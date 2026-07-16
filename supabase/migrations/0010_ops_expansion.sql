-- Agency OS v4 (client requirements doc 2026-07-15): equipment management,
-- vehicle extras (driver, unavailability blocks), dynamic task types,
-- global + per-client shoot blocks, and the internal AI assistant chat.

-- ---------- enum extensions ----------
-- NOTE: new enum values must not be *used* later in this same migration.
alter type job_kind add value if not exists 'chat';

-- ---------- global settings (key/value) ----------
create table app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);
insert into app_settings (key, value) values
  ('shoot_block_minutes', '210'::jsonb);

-- Per-client override; null = use the app_settings global (210 min default).
alter table clients add column if not exists shoot_block_minutes int;

-- ---------- vehicle extras (v4 §4) ----------
alter table vehicles add column if not exists
  driver uuid references profiles(id) on delete set null;
alter table vehicles add column if not exists notes text not null default '';

-- Maintenance / unavailability windows. A blocked vehicle must not be
-- suggested by lib/scheduling for shoots inside the window.
create table vehicle_blocks (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  reason text not null default '',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index vehicle_blocks_idx on vehicle_blocks (vehicle_id, starts_on);

-- ---------- equipment (v4 — entirely new module) ----------
create table equipment (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default '',            -- kamera, lens, ışık, ses, gimbal…
  serial text not null default '',
  vehicle_id uuid references vehicles(id) on delete set null, -- fixed kit on a vehicle
  active boolean not null default true,
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index equipment_active_idx on equipment (active);

-- Shoots reserve equipment like they reserve crew — uuid[] mirrors crew,
-- conflict-checked in lib/scheduling (no double-booking in overlapping blocks).
alter table shoots add column if not exists
  equipment_ids uuid[] not null default '{}';

-- ---------- dynamic task types (v4 §6) ----------
create table task_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  default_minutes int not null default 60,
  workload_points int not null default 1,
  requires_review boolean not null default false,
  priority smallint not null default 3,
  auto_open boolean not null default false,
  depends_on uuid references task_types(id) on delete set null,
  default_assignee uuid references profiles(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
-- Cards may carry a task type (görev türü) alongside the content-format enum.
alter table cards add column if not exists
  task_type_id uuid references task_types(id) on delete set null;

-- ---------- internal AI assistant (one rolling thread per profile) ----------
create table assistant_messages (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  body text not null,
  created_at timestamptz not null default now()
);
create index assistant_messages_idx on assistant_messages (profile_id, created_at desc);

-- ---------- RLS ----------
alter table app_settings enable row level security;
alter table vehicle_blocks enable row level security;
alter table equipment enable row level security;
alter table task_types enable row level security;
alter table assistant_messages enable row level security;

create policy team_read_app_settings on app_settings
  for select to authenticated using (true);
create policy admin_write_app_settings on app_settings
  for all to authenticated
  using (my_role() = 'admin') with check (my_role() = 'admin');

create policy team_read_vehicle_blocks on vehicle_blocks
  for select to authenticated using (true);
create policy mgr_write_vehicle_blocks on vehicle_blocks
  for all to authenticated
  using (my_role() in ('admin','manager'))
  with check (my_role() in ('admin','manager'));

create policy team_read_equipment on equipment
  for select to authenticated using (true);
create policy mgr_write_equipment on equipment
  for all to authenticated
  using (my_role() in ('admin','manager'))
  with check (my_role() in ('admin','manager'));

create policy team_read_task_types on task_types
  for select to authenticated using (true);
create policy mgr_write_task_types on task_types
  for all to authenticated
  using (my_role() in ('admin','manager'))
  with check (my_role() in ('admin','manager'));

-- Assistant chat is personal: each profile reads/sends only its own thread.
-- Assistant replies are written by the worker (service role).
create policy self_read_assistant on assistant_messages
  for select to authenticated using (profile_id = auth.uid());
create policy self_send_assistant on assistant_messages
  for insert to authenticated
  with check (profile_id = auth.uid() and role = 'user');

-- ---------- activity triggers (rule 2) ----------
create or replace function log_equipment_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into activity_log (actor, action, detail)
    values (auth.uid(), 'equipment.created',
            jsonb_build_object('equipment_id', new.id, 'name', new.name));
  elsif new.active is distinct from old.active then
    insert into activity_log (actor, action, detail)
    values (auth.uid(), 'equipment.updated',
            jsonb_build_object('equipment_id', new.id, 'name', new.name,
                               'active', new.active));
  end if;
  return new;
end $$;
create trigger equipment_log after insert or update on equipment
  for each row execute function log_equipment_changed();

create or replace function log_vehicle_block_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into activity_log (actor, action, detail)
  values (auth.uid(), 'vehicle.blocked',
          jsonb_build_object('vehicle_id', new.vehicle_id,
                             'starts_on', new.starts_on,
                             'ends_on', new.ends_on, 'reason', new.reason));
  return new;
end $$;
create trigger vehicle_blocks_log after insert on vehicle_blocks
  for each row execute function log_vehicle_block_created();

create or replace function log_task_type_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into activity_log (actor, action, detail)
  values (auth.uid(), 'task_type.created',
          jsonb_build_object('task_type_id', new.id, 'name', new.name));
  return new;
end $$;
create trigger task_types_log after insert on task_types
  for each row execute function log_task_type_created();

create or replace function log_setting_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into activity_log (actor, action, detail)
  values (auth.uid(), 'setting.changed',
          jsonb_build_object('key', new.key, 'from', old.value, 'to', new.value));
  return new;
end $$;
create trigger app_settings_log after update on app_settings
  for each row execute function log_setting_changed();

-- Chat: log usage without the message body (personal-tool noise + privacy);
-- only user-sent messages are counted, replies are system output.
create or replace function log_assistant_used() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'user' then
    insert into activity_log (actor, action, detail)
    values (new.profile_id, 'assistant.used', '{}'::jsonb);
  end if;
  return new;
end $$;
create trigger assistant_messages_log after insert on assistant_messages
  for each row execute function log_assistant_used();

-- Advisor hygiene (0008 precedent).
revoke execute on function log_equipment_changed() from public, anon, authenticated;
revoke execute on function log_vehicle_block_created() from public, anon, authenticated;
revoke execute on function log_task_type_created() from public, anon, authenticated;
revoke execute on function log_setting_changed() from public, anon, authenticated;
revoke execute on function log_assistant_used() from public, anon, authenticated;

-- Assistant replies stream to the UI live.
alter publication supabase_realtime add table assistant_messages;
