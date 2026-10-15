-- Fase 5A: tratamento administrativo sem alterar a visita nem a programação.

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);

select public._exige(
  (
    select status_ocorrencia = 'aberta'
      and descricao_original = 'Correia solta'
      and foto_url = 'fotos/correia.jpg'
    from public.ocorrencias
    where item_manutencao_id = '00000000-0000-4000-8000-000000000074'
  ),
  'registro original do prestador continua aberto'
);

select public.registrar_tratamento_ocorrencia(
  (select id from public.ocorrencias where item_manutencao_id = '00000000-0000-4000-8000-000000000074'),
  'em_analise',
  'Verificar a correia com o condomínio'
);

select public.registrar_tratamento_ocorrencia(
  (select id from public.ocorrencias where item_manutencao_id = '00000000-0000-4000-8000-000000000074'),
  'aguardando_orcamento',
  'Pedir orçamento da correia'
);

select public._exige(
  (
    select status_ocorrencia = 'aguardando_orcamento'
      and descricao_original = 'Correia solta'
      and foto_url = 'fotos/correia.jpg'
      and resolvida_no_local = false
    from public.ocorrencias
    where item_manutencao_id = '00000000-0000-4000-8000-000000000074'
  ),
  'tratamento muda a situacao e preserva o registro original'
);

select public._exige(
  (
    select count(*) = 2
      and bool_or(situacao_anterior = 'aberta' and situacao_nova = 'em_analise')
      and bool_or(situacao_anterior = 'em_analise' and situacao_nova = 'aguardando_orcamento')
    from public.historico_ocorrencias
    where ocorrencia_id = (select id from public.ocorrencias where item_manutencao_id = '00000000-0000-4000-8000-000000000074')
  ),
  'historico guarda a situacao anterior e a nova'
);

select public._teste_recusa(
  $$delete from public.historico_ocorrencias
    where ocorrencia_id = (select id from public.ocorrencias where item_manutencao_id = '00000000-0000-4000-8000-000000000074')$$,
  'não pode ser apagado'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
select public._teste_recusa(
  $$select public.registrar_tratamento_ocorrencia(
    (select id from public.ocorrencias where item_manutencao_id = '00000000-0000-4000-8000-000000000074'),
    'resolvida',
    'Prestador não decide'
  )$$,
  'Somente o ADM trata a ocorrência'
);
select public._teste_recusa(
  $$select public.programar_retorno_ocorrencia(
    (select id from public.ocorrencias where item_manutencao_id = '00000000-0000-4000-8000-000000000074'),
    date '2026-12-02',
    '00000000-0000-4000-8000-000000000030'
  )$$,
  'Somente o ADM trata a ocorrência'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
select public._exige(
  (
    select tipo = 'corretiva_complementar'
      and numero_visita is null
      and status = 'programada'
      and ocorrencia_origem_id = (select id from public.ocorrencias where item_manutencao_id = '00000000-0000-4000-8000-000000000074')
    from public.manutencoes
    where id = '00000000-0000-4000-8000-000000000067'
  ),
  'retorno ja existente permanece ligado a ocorrencia sem numero preventivo'
);
select public._teste_recusa(
  $$select public.programar_retorno_ocorrencia(
    (select id from public.ocorrencias where item_manutencao_id = '00000000-0000-4000-8000-000000000074'),
    date '2026-12-02',
    '00000000-0000-4000-8000-000000000030'
  )$$,
  'Já existe um retorno em aberto'
);
select public.cancelar_manutencao('00000000-0000-4000-8000-000000000067');
select public.programar_retorno_ocorrencia(
  (select id from public.ocorrencias where item_manutencao_id = '00000000-0000-4000-8000-000000000074'),
  date '2026-12-02',
  '00000000-0000-4000-8000-000000000030'
);

select public._exige(
  (
    select count(*) = 1
    from public.manutencoes
    where ocorrencia_origem_id = (select id from public.ocorrencias where item_manutencao_id = '00000000-0000-4000-8000-000000000074')
      and tipo = 'corretiva_complementar'
      and numero_visita is null
      and contrato_id = '00000000-0000-4000-8000-000000000020'
      and condominio_id = '00000000-0000-4000-8000-000000000010'
      and prestador_id = '00000000-0000-4000-8000-000000000030'
      and data_programada_atual = date '2026-12-02'
      and status = 'programada'
  ),
  'retorno fica ligado a ocorrencia sem numerar visita preventiva'
);

select public._exige(
  (
    select count(*) = 1
    from public.itens_manutencao i
    join public.manutencoes m on m.id = i.manutencao_id
    where m.ocorrencia_origem_id = (select id from public.ocorrencias where item_manutencao_id = '00000000-0000-4000-8000-000000000074')
      and i.nome_identificacao = 'Esteira 01'
      and i.equipamento_contrato_id = '00000000-0000-4000-8000-000000000050'
      and i.resultado = 'pendente'
  ),
  'retorno reutiliza o equipamento da ocorrencia'
);

select public._exige(
  (select numero_visita = 3 and data_programada_atual = date '2026-03-31' and status = 'realizada' from public.manutencoes where id = '00000000-0000-4000-8000-000000000062'),
  'retorno nao altera a programacao contratual'
);
select public._exige(
  (select status = 'aguardando_administracao' from public.manutencoes where id = '00000000-0000-4000-8000-000000000063'),
  'visita finalizada permanece como registro historico'
);
select public._exige(
  (select status_ocorrencia = 'retorno_programado' from public.ocorrencias where item_manutencao_id = '00000000-0000-4000-8000-000000000074'),
  'programar retorno atualiza a situacao da ocorrencia'
);

select public._teste_recusa(
  $$select public.programar_retorno_ocorrencia(
    (select id from public.ocorrencias where item_manutencao_id = '00000000-0000-4000-8000-000000000074'),
    date '2026-12-10',
    '00000000-0000-4000-8000-000000000030'
  )$$,
  'Já existe um retorno em aberto'
);
select public._exige(
  (select status = 'cancelada' from public.manutencoes where id = '00000000-0000-4000-8000-000000000067'),
  'cancelar o retorno anterior nao apaga o vinculo'
);

select public.registrar_tratamento_ocorrencia(
  (select id from public.ocorrencias where item_manutencao_id = '00000000-0000-4000-8000-000000000074'),
  'resolvida',
  'Correia substituída na garantia'
);

select public._exige(
  (
    select status_ocorrencia = 'resolvida'
      and solucao = 'Correia substituída na garantia'
      and descricao_original = 'Correia solta'
      and foto_url = 'fotos/correia.jpg'
    from public.ocorrencias
    where item_manutencao_id = '00000000-0000-4000-8000-000000000074'
  ),
  'encerramento registra a solucao sem alterar a execucao'
);
select public._exige(
  (select count(*) >= 4 from public.historico_ocorrencias where ocorrencia_id = (select id from public.ocorrencias where item_manutencao_id = '00000000-0000-4000-8000-000000000074')),
  'encerramento nao apaga o historico anterior'
);
