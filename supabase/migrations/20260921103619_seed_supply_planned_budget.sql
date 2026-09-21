begin;

-- Carga inicial fornecida em Lista_Orçamento_Sistema.xlsx.
-- Os vínculos usam nomes de itens e códigos de loja, nunca UUIDs gerados por ambiente.

create temporary table planned_budget_seed_items (
  seed_key text primary key,
  item_name text not null,
  group_name text not null,
  unit_price numeric(14,2) not null,
  quantity_attended numeric(14,3) not null,
  quantity_unattended numeric(14,3) not null,
  quantity_baependi numeric(14,3) not null
) on commit drop;

insert into planned_budget_seed_items (
  seed_key,
  item_name,
  group_name,
  unit_price,
  quantity_attended,
  quantity_unattended,
  quantity_baependi
) values
  ('orcamento_previsto:002', 'Ar condicionado 1', 'Equipamentos', 2081.97, 1.000, 1.000, 1.000),
  ('orcamento_previsto:003', 'Ar condicionado 2', 'Equipamentos', 8204.78, 1.000, 1.000, 1.000),
  ('orcamento_previsto:004', 'Purificador/bebedouro', 'Equipamentos', 519.90, 1.000, 1.000, 1.000),
  ('orcamento_previsto:005', 'Suporte para copos', 'Itens gerais', 42.49, 1.000, 1.000, 1.000),
  ('orcamento_previsto:006', 'Lixeira coletiva com pedal', 'Itens gerais', 54.07, 1.000, 1.000, 1.000),
  ('orcamento_previsto:007', 'Dispenser de álcool', 'Itens gerais', 38.89, 1.000, 1.000, 1.000),
  ('orcamento_previsto:008', 'Kit de primeiros socorros', 'Itens gerais', 61.90, 1.000, 1.000, 1.000),
  ('orcamento_previsto:009', 'Quadro de chaves', 'Itens gerais', 59.90, 1.000, 1.000, 1.000),
  ('orcamento_previsto:010', 'Suporte para notebook', 'Itens gerais', 21.89, 1.000, 1.000, 1.000),
  ('orcamento_previsto:011', 'Monitor videoatendimento (Tela fundo BB)', 'Equipamentos', 628.99, 1.000, 0.000, 1.000),
  ('orcamento_previsto:012', 'Webcam Full HD', 'Equipamentos', 341.61, 1.000, 0.000, 1.000),
  ('orcamento_previsto:013', 'Teclado e mouse', 'Equipamentos', 75.90, 2.000, 1.000, 3.000),
  ('orcamento_previsto:014', 'Headset profissional', 'Equipamentos', 159.18, 1.000, 0.000, 1.000),
  ('orcamento_previsto:015', 'Iluminador frontal', 'Equipamentos', 159.00, 1.000, 0.000, 1.000),
  ('orcamento_previsto:016', 'Detector de cédulas falsas', 'Equipamentos', 37.71, 2.000, 2.000, 2.000),
  ('orcamento_previsto:017', 'Impressora multifuncional com scanner', 'Equipamentos', 1205.00, 1.000, 1.000, 1.000),
  ('orcamento_previsto:018', 'Organizador de cédulas e moedas', 'Itens gerais', 39.99, 2.000, 2.000, 2.000),
  ('orcamento_previsto:019', 'Balcão atendimento Alto com Gaveta', 'Mobiliário', 414.06, 2.000, 2.000, 2.000),
  ('orcamento_previsto:020', 'Mesa Escritório negocial', 'Mobiliário', 410.00, 1.000, 1.000, 2.000),
  ('orcamento_previsto:021', 'Mesa de videoatendimento', 'Mobiliário', 410.00, 1.000, 1.000, 1.000),
  ('orcamento_previsto:022', 'Cadeira operacional ergonômica PADRÃO caixa alta', 'Mobiliário', 589.50, 2.000, 2.000, 2.000),
  ('orcamento_previsto:023', 'Apoio para os pés', 'Mobiliário', 39.90, 1.000, 1.000, 2.000),
  ('orcamento_previsto:024', 'Cadeira operacional ergonômica', 'Mobiliário', 645.20, 1.000, 1.000, 2.000),
  ('orcamento_previsto:025', 'Cadeira fixa para cliente', 'Mobiliário', 278.88, 2.000, 1.000, 3.000),
  ('orcamento_previsto:026', 'Longarina de espera com 3 lugares', 'Mobiliário', 629.98, 2.000, 2.000, 2.000),
  ('orcamento_previsto:027', 'Capa cadeira preferencial', 'Itens gerais', 59.90, 2.000, 2.000, 2.000),
  ('orcamento_previsto:028', 'Notebook negocial', 'Equipamentos', 3738.00, 1.000, 1.000, 2.000),
  ('orcamento_previsto:029', 'Computador de mesa para videoatendimento', 'Equipamentos', 2900.00, 1.000, 0.000, 1.000),
  ('orcamento_previsto:030', 'SmartPOS', 'Equipamentos', 900.00, 2.000, 2.000, 3.000),
  ('orcamento_previsto:031', 'Adaptador para leitor pistola e fonte', 'Equipamentos', 39.90, 2.000, 2.000, 3.000),
  ('orcamento_previsto:032', 'Fonte de alimentação SmartPOS', 'Equipamentos', 0.00, 0.000, 0.000, 0.000),
  ('orcamento_previsto:033', 'Bobinas SmartPOS iniciais', 'Itens gerais', 1.14, 113.000, 113.000, 113.000),
  ('orcamento_previsto:034', 'Organizador de fila', 'Itens gerais', 481.66, 1.000, 1.000, 1.000),
  ('orcamento_previsto:035', 'Filtro de privacidade para monitor', 'Equipamentos', 227.96, 2.000, 1.000, 3.000),
  ('orcamento_previsto:036', 'Máquina contadora de cédulas', 'Equipamentos', 434.99, 1.000, 1.000, 1.000),
  ('orcamento_previsto:037', 'Fragmentadora de papel', 'Equipamentos', 227.16, 1.000, 1.000, 1.000),
  ('orcamento_previsto:038', 'Calculadora de mesa', 'Equipamentos', 19.63, 3.000, 3.000, 4.000),
  ('orcamento_previsto:039', 'Regua', 'Itens gerais', 2.25, 3.000, 3.000, 4.000),
  ('orcamento_previsto:040', 'Lixeira individual', 'Itens gerais', 39.90, 3.000, 3.000, 4.000),
  ('orcamento_previsto:041', 'Grampeador', 'Itens gerais', 15.30, 3.000, 3.000, 4.000),
  ('orcamento_previsto:042', 'Grampos', 'Itens gerais', 4.86, 3.000, 3.000, 4.000),
  ('orcamento_previsto:043', 'Caneta', 'Itens gerais', 1.48, 3.000, 3.000, 4.000),
  ('orcamento_previsto:044', 'Agenda', 'Itens gerais', 31.00, 3.000, 3.000, 4.000),
  ('orcamento_previsto:045', 'Malote de segurança', 'Itens gerais', 14.12, 2.000, 2.000, 2.000),
  ('orcamento_previsto:046', 'Ligas', 'Itens gerais', 10.00, 1.000, 1.000, 1.000),
  ('orcamento_previsto:047', 'Resma de folhas', 'Itens gerais', 25.50, 1.000, 1.000, 1.000),
  ('orcamento_previsto:048', 'Lacre de Malote de Segurança', 'Itens gerais', 5.00, 1.000, 1.000, 1.000),
  ('orcamento_previsto:049', 'Gaveteiro móvel com chave', 'Mobiliário', 645.67, 1.000, 1.000, 2.000),
  ('orcamento_previsto:050', 'Armário alto com chave', 'Mobiliário', 726.78, 1.000, 1.000, 1.000),
  ('orcamento_previsto:051', 'Armário baixo com chave', 'Mobiliário', 636.01, 1.000, 1.000, 1.000),
  ('orcamento_previsto:052', 'Mesa de apoio para água/café', 'Mobiliário', 194.36, 1.000, 1.000, 1.000),
  ('orcamento_previsto:053', 'Bancada de apoio', 'Mobiliário', 0.00, 0.000, 0.000, 0.000);

