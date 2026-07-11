/**
 * Telegram bot + notifications (SPEC §9). grammY polling for inbound
 * (/start, /link, media intake, inline approve/reject); outbound notifications
 * go through the same bot API. All of this is optional — when
 * TELEGRAM_BOT_TOKEN is unset the notify* helpers no-op so the rest of the
 * worker runs unaffected.
 */

import { Bot, InlineKeyboard, type Context } from 'grammy';

import type { Enums } from '../../lib/db/types';
import { workerEnv } from './env';
import { db, logActivity } from './supabase';
import { publicUrl, putObject, r2Configured } from './r2';
import { log } from './log';

let bot: Bot | undefined;

export function telegramConfigured(): boolean {
  return Boolean(workerEnv().TELEGRAM_BOT_TOKEN);
}

function getBot(): Bot | null {
  if (!telegramConfigured()) return null;
  if (!bot) bot = new Bot(workerEnv().TELEGRAM_BOT_TOKEN!);
  return bot;
}

async function sendTo(
  chatId: number,
  text: string,
  extra?: object,
): Promise<void> {
  const b = getBot();
  if (!b) {
    log.info({ chatId, text }, 'telegram disabled — would notify');
    return;
  }
  try {
    await b.api.sendMessage(chatId, text, extra);
  } catch (err) {
    log.warn({ err: String(err), chatId }, 'telegram send failed');
  }
}

async function chatIdsForRoles(roles: Enums<'user_role'>[]): Promise<number[]> {
  const { data } = await db()
    .from('profiles')
    .select('telegram_chat_id, role')
    .in('role', roles)
    .not('telegram_chat_id', 'is', null);
  return (data ?? [])
    .map((p) => p.telegram_chat_id)
    .filter((id): id is number => id !== null);
}

export async function notifyAdmins(text: string): Promise<void> {
  for (const id of await chatIdsForRoles(['admin'])) await sendTo(id, text);
}

export async function notifyManagers(text: string): Promise<void> {
  for (const id of await chatIdsForRoles(['admin', 'manager']))
    await sendTo(id, text);
}

/**
 * Managers only (role `manager`, excluding admins). Used where admins are
 * already alerted through another path (e.g. queue.failJob → notifyAdmins on a
 * terminal publish failure) so the same person isn't pinged twice.
 */
export async function notifyManagersOnly(text: string): Promise<void> {
  for (const id of await chatIdsForRoles(['manager'])) await sendTo(id, text);
}

export async function notifyUser(
  profileId: string,
  text: string,
): Promise<void> {
  const { data } = await db()
    .from('profiles')
    .select('telegram_chat_id')
    .eq('id', profileId)
    .single();
  if (data?.telegram_chat_id) await sendTo(data.telegram_chat_id, text);
}

// ---------- inbound bot ----------

/** Resolve a Telegram chat id to a linked internal profile (or null). */
async function senderProfile(
  chatId: number | undefined,
): Promise<{ id: string; role: Enums<'user_role'> } | null> {
  if (!chatId) return null;
  const { data } = await db()
    .from('profiles')
    .select('id, role')
    .eq('telegram_chat_id', chatId)
    .maybeSingle();
  return data ?? null;
}

// Media-intake picker: Telegram caps callback_data at 64 bytes, so we can't
// pack a client UUID + file_id in there. Each button carries a short opaque
// code that maps back to {clientId, fileId} in this in-memory cache.
interface IntakeChoice {
  clientId: string;
  fileId: string;
  expiresAt: number;
}
let intakeSeq = 0;
const intakeCache = new Map<string, IntakeChoice>();
const INTAKE_TTL_MS = 30 * 60 * 1000;

function cacheIntakeChoice(clientId: string, fileId: string): string {
  const now = Date.now();
  for (const [k, v] of intakeCache)
    if (v.expiresAt < now) intakeCache.delete(k);
  const code = (intakeSeq++).toString(36);
  intakeCache.set(code, { clientId, fileId, expiresAt: now + INTAKE_TTL_MS });
  return code;
}

// A manager who tapped Reject (SPEC §9: reject asks for a one-line reason).
// Keyed by chat id → the next text message from that chat becomes the reason.
interface PendingReject {
  cardId: string;
  fromStatus: Enums<'card_status'>;
  profileId: string;
  clientId: string | null;
  expiresAt: number;
}
const pendingRejects = new Map<number, PendingReject>();
const REJECT_TTL_MS = 10 * 60 * 1000;

