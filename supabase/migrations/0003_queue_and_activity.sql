-- Queue claim function + activity-log triggers for non-status mutations.

-- ---------- ai_jobs claiming (SPEC §6.1) ----------
-- The worker polls via supabase-js RPC; FOR UPDATE SKIP LOCKED needs SQL, so
-- it lives here instead of a raw connection string in the worker env.
create or replace function claim_ai_jobs(batch int default 3)
returns setof ai_jobs
language sql
security definer set search_path = public as $$
  update ai_jobs j
     set status = 'running', updated_at = now()
   where j.id in (
     select id from ai_jobs
      where status = 'queued' and run_after <= now()
      order by created_at
      limit batch
      for update skip locked)
  returning j.*;
$$;

-- Worker-only: it authenticates with the service role, which bypasses this,
-- but the explicit revoke keeps authenticated/anon from draining the queue.
revoke execute on function claim_ai_jobs(int) from public, anon, authenticated;

-- ---------- activity triggers (CLAUDE.md rule 2: every mutation logs) ----------
-- Status changes are logged by cards_status_guard; these cover the other
-- team mutations where auth.uid() is available in the RLS context.

create or replace function log_card_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into activity_log (actor, client_id, card_id, action, detail)
  values (auth.uid(), new.client_id, new.id, 'card.created',
          jsonb_build_object('title', new.title, 'type', new.type));
  return new;
end $$;

create trigger cards_log_insert after insert on cards
  for each row execute function log_card_created();

create or replace function log_comment_added() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_client uuid;
begin
  select client_id into v_client from cards where id = new.card_id;
  insert into activity_log (actor, client_id, card_id, action, detail)
  values (auth.uid(), v_client, new.card_id, 'comment.added',
          jsonb_build_object('excerpt', left(new.body, 140)));
  return new;
end $$;

create trigger comments_log_insert after insert on comments
  for each row execute function log_comment_added();

create or replace function log_content_updated() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_client uuid;
begin
  select client_id into v_client from cards where id = new.card_id;
  insert into activity_log (actor, client_id, card_id, action, detail)
  values (auth.uid(), v_client, new.card_id, 'content.updated',
          jsonb_build_object('lang', new.lang,
                             'caption_excerpt', left(new.caption, 140)));
  return new;
end $$;

create trigger card_contents_log_upsert after insert or update on card_contents
  for each row execute function log_content_updated();

create or replace function log_asset_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into activity_log (actor, client_id, action, detail)
  values (auth.uid(), new.client_id, 'asset.created',
          jsonb_build_object('asset_id', new.id, 'kind', new.kind,
                             'source', new.source,
                             'name', new.original_name));
  return new;
end $$;

create trigger assets_log_insert after insert on assets
  for each row execute function log_asset_created();
