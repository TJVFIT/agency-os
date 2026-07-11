-- Agency OS — security hardening (Supabase migration 0007)
-- Closes four confirmed findings from the Phase review. All fixes live in the
-- DB layer (triggers + RLS) so they hold even when a member talks to PostgREST
-- directly, bypassing the server actions and lib/status.ts.
--
-- NOTE (signup lockdown): this migration's companion change in
-- supabase/config.toml sets enable_signup=false, but config.toml only takes
-- effect on a `supabase config push` for the LINKED project. The hosted
-- project's Authentication → Providers dashboard must ALSO have "Allow new
-- users to sign up" disabled — SPEC §4 is invite-only (admins invite via the
-- service role). config.toml alone does not retro-close an already-open
-- dashboard setting.

-- ---------------------------------------------------------------------------
-- 1) Privilege escalation via self_update_profile (0001).
--
-- The RLS policy self_update_profile only asserts id = auth.uid() in USING and
-- CHECK, so a member can PATCH their own profiles.role to 'admin' through
-- PostgREST. RLS can't express "columns other than role" cheaply, so we gate
-- the role column with a BEFORE UPDATE trigger: a role change is allowed only
-- when the actor is an admin or the service role (auth.uid() is null). All
-- other self-updates (full_name, telegram_chat_id) pass through untouched.
-- ---------------------------------------------------------------------------
create or replace function profiles_guard_role() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor_role user_role;
begin
  if new.role is distinct from old.role then
    -- service role (worker / admin invite): auth.uid() is null → allowed.
    if auth.uid() is not null then
      select role into actor_role from profiles where id = auth.uid();
      -- coalesce fails closed: a caller with no profile row (actor_role NULL)
      -- yields NULL from the comparison, which coalesces to false → raise.
      if not coalesce(actor_role = 'admin', false) then
        raise exception 'role changes require an admin (actor role %)',
          actor_role;
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_role_guard on profiles;
create trigger profiles_role_guard before update on profiles
  for each row execute function profiles_guard_role();

-- ---------------------------------------------------------------------------
-- 3) Token exposure via team_read_links / team_read_portal_links.
--
-- Both were SELECT to authenticated using(true), handing every member the raw
-- approval/portal tokens, from which they could self-approve via /approve or
-- /portal. Members never need the token: the public routes read by token with
-- the service role. Restrict reads to admin/manager (who mint the links).
-- ---------------------------------------------------------------------------
drop policy if exists team_read_links on approval_links;
create policy team_read_links on approval_links for select to authenticated
  using (my_role() in ('admin','manager'));

drop policy if exists team_read_portal_links on portal_links;
create policy team_read_portal_links on portal_links for select to authenticated
  using (my_role() in ('admin','manager'));

-- ---------------------------------------------------------------------------
-- 4) Weak DB status guard (0001/0002).
--
-- The prior guard gated only 'approved' (manager/admin) and 'published'
-- (service), letting every other transition through (else true). A member
-- could PATCH cards directly to reject an awaiting-approval card
-- (translated/visual_ready → copy_draft, manager-only per SPEC §5) or move a
-- card out of the terminal 'published'/'archived' states. This CREATE OR
-- REPLACE mirrors lib/status.ts semantics as a fail-closed backstop:
--   (a) no transition OUT of 'published' or 'archived' except the service role;
--   (b) the reject transition (translated|visual_ready → copy_draft) requires
--       manager/admin/service;
--   (c) keeps the approved (manager/admin), published (service-only) and
--       scheduled-future checks, plus the coalesce(...,false) fail-closed fix;
--   (d) keeps the activity_log insert.
-- The guard stays looser than lib/status.ts (no lang / platform awareness) by
-- design — it is a backstop, not the source of truth.
-- ---------------------------------------------------------------------------
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
    allowed := coalesce(case
      -- (a) 'published'/'archived' are terminal for non-service actors: any
      -- move out of them (e.g. backwards from published) is service-only.
      when old.status in ('published','archived')
        then false
      -- approve: manager/admin only
      when new.status = 'approved'
        then actor_role in ('admin','manager')
      -- publish: worker only (service role)
      when new.status = 'published'
        then false
      -- (b) reject: sending an awaiting-approval card back to copy_draft is an
      -- approval decision — manager/admin only (idea → copy_draft is exempt).
      when new.status = 'copy_draft'
           and old.status in ('translated','visual_ready')
        then actor_role in ('admin','manager')
      else true
    end, false);
  end if;

  if not allowed then
    raise exception 'transition % → % not allowed for role %',
      old.status, new.status, actor_role;
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
