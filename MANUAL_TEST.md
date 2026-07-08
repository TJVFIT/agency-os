# Manual test script

Follow after SETUP.md Part A (Supabase + AI keys). Assumes migrations are
pushed and an admin exists.

## 0. One-time setup

```bash
pnpm install
# Push schema to the linked Supabase project (review the diff first):
pnpm supabase db push
# Create the first admin:
pnpm seed:admin -- --email you@agency.com --password "strong-pass" --name "Ad Soyad"
# Run the app + worker (two terminals):
pnpm dev
pnpm --filter @agency-os/worker dev
```

Open http://localhost:3000 → redirected to /login → sign in.

## Phase 1 — core (auth, clients, cards, board, feed)

1. **Clients**: /clients → "Yeni müşteri" (admin) → create one (langs tr+en).
   Open it, fill brand profile (voice, banned words), add a glossary row
   (`Fıstıklı Latte` → keep), add hashtags, add an Instagram account.
2. **Cards**: /board → "Yeni kart" → create for that client. Drag it across
   columns; each move should persist and appear in the live feed (Turkish).
3. **Realtime**: open /board in two browsers signed in as two users. User A
   drags a card; User B sees the column + feed update within ~1s, no refresh.
4. **Role guard**: as a `member`, try to move a card into "Onaylandı"
   (approved) — the UI shows "Onaylama yetkisi müdür ve yöneticilere aittir"
   and the DB trigger rejects it. As a manager it succeeds.

## Phase 2 — calendar + AI

5. **AI caption**: open a card → "3 başlık üret" with a brief → button shows
   "işleniyor" → 3 Turkish variants arrive (<~30s) via Realtime → pick one →
   it writes the TR caption.
6. **Fallback**: temporarily unset `GEMINI_KEY_A` (keep Groq/OpenRouter) and
   retry — captions still return through the chain.
7. **Translate**: with TR caption present → "Çevir" → EN tab fills; a glossary
   `keep` term stays untranslated.
8. **Calendar**: /calendar → drag a card to another day (reschedules) →
   schedule a card (datetime + platform) → status becomes "Zamanlandı".

## Phase 3 — assets, approvals, Telegram

9. **Upload**: /assets → upload an image → within a minute it shows 4 variants
   (needs R2 + worker).
10. **Approval link**: /calendar → filter one client → "Haftayı onaya gönder"
    → copy the WhatsApp message → open /approve/{token} on a phone → approve /
    reject with comment → card transitions, appears in the feed. An expired or
    garbage token shows the "süresi dolmuş" page (clean 404-style).
11. **Telegram**: /settings → "Kod oluştur" → DM the bot `/link <code>` →
    linked. Send a photo → pick the client → it lands in /assets with variants.

## Phase 4 — reels, publishing, crons

12. **Reel** (needs ffmpeg + whisper on the box): from a card with a video
    asset, enqueue a reel → a captioned 1080×1920 MP4 attaches to the card,
    Turkish glyphs (ş ğ ı İ ç ö ü) render correctly.
13. **Publish**: schedule a card 2 minutes out to a **test** account → the
    dispatcher publishes via Postiz (or notifies for manual posting if Postiz
    isn't configured) → status flips to "Yayınlandı" with a feed entry.
14. **Planner**: run the Monday cron (or invoke handler) → 5 `idea` cards
    appear for a seeded client, tagged `ai-planned`.

## Automated checks

```bash
pnpm typecheck   # app + worker
pnpm lint
pnpm test        # status machine, AI router/bucket/prompts, ASS generator
pnpm build
```
