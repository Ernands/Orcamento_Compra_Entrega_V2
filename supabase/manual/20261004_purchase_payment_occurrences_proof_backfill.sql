-- BACKFILL MANUAL — NAO E MIGRATION.
-- Fonte: comprovantes disponibilizados para compras de Mobiliario/Equipamentos.
-- Regra: o valor oficial de supply_purchase_payments NAO e alterado.
-- Este script apenas substitui o detalhamento de ocorrencias financeiras dos pagamentos pagos.
-- Executar somente apos validar os arquivos e com autorizacao explicita no ambiente alvo.

begin;

create temporary table _proof_occurrence_backfill (
  purchase_code text not null,
  attachment_name text not null,
  occurred_on date not null,
  amount numeric(16,2) not null,
  payment_method text not null,
  reference_label text not null
) on commit drop;

insert into _proof_occurrence_backfill values
  ('CMP-00038', 'Comprocante 24-09-2026-Aline - ACARAU - CE - Boleto.pdf', '2026-09-24', 13897.59, 'boleto', '92.403'),
  ('CMP-00039', 'Comprovante_Pagamento_Impressora multifuncional com scanner_ACARAU CE_1un.pdf', '2026-09-17', 1289.00, 'pix', 'E0000000020260917115448913558547'),
  ('CMP-00040', 'Comprovante_Compra_Mercado Livre_Lista_Compra_Prazo.pdf', '2026-09-24', 15347.06, 'boleto', '92.404'),
  ('CMP-00041', 'Comprovante_Mercado Livre_Lista_Compra_Prazo_Extintor_2un.pdf', '2026-10-02', 642.90, 'pix', 'E0000000020261002164738993363802'),
  ('CMP-00042', 'Comprovante_Mercado Livre_Lista_Compra_Prazo.pdf', '2026-09-25', 15275.35, 'pix', 'E0000000020260925153408284900407'),
  ('CMP-00042', 'Comprovante_Mercado Livre_Lista_Compra_Prazo_Extintor_2un.pdf', '2026-10-02', 569.00, 'pix', 'E0000000020261002164937365053104'),
  ('CMP-00043', 'Comprovante_Extintor - PE (2).pdf', '2026-09-30', 642.90, 'pix', 'E0000000020260930172821250946061'),
  ('CMP-00043', 'Comprovante_Mercado Livre_Lista_Compra_Prazo.pdf', '2026-09-28', 22133.07, 'pix', 'E0000000020260928181505933257370'),
  ('CMP-00043', 'Comprovante_Mercado Livre_Lista_Compra_Prazo_Cancelados.pdf', '2026-10-01', 1972.98, 'pix', 'E0000000020261001174403752397982'),
  ('CMP-00044', 'Comp-pagamento-ar-condicionado-Acarau-ce.pdf', '2026-09-16', 6650.00, 'pix', 'E0000000020260916141852258763946'),
  ('CMP-00045', 'Comprovante_Mercado Livre_Lista_Compra_Prazo.pdf', '2026-09-28', 13202.53, 'pix', 'E0000000020260928175742373296298'),
  ('CMP-00045', 'Comprovante_piso_extintor.pdf', '2026-09-30', 2150.91, 'pix', 'E0000000020260930173504613852373'),
  ('CMP-00046', 'Comprovante_2_AR_Condicionado_Extintor.pdf', '2026-09-30', 7740.14, 'pix', 'E0000000020260930175221526774657'),
  ('CMP-00046', 'Comprovante_Mercado Livre_Lista_Compra_Prazo.pdf', '2026-09-25', 13314.26, 'pix', 'E0000000020260925165833970427707'),
  ('CMP-00047', 'Comprovante_Mercado Livre_Lista_Compra_Prazo.pdf', '2026-09-28', 23993.15, 'pix', 'E0000000020260928180608271479394'),
  ('CMP-00048', 'Comp-Pagamento-Ares-Condicionados-Loja-Mais-BB-de-Ubajara-CE_.pdf', '2026-09-16', 5598.00, 'bank_transfer', '170.532.510.013.527'),
  ('CMP-00049', 'Comprovante_Mercado Livre_Lista_Compra_Prazo.pdf', '2026-09-28', 12963.83, 'pix', 'E0000000020260928175232624001790'),
  ('CMP-00049', 'Comprovante_Mercado Livre_Lista_Compra_Prazo_Extintor_Piso_Tatil.pdf', '2026-10-01', 2209.40, 'pix', 'E0000000020261001175339748156175'),
  ('CMP-00050', 'Comprovante_Extintor_Piso_Tatil_Cancelados.pdf', '2026-10-01', 3408.58, 'pix', 'E0000000020261001133449196914745'),
  ('CMP-00050', 'Comprovante_Mercado Livre_Lista_Compra_Prazo.pdf', '2026-09-28', 15288.97, 'pix', 'E0000000020260928181047746817250'),
  ('CMP-00051', 'Comprovante_Compra_Diversas_ SALGUEIRO PE_34un.pdf', '2026-09-17', 23109.23, 'pix', 'E0000000020260917121036078130778'),
  ('CMP-00051', 'Comprovante_Mercado Livre_Lista_Compra_Prazo_2.pdf', '2026-09-25', 4642.90, 'pix', 'E0000000020260925164740346867767'),
  ('CMP-00052', 'Comprovantes-pag-Baependi-MG-50-ares-condicionados.pdf', '2026-09-24', 5123.00, 'pix', 'E0000000020260924182211412571720'),
  ('CMP-00053', 'Comprovantes-BB-2026-09-24T161114.778.pdf-comp.-lj-Bambui-MG.pdf', '2026-09-24', 7916.00, 'pix', 'E0000000020260924190958107542059');