async function onLink(ctx: Context, code: string): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const { data: link } = await db()
    .from('telegram_link_codes')
    .select('profile_id, expires_at')
    .eq('code', code)
    .single();
  if (!link || new Date(link.expires_at) < new Date()) {
    await ctx.reply(
      'Kod geçersiz veya süresi dolmuş. Ayarlar sayfasından yeni kod alın.',
    );
    return;
  }
  // Only consume the code and report success once the bind actually lands.
  // telegram_chat_id is UNIQUE, so a chat already linked to another profile
  // fails here — don't burn the code or claim success in that case.
  const { error: updateError } = await db()
    .from('profiles')
    .update({ telegram_chat_id: chatId })
    .eq('id', link.profile_id);
  if (updateError) {
    log.warn(
      { err: updateError.message, profileId: link.profile_id },
      'telegram link bind failed',
    );
    await ctx.reply(
      'Bağlanamadı — bu Telegram hesabı başka bir kullanıcıya bağlı olabilir. ' +
        'Yönetici ile görüşün; kod hâlâ geçerli.',
    );
    return;
  }
  await db().from('telegram_link_codes').delete().eq('code', code);
  await ctx.reply(
    '✅ Telegram hesabınız bağlandı. Bildirimler buraya gelecek.',
  );
}

async function onMedia(ctx: Context): Promise<void> {
  // Photo/video intake (SPEC §9): pick client via inline keyboard, then
  // download → R2 → asset + variants job. Only linked internal users may
  // enumerate clients or inject media.
  const profile = await senderProfile(ctx.chat?.id ?? ctx.from?.id);
  if (!profile) {
    await ctx.reply(
      'Önce hesabınızı bağlayın: Ayarlar sayfasından kod alıp /link <kod> yazın.',
    );
    return;
  }
  const { data: clients } = await db()
    .from('clients')
    .select('id, name')
    .eq('active', true)
    .order('name');
  if (!clients?.length) {
    await ctx.reply('Aktif müşteri yok.');
    return;
  }
  const fileId =
    ctx.message?.photo?.at(-1)?.file_id ?? ctx.message?.video?.file_id;
  if (!fileId) return;

  const kb = new InlineKeyboard();
  for (const c of clients.slice(0, 20))
    kb.text(c.name, `ik:${cacheIntakeChoice(c.id, fileId)}`).row();
  await ctx.reply('Bu medya hangi müşteriye ait?', { reply_markup: kb });
}

