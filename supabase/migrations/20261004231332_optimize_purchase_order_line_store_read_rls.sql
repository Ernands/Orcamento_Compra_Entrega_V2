create or replace function app.can_store_any(p_permission_keys text[], p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_store_access(p_store_id)
    and exists (
      select 1
      from public.usuarios u
      join public.permissoes p
        on p.chave = any(p_permission_keys)
       and p.ativo
      where u.auth_user_id = (select auth.uid())
        and u.status = 'active'
        and not exists (
          select 1
          from public.usuario_permissoes up
          where up.usuario_id = u.id
            and up.permissao_id = p.id
            and (up.loja_id is null or up.loja_id = p_store_id)
            and up.efeito = 'deny'
            and (up.expires_at is null or up.expires_at > now())
        )
        and (
          exists (
            select 1
            from public.perfil_permissoes pp
            where pp.perfil_id = u.perfil_id
              and pp.permissao_id = p.id
          )
          or exists (
            select 1
            from public.usuario_permissoes up
            where up.usuario_id = u.id
              and up.permissao_id = p.id
              and (up.loja_id is null or up.loja_id = p_store_id)
              and up.efeito = 'grant'
              and (up.expires_at is null or up.expires_at > now())
          )
        )
    );
$$;

revoke all on function app.can_store_any(text[], uuid) from public;
revoke all on function app.can_store_any(text[], uuid) from anon;
grant execute on function app.can_store_any(text[], uuid) to authenticated;

drop policy if exists supply_purchase_order_line_stores_read on public.supply_purchase_order_line_stores;
create policy supply_purchase_order_line_stores_read
on public.supply_purchase_order_line_stores
for select
to authenticated
using (
  exists (
    select 1
    from public.supply_purchase_order_items line
    join public.supply_purchase_orders purchase_order
      on purchase_order.id = line.order_id
    where line.id = supply_purchase_order_line_stores.order_line_id
      and app.can_read_supply_purchase(purchase_order.purchase_id)
  )
  and app.can_store_any(
    array[
      'purchases.view',
      'finance.overview_view',
      'finance.store_detail_view',
      'finance.payments_view',
      'finance.stores_ufs_view',
      'finance.reimbursements_view'
    ]::text[],
    store_id
  )
);
