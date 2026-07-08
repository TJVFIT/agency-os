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
  await db()
    .from('profiles')
    .update({ telegram_chat_id: chatId })
    .eq('id', link.profile_id);
  await db().from('telegram_link_codes').delete().eq('code', code);
  await ctx.reply(
    '✅ Telegram hesabınız bağlandı. Bildirimler buraya gelecek.',
  );
}

async function onMedia(ctx: Context): Promise<void> {
  // Photo/video intake (SPEC §9): pick client via inline keyboard, then
  // download → R2 → asset + variants job.
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
    kb.text(c.name, `intake:${c.id}:${fileId}`).row();
  await ctx.reply('Bu medya hangi müşteriye ait?', { reply_markup: kb });
}

async function onIntakeChosen(
  ctx: Context,
  clientId: string,
  fileId: string,
): Promise<void> {
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

async function onApprovalCallback(
  ctx: Context,
  action: 'approve' | 'reject',
  cardId: string,
): Promise<void> {
  await ctx.answerCallbackQuery();
  if (action === 'approve') {
    await db().from('cards').update({ status: 'approved' }).eq('id', cardId);
    await ctx.reply('✅ Onaylandı.');
  } else {
    await db().from('cards').update({ status: 'copy_draft' }).eq('id', cardId);
    await ctx.reply('↩️ Reddedildi, taslağa döndürüldü.');
  }
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
    if (data.startsWith('intake:')) {
      const [, clientId, fileId] = data.split(':');
      return onIntakeChosen(ctx, clientId, fileId);
    }
    if (data.startsWith('approve:') || data.startsWith('reject:')) {
      const [action, cardId] = data.split(':');
      return onApprovalCallback(ctx, action as 'approve' | 'reject', cardId);
    }
  });

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