create temporary table planned_budget_seed_stores (
  store_group text not null,
  store_code text primary key
) on commit drop;

insert into planned_budget_seed_stores (store_group, store_code) values
  ('Com atendimento', 'LOJ-001'),
  ('Com atendimento', 'LOJ-003'),
  ('Com atendimento', 'LOJ-004'),
  ('Com atendimento', 'LOJ-006'),
  ('Com atendimento', 'LOJ-013'),
  ('Com atendimento', 'LOJ-014'),
  ('Com atendimento', 'LOJ-015'),
  ('Com atendimento', 'LOJ-025'),
  ('Com atendimento', 'LOJ-026'),
  ('Com atendimento', 'LOJ-021'),
  ('Com atendimento', 'LOJ-010'),
  ('Com atendimento', 'LOJ-009'),
  ('Com atendimento', 'LOJ-024'),
  ('Sem atendimento', 'LOJ-002'),
  ('Sem atendimento', 'LOJ-007'),
  ('Sem atendimento', 'LOJ-005'),
  ('Sem atendimento', 'LOJ-011'),
  ('Sem atendimento', 'LOJ-017'),
  ('Sem atendimento', 'LOJ-020'),
  ('Sem atendimento', 'LOJ-012'),
  ('Sem atendimento', 'LOJ-016'),
  ('Sem atendimento', 'LOJ-018'),
  ('Sem atendimento', 'LOJ-019'),
  ('Sem atendimento', 'LOJ-023'),
  ('Sem atendimento', 'LOJ-027'),
  ('Baependi', 'LOJ-008');

