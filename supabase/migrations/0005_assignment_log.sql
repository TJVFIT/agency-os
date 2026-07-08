-- Log card assignment changes so the worker can send "assigned to you"
-- Telegram notifications (SPEC §9). Status/comment/content/asset events are
-- already logged by earlier triggers; assignment lives on a plain column
-- update, which none of them capture.

create or replace function log_card_assignment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT' and new.assignee is not null)
     or (tg_op = 'UPDATE'
         and new.assignee is distinct from old.assignee
         and new.assignee is not null) then
    insert into activity_log (actor, client_id, card_id, action, detail)
    values (auth.uid(), new.client_id, new.id, 'card.assigned',
            jsonb_build_object('assignee', new.assignee));
  end if;
  return new;
end $$;

create trigger cards_log_assignment
  after insert or update of assignee on cards
  for each row execute function log_card_assignment();