async function onIntakeChosen(
  ctx: Context,
  clientId: string,
  fileId: string,
): Promise<void> {
  const profile = await senderProfile(ctx.chat?.id ?? ctx.from?.id);
  if (!profile) {
    await ctx.answerCallbackQuery({
      text: 'Önce /link ile hesabınızı bağlayın.',
      show_alert: true,
    });
    return;
  }
  await ctx.answerCallbackQuery();
  const b = getBot();
  if (!b || !r2Configured()) {
    await ctx.reply('Depolama yapılandırılmamış.');
    return;
  }
  try {
    const file = await b.api.getFile(fileId);
    if ((file.file_size ?? 0) > 20 * 1024 * 1024) {
      await ctx.reply('Dosya 20 MB’dan büyük — lütfen web üzerinden yükleyin.');
      return;
    }
    const url = `https://api.telegram.org/file/bot${workerEnv().TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    const ext = file.file_path?.split('.').pop() ?? 'jpg';
    const isVideo = ['mp4', 'mov', 'webm'].includes(ext.toLowerCase());
    const key = `private/${clientId}/telegram/${Date.now()}.${ext}`;
    await putObject(key, buf, isVideo ? 'video/mp4' : 'image/jpeg');

    const { data: asset } = await db()
      .from('assets')
      .insert({
        client_id: clientId,
        kind: isVideo ? 'video' : 'image',
        r2_key: key,
        original_name: `telegram.${ext}`,
        source: 'telegram',
      })
      .select('id')
      .single();

    if (asset && !isVideo) {
      await db()
        .from('ai_jobs')
        .insert({
          kind: 'image_variants',
          payload: { asset_id: asset.id },
        });
    }
    await logActivity('asset.created', {
      clientId,
      detail: { source: 'telegram', asset_id: asset?.id },
    });
    await ctx.reply('✅ Medya alındı ve işleniyor.');
  } catch (err) {
    log.warn({ err: String(err) }, 'telegram intake failed');
    await ctx.reply('Medya alınamadı, tekrar deneyin.');
  }
}

/** Statuses that are actually awaiting manager approval (SPEC §5). */
function isAwaitingApproval(
  status: Enums<'card_status'>,
  langs: string[],
): boolean {
  return (
    status === 'translated' || (status === 'visual_ready' && langs.length === 1)
  );
}

async function onApprovalCallback(
  ctx: Context,
  action: 'approve' | 'reject',
  cardId: string,
): Promise<void> {
  const chatId = ctx.chat?.id ?? ctx.from?.id;
  // (a) Authorize: only linked managers/admins may decide approvals. Any other
  // Telegram user who ever messaged the bot must not move cards.
  const profile = await senderProfile(chatId);
  if (!profile || (profile.role !== 'admin' && profile.role !== 'manager')) {
    await ctx.answerCallbackQuery({
      text: 'Bu işlem için yetkiniz yok.',
      show_alert: true,
    });
    return;
  }

  const { data: card } = await db()
    .from('cards')
    .select('status, title, client_id, clients(langs)')
    .eq('id', cardId)
    .maybeSingle();
  if (!card) {
    await ctx.answerCallbackQuery({
      text: 'Kart bulunamadı.',
      show_alert: true,
    });
    return;
  }
  const langs = (card.clients as { langs: string[] } | null)?.langs ?? ['tr'];

  // (b) Gate on state: only decide cards that are actually awaiting approval.
  // Blocks re-approving a published card or knocking one back from any status.
  if (!isAwaitingApproval(card.status, langs)) {
    await ctx.answerCallbackQuery({
      text: 'Bu kart onay bekleyen bir durumda değil.',
      show_alert: true,
    });
    return;
  }

  if (action === 'approve') {
    await ctx.answerCallbackQuery();
    // (c) Optimistic lock: only flip if still in the status we just read.
    const { data: updated } = await db()
      .from('cards')
      .update({ status: 'approved' })
      .eq('id', cardId)
      .eq('status', card.status)
      .select('id');
    if (!updated?.length) {
      await ctx.reply('Kart bu sırada değişti — onaylanmadı.');
      return;
    }
    await ctx.reply('✅ Onaylandı.');
    return;
  }

  // Reject → ask for a one-line reason (SPEC §9). The status change happens
  // when the reason arrives (onText), still optimistic-locked on this status.
  await ctx.answerCallbackQuery();
  if (chatId)
    pendingRejects.set(chatId, {
      cardId,
      fromStatus: card.status,
      profileId: profile.id,
      clientId: card.client_id,
      expiresAt: Date.now() + REJECT_TTL_MS,
    });
  await ctx.reply(`Reddetme sebebini tek satırda yazın: "${card.title}"`);
}

/** Second half of a Telegram reject: capture the reason, then revert. */
async function onRejectReason(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  const text = ctx.message?.text?.trim();
  if (!chatId || !text) return;
  const pending = pendingRejects.get(chatId);
  if (!pending) return; // not awaiting a reason — ignore ordinary chatter
  pendingRejects.delete(chatId);
  if (pending.expiresAt < Date.now()) {
    await ctx.reply('Süre doldu — reddetmeyi tekrar başlatın.');
    return;
  }
  // Optimistic lock: only revert if still in the awaiting status.
  const { data: updated } = await db()
    .from('cards')
    .update({ status: 'copy_draft' })
    .eq('id', pending.cardId)
    .eq('status', pending.fromStatus)
    .select('id');
  if (!updated?.length) {
    await ctx.reply('Kart bu sırada değişti — reddedilmedi.');
    return;
  }
  // Record the reason + notify the relevant people (via notifications loop).
  await logActivity('card.rejected', {
    cardId: pending.cardId,
    clientId: pending.clientId,
    detail: { reason: text, by: pending.profileId },
  });
  await ctx.reply('↩️ Reddedildi, taslağa döndürüldü.');
}

export function startBot(): (() => void) | null {
  const b = getBot();
  if (!b) {
    log.info('telegram bot disabled (no token)');
    return null;
  }

  b.command('start', (ctx) =>
    ctx.reply(
      'Agency OS botu. Hesabınızı bağlamak için uygulamadaki Ayarlar sayfasından kod alın ve /link <kod> yazın.',
    ),
  );
  b.command('link', (ctx) => {
    const code = ctx.match?.trim();
    if (!code) return ctx.reply('Kullanım: /link <kod>');
    return onLink(ctx, code);
  });
  b.on([':photo', ':video'], onMedia);
  b.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (data.startsWith('ik:')) {
      const choice = intakeCache.get(data.slice(3));
      if (!choice || choice.expiresAt < Date.now()) {
        intakeCache.delete(data.slice(3));
        await ctx.answerCallbackQuery({
          text: 'Seçim süresi doldu — medyayı tekrar gönderin.',
          show_alert: true,
        });
        return;
      }
      intakeCache.delete(data.slice(3));
      return onIntakeChosen(ctx, choice.clientId, choice.fileId);
    }
    if (data.startsWith('approve:') || data.startsWith('reject:')) {
      const [action, cardId] = data.split(':');
      return onApprovalCallback(ctx, action as 'approve' | 'reject', cardId);
    }
  });
  // Plain text (after command handlers, which consume /start and /link): the
  // one-line reason for a pending Telegram reject.
  b.on('message:text', onRejectReason);

  b.start({ onStart: () => log.info('telegram bot polling') }).catch((e) =>
    log.error({ err: String(e) }, 'telegram bot crashed'),
  );
  return () => b.stop();
}

/** Send a manager an approval request with inline Approve/Reject buttons. */
export async function sendApprovalRequest(
  cardId: string,
  title: string,
): Promise<void> {
  const kb = new InlineKeyboard()
    .text('✅ Onayla', `approve:${cardId}`)
    .text('❌ Reddet', `reject:${cardId}`);
  for (const id of await chatIdsForRoles(['admin', 'manager']))
    await sendTo(id, `Onay bekliyor: ${title}`, { reply_markup: kb });
}

export { publicUrl };
