alter table public.checklist_master_items
drop constraint checklist_master_items_relative_due_days_check;

alter table public.checklist_master_items
add constraint checklist_master_items_relative_due_days_check check (
  relative_due_days is null or relative_due_days between -3650 and 3650
);
