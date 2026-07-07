-- Agency OS — initial schema (Supabase migration 0001)
-- Apply with: supabase db push (after `supabase link`)
-- Companion to SPEC.md §3–§5. Extend, don't hand-edit in prod.

create extension if not exists "pgcrypto";

-- ---------- enums ----------
create type user_role as enum ('admin','manager','member');
create type card_type as enum ('post','reel','story','reply','other');
create type card_status as enum
  ('idea','copy_draft','visual_ready','translated','approved',
   'scheduled','published','archived');
create type asset_kind as enum ('image','video','other');
create type asset_source as enum ('upload','telegram','ai','render');
create type job_kind as enum
  ('caption','translate','reply','plan','report',
   'image_variants','bg_remove','render_reel','publish');
create type job_status as enum ('queued','running','done','error');
create type approval_decision as enum ('approved','rejected');

-- ---------- profiles ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role user_role not null default 'member',
  telegram_chat_id bigint unique,
  created_at timestamptz not null default now()
);

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- clients ----------
create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  industry text not null default 'restaurant',
  langs text[] not null default array['tr','en'],
  brand_profile jsonb not null default '{}'::jsonb,
  glossary jsonb not null default '[]'::jsonb,
  hashtag_bank text[] not null default '{}',
  colors jsonb not null default '{}'::jsonb,
  logo_asset_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table client_social_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  platform text not null check (platform in
    ('instagram','facebook','tiktok','x','youtube','linkedin')),
  handle text not null,
  postiz_integration_id text,
  created_at timestamptz not null default now(),
  unique (client_id, platform, handle)
);

-- ---------- assets ----------
create table assets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  kind asset_kind not null,
  r2_key text not null,
  original_name text not null default '',
  width int, height int, duration_s numeric,
  variants jsonb not null default '{}'::jsonb,
  source asset_source not null default 'upload',
  uploaded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index assets_client_idx on assets (client_id, created_at desc);

alter table clients
  add constraint clients_logo_fk
  foreign key (logo_asset_id) references assets(id) on delete set null;

-- ---------- cards ----------
create table cards (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  type card_type not null default 'post',
  title text not null,
  status card_status not null default 'idea',
  assignee uuid references profiles(id),
  due_at timestamptz,
  scheduled_at timestamptz,
  platforms text[] not null default '{}',
  priority smallint not null default 3,
  tags text[] not null default '{}',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cards_client_status_idx on cards (client_id, status);
create index cards_sched_idx on cards (status, scheduled_at);
create index cards_assignee_idx on cards (assignee) where assignee is not null;

create table card_contents (
  card_id uuid not null references cards(id) on delete cascade,
  lang text not null,
  caption text not null default '',
  hashtags text[] not null default '{}',
  media_asset_ids uuid[] not null default '{}',
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now(),
  primary key (card_id, lang)
);

create table comments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references cards(id) on delete cascade,
  author uuid references profiles(id),
  body text not null,
  asset_id uuid references assets(id),
  created_at timestamptz not null default now()
);
create index comments_card_idx on comments (card_id, created_at);

