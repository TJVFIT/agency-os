-- Fix: cards_status_guard failed OPEN when the acting user has no profiles
-- row. `select role into actor_role` leaves actor_role NULL, the CASE then
-- yields NULL (not false), and `if not NULL` skips the raise — so an
-- authenticated user without a profile could set status='approved'.
-- (Found in Phase 0 review; previously masked only by the activity_log.actor
-- FK.) SPEC §4 requires this guard to fail closed: only manager|admin or the
-- service role may approve. Same body as 0001, with coalesce(..., false).

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
      when new.status = 'approved'
        then actor_role in ('admin','manager')
      when new.status = 'published'
        then false                      -- worker only (service role)
      else true
    end, false);
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
