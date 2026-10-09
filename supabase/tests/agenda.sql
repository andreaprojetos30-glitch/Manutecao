select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);

select public._teste_recusa(
  $$select public.reagendar_visita('00000000-0000-4000-8000-000000000060', date '2026-02-01')$$,
  'Só é possível reagendar uma visita programada'
);
select public._teste_recusa(
  $$select public.reagendar_visita('00000000-0000-4000-8000-000000000065', date '2026-08-01')$$,
  'Só é possível reagendar uma visita programada'
);
select public._teste_recusa(
  $$select public.reagendar_visita('00000000-0000-4000-8000-000000000061', date '2026-03-02')$$,
  'Informe uma data diferente da atual'
);

select public.reagendar_visita('00000000-0000-4000-8000-000000000061', date '2026-03-10');
select public._exige(
  (select data_programada_atual = date '2026-03-10' and data_programada_original = date '2026-02-28'
   from public.manutencoes where id = '00000000-0000-4000-8000-000000000061'),
  'reagenda so a data atual desta visita'
);
select public._exige(
  (select data_programada_atual = date '2026-01-31' from public.manutencoes where id = '00000000-0000-4000-8000-000000000060'),
  'reagendar nao move a visita anterior'
);
select public._exige(
  (select data_programada_atual = date '2026-03-31' from public.manutencoes where id = '00000000-0000-4000-8000-000000000062'),
  'reagendar nao move a visita seguinte'
);
select public._exige(
  (select count(*) = 1
   from public.historico_reagendamentos
   where manutencao_id = '00000000-0000-4000-8000-000000000061'
     and data_anterior = date '2026-03-02'
     and nova_data = date '2026-03-10'
     and alterado_por = '00000000-0000-4000-8000-000000000001'
     and created_at is not null),
  'historico guarda data anterior, nova data, responsavel e momento'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
select public._teste_recusa(
  $$select public.reagendar_visita('00000000-0000-4000-8000-000000000066', date '2026-08-01')$$,
  'Somente o ADM pode reagendar'
);
select public._exige(
  (select data_programada_atual = date '2026-04-02' from public.manutencoes where id = '00000000-0000-4000-8000-000000000066'),
  'prestador nao altera a programacao'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
select public._teste_recusa(
  $$select public.criar_manutencao_avulsa(
      '00000000-0000-4000-8000-000000000010',
      date '2026-11-02',
      '00000000-0000-4000-8000-000000000030',
      '[]'::jsonb
    )$$,
  'Selecione ao menos um equipamento'
);
select public._teste_recusa(
  $$select public.criar_manutencao_avulsa(
      '00000000-0000-4000-8000-000000000010',
      date '2026-11-02',
      '00000000-0000-4000-8000-000000000030',
      jsonb_build_array((select id from public.equipamentos_matriz where nome = 'Bicicleta'))
    )$$,
  'Selecione um equipamento da lista'
);

select public.criar_manutencao_avulsa(
  '00000000-0000-4000-8000-000000000010',
  date '2026-11-02',
  '00000000-0000-4000-8000-000000000030',
  jsonb_build_array('00000000-0000-4000-8000-000000000040'::uuid)
);
select public._exige(
  (select count(*) = 1
   from public.manutencoes
   where tipo = 'avulsa'
     and origem = 'manual'
     and status = 'programada'
     and contrato_id is null
     and numero_visita is null
     and condominio_id = '00000000-0000-4000-8000-000000000010'
     and data_programada_atual = date '2026-11-02'
     and prestador_id = '00000000-0000-4000-8000-000000000030'),
  'avulsa nasce sem contrato e sem numeracao'
);
select public._exige(
  (select count(*) = 1
   from public.itens_manutencao i
   join public.manutencoes m on m.id = i.manutencao_id
   where m.tipo = 'avulsa'
     and m.data_programada_atual = date '2026-11-02'
     and i.equipamento_matriz_id = '00000000-0000-4000-8000-000000000040'
     and i.equipamento_contrato_id is null
     and i.nome_identificacao = 'Esteira'),
  'avulsa usa o equipamento da matriz'
);
select public._exige(
  (select data_programada_atual = date '2026-03-10' from public.manutencoes where id = '00000000-0000-4000-8000-000000000061'),
  'avulsa nao altera a preventiva'
);
select public._exige(
  (select data_programada_atual = date '2026-03-31' from public.manutencoes where id = '00000000-0000-4000-8000-000000000062'),
  'avulsa nao altera as outras visitas'
);

select public.reagendar_visita(
  (select id from public.manutencoes where tipo = 'avulsa' and data_programada_atual = date '2026-11-02'),
  date '2026-11-09'
);
select public._exige(
  (select data_programada_atual = date '2026-11-09' and numero_visita is null
   from public.manutencoes where tipo = 'avulsa' and data_programada_original = date '2026-11-02'),
  'avulsa tambem pode ser reagendada'
);
select public._exige(
  (select data_programada_atual = date '2026-03-10' from public.manutencoes where id = '00000000-0000-4000-8000-000000000061'),
  'reagendar a avulsa nao move a preventiva'
);

set local role anon;
select public._teste_recusa(
  $$select public.reagendar_visita('00000000-0000-4000-8000-000000000061', date '2026-04-01')$$,
  'permission denied'
);
reset role;
