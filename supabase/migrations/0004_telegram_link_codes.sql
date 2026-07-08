-- Telegram /link codes (SPEC §9): generated on the settings page, 10-minute
-- expiry, consumed by the bot to bind profiles.telegram_chat_id.
-- Written/read by the service role only (settings action + worker bot).

create table telegram_link_codes (
  code text primary key,
  profile_id uuid not null references profiles(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table telegram_link_codes enable row level security;
-- No policies: service role only.
