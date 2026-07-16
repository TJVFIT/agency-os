/**
 * Internal staff assistant chat handler (v4 `chat` job kind, migration 0010).
 * Payload: { profile_id, message_id } — lib/actions/assistant.ts inserts the
 * user's turn into assistant_messages (RLS self_send) and enqueues this job;
 * the worker answers on the dedicated open-model 'chat' chain (Groq Llama →
 * OpenRouter :free → gemini-flash-lite) and writes the reply row as the
 * service role (the only writer allowed for role='assistant'). The UI streams
 * it via the assistant_messages realtime publication — no blocking AI calls
 * in the app (CLAUDE.md rule 3).
 *
 * On total chain failure the error propagates: queue.ts applies exponential
 * backoff and, after MAX_ATTEMPTS, flags the job + alerts admins.
 */

import { addDays } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

import { buildChatPrompt } from '../../../lib/ai/jobs';
import { buildChain } from '../../../lib/ai/providers';
import { runChain } from '../../../lib/ai/router';
import { OPEN_CARD_STATUSES } from '../../../lib/workload';
import type { AiJob } from '../../../lib/db/types';
import { providerConfig } from '../ai-config';
import { db } from '../supabase';
import { log } from '../log';

const TZ = 'Europe/Istanbul';
/** Rolling context window — the thread itself is pruned by retention (90d). */
const HISTORY_LIMIT = 12;
const CARDS_LIMIT = 10;

export async function handleChat(job: AiJob) {
  const payload = job.payload as { profile_id?: string; message_id?: string };
  if (!payload?.profile_id || !payload?.message_id)
    throw new Error('chat job missing profile_id/message_id');
  const { profile_id: profileId, message_id: messageId } = payload;

  // Istanbul "today" window for the shoot lookup (dates stored UTC).
  const now = new Date();
  const today = formatInTimeZone(now, TZ, 'yyyy-MM-dd');
  const dayStart = fromZonedTime(`${today}T00:00:00`, TZ);
  const dayEnd = addDays(dayStart, 1);

  const [
    { data: profile },
    { data: message },
    { data: thread },
    { data: cards },
    { data: shoots },
  ] = await Promise.all([
    db().from('profiles').select('full_name, role').eq('id', profileId).single(),
    db()
      .from('assistant_messages')
      .select('id, profile_id, role, body')
      .eq('id', messageId)
      .single(),
    db()
      .from('assistant_messages')
      .select('role, body')
      .eq('profile_id', profileId)
      .neq('id', messageId)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT),
    db()
      .from('cards')
      .select('id, title, status')
      .eq('assignee', profileId)
      .in('status', [...OPEN_CARD_STATUSES])
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(CARDS_LIMIT),
    db()
      .from('shoots')
      .select('title, status, starts_at, ends_at')
      .contains('crew', [profileId])
      .neq('status', 'cancelled')
      .gte('starts_at', dayStart.toISOString())
      .lt('starts_at', dayEnd.toISOString())
      .order('starts_at', { ascending: true }),
  ]);
  if (!profile) throw new Error(`profile ${profileId} not found`);
  if (!message || message.profile_id !== profileId || message.role !== 'user')
    throw new Error(`message ${messageId} is not a user turn of ${profileId}`);

  const context = {
    name: profile.full_name,
    role: profile.role,
    today,
    open_cards: cards ?? [],
    todays_shoots: (shoots ?? []).map((s) => ({
      title: s.title,
      status: s.status,
      starts: formatInTimeZone(s.starts_at, TZ, 'HH:mm'),
      ends: formatInTimeZone(s.ends_at, TZ, 'HH:mm'),
    })),
  };
  // Prior turns, oldest → newest (query is newest-first for the LIMIT).
  const history = (thread ?? [])
    .reverse()
    .map((m) => ({ role: m.role, body: m.body }));

  const prompt = buildChatPrompt(
    JSON.stringify(context),
    JSON.stringify(history),
    message.body,
  );

  const out = await runChain(
    buildChain(prompt.chainKind, providerConfig()),
    prompt.system,
    prompt.user,
    prompt.schema,
    { timeoutMs: 30_000, log: (l) => log.debug(l, 'ai') },
  );

  // Reply row: service-role insert (no RLS path allows role='assistant').
  // The assistant_messages trigger logs only user turns by design (0010) —
  // replies are system output, so no extra activity row here.
  const { error } = await db().from('assistant_messages').insert({
    profile_id: profileId,
    role: 'assistant',
    body: out.data.reply,
  });
  if (error) throw new Error(`assistant reply insert failed: ${error.message}`);

  return { reply_length: out.data.reply.length, _meta: out._meta };
}
