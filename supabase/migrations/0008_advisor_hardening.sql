-- Agency OS — advisor hardening (Supabase migration 0008)
-- Closes the findings the hosted security advisor raised after 0001–0007
-- landed on the live project. All are defense-in-depth: none were exploitable
-- (PostgREST cannot invoke functions that return `trigger`), but revoking
-- EXECUTE removes them from the exposed RPC surface entirely, matching the
-- claim_ai_jobs precedent from 0003.

-- Trigger functions: fired by the system, never called directly. Runtime
-- trigger execution does not check the DML caller's EXECUTE privilege, so
-- revoking from every API role is safe (incl. handle_new_user, which GoTrue
-- fires via the auth.users insert).
revoke execute on function handle_new_user() from public, anon, authenticated;
revoke execute on function cards_status_guard() from public, anon, authenticated;
revoke execute on function profiles_guard_role() from public, anon, authenticated;
revoke execute on function touch_updated_at() from public, anon, authenticated;
revoke execute on function log_card_created() from public, anon, authenticated;
revoke execute on function log_comment_added() from public, anon, authenticated;
revoke execute on function log_content_updated() from public, anon, authenticated;
revoke execute on function log_asset_created() from public, anon, authenticated;
revoke execute on function log_card_assignment() from public, anon, authenticated;
revoke execute on function log_shoot_changed() from public, anon, authenticated;
revoke execute on function log_payment_changed() from public, anon, authenticated;
revoke execute on function log_ad_task_changed() from public, anon, authenticated;
revoke execute on function log_idea_created() from public, anon, authenticated;
revoke execute on function log_automation_changed() from public, anon, authenticated;
revoke execute on function log_suggestion_resolved() from public, anon, authenticated;

-- my_role(): RLS policies call it in the querying user's context, so
-- `authenticated` MUST keep EXECUTE — revoking it would break every
-- role-gated policy with permission-denied. Anon never evaluates those
-- policies (all are `to authenticated`), so it loses access.
revoke execute on function my_role() from public, anon;

-- touch_updated_at was the one function without a pinned search_path
-- (plain trigger, not SECURITY DEFINER — pinned anyway per the linter).
alter function touch_updated_at() set search_path = public;
