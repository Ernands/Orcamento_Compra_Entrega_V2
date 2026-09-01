revoke execute on function public.create_supply_purchase_order(uuid, date, text, date, text, jsonb) from public, anon;
revoke execute on function public.cancel_supply_purchase_order(uuid, text) from public, anon;
revoke execute on function public.save_supply_purchase_destination_distribution(uuid, jsonb) from public, anon;

grant execute on function public.create_supply_purchase_order(uuid, date, text, date, text, jsonb) to authenticated;
grant execute on function public.cancel_supply_purchase_order(uuid, text) to authenticated;
grant execute on function public.save_supply_purchase_destination_distribution(uuid, jsonb) to authenticated;