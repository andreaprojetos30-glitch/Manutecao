select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', false);
select public._teste_recusa(
  $$select public.registrar_ok('00000000-0000-4000-8000-000000000076')$$,
  'Visita não atribuída'
);
select public._exige(
  (select status = 'programada' from public.manutencoes where id = '00000000-0000-4000-8000-000000000066'),
  'outro prestador nao executa e abrir nao muda o status'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
update public.prestadores set ativo = false where id = '00000000-0000-4000-8000-000000000030';
select public._teste_recusa(
  $$select public.registrar_ok('00000000-0000-4000-8000-000000000076')$$,
  'Visita não atribuída'
);
update public.prestadores set ativo = true where id = '00000000-0000-4000-8000-000000000030';
select public._exige(
  (select status = 'programada' from public.manutencoes where id = '00000000-0000-4000-8000-000000000066'),
  'prestador inativo nao executa'
);

select public.registrar_ok('00000000-0000-4000-8000-000000000076');
select public._exige(
  (select status = 'em_execucao' from public.manutencoes where id = '00000000-0000-4000-8000-000000000066'),
  'primeiro resultado valido inicia a execucao'
);
select public._exige(
  (select resultado = 'ok' and registrado_por = '00000000-0000-4000-8000-000000000002' and registrado_em is not null
   from public.itens_manutencao where id = '00000000-0000-4000-8000-000000000076'),
  'OK grava prestador e momento'
);

select public.registrar_ocorrencia(
  '00000000-0000-4000-8000-000000000076',
  false,
  'Correia solta',
  '00000000-0000-4000-8000-000000000066/foto-1.jpg'
);
select public.registrar_ocorrencia(
  '00000000-0000-4000-8000-000000000076',
  false,
  'Correia trocada',
  '00000000-0000-4000-8000-000000000066/foto-2.jpg'
);
select public._exige(
  (select count(*) = 1 from public.ocorrencias where item_manutencao_id = '00000000-0000-4000-8000-000000000076'),
  'correcao nao duplica a ocorrencia'
);
select public._exige(
  (select descricao_original = 'Correia trocada'
     and foto_url = '00000000-0000-4000-8000-000000000066/foto-2.jpg'
     and resolvida_no_local = false
     and status_ocorrencia = 'aberta'
     and necessita_orcamento = false
     and enviar_para_sindico = false
     and classificacao_interna is null
   from public.ocorrencias
   where item_manutencao_id = '00000000-0000-4000-8000-000000000076'),
  'correcao atualiza a ocorrencia sem duplicar'
);

select public.registrar_ok('00000000-0000-4000-8000-000000000076');
select public._exige(
  (select count(*) = 0 from public.ocorrencias where item_manutencao_id = '00000000-0000-4000-8000-000000000076'),
  'voltar para OK remove a ocorrencia'
);
select public._exige(
  (select resultado = 'ok' from public.itens_manutencao where id = '00000000-0000-4000-8000-000000000076'),
  'equipamento corrigido fica OK'
);

select public.registrar_ocorrencia(
  '00000000-0000-4000-8000-000000000076',
  true,
  'Ajuste no local',
  '00000000-0000-4000-8000-000000000066/foto-3.jpg'
);
select public._exige(
  (select status_ocorrencia = 'resolvida' and resolvida_no_local = true
   from public.ocorrencias where item_manutencao_id = '00000000-0000-4000-8000-000000000076'),
  'resolvida no local fica no historico interno'
);
select public._exige(
  public.finalizar_manutencao('00000000-0000-4000-8000-000000000066') = 'realizada',
  'avulsa sem pendencia finaliza como realizada'
);
select public._exige(
  (select status = 'realizada' and numero_visita is null and contrato_id is null and finalizada_em is not null and finalizada_por = '00000000-0000-4000-8000-000000000002'
   from public.manutencoes where id = '00000000-0000-4000-8000-000000000066'),
  'finalizacao grava momento e nao cria numeracao'
);
select public._teste_recusa(
  $$select public.finalizar_manutencao('00000000-0000-4000-8000-000000000066')$$,
  'Visita não pode ser finalizada neste status'
);
select public._teste_recusa(
  $$select public.registrar_ok('00000000-0000-4000-8000-000000000076')$$,
  'Visita encerrada para edição do prestador'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
select public.criar_manutencao_avulsa(
  '00000000-0000-4000-8000-000000000010',
  date '2026-08-02',
  '00000000-0000-4000-8000-000000000030',
  jsonb_build_array(
    '00000000-0000-4000-8000-000000000040'::uuid,
    (select id from public.equipamentos_matriz where nome = 'Bike Horizontal')
  )
);
select set_config(
  'teste.execucao',
  (select id::text from public.manutencoes where tipo = 'avulsa' and data_programada_atual = date '2026-08-02'),
  false
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
select public.registrar_ok(
  (select id from public.itens_manutencao
   where manutencao_id = current_setting('teste.execucao')::uuid and nome_identificacao = 'Esteira')
);
select public._teste_recusa(
  $$select public.finalizar_manutencao(current_setting('teste.execucao')::uuid)$$,
  'Todos os equipamentos precisam ser tratados'
);
select public._exige(
  (select status = 'em_execucao' from public.manutencoes where id = current_setting('teste.execucao')::uuid),
  'finalizacao incompleta nao encerra a visita'
);
select public.registrar_ocorrencia(
  (select id from public.itens_manutencao
   where manutencao_id = current_setting('teste.execucao')::uuid and nome_identificacao = 'Bike Horizontal'),
  false,
  'Barulho no eixo',
  current_setting('teste.execucao') || '/bike.jpg'
);
select public._exige(
  public.finalizar_manutencao(current_setting('teste.execucao')::uuid) = 'aguardando_administracao',
  'ocorrencia nao resolvida aguarda a administracao'
);

select public._teste_recusa(
  $$select public.registrar_ok('00000000-0000-4000-8000-000000000075')$$,
  'Visita encerrada para edição do prestador'
);
select public._exige(
  (select data_programada_atual = date '2026-03-10' and status = 'programada'
   from public.manutencoes where id = '00000000-0000-4000-8000-000000000061'),
  'executar avulsa nao altera a preventiva'
);
select public._exige(
  (select count(*) = 6
   from public.manutencoes
   where contrato_id = '00000000-0000-4000-8000-000000000020' and tipo = 'preventiva'),
  'a programacao do contrato permanece inteira'
);
select public._exige(
  (select public = false from storage.buckets where id = 'fotos'),
  'bucket de fotos permanece privado'
);
select public._exige(
  (select count(*) = 1 from pg_policies where policyname = 'fotos_prestador_delete'),
  'prestador pode substituir a foto da visita aberta'
);

set local role anon;
select public._teste_recusa(
  $$select public.registrar_ok('00000000-0000-4000-8000-000000000076')$$,
  'permission denied'
);
reset role;
