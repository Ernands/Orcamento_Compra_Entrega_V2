-- Dados opcionais para aplicacao manual exclusiva em DEV.
-- Este arquivo nao e migration nem seed, nao publica a versao e nao inicia lojas.

begin;

do $$
declare
  v_version_id uuid;
  v_draft_count integer;
  v_item_count integer;
  v_distinct_positions integer;
begin
  select count(*)
  into v_draft_count
  from public.checklist_master_versions
  where name = 'Checklist de Implantação de Loja'
    and status = 'draft';

  if v_draft_count > 1 then
    raise exception 'Mais de um draft chamado Checklist de Implantação de Loja foi encontrado; revise os dados antes de continuar.';
  end if;

  if v_draft_count = 0 then
    insert into public.checklist_master_versions (name, status, notes)
    values (
      'Checklist de Implantação de Loja',
      'draft',
      'Checklist inicial de implantação. Os offsets são calculados em relação à data prevista de inauguração da loja. Versão preparada a partir da relação operacional fornecida em 17/08/2026.'
    )
    returning id into v_version_id;
  else
    select id
    into v_version_id
    from public.checklist_master_versions
    where name = 'Checklist de Implantação de Loja'
      and status = 'draft';
  end if;

  if exists (
    select 1
    from public.checklist_master_items
    where version_id = v_version_id
  ) then
    raise exception 'O draft Checklist de Implantação de Loja já possui atividades; nenhuma duplicação foi realizada.';
  end if;

  update public.checklist_master_versions
  set notes = 'Checklist inicial de implantação. Os offsets são calculados em relação à data prevista de inauguração da loja. Versão preparada a partir da relação operacional fornecida em 17/08/2026.'
  where id = v_version_id;

  insert into public.checklist_master_items (
    version_id,
    title,
    description,
    category,
    position,
    is_required,
    is_active,
    relative_due_days,
    guidance,
    responsibility_type,
    evidence_required,
    priority
  )
  values
    (v_version_id, 'Solicitar orçamento de cofre + transporte de valores.', null, '1. Ações Iniciais', 1, true, true, -30, null, 'Equipe interna', false, 'normal'),
    (v_version_id, 'Visitar a agência BB. Se apresentar ao gerente BB e explicar o objetivo da visita, buscando apoio.', null, '1. Ações Iniciais', 2, true, true, -30, null, 'Equipe de campo', false, 'normal'),
    (v_version_id, 'Mapear na cidade a existência de agentes de crédito do BB (qual empresa) e concorrência.', null, '1. Ações Iniciais', 3, true, true, -30, null, 'Equipe de campo', false, 'normal'),
    (v_version_id, 'Com agência BB: buscar imóveis para locação, com anuência do gerente BB. Sem agência BB: buscar locais centrais com bastante movimento.', null, '1. Ações Iniciais', 4, true, true, -30, null, 'Equipe de campo', false, 'normal'),
    (v_version_id, 'Compartilhar no grupo de trabalho informações e características do imóvel visitado.', null, '1. Ações Iniciais', 5, true, true, -30, null, 'Equipe de campo', false, 'normal'),
    (v_version_id, 'Submeter ao BB valores de locação + orçamentos de transporte de valores.', null, '1. Ações Iniciais', 6, true, true, -30, null, 'Equipe interna', false, 'normal'),
    (v_version_id, 'Realizar projeto simples (croqui) e submeter ao BB para aprovação.', null, '1. Ações Iniciais', 7, true, true, -30, null, 'Equipe interna', false, 'normal'),
    (v_version_id, 'Orçamento/contratação mão de obra - pedreiro.', null, '2. Obras e Instalações', 8, true, true, -25, null, 'Equipe de campo', false, 'normal'),
    (v_version_id, 'Orçamento/contratação mão de obra - gesseiro.', null, '2. Obras e Instalações', 9, true, true, -25, null, 'Equipe de campo', false, 'normal'),
    (v_version_id, 'Orçamento/contratação mão de obra - pintor.', null, '2. Obras e Instalações', 10, true, true, -25, null, 'Equipe de campo', false, 'normal'),
    (v_version_id, 'Orçamento/contratação mão de obra - eletricista.', null, '2. Obras e Instalações', 11, true, true, -25, null, 'Equipe de campo', false, 'normal'),
    (v_version_id, 'Orçamento/contratação mão de obra - vidraceiro.', null, '2. Obras e Instalações', 12, true, true, -25, null, 'Equipe de campo', false, 'normal'),
    (v_version_id, 'Orçamento/contratação mão de obra - encanador.', null, '2. Obras e Instalações', 13, true, true, -25, null, 'Equipe de campo', false, 'normal'),
    (v_version_id, 'Ativar/transferir água e energia em nome da empresa.', null, '2. Obras e Instalações', 14, true, true, -25, null, 'Equipe de campo', false, 'normal'),
    (v_version_id, 'Orçamento/contratação de sistema de CFTV/DVR.', null, '2. Obras e Instalações', 15, true, true, -25, null, 'Equipe de campo', false, 'normal'),
    (v_version_id, 'Orçamento/contratação de alarme contra intrusão.', null, '2. Obras e Instalações', 16, true, true, -25, null, 'Equipe de campo', false, 'normal'),
    (v_version_id, 'Orçamento/contratação - Fachada.', null, '2. Obras e Instalações', 17, true, true, -25, null, 'Equipe de campo', false, 'normal'),
    (v_version_id, 'Orçamento/contratação - Internet.', null, '2. Obras e Instalações', 18, true, true, -25, null, 'Equipe de campo', false, 'normal'),
    (v_version_id, 'Orçamento/contratação - Instalação de ar condicionado.', null, '2. Obras e Instalações', 19, true, true, -25, null, 'Equipe de campo', false, 'normal'),
    (v_version_id, 'Orçamento/contratação - sinalização tátil.', null, '2. Obras e Instalações', 20, true, true, -20, null, 'Equipe de campo', false, 'normal'),
    (v_version_id, 'Orçamento/contratação - persianas quando necessárias.', null, '2. Obras e Instalações', 21, true, true, -20, null, 'Equipe de campo', false, 'normal'),
    (v_version_id, 'Implantação de mobiliário, maquinário e sinalização (conclusão de obra).', null, '2. Obras e Instalações', 22, true, true, -20, null, 'Equipe de campo', false, 'normal'),
    (v_version_id, 'Instalação do cofre (transportadora).', null, '2. Obras e Instalações', 23, true, true, -20, null, 'Equipe de campo', false, 'normal'),
    (v_version_id, 'Vistoria final de obra.', null, '2. Obras e Instalações', 24, true, true, -20, null, 'Equipe de campo', false, 'normal'),
    (v_version_id, 'Seleção, recrutamento e contratação de colaboradores.', null, '3. Pessoas e Capacitação', 25, true, true, -5, null, 'RH', false, 'normal'),
    (v_version_id, 'Realizar capacitações e certificações (CDC, consignado, PLDFT).', null, '3. Pessoas e Capacitação', 26, true, true, -5, null, 'Contratado', false, 'normal'),
    (v_version_id, 'Entregar uniformes e identificação.', null, '3. Pessoas e Capacitação', 27, true, true, -5, null, null, false, 'normal'),
    (v_version_id, 'Criar usuários individuais e perfis.', null, '3. Pessoas e Capacitação', 28, true, true, -5, null, null, false, 'normal'),
    (v_version_id, 'Treinamento de equipe.', null, '3. Pessoas e Capacitação', 29, true, true, -5, null, null, false, 'normal'),
    (v_version_id, 'Realizar inauguração.', null, '4. Inauguração', 30, true, true, 0, null, null, false, 'normal');

  select count(*), count(distinct position)
  into v_item_count, v_distinct_positions
  from public.checklist_master_items
  where version_id = v_version_id;

  if v_item_count <> 30
    or v_distinct_positions <> 30
    or exists (
      select 1
      from generate_series(1, 30) expected(position)
      where not exists (
        select 1
        from public.checklist_master_items item
        where item.version_id = v_version_id
          and item.position = expected.position
      )
    ) then
    raise exception 'Carga inválida: o draft deve conter exatamente 30 atividades nas posições de 1 a 30.';
  end if;
end;
$$;

commit;
