do $$
begin
  -- A carga inicial só acontece em uma base vazia. Assim, futuras execuções não
  -- substituem ajustes manuais já feitos pelo usuário neste módulo.
  if exists (select 1 from public.purchase_delivery_items limit 1)
     or exists (select 1 from public.purchase_delivery_destinations limit 1) then
    return;
  end if;

  insert into public.purchase_delivery_destinations
    (label, keyword, is_video_service, header_tone, position)
  values
    ('LOJ-001 - ACARAU - CE','ERVILHA',true,'video_light',1),
    ('LOJ-002 - ACOPIARA - CE',null,false,'default',2),
    ('LOJ-003 - BOA VIAGEM - CE','ALINHAR JH/Linhares Antes Compra',true,'video_light',3),
    ('LOJ-004 - SOLONOPOLE - CE',null,true,'video_light',4),
    ('LOJ-006 - UBAJARA - CE','PLANEJAR',true,'video_light',5),
    ('LOJ-013 - PETROLANDIA - PE','TEMPERATURA',true,'video_light',6),
    ('LOJ-014  - SALGUEIRO - PE','AMORA / ESTADO',true,'video_light',7),
    ('LOJ-015 - CABROBO - PE','ONDAS',true,'video_light',8),
    ('LOJ-025 - FEIRA NOVA - PE','Sem Palavra',true,'video_light',9),
    ('LOJ-026 - CAMARAGIBE - PE',null,true,'video_dark',10),
    ('LOJ-021 - IPOJUCA - PE',null,true,'video_dark',11),
    ('LOJ-007 - TAVARES - PB','CARIDADE',false,'default',12),
    ('LOJ-005 - TOUROS - RN',null,false,'default',13),
    ('LOJ-011 - SANTO ANTONIO - RN',null,false,'default',14),
    ('LOJ-017 - PAU DOS FERROS - RN',null,false,'default',15),
    ('LOJ-010 - MACAU - RN',null,true,'video_dark',16),
    ('LOJ-020 - JOAO CAMARA - RN',null,false,'default',17),
    ('LOJ-008 - BAEPENDI - MG','REI',true,'video_light',18),
    ('LOJ-009 - BAMBUI - MG','PARQUE',true,'video_light',19),
    ('LOJ-012 - IAPU - MG',null,false,'default',20),
    ('LOJ-016  - MONTE BELO - MG',null,false,'default',21),
    ('LOJ-018 - SAO TIAGO - MG',null,false,'default',22),
    ('LOJ-019 - ESPINOSA - MG',null,false,'default',23),
    ('LOJ-023 - MONTE ALEGRE DE MINAS MG',null,false,'default',24),
    ('LOJ-024 - SANTA MARIA DE ITABIR MG',null,true,'video_dark',25),
    ('LOJ-027 - CLAUDIO - MG','LUA',false,'default',26);

  insert into public.purchase_delivery_items
    (name, purchase_total, acquired_quantity, position)
  values
    ('Ar-condicionado split inverter',43,21,1),
    ('Purificador/bebedouro',26,16,2),
    ('Suporte para copos',26,17,3),
    ('Lixeira coletiva com pedal',26,17,4),
    ('Dispenser de álcool',26,17,5),
    ('Organizador de fila',26,17,6),
    ('Kit de primeiros socorros',26,17,7),
    ('Quadro de chaves',26,17,8),
    ('Notebook negocial',27,27,9),
    ('Suporte para notebook',27,18,10),
    ('Computador de mesa para videoatendimento',14,14,11),
    ('Monitor videoatendimento (Tela fundo BB)',14,10,12),
    ('Webcam Full HD',14,10,13),
    ('Teclado e mouse',41,28,14),
    ('Headset profissional',14,10,15),
    ('Iluminador frontal',14,10,16),
    ('Máquina contadora de cédulas',26,17,17),
    ('Detector de cédulas falsas',52,34,18),
    ('Impressora multifuncional com scanner',26,17,19),
    ('Fragmentadora de papel',26,16,20),
    ('SmartPOS',53,53,21),
    ('Adaptador para leitor pistola e fonte',53,53,22),
    ('Fonte de alimentação SmartPOS',53,53,23),
    ('Bobinas SmartPOS iniciais',26,3051,24),
    ('Calculadora de mesa',79,79,25),
    ('Regua',79,79,26),
    ('Lixeira individual',79,79,27),
    ('Grampeador',79,79,28),
    ('Grampos',27,27,29),
    ('Caneta',79,79,30),
    ('Agenda',79,79,31),
    ('Organizador de cédulas e moedas',52,34,32),
    ('Ligas',27,26,33),
    ('Resma de folhas',27,27,34),
    ('Gaveteiro móvel com chave',27,17,35),
    ('Balcão atendimento Alto com Gaveta ',52,34,36),
    ('Mesa Escritório negocial',27,17,37),
    ('Mesa de videoatendimento | Padrão Call Center',26,9,38),
    ('Armário alto com chave',26,16,39),
    ('Armário baixo com chave',26,16,40),
    ('Mesa de apoio para água/café',26,17,41),
    ('Cadeira operacional ergonômica PADRÃO caixa alta',52,34,42),
    ('Apoio para os pés',27,18,43),
    ('Cadeira operacional ergonômica',27,18,44),
    ('Cadeira fixa para cliente',41,28,45),
    ('Longarina de espera com 3 lugares',52,34,46),
    ('Capa preferencial',52,34,47),
    ('Extintor com suporte e placa 2 unidades',52,52,48),
    ('Malote de segurança',52,0,49),
    ('Lacre de Malote de Segurança',27,0,50),
    ('estabilizador/transformador',26,0,51),
    ('Gaveta metálica de numerário',52,0,52),
    ('Bancada de apoio',26,0,53),
    ('Filtro de privacidade para monitor',41,0,54);

  with rows as (
    select value as row_data
    from jsonb_array_elements($json$[
      {"i":1,"q":[null,null,null,2,null,2,2,2,2,null,null,2,2,2,2,null,2,null,null,null,null,null,null,null,null,1],"s":"xxxoxasppnnaooonoxxnnnnnnp"},
      {"i":2,"q":[1,1,1,null,1,1,1,1,1,null,null,1,1,1,1,null,1,1,1,null,null,null,null,null,null,1],"s":"pooxppdppnnpooonoppnnnnnnp"},
      {"i":3,"q":[1,1,1,1,1,1,1,1,1,null,null,1,1,1,1,null,1,1,1,null,null,null,null,null,null,1],"s":"poooppdppnnpooonoppnnnnnnp"},
      {"i":4,"q":[1,1,1,1,1,1,1,1,1,null,null,1,1,1,1,null,1,1,1,null,null,null,null,null,null,1],"s":"poooppdppnnpooonoppnnnnnnp"},
      {"i":5,"q":[1,1,1,1,1,1,1,1,1,null,null,1,1,1,1,null,1,1,1,null,null,null,null,null,null,1],"s":"poooppdppnnpooonoppnnnnnnp"},
      {"i":6,"q":[1,1,1,1,1,1,1,1,1,null,null,1,1,1,1,null,1,1,1,null,null,null,null,null,null,1],"s":"poooppsppnnpooonoppnnnnnnp"},
      {"i":7,"q":[1,1,1,1,1,1,1,1,1,null,null,1,1,1,1,null,1,1,1,null,null,null,null,null,null,1],"s":"poooppdppnnpooonoppnnnnnnp"},
      {"i":8,"q":[1,1,1,1,1,1,1,1,1,null,null,1,1,1,1,null,1,1,1,null,null,null,null,null,null,1],"s":"poooppdppnnpooonoppnnnnnnp"},
      {"i":9,"q":[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,1,1,1,1,1,1,1,1],"s":"mmmmmmmmmmmmmmmmmmmmmmmmmm"},
      {"i":10,"q":[1,1,1,1,1,1,1,1,1,null,null,1,1,1,1,null,1,2,1,null,null,null,null,null,null,1],"s":"poooppdppnnpooonoppnnnnnnp"},
      {"i":11,"q":[1,null,1,1,1,1,1,1,1,1,1,null,null,null,null,1,null,1,1,null,null,null,null,null,1,null],"s":"mxmmmmmmmmmxxxxmxmmxxxxxmx"},
      {"i":12,"q":[1,null,1,1,1,1,1,1,1,null,null,null,null,null,null,null,null,1,1,null,null,null,null,null,null,null],"s":"pxooppdppnnxxxxnxppnnnnnnx"},
      {"i":13,"q":[1,null,1,1,1,1,1,1,1,null,null,null,null,null,null,null,null,1,1,null,null,null,null,null,null,null],"s":"pxooppdppnnxxxxnxppnnnnnnx"},
      {"i":14,"q":[2,1,2,2,2,2,2,2,2,null,null,1,1,1,1,null,1,3,2,null,null,null,null,null,null,1],"s":"poooppdppnnpooonoppnnnnnnp"},
      {"i":15,"q":[1,null,1,1,1,1,1,1,1,null,null,null,null,null,null,null,null,1,1,null,null,null,null,null,null,null],"s":"pxooppdppnnxxxxnxppnnnnnnx"},
      {"i":16,"q":[1,null,1,1,1,1,1,1,1,null,null,null,null,null,null,null,null,1,1,null,null,null,null,null,null,null],"s":"pxooppdppnnxxxxnxppnnnnnnx"},
      {"i":17,"q":[1,1,1,1,1,1,1,1,1,null,null,1,1,1,1,null,1,1,1,null,null,null,null,null,null,1],"s":"poooppsppnnpooonoppnnnnnnp"},
      {"i":18,"q":[2,2,2,2,2,2,2,2,2,null,null,2,2,2,2,null,2,2,2,null,null,null,null,null,null,2],"s":"poooppdppnnpooonoppnnnnnnp"},
      {"i":19,"q":[1,1,1,1,1,1,1,1,1,null,null,1,1,1,1,null,1,1,1,null,null,null,null,null,null,1],"s":"doooppdppnnpooonoppnnnnnnp"},
      {"i":20,"q":[1,1,1,null,1,1,1,1,1,null,null,1,1,1,1,null,1,1,1,null,null,null,null,null,null,1],"s":"poonppdppnnpooonoppnnnnnnp"},
      {"i":21,"q":[2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,3,2,2,2,2,2,2,2,2],"s":"mmmmmmmmmmmmmmmmmmmmmmmmmm"},
      {"i":22,"q":[2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,3,2,2,2,2,2,2,2,2],"s":"mmmmmmmmmmmmmmmmmmmmmmmmmm"},
      {"i":23,"q":[2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,3,2,2,2,2,2,2,2,2],"s":"mmmmmmmmmmmmmmmmmmmmmmmmmm"},
      {"i":24,"q":[113,113,113,113,113,113,113,113,113,113,113,113,113,113,113,113,113,226,113,113,113,113,113,113,113,113],"s":"mmmmmmmmmmmmmmmmmmmmmmmmmm"},
      {"i":25,"q":[3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,4,3,3,3,3,3,3,3,3],"s":"mmmmmmmmmmmmmmmmmmmmmmmmmm"},
      {"i":26,"q":[3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,4,3,3,3,3,3,3,3,3],"s":"mmmmmmmmmmmmmmmmmmmmmmmmmm"},
      {"i":27,"q":[3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,4,3,3,3,3,3,3,3,3],"s":"mmmmmmmmmmmmmmmmmmmmmmmmmm"},
      {"i":28,"q":[3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,4,3,3,3,3,3,3,3,3],"s":"mmmmmmmmmmmmmmmmmmmmmmmmmm"},
      {"i":29,"q":[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,1,1,1,1,1,1,1,1],"s":"mmmmmmmmmmmmmmmmmmmmmmmmmm"},
      {"i":30,"q":[3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,4,3,3,3,3,3,3,3,3],"s":"mmmmmmmmmmmmmmmmmmmmmmmmmm"},
      {"i":31,"q":[3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,4,3,3,3,3,3,3,3,3],"s":"mmmmmmmmmmmmmmmmmmmmmmmmmm"},
      {"i":32,"q":[2,2,2,2,2,2,2,2,2,null,null,2,2,2,2,null,2,2,2,null,null,null,null,null,null,2],"s":"poooipdppnnpooonoppnnnnnnp"},
      {"i":33,"q":[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],"s":"mmmmmmmmmmmmmmmmmmmmmmmmmm"},
      {"i":34,"q":[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,1,1,1,1,1,1,1,1],"s":"mmmmmmmmmmmmmmmmmmmmmmmmmm"},
      {"i":35,"q":[1,1,1,null,1,1,1,1,1,null,null,1,1,1,1,null,1,2,1,null,null,null,null,null,null,1],"s":"poooppsppnnpooonoppnnnnnnp"},
      {"i":36,"q":[2,2,2,2,2,2,2,2,2,null,null,2,2,2,2,null,2,2,2,null,null,null,null,null,null,2],"s":"poooppsppnnpooonoppnnnnnnp"},
      {"i":37,"q":[1,1,1,null,1,1,1,1,1,null,null,1,1,1,1,null,1,2,1,null,null,null,null,null,null,1],"s":"poooppdpannaooonoppnnnnnnp"},
      {"i":38,"q":[1,null,1,null,1,1,1,1,1,null,null,null,null,null,null,null,null,1,1,null,null,null,null,null,null,null],"s":"pxooppspannxxxxnxppnnnnnnx"},
      {"i":39,"q":[1,1,1,null,1,1,1,1,1,null,null,1,1,1,1,null,1,1,1,null,null,null,null,null,null,1],"s":"poonppsppnnpooonoppnnnnnnp"},
      {"i":40,"q":[1,1,1,null,1,1,1,1,1,null,null,1,1,1,1,null,1,1,1,null,null,null,null,null,null,1],"s":"poooppsppnnpooonoppnnnnnnp"},
      {"i":41,"q":[1,1,1,1,1,1,1,1,1,null,null,1,1,1,1,null,1,1,1,null,null,null,null,null,null,1],"s":"poooppsppnnpooonoppnnnnnnp"},
      {"i":42,"q":[2,2,2,2,2,2,2,2,2,null,null,2,2,2,2,null,2,2,2,null,null,null,null,null,null,2],"s":"poooppdppnnpooonoppnnnnnnp"},
      {"i":43,"q":[1,1,1,1,1,1,1,1,1,null,null,1,1,1,1,null,1,2,1,null,null,null,null,null,null,1],"s":"poooppdppnnpooonoppnnnnnnp"},
      {"i":44,"q":[1,1,1,1,1,1,1,1,1,null,null,1,1,1,1,null,1,2,1,null,null,null,null,null,null,1],"s":"poooppsppnnpooonoppnnnnnnp"},
      {"i":45,"q":[2,1,2,2,2,2,2,2,2,null,null,1,1,1,1,null,1,3,2,null,null,null,null,null,null,1],"s":"poooppdppnnpooonoppnnnnnnp"},
      {"i":46,"q":[2,2,2,2,2,2,2,2,2,null,null,2,2,2,2,null,2,2,2,null,null,null,null,null,null,2],"s":"poooppdppnnpooonoppnnnnnnp"},
      {"i":47,"q":[2,2,2,2,2,2,2,2,2,null,null,2,2,2,2,null,2,2,2,null,null,null,null,null,null,2],"s":"poooppdppnnpooonoggnnnnnnp"},
      {"i":48,"q":[2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],"s":"oooooooooooooooooooooooooo"},
      {"i":49,"q":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],"s":"nnnnnnnnnnnnnnnnnnnnnnnnnn"},
      {"i":50,"q":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],"s":"nnnnnnnnnnnnnnnnnnnnnnnnnn"},
      {"i":51,"q":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],"s":"nnnooonnnnnnnnnnnnnnnnnnnn"},
      {"i":52,"q":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],"s":"nnnnnnnnnnnnnnnnnnnnnnnnnn"},
      {"i":53,"q":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],"s":"nnnnnnnnnnnnnnnnnnnnnnnnnn"},
      {"i":54,"q":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],"s":"nonnnnoonnnnnnnnnnnnnnnnnn"}
    ]$json$::jsonb)
  ), expanded as (
    select
      (r.row_data->>'i')::integer as item_pos,
      q.ordinality::integer as destination_pos,
      case when jsonb_typeof(q.value)='null' then null else (q.value #>> '{}')::numeric end as quantity,
      substring(r.row_data->>'s' from q.ordinality::integer for 1) as code
    from rows r
    cross join lateral jsonb_array_elements(r.row_data->'q') with ordinality as q(value, ordinality)
  ), data as (
    select
      item_pos,
      destination_pos,
      quantity,
      case code
        when 'm' then 'matrix'
        when 'p' then 'purchased'
        when 'g' then 'green_text'
        when 'd' then 'delivered'
        when 's' then 'shipping_note'
        when 'o' then 'orange_text'
        when 'a' then 'attention'
        when 'i' then 'issue'
        when 'x' then 'do_not_buy'
        else 'none'
      end as status
    from expanded
    where quantity is not null or code in ('m','p','g','d','s','a','i','x')
  )
  insert into public.purchase_delivery_cells
    (item_id, destination_id, quantity, status)
  select i.id, d.id, data.quantity, data.status
  from data
  join public.purchase_delivery_items i on i.position = data.item_pos
  join public.purchase_delivery_destinations d on d.position = data.destination_pos;

  with notes(item_name,destination_label,note) as (
    values
      ('Ar-condicionado split inverter','LOJ-013 - PETROLANDIA - PE','Solicitado aquisição ao Emidio no grupo'),
      ('Mesa Escritório negocial','LOJ-025 - FEIRA NOVA - PE','Solicitado aquisição ao Valter no grupo'),
      ('Mesa de videoatendimento | Padrão Call Center','LOJ-025 - FEIRA NOVA - PE',null),
      ('Mesa Escritório negocial','LOJ-007 - TAVARES - PB','Solicitado aquisição ao Joseney no grupo'),
      ('Ar-condicionado split inverter','LOJ-007 - TAVARES - PB',null)
  ), resolved as (
    select i.id as item_id, d.id as destination_id, n.note
    from notes n
    join public.purchase_delivery_items i on btrim(i.name) = btrim(n.item_name)
    join public.purchase_delivery_destinations d on btrim(d.label) = btrim(n.destination_label)
  )
  insert into public.purchase_delivery_cells (item_id,destination_id,status,note)
  select item_id,destination_id,'attention',note
  from resolved
  on conflict (item_id,destination_id) do update
  set note = excluded.note,
      status = case
        when public.purchase_delivery_cells.status = 'none' then 'attention'
        else public.purchase_delivery_cells.status
      end,
      updated_at = now();
end
$$;