-- ---------- activity log (the live feed) ----------
create table activity_log (
  id bigint generated always as identity primary key,
  actor uuid references profiles(id),
  client_id uuid references clients(id) on delete set null,
  card_id uuid references cards(id) on delete set null,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_created_idx on activity_log (created_at desc);
create index activity_card_idx on activity_log (card_id)
  where card_id is not null;

-- ---------- ai job queue ----------
create table ai_jobs (
  id uuid primary key default gen_random_uuid(),
  kind job_kind not null,
  payload jsonb not null default '{}'::jsonb,
  status job_status not null default 'queued',
  result jsonb,
  error text,
  attempts int not null default 0,
  run_after timestamptz not null default now(),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_jobs_poll_idx on ai_jobs (status, run_after)
  where status = 'queued';

-- ---------- approvals ----------
create table approval_links (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  token text not null unique,
  week_start date not null,
  expires_at timestamptz not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table approval_actions (
  id uuid primary key default gen_random_uuid(),
  approval_link_id uuid not null references approval_links(id)
    on delete cascade,
  card_id uuid not null references cards(id) on delete cascade,
  decision approval_decision not null,
  comment text not null default '',
  created_at timestamptz not null default now()
);

-- ---------- reports ----------
create table reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  week_start date not null,
  body_md text not null default '',
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (client_id, week_start)
);

-- ---------- shared triggers ----------
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger cards_touch before update on cards
  for each row execute function touch_updated_at();
create trigger ai_jobs_touch before update on ai_jobs
  for each row execute function touch_updated_at();

-- status guard + auto-log (mirror of lib/status.ts — keep in sync)
create or replace function cards_status_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor_role user_role;
  allowed boolean := false;
begin
  if new.status = old.status then return new; end if;

  select role into actor_role from profiles where id = auth.uid();
  -- service role (worker / approval route): auth.uid() is null → allowed
  if auth.uid() is null then allowed := true;
  else
    allowed := case
      when new.status = 'approved'
        then actor_role in ('admin','manager')
      when new.status = 'published'
        then false                      -- worker only (service role)
      else true
    end;
  end if;

  if not allowed then
    raise exception 'transition to % not allowed for role %',
      new.status, actor_role;
  end if;

  if new.status = 'scheduled'
     and (new.scheduled_at is null or new.scheduled_at <= now()) then
    raise exception 'scheduled requires a future scheduled_at';
  end if;

  insert into activity_log (actor, client_id, card_id, action, detail)
  values (auth.uid(), new.client_id, new.id, 'card.status_changed',
          jsonb_build_object('from', old.status, 'to', new.status));
  return new;
end $$;

create trigger cards_status_trg before update of status on cards
  for each row execute function cards_status_guard();

-- ---------- RLS ----------
alter table profiles enable row level security;
alter table clients enable row level security;
alter table client_social_accounts enable row level security;
alter table assets enable row level security;
alter table cards enable row level security;
alter table card_contents enable row level security;
alter table comments enable row level security;
alter table activity_log enable row level security;
alter table ai_jobs enable row level security;
alter table approval_links enable row level security;
alter table approval_actions enable row level security;
alter table reports enable row level security;

create or replace function my_role() returns user_role
language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() $$;

-- read: whole team reads everything
create policy team_read_profiles on profiles for select to authenticated using (true);
create policy team_read_clients  on clients  for select to authenticated using (true);
create policy team_read_csa      on client_social_accounts for select to authenticated using (true);
create policy team_read_assets   on assets   for select to authenticated using (true);
create policy team_read_cards    on cards    for select to authenticated using (true);
create policy team_read_cc       on card_contents for select to authenticated using (true);
create policy team_read_comments on comments for select to authenticated using (true);
create policy team_read_log      on activity_log for select to authenticated using (true);
create policy team_read_jobs     on ai_jobs  for select to authenticated using (true);
create policy team_read_links    on approval_links for select to authenticated using (true);
create policy team_read_appr     on approval_actions for select to authenticated using (true);
create policy team_read_reports  on reports  for select to authenticated using (true);

-- write
create policy self_update_profile on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy mgr_write_clients on clients for update to authenticated
  using (my_role() in ('admin','manager'));
create policy admin_insert_clients on clients for insert to authenticated
  with check (my_role() = 'admin');
create policy admin_delete_clients on clients for delete to authenticated
  using (my_role() = 'admin');

create policy admin_all_csa on client_social_accounts
  for all to authenticated
  using (my_role() in ('admin','manager'))
  with check (my_role() in ('admin','manager'));

create policy team_write_assets on assets for insert to authenticated
  with check (true);
create policy team_write_cards on cards for insert to authenticated
  with check (true);
create policy team_update_cards on cards for update to authenticated
  using (true) with check (true);           -- transitions guarded by trigger
create policy admin_delete_cards on cards for delete to authenticated
  using (my_role() = 'admin');

create policy team_write_cc on card_contents for all to authenticated
  using (true) with check (true);
create policy team_write_comments on comments for insert to authenticated
  with check (author = auth.uid());
create policy team_write_jobs on ai_jobs for insert to authenticated
  with check (created_by = auth.uid());
-- activity_log inserts: via triggers/service role only (no direct policy).

-- reports metrics manual entry
create policy mgr_write_reports on reports for all to authenticated
  using (my_role() in ('admin','manager'))
  with check (my_role() in ('admin','manager'));

-- ---------- realtime ----------
alter publication supabase_realtime add table activity_log;
alter publication supabase_realtime add table cards;
alter publication supabase_realtime add table ai_jobs;
