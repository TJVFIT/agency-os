-- Agency OS v3 (UPGRADE_SPEC §11a + client collaboration): two-way
-- client<->team messaging, client self-service uploads + company info,
-- and the AI edit pipeline job kinds (edit_video / edit_photo).

-- ---------- enum extensions ----------
-- NOTE: new enum values must not be *used* later in this same migration
-- (PG12+ allows ADD VALUE in a transaction but not same-tx usage).
alter type job_kind add value if not exists 'edit_video';
alter type job_kind add value if not exists 'edit_photo';
alter type asset_source add value if not exists 'client';

create type message_sender as enum ('team','client');

-- ---------- clients gain portal-editable contact info ----------
-- Shape defined by clientContactSchema in lib/db/domain.ts:
-- {phone, email, address, district, website, instagram, hours, notes}
alter table clients add column if not exists
  contact jsonb not null default '{}'::jsonb;

-- ---------- client <-> team messages ----------
create table client_messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  card_id uuid references cards(id) on delete set null,
  sender message_sender not null,
  author uuid references profiles(id),                -- null when sender='client'
  portal_link_id uuid references portal_links(id) on delete set null,
  body text not null,
  asset_id uuid references assets(id) on delete set null,
  read_by_team boolean not null default false,
  read_by_client boolean not null default false,
  created_at timestamptz not null default now(),
  check (sender = 'team' or author is null)           -- client msgs are anonymous
);
create index client_messages_idx on client_messages (client_id, created_at desc);
create index client_messages_unread_idx on client_messages (client_id)
  where read_by_team = false;

alter table client_messages enable row level security;

create policy team_read_messages on client_messages
  for select to authenticated using (true);
create policy team_send_messages on client_messages
  for insert to authenticated
  with check (sender = 'team' and author = auth.uid());
-- Team members may update rows only to flip read flags — the guard trigger
-- below keeps every other column immutable (RLS cannot express column grants).
create policy team_update_messages on client_messages
  for update to authenticated using (true) with check (true);
-- client-side inserts: service role only (portal routes), like client_ideas.

-- Immutability backstop (0007 style): after insert, only the read flags may
-- change; body/sender/author/scoping are frozen for non-service actors.
create or replace function client_messages_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and (
       new.body       is distinct from old.body
    or new.sender     is distinct from old.sender
    or new.author     is distinct from old.author
    or new.client_id  is distinct from old.client_id
    or new.card_id    is distinct from old.card_id
    or new.asset_id   is distinct from old.asset_id
    or new.portal_link_id is distinct from old.portal_link_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'client_messages rows are immutable (read flags only)';
  end if;
  return new;
end $$;
create trigger client_messages_guard_trg before update on client_messages
  for each row execute function client_messages_guard();

-- Every message logs to the feed (rule 2). actor is null for portal sends.
create or replace function log_message_sent() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into activity_log (actor, client_id, card_id, action, detail)
  values (auth.uid(), new.client_id, new.card_id, 'message.sent',
          jsonb_build_object('message_id', new.id, 'sender', new.sender,
                             'preview', left(new.body, 80)));
  return new;
end $$;
create trigger client_messages_log after insert on client_messages
  for each row execute function log_message_sent();

-- Advisor hygiene (0008 precedent): trigger functions off the RPC surface.
revoke execute on function client_messages_guard() from public, anon, authenticated;
revoke execute on function log_message_sent() from public, anon, authenticated;

-- Team side subscribes live to the thread.
alter publication supabase_realtime add table client_messages;