-- O Orçamento Previsto nunca cria nem reativa itens do catálogo.
-- Todos os itens precisam ser cadastrados previamente pelo sistema.
do $catalog_preflight$
declare
  v_missing_items text;
  v_inactive_items text;
begin
  select string_agg(seed.item_name, ', ' order by seed.item_name)
  into v_missing_items
  from planned_budget_seed_items seed
  where not exists (
    select 1
    from public.supply_items item
    where lower(regexp_replace(btrim(item.name), '\\s+', ' ', 'g')) =
      lower(regexp_replace(btrim(seed.item_name), '\\s+', ' ', 'g'))
  );

  if v_missing_items is not null then
    raise exception
      'planned budget seed requires existing catalog items. Missing: %',
      v_missing_items;
  end if;

  select string_agg(seed.item_name, ', ' order by seed.item_name)
  into v_inactive_items
  from planned_budget_seed_items seed
  where not exists (
    select 1
    from public.supply_items item
    where lower(regexp_replace(btrim(item.name), '\\s+', ' ', 'g')) =
      lower(regexp_replace(btrim(seed.item_name), '\\s+', ' ', 'g'))
      and item.active
  );

  if v_inactive_items is not null then
    raise exception
      'planned budget seed requires active catalog items. Inactive: %',
      v_inactive_items;
  end if;
end;
$catalog_preflight$;

with catalog as (
  select
    seed.*,
    (
      select item.id
      from public.supply_items item
      where lower(regexp_replace(btrim(item.name), '\s+', ' ', 'g')) =
        lower(regexp_replace(btrim(seed.item_name), '\s+', ' ', 'g'))
      order by item.codigo_negocio, item.id
      limit 1
    ) as supply_item_id
  from planned_budget_seed_items seed
)
insert into public.supply_budget_segments (
  supply_item_id,
  name,
  active,
  notes
)
select
  catalog.supply_item_id,
  'Planejamento inicial',
  true,
  'Carga inicial Lista_Orçamento_Sistema.xlsx · ' || catalog.seed_key