-- CMP-00054 foi deliberadamente omitida: o arquivo exato anexado no sistema
-- (ComprovanteBB_Lixeiras.pdf) nao estava no pacote disponibilizado. Um arquivo
-- geral com mesmo valor foi encontrado, mas nao e usado sem correspondencia exata.
-- CMP-00047 possui outro comprovante anexado que nao estava no pacote; por isso
-- seu detalhamento permanecera divergente/incompleto ate o arquivo ser conferido.

create temporary table _proof_occurrence_resolved on commit drop as
select
  source.purchase_code,
  source.attachment_name,
  source.occurred_on,
  source.amount,
  source.payment_method,
  source.reference_label,
  purchase.id as purchase_id,
  attachment.id as attachment_id,
  payment.id as payment_id
from _proof_occurrence_backfill source
join public.supply_purchases purchase
  on purchase.codigo_negocio = source.purchase_code
join public.supply_purchase_attachments attachment
  on attachment.purchase_id = purchase.id
 and attachment.deleted_at is null
 and attachment.original_name = source.attachment_name
join public.supply_purchase_payments payment
  on payment.purchase_id = purchase.id
 and payment.status = 'paid'
 and (
   payment.purchase_order_id = attachment.purchase_order_id
   or payment.purchase_order_id is null
 );

-- Cada linha informada precisa resolver exatamente um comprovante e um pagamento pago.
do $validation$
declare
  v_expected integer;
  v_resolved integer;
  v_manual_conflicts integer;
begin
  select count(*) into v_expected from _proof_occurrence_backfill;
  select count(*) into v_resolved from _proof_occurrence_resolved;
  if v_expected <> v_resolved then
    raise exception 'proof backfill mapping incomplete: expected %, resolved %', v_expected, v_resolved;
  end if;

  select count(*)
  into v_manual_conflicts
  from (
    select distinct resolved.payment_id
    from _proof_occurrence_resolved resolved
  ) target
  join public.supply_purchase_payment_occurrences occurrence
    on occurrence.payment_id = target.payment_id
   and occurrence.source = 'manual';

  if v_manual_conflicts > 0 then
    raise exception 'proof backfill aborted: % payment(s) already have manual occurrences', v_manual_conflicts;
  end if;
end;
$validation$;

-- Remove somente detalhamentos automaticos ou backfills anteriores dos pagamentos alvo.
delete from public.supply_purchase_payment_occurrences occurrence
using (select distinct payment_id from _proof_occurrence_resolved) target
where occurrence.payment_id = target.payment_id
  and occurrence.source in ('payment_record', 'proof_backfill');

insert into public.supply_purchase_payment_occurrences (
  payment_id,
  attachment_id,
  occurred_on,
  amount,
  payment_method,
  reference_label,
  source,
  notes,
  position
)
select
  resolved.payment_id,
  resolved.attachment_id,
  resolved.occurred_on,
  resolved.amount,
  resolved.payment_method,
  resolved.reference_label,
  'proof_backfill',
  'Conferido no comprovante disponibilizado para o historico de Mobiliario/Equipamentos.',
  row_number() over (
    partition by resolved.payment_id
    order by resolved.occurred_on, resolved.attachment_name, resolved.reference_label
  ) - 1
from _proof_occurrence_resolved resolved;

-- Relatorio de conciliacao: diferença = detalhado - valor oficial.
select
  purchase.codigo_negocio as compra,
  payment.amount as valor_oficial,
  sum(occurrence.amount) as soma_detalhada,
  round(sum(occurrence.amount) - payment.amount, 2) as diferenca,
  string_agg(
    to_char(occurrence.occurred_on, 'DD/MM/YYYY') || ' · ' ||
    to_char(occurrence.amount, 'FM999999990.00') || ' · ' ||
    upper(occurrence.payment_method),
    E'\n' order by occurrence.occurred_on, occurrence.position
  ) as detalhamento
from public.supply_purchase_payment_occurrences occurrence
join public.supply_purchase_payments payment on payment.id = occurrence.payment_id
join public.supply_purchases purchase on purchase.id = payment.purchase_id
where occurrence.source = 'proof_backfill'
  and payment.id in (select distinct payment_id from _proof_occurrence_resolved)
group by purchase.codigo_negocio, payment.id, payment.amount
order by purchase.codigo_negocio;

commit;
