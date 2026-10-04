create or replace function app.can_read_supply_purchase_fast(p_purchase_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.usuarios u
    join public.permissoes p
      on p.chave = any(array[
        'purchases.view',
        'finance.overview_view',
        'finance.store_detail_view',
        'finance.payments_view',
        'finance.stores_ufs_view',
        'finance.reimbursements_view'
      ]::text[])
     and p.ativo
    where u.auth_user_id = (select auth.uid())
      and u.status = 'active'
      and not exists (
        select 1
        from public.usuario_permissoes up
        where up.usuario_id = u.id
          and up.permissao_id = p.id
          and up.loja_id is null
          and up.efeito = 'deny'
          and (up.expires_at is null or up.expires_at > now())
      )
      and (
        exists (
          select 1 from public.perfil_permissoes pp
          where pp.perfil_id = u.perfil_id and pp.permissao_id = p.id
        )
        or exists (
          select 1 from public.usuario_permissoes up
          where up.usuario_id = u.id
            and up.permissao_id = p.id
            and up.loja_id is null
            and up.efeito = 'grant'
            and (up.expires_at is null or up.expires_at > now())
        )
      )
      and exists (
        select 1 from public.supply_purchase_stores ps
        where ps.purchase_id = p_purchase_id
      )
      and not exists (
        select 1
        from public.supply_purchase_stores ps
        where ps.purchase_id = p_purchase_id
          and not (
            app.has_store_access(ps.store_id)
            and not exists (
              select 1 from public.usuario_permissoes up
              where up.usuario_id = u.id
                and up.permissao_id = p.id
                and (up.loja_id is null or up.loja_id = ps.store_id)
                and up.efeito = 'deny'
                and (up.expires_at is null or up.expires_at > now())
            )
            and (
              exists (
                select 1 from public.perfil_permissoes pp
                where pp.perfil_id = u.perfil_id and pp.permissao_id = p.id
              )
              or exists (
                select 1 from public.usuario_permissoes up
                where up.usuario_id = u.id
                  and up.permissao_id = p.id
                  and (up.loja_id is null or up.loja_id = ps.store_id)
                  and up.efeito = 'grant'
                  and (up.expires_at is null or up.expires_at > now())
              )
            )
          )
      )
  );
$$;

revoke all on function app.can_read_supply_purchase_fast(uuid) from public;
revoke all on function app.can_read_supply_purchase_fast(uuid) from anon;
grant execute on function app.can_read_supply_purchase_fast(uuid) to authenticated;
