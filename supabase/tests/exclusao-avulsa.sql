select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
select set_config(
  'teste.avulsa',
  (select id::text from public.manutencoes where tipo = 'avulsa' and data_programada_original = date '2026-11-02'),
  false
);

select public.excluir_manutencao_avulsa(current_setting('teste.avulsa')::uuid);
select public._exige(
  (select count(*) = 0 from public.manutencoes where id = current_setting('teste.avulsa')::uuid),
  'exclui avulsa programada sem execucao'
);
select public._exige(
  (select count(*) = 0 from public.itens_manutencao where manutencao_id = current_setting('teste.avulsa')::uuid),
  'remove os itens preparatorios da avulsa'
);
select public._exige(
  (select count(*) = 0 from public.historico_reagendamentos where manutencao_id = current_setting('teste.avulsa')::uuid),
  'remove o historico preparatorio da avulsa'
);
select public._exige(
  (select count(*) = 1
   from public.auditoria
   where tabela = 'manutencoes'
     and registro_id = current_setting('teste.avulsa')::uuid
     and acao = 'exclusao'
     and ator_id = '00000000-0000-4000-8000-000000000001'
     and created_at is not null
     and detalhe->>'identificacao' = 'Manutenção Avulsa 09/11/2026'
     and detalhe->>'condominio' = 'Porta do Sol'
     and detalhe->>'data' = '2026-11-09'),
  'auditoria guarda responsavel, data e identificacao'
);
select public._exige(
  (select data_programada_atual = date '2026-03-10' and status = 'programada'
   from public.manutencoes where id = '00000000-0000-4000-8000-000000000061'),
  'excluir avulsa nao altera a preventiva'
);
select public._exige(
  (select data_programada_atual = date '2026-03-31' and status = 'realizada'
   from public.manutencoes where id = '00000000-0000-4000-8000-000000000062'),
  'excluir avulsa nao altera as outras visitas'
);

select public.criar_manutencao_avulsa(
  '00000000-0000-4000-8000-000000000010',
  date '2026-12-02',
  '00000000-0000-4000-8000-000000000030',
  jsonb_build_array('00000000-0000-4000-8000-000000000040'::uuid)
);
select set_config(
  'teste.avulsa2',
  (select id::text from public.manutencoes where tipo = 'avulsa' and data_programada_atual = date '2026-12-02'),
  false
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
select public._teste_recusa(
  $$select public.excluir_manutencao_avulsa(current_setting('teste.avulsa2')::uuid)$$,
  'Somente o ADM pode excluir uma manutenção avulsa'
);
select public._exige(
  (select count(*) = 1 from public.manutencoes where id = current_setting('teste.avulsa2')::uuid),
  'prestador nao exclui a avulsa'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
select set_config('app.executando', 'on', true);
update public.manutencoes
  set status = 'em_execucao'
  where id = current_setting('teste.avulsa2')::uuid;
select set_config('app.executando', 'off', true);
select public._teste_recusa(
  $$select public.excluir_manutencao_avulsa(current_setting('teste.avulsa2')::uuid)$$,
  'Manutenção já iniciada não pode ser excluída'
);
select public._exige(
  (select status = 'em_execucao' from public.manutencoes where id = current_setting('teste.avulsa2')::uuid),
  'visita iniciada permanece no historico'
);

select public.criar_manutencao_avulsa(
  '00000000-0000-4000-8000-000000000010',
  date '2026-12-03',
  '00000000-0000-4000-8000-000000000030',
  jsonb_build_array('00000000-0000-4000-8000-000000000040'::uuid)
);
select set_config(
  'teste.avulsa3',
  (select id::text from public.manutencoes where tipo = 'avulsa' and data_programada_atual = date '2026-12-03'),
  false
);
update public.itens_manutencao
  set resultado = 'ok'
  where manutencao_id = current_setting('teste.avulsa3')::uuid;
update public.manutencoes
  set status = 'programada'
  where id = current_setting('teste.avulsa3')::uuid;
select public._teste_recusa(
  $$select public.excluir_manutencao_avulsa(current_setting('teste.avulsa3')::uuid)$$,
  'Manutenção com execução ou ocorrência não pode ser excluída'
);
select public._exige(
  (select count(*) = 1 from public.manutencoes where id = current_setting('teste.avulsa3')::uuid),
  'avulsa com execucao permanece'
);

select public._teste_recusa(
  $$select public.excluir_manutencao_avulsa('00000000-0000-4000-8000-000000000061')$$,
  'Manutenção preventiva do contrato não pode ser excluída'
);
select public._teste_recusa(
  $$delete from public.manutencoes where id = '00000000-0000-4000-8000-000000000062'$$,
  'Manutenção preventiva do contrato não pode ser excluída'
);
select public._exige(
  (select data_programada_atual = date '2026-03-10' and status = 'programada'
   from public.manutencoes where id = '00000000-0000-4000-8000-000000000061'),
  'tentar excluir preventiva nao muda a programacao'
);
select public._exige(
  (select data_programada_atual = date '2026-03-31' and status = 'realizada'
   from public.manutencoes where id = '00000000-0000-4000-8000-000000000062'),
  'tentar excluir a visita seguinte nao muda a programacao'
);
select public._exige(
  (select count(*) = 6
   from public.manutencoes
   where contrato_id = '00000000-0000-4000-8000-000000000020' and tipo = 'preventiva'),
  'a programacao do contrato permanece inteira'
);

set local role anon;
select public._teste_recusa(
  $$select public.excluir_manutencao_avulsa(current_setting('teste.avulsa2')::uuid)$$,
  'permission denied'
);
reset role;
