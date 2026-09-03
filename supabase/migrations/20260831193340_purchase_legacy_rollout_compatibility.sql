-- Mantem a tela antiga de Compras funcional durante a janela de rollout e
-- reconcilia registros historicos simples com a nova distribuicao fisica.

-- Backfill seguro: somente linhas ainda sem distribuicao. A funcao privada
-- confirma automaticamente apenas casos inequivocos (destino direto, item de
-- loja ou compra vinculada a uma unica loja); agrupamentos permanecem pendentes.
do $$
declare
  v_line_id uuid;
begin
  for v_line_id in
    select line.id
    from public.supply_purchase_order_items line
    join public.supply_purchase_orders purchase_order on purchase_order.id = line.order_id
    where purchase_order.status = 'active'
      and not exists (
        select 1
        from public.supply_purchase_order_line_stores line_store
        where line_store.order_line_id = line.id
      )
  loop
    perform private.auto_allocate_supply_purchase_order_line_store(v_line_id);
  end loop;
end;
$$;

-- Compatibilidade temporaria com a interface anterior. Enquanto nao houver
-- registros manuais V2 para o item, o RPC legado passa a manter uma unica
-- linha legacy_backfill que representa o estado acumulado informado pela tela
-- antiga. Assim o novo historico continua sendo a fonte dos totais realizados.
create or replace function public.save_supply_purchase_item(
  p_purchase_item_id uuid,
  p_purchased_quantity numeric,
  p_actual_unit_price numeric,
  p_actual_discount_amount numeric,
  p_actual_shipping_amount numeric,
  p_actual_other_costs numeric,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.supply_purchase_items;
  v_purchase_status text;
  v_actor uuid := app.current_usuario_id();
  v_legacy_order_id uuid;
  v_legacy_line_id uuid;
  v_before jsonb;
begin
  select * into v_item
  from public.supply_purchase_items
  where id = p_purchase_item_id
  for update;

  if v_item.id is null or not app.can_edit_supply_purchase(v_item.purchase_id) then
    raise exception 'permission denied';
  end if;

  select purchase.status into v_purchase_status
  from public.supply_purchases purchase
  where purchase.id = v_item.purchase_id
  for update;

  if v_purchase_status in ('returned', 'cancelled') then
    raise exception 'purchase is closed';
  end if;

  if p_purchased_quantity is null
    or p_actual_unit_price is null
    or p_actual_discount_amount is null
    or p_actual_shipping_amount is null
    or p_actual_other_costs is null
    or p_purchased_quantity < 0
    or p_purchased_quantity > v_item.quantity_approved
    or p_actual_unit_price < 0
    or p_actual_discount_amount < 0
    or p_actual_shipping_amount < 0
    or p_actual_other_costs < 0 then
    raise exception 'invalid purchase values';
  end if;

  if p_actual_discount_amount > round(p_purchased_quantity * p_actual_unit_price, 2) then
    raise exception 'purchase discount exceeds subtotal';
  end if;

  -- Uma aba antiga aberta no navegador nao pode sobrescrever historico criado
  -- pela nova interface. Neste caso pedimos recarga da aplicacao.
  if exists (
    select 1
    from public.supply_purchase_order_items line
    join public.supply_purchase_orders purchase_order on purchase_order.id = line.order_id
    where line.purchase_item_id = p_purchase_item_id
      and purchase_order.status = 'active'
      and purchase_order.source <> 'legacy_backfill'
  ) then
    raise exception 'purchase item has v2 execution history; reload the application';
  end if;

  select purchase_order.id into v_legacy_order_id
  from public.supply_purchase_orders purchase_order
  where purchase_order.purchase_id = v_item.purchase_id
    and purchase_order.source = 'legacy_backfill'
  limit 1;

  if v_legacy_order_id is not null then
    select line.id into v_legacy_line_id
    from public.supply_purchase_order_items line
    where line.order_id = v_legacy_order_id
      and line.purchase_item_id = p_purchase_item_id
    limit 1;
  end if;

  -- Nao alteramos uma distribuicao manual feita na nova interface por meio de
  -- uma aba antiga ainda aberta.
  if v_legacy_line_id is not null and exists (
    select 1
    from public.supply_purchase_order_line_stores line_store
    where line_store.order_line_id = v_legacy_line_id
      and line_store.allocation_source = 'manual'
  ) then
    raise exception 'purchase item has store distribution; reload the application';
  end if;

  v_before := to_jsonb(v_item);

  if p_purchased_quantity = 0 then
    if v_legacy_line_id is not null then
      delete from public.supply_purchase_order_items
      where id = v_legacy_line_id;
    end if;
  else
    if v_legacy_order_id is null then
      insert into public.supply_purchase_orders (
        purchase_id,
        purchased_on,
        status,
        source,
        notes,
        created_by
      ) values (
        v_item.purchase_id,
        current_date,
        'active',
        'legacy_backfill',
        'Registro de compatibilidade criado durante a transicao para Compras V2.',
        v_actor
      ) returning id into v_legacy_order_id;
    elsif (select status from public.supply_purchase_orders where id = v_legacy_order_id) <> 'active' then
      raise exception 'legacy purchase history is closed; reload the application';
    end if;

    if v_legacy_line_id is null then
      insert into public.supply_purchase_order_items (
        order_id,
        purchase_item_id,
        purchase_destination_id,
        item_code_snapshot,
        item_name_snapshot,
        destination_label_snapshot,
        destination_state_snapshot,
        quantity,
        unit,
        unit_price,
        discount_amount,
        shipping_amount,
        other_costs,
        expected_delivery_date,
        notes
      ) values (
        v_legacy_order_id,
        v_item.id,
        null,
        v_item.item_code_snapshot,
        v_item.item_name_snapshot,
        null,
        null,
        p_purchased_quantity,
        v_item.unit,
        p_actual_unit_price,
        p_actual_discount_amount,
        p_actual_shipping_amount,
        p_actual_other_costs,
        null,
        nullif(trim(p_notes), '')
      ) returning id into v_legacy_line_id;
    else
      update public.supply_purchase_order_items
      set quantity = p_purchased_quantity,
          unit_price = p_actual_unit_price,
          discount_amount = p_actual_discount_amount,
          shipping_amount = p_actual_shipping_amount,
          other_costs = p_actual_other_costs,
          notes = nullif(trim(p_notes), '')
      where id = v_legacy_line_id;

      -- Se a linha tinha alocacao direta criada pelo backfill, ela acompanha a
      -- quantidade acumulada da tela legada.
      update public.supply_purchase_order_line_stores
      set quantity = p_purchased_quantity
      where order_line_id = v_legacy_line_id
        and allocation_source = 'direct';
    end if;
  end if;

  perform private.sync_supply_purchase_item_execution_totals(v_item.id);

  update public.supply_purchase_items
  set notes = nullif(trim(p_notes), '')
  where id = v_item.id;

  perform private.recalculate_supply_purchase_status(v_item.purchase_id);

  -- Remove ordem tecnica vazia para ela nao contar como registro ativo.
  if v_legacy_order_id is not null
     and not exists (
       select 1 from public.supply_purchase_order_items line
       where line.order_id = v_legacy_order_id
     ) then
    delete from public.supply_purchase_orders
    where id = v_legacy_order_id
      and source = 'legacy_backfill';
  end if;

  insert into public.audit_logs (
    actor_usuario_id, action, entity_type, entity_id, before_json, after_json, origin
  ) values (
    v_actor,
    'purchase.item.updated_legacy_compat',
    'supply_purchase_item',
    p_purchase_item_id,
    v_before,
    (select to_jsonb(item) from public.supply_purchase_items item where item.id = p_purchase_item_id),
    'database'
  );
end;
$$;

revoke execute on function public.save_supply_purchase_item(uuid, numeric, numeric, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.save_supply_purchase_item(uuid, numeric, numeric, numeric, numeric, numeric, text) to authenticated;