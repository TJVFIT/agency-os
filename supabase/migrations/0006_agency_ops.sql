-- Agency OS v2 (UPGRADE_SPEC.md): client portal, production/shoots,
-- business ops (packages/payments/ads), automation modes, push, new AI kinds.

-- ---------- enum extensions ----------
alter type job_kind add value if not exists 'idea_refine';
alter type job_kind add value if not exists 'scenario';
alter type job_kind add value if not exists 'poster';
alter type job_kind add value if not exists 'compliance';

create type shoot_status as enum ('planned','confirmed','done','cancelled');
create type idea_status as enum ('new','refined','accepted','rejected');
create type payment_kind as enum ('package','extra');
create type payment_status as enum ('pending','paid','overdue');
create type ad_status as enum ('planned','active','done','cancelled');
create type automation_mode as enum ('suggest','semi','full');
create type suggestion_status as enum ('pending','accepted','dismissed');

-- ---------- clients gain a location (route planning) ----------
alter table clients add column if not exists location jsonb not null default '{}'::jsonb;

-- ---------- client portal ----------
create table portal_links (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  token text not null unique,
  active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table client_ideas (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  portal_link_id uuid references portal_links(id) on delete set null,
  title text not null,
  body text not null default '',
  status idea_status not null default 'new',
  refined jsonb,                -- AI output: {title, summary, goal, suggested_type}
  card_id uuid references cards(id) on delete set null,
  created_at timestamptz not null default now()
);
create index client_ideas_client_idx on client_ideas (client_id, status);

create table client_availability (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  portal_link_id uuid references portal_links(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index client_availability_idx on client_availability (client_id, starts_at);

-- ---------- production: vehicles, leaves, shoots ----------
create table vehicles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plate text not null default '',
  capacity int not null default 4,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table staff_leaves (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index staff_leaves_idx on staff_leaves (profile_id, starts_on);

create table shoots (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  card_id uuid references cards(id) on delete set null,
  title text not null,
  brief_md text not null default '',
  status shoot_status not null default 'planned',
  starts_at timestamptz not null,
  ends_at timestamptz not null,        -- default 210-min block set by the app
  crew uuid[] not null default '{}',   -- profile ids
  vehicle_id uuid references vehicles(id) on delete set null,
  location jsonb not null default '{}'::jsonb,  -- {lat,lng,address,district}
  tasks_opened boolean not null default false,  -- post-shoot kurgu/metin/kontrol
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index shoots_time_idx on shoots (starts_at);
create index shoots_client_idx on shoots (client_id, status);
create trigger shoots_touch before update on shoots
  for each row execute function touch_updated_at();

-- ---------- business ops ----------
create table client_packages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  name text not null,
  monthly jsonb not null default '{}'::jsonb,  -- {post,reel,story,shoot}
  price numeric not null default 0,
  currency text not null default 'TRY',
  starts_on date not null default current_date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index client_packages_idx on client_packages (client_id, active);

create table payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  kind payment_kind not null default 'package',
  title text not null,
  amount numeric not null,
  currency text not null default 'TRY',
  due_on date not null,
  paid_on date,
  status payment_status not null default 'pending',
  note text not null default '',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index payments_idx on payments (client_id, status, due_on);

create table ad_tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  card_id uuid references cards(id) on delete set null,
  platform text not null check (platform in
    ('instagram','facebook','tiktok','x','youtube','linkedin')),
  objective text not null default '',
  budget numeric not null default 0,
  currency text not null default 'TRY',
  starts_on date,
  ends_on date,
  status ad_status not null default 'planned',
  results jsonb not null default '{}'::jsonb,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index ad_tasks_idx on ad_tasks (client_id, status);

-- ---------- automation modes + suggestions inbox ----------
create table automation_settings (
  key text primary key,               -- 'master','planner','publish','post_shoot','compliance','reports'
  mode automation_mode not null default 'semi',
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);
insert into automation_settings (key, mode) values
  ('master','semi'),('planner','semi'),('publish','semi'),
  ('post_shoot','semi'),('compliance','semi'),('reports','semi');

create table suggestions (
  id uuid primary key default gen_random_uuid(),
  domain text not null,               -- 'planner','publish','post_shoot','compliance','missing_work',...
  title text not null,
  body jsonb not null default '{}'::jsonb,  -- structured payload to execute on accept
  status suggestion_status not null default 'pending',
  client_id uuid references clients(id) on delete cascade,
  card_id uuid references cards(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_by uuid references profiles(id),
  resolved_at timestamptz
);
create index suggestions_idx on suggestions (status, created_at desc);

-- ---------- web push ----------
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,                -- {p256dh, auth}
  created_at timestamptz not null default now()
);
create index push_subs_profile_idx on push_subscriptions (profile_id);

-- ---------- RLS ----------
alter table portal_links enable row level security;
alter table client_ideas enable row level security;
alter table client_availability enable row level security;
alter table vehicles enable row level security;
alter table staff_leaves enable row level security;
alter table shoots enable row level security;
alter table client_packages enable row level security;
alter table payments enable row level security;
alter table ad_tasks enable row level security;
alter table automation_settings enable row level security;
alter table suggestions enable row level security;
alter table push_subscriptions enable row level security;

-- team reads everything (portal public pages use the service role)
create policy team_read_portal_links on portal_links for select to authenticated using (true);
create policy team_read_client_ideas on client_ideas for select to authenticated using (true);
create policy team_read_availability on client_availability for select to authenticated using (true);
create policy team_read_vehicles on vehicles for select to authenticated using (true);
create policy team_read_leaves on staff_leaves for select to authenticated using (true);
create policy team_read_shoots on shoots for select to authenticated using (true);
create policy team_read_packages on client_packages for select to authenticated using (true);
create policy team_read_payments on payments for select to authenticated using (true);
create policy team_read_ads on ad_tasks for select to authenticated using (true);
create policy team_read_automation on automation_settings for select to authenticated using (true);
create policy team_read_suggestions on suggestions for select to authenticated using (true);
create policy self_read_push on push_subscriptions for select to authenticated
  using (profile_id = auth.uid());

-- writes
create policy mgr_write_portal_links on portal_links for all to authenticated
  using (my_role() in ('admin','manager')) with check (my_role() in ('admin','manager'));
create policy mgr_write_client_ideas on client_ideas for update to authenticated
  using (my_role() in ('admin','manager'));
-- client_ideas/client_availability inserts: service role only (portal routes).

create policy mgr_write_vehicles on vehicles for all to authenticated
  using (my_role() in ('admin','manager')) with check (my_role() in ('admin','manager'));

create policy self_or_mgr_write_leaves on staff_leaves for all to authenticated
  using (profile_id = auth.uid() or my_role() in ('admin','manager'))
  with check (profile_id = auth.uid() or my_role() in ('admin','manager'));

create policy team_write_shoots on shoots for insert to authenticated with check (true);
create policy team_update_shoots on shoots for update to authenticated using (true) with check (true);
create policy mgr_delete_shoots on shoots for delete to authenticated
  using (my_role() in ('admin','manager'));

create policy mgr_write_packages on client_packages for all to authenticated
  using (my_role() in ('admin','manager')) with check (my_role() in ('admin','manager'));
create policy mgr_write_payments on payments for all to authenticated
  using (my_role() in ('admin','manager')) with check (my_role() in ('admin','manager'));
create policy mgr_write_ads on ad_tasks for all to authenticated
  using (my_role() in ('admin','manager')) with check (my_role() in ('admin','manager'));

create policy admin_write_automation on automation_settings for update to authenticated
  using (my_role() = 'admin') with check (my_role() = 'admin');

create policy mgr_resolve_suggestions on suggestions for update to authenticated
  using (my_role() in ('admin','manager')) with check (my_role() in ('admin','manager'));
-- suggestion inserts: worker/service role only.

create policy self_write_push on push_subscriptions for insert to authenticated
  with check (profile_id = auth.uid());
create policy self_delete_push on push_subscriptions for delete to authenticated
  using (profile_id = auth.uid());

-- ---------- activity triggers (rule 2: every mutation logs) ----------
create or replace function log_shoot_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into activity_log (actor, client_id, action, detail)
    values (auth.uid(), new.client_id, 'shoot.created',
            jsonb_build_object('shoot_id', new.id, 'title', new.title,
                               'starts_at', new.starts_at));
  elsif new.status is distinct from old.status then
    insert into activity_log (actor, client_id, action, detail)
    values (auth.uid(), new.client_id, 'shoot.status_changed',
            jsonb_build_object('shoot_id', new.id, 'title', new.title,
                               'from', old.status, 'to', new.status));
  end if;
  return new;
end $$;
create trigger shoots_log after insert or update on shoots
  for each row execute function log_shoot_changed();

create or replace function log_payment_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into activity_log (actor, client_id, action, detail)
    values (auth.uid(), new.client_id, 'payment.created',
            jsonb_build_object('payment_id', new.id, 'title', new.title,
                               'amount', new.amount, 'due_on', new.due_on));
  elsif new.status is distinct from old.status then
    insert into activity_log (actor, client_id, action, detail)
    values (auth.uid(), new.client_id, 'payment.status_changed',
            jsonb_build_object('payment_id', new.id, 'title', new.title,
                               'from', old.status, 'to', new.status));
  end if;
  return new;
end $$;
create trigger payments_log after insert or update on payments
  for each row execute function log_payment_changed();

create or replace function log_ad_task_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into activity_log (actor, client_id, action, detail)
    values (auth.uid(), new.client_id, 'ad.created',
            jsonb_build_object('ad_id', new.id, 'platform', new.platform,
                               'budget', new.budget));
  elsif new.status is distinct from old.status then
    insert into activity_log (actor, client_id, action, detail)
    values (auth.uid(), new.client_id, 'ad.status_changed',
            jsonb_build_object('ad_id', new.id, 'platform', new.platform,
                               'from', old.status, 'to', new.status));
  end if;
  return new;
end $$;
create trigger ad_tasks_log after insert or update on ad_tasks
  for each row execute function log_ad_task_changed();

create or replace function log_idea_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into activity_log (actor, client_id, action, detail)
  values (null, new.client_id, 'idea.received',
          jsonb_build_object('idea_id', new.id, 'title', new.title));
  return new;
end $$;
create trigger client_ideas_log after insert on client_ideas
  for each row execute function log_idea_created();

create or replace function log_automation_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into activity_log (actor, action, detail)
  values (auth.uid(), 'automation.mode_changed',
          jsonb_build_object('key', new.key, 'from', old.mode, 'to', new.mode));
  return new;
end $$;
create trigger automation_log after update on automation_settings
  for each row execute function log_automation_changed();

create or replace function log_suggestion_resolved() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into activity_log (actor, client_id, card_id, action, detail)
    values (auth.uid(), new.client_id, new.card_id, 'suggestion.resolved',
            jsonb_build_object('suggestion_id', new.id, 'title', new.title,
                               'domain', new.domain, 'to', new.status));
  end if;
  return new;
end $$;
create trigger suggestions_log after update on suggestions
  for each row execute function log_suggestion_resolved();