from catalog
where catalog.supply_item_id is not null
  and not exists (
    select 1
    from public.supply_budget_segments segment
    where segment.supply_item_id = catalog.supply_item_id
      and segment.notes = 'Carga inicial Lista_Orçamento_Sistema.xlsx · ' || catalog.seed_key
  );

with catalog as (
  select
    seed.*,
    (
      select item.id
      from public.supply_items item
      where lower(regexp_replace(btrim(item.name), '\s+', ' ', 'g')) =
        lower(regexp_replace(btrim(seed.item_name), '\s+', ' ', 'g'))
      order by item.codigo_negocio, item.id
      limit 1
    ) as supply_item_id
  from planned_budget_seed_items seed
), seeded_segments as (
  select catalog.*, segment.id as segment_id
  from catalog
  join public.supply_budget_segments segment
    on segment.supply_item_id = catalog.supply_item_id
   and segment.notes = 'Carga inicial Lista_Orçamento_Sistema.xlsx · ' || catalog.seed_key
), allocations as (
  select
    seeded_segments.segment_id,
    store.id as store_id,
    case seed_store.store_group
      when 'Com atendimento' then seeded_segments.quantity_attended
      when 'Sem atendimento' then seeded_segments.quantity_unattended
      when 'Baependi' then seeded_segments.quantity_baependi
    end as quantity
  from seeded_segments
  cross join planned_budget_seed_stores seed_store
  join public.lojas store on store.codigo_negocio = seed_store.store_code
)
insert into public.supply_budget_segment_stores (segment_id, store_id, quantity)
select segment_id, store_id, quantity
from allocations
where quantity > 0
on conflict (segment_id, store_id) do update
set quantity = excluded.quantity;

with catalog as (
  select
    seed.*,
    (
      select item.id
      from public.supply_items item
      where lower(regexp_replace(btrim(item.name), '\s+', ' ', 'g')) =
        lower(regexp_replace(btrim(seed.item_name), '\s+', ' ', 'g'))
      order by item.codigo_negocio, item.id
      limit 1
    ) as supply_item_id
  from planned_budget_seed_items seed
), seeded_segments as (
  select catalog.*, segment.id as segment_id
  from catalog
  join public.supply_budget_segments segment
    on segment.supply_item_id = catalog.supply_item_id
   and segment.notes = 'Carga inicial Lista_Orçamento_Sistema.xlsx · ' || catalog.seed_key
)
insert into public.supply_budget_items (
  supply_item_id,
  segment_id,
  unit_price,
  active,
  notes
)
select
  supply_item_id,
  segment_id,
  unit_price,
  true,
  'Valor importado de Lista_Orçamento_Sistema.xlsx'
from seeded_segments
on conflict (segment_id) do update
set unit_price = excluded.unit_price,
    active = true,
    notes = excluded.notes,
    updated_at = now();

do $validation$
declare
  v_catalog_count integer;
  v_segment_count integer;
  v_budget_item_count integer;
begin
  select count(distinct item.id)
  into v_catalog_count
  from planned_budget_seed_items seed
  join public.supply_items item
    on lower(regexp_replace(btrim(item.name), '\s+', ' ', 'g')) =
      lower(regexp_replace(btrim(seed.item_name), '\s+', ' ', 'g'));

  select count(*)
  into v_segment_count
  from public.supply_budget_segments segment
  where segment.notes like 'Carga inicial Lista_Orçamento_Sistema.xlsx · orcamento_previsto:%';

  select count(*)
  into v_budget_item_count
  from public.supply_budget_items budget_item
  join public.supply_budget_segments segment on segment.id = budget_item.segment_id
  where segment.notes like 'Carga inicial Lista_Orçamento_Sistema.xlsx · orcamento_previsto:%'
    and budget_item.active;

  if v_catalog_count < 52 or v_segment_count <> 52 or v_budget_item_count <> 52 then
    raise exception
      'planned budget seed validation failed: catalog %, segments %, budget items %',
      v_catalog_count,
      v_segment_count,
      v_budget_item_count;
  end if;
end;
$validation$;

commit;
