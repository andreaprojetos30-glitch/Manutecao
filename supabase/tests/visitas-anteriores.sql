-- Adequação da Fase 3: visitas anteriores entram na numeração sem checklist.

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);

insert into public.contratos (
  id, numero_contrato, condominio_id, data_inicio_contrato, data_fim_contrato,
  data_inicio_manutencao, quantidade_visitas, prestador_padrao_id, status
) values (
  '00000000-0000-4000-8000-0000000000e1',
  'TESTE-ANTERIORES',
  '00000000-0000-4000-8000-000000000010',
  date '2026-01-01',
  date '2026-12-01',
  date '2026-01-01',
  12,
  '00000000-0000-4000-8000-000000000030',
  'ativo'
);

insert into public.equipamentos_contrato (
  id, contrato_id, equipamento_matriz_id, nome_identificacao, data_entrada
) values (
  '00000000-0000-4000-8000-0000000000e8',
  '00000000-0000-4000-8000-0000000000e1',
  '00000000-0000-4000-8000-000000000040',
  'Esteira',
  date '2026-01-01'
);

select public._teste_recusa(
  $$select public.gerar_programacao_contrato(
    '00000000-0000-4000-8000-0000000000e1',
    7,
    array[
      date '2026-01-10', date '2026-02-10', date '2026-03-10', date '2026-04-10',
      date '2026-05-10', date '2026-06-10', date '2026-10-10'
    ],
    false
  )$$,
  'Confirme as visitas anteriores'
);

select public._exige(
  (select count(*) = 0 from public.manutencoes where contrato_id = '00000000-0000-4000-8000-0000000000e1'),
  'recusa sem confirmacao nao cria visita'
);

select public._exige(
  public.gerar_programacao_contrato(
    '00000000-0000-4000-8000-0000000000e1',
    7,
    array[
      date '2026-01-10', date '2026-02-10', date '2026-03-10', date '2026-04-10',
      date '2026-05-10', date '2026-06-10', date '2026-10-10'
    ],
    true
  ) = 12,
  'gera as 12 posicoes sem duplicar'
);

select public._exige(
  (
    select count(*) = 7
      and bool_and(registro_anterior)
      and bool_and(status = 'realizada')
      and bool_and(prestador_id is null)
      and bool_and(data_programada_original = public.data_visita_mensal(date '2026-01-01', numero_visita - 1))
      and bool_and(data_programada_atual = data_programada_original)
    from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-0000000000e1'
      and numero_visita between 1 and 7
  ),
  'as sete primeiras guardam a data mensal e a posicao'
);

select public._exige(
  (
    select data_realizada = date '2026-10-10'
      and data_programada_original = date '2026-07-01'
      and numero_visita = 7
    from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-0000000000e1'
      and numero_visita = 7
  ),
  'a setima usa a data efetiva informada'
);

select public._exige(
  (
    select count(*) = 0
    from public.itens_manutencao i
    join public.manutencoes m on m.id = i.manutencao_id
    where m.contrato_id = '00000000-0000-4000-8000-0000000000e1'
      and m.numero_visita <= 7
  ),
  'registro anterior nao cria checklist'
);

select public._exige(
  (
    select status = 'programada'
      and registro_anterior = false
      and numero_visita = 8
      and data_programada_original = date '2026-08-01'
      and prestador_id = '00000000-0000-4000-8000-000000000030'
    from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-0000000000e1'
      and numero_visita = 8
  ),
  'a oitava continua programada na data mensal'
);

select public._exige(
  (
    select count(*) = 1
    from public.itens_manutencao i
    join public.manutencoes m on m.id = i.manutencao_id
    where m.contrato_id = '00000000-0000-4000-8000-0000000000e1'
      and m.numero_visita = 8
      and i.resultado = 'pendente'
  ),
  'so a visita futura recebe o equipamento'
);

select public._exige(
  (select count(*) = 12 from public.manutencoes where contrato_id = '00000000-0000-4000-8000-0000000000e1' and tipo = 'preventiva'),
  'nao ha visita preventiva duplicada'
);

select public._exige(
  (select data_fim_contrato = date '2026-12-01' from public.contratos where id = '00000000-0000-4000-8000-0000000000e1'),
  'o fim do contrato permanece a ultima data mensal'
);

insert into public.contratos (
  id, numero_contrato, condominio_id, data_inicio_contrato, data_fim_contrato,
  data_inicio_manutencao, quantidade_visitas, prestador_padrao_id, status
) values (
  '00000000-0000-4000-8000-0000000000e2',
  'TESTE-ANTERIORES-2',
  '00000000-0000-4000-8000-000000000010',
  date '2026-03-01',
  date '2026-06-01',
  date '2026-03-01',
  4,
  '00000000-0000-4000-8000-000000000030',
  'ativo'
);

insert into public.equipamentos_contrato (
  id, contrato_id, equipamento_matriz_id, nome_identificacao, data_entrada
) values (
  '00000000-0000-4000-8000-0000000000e9',
  '00000000-0000-4000-8000-0000000000e2',
  '00000000-0000-4000-8000-000000000040',
  'Bike',
  date '2026-03-01'
);

select public.gerar_programacao_contrato('00000000-0000-4000-8000-0000000000e2');

select public._teste_recusa(
  $$select public.registrar_visitas_anteriores(
    '00000000-0000-4000-8000-0000000000e2',
    2,
    array[date '2026-03-15', date '2026-04-15'],
    false
  )$$,
  'Confirme as visitas anteriores'
);

select public._exige(
  public.registrar_visitas_anteriores(
    '00000000-0000-4000-8000-0000000000e2',
    2,
    array[date '2026-03-15', date '2026-04-15'],
    true
  ) = 2,
  'marca as duas primeiras de uma programacao ja gerada'
);

select public._exige(
  (
    select count(*) = 2
    from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-0000000000e2'
      and numero_visita in (1, 2)
      and registro_anterior
      and status = 'realizada'
      and data_programada_atual = data_programada_original
  ),
  'programacao existente conserva numero e data mensal'
);

select public._exige(
  (
    select status = 'programada'
      and registro_anterior = false
      and data_programada_original = date '2026-05-01'
    from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-0000000000e2'
      and numero_visita = 3
  ),
  'as visitas seguintes permanecem programadas'
);

select public._exige(
  (
    select count(*) = 1
    from public.itens_manutencao i
    join public.manutencoes m on m.id = i.manutencao_id
    where m.contrato_id = '00000000-0000-4000-8000-0000000000e2'
      and m.numero_visita = 3
  ),
  'a visita futura conserva o equipamento'
);

insert into public.contratos (
  id, numero_contrato, condominio_id, data_inicio_contrato, data_fim_contrato,
  data_inicio_manutencao, quantidade_visitas, prestador_padrao_id, status
) values (
  '00000000-0000-4000-8000-0000000000e3',
  'TESTE-ANTERIORES-3',
  '00000000-0000-4000-8000-000000000010',
  date '2026-05-01',
  date '2026-06-01',
  date '2026-05-01',
  2,
  '00000000-0000-4000-8000-000000000030',
  'ativo'
);

insert into public.equipamentos_contrato (
  id, contrato_id, equipamento_matriz_id, nome_identificacao, data_entrada
) values (
  '00000000-0000-4000-8000-0000000000ea',
  '00000000-0000-4000-8000-0000000000e3',
  '00000000-0000-4000-8000-000000000040',
  'Elíptico',
  date '2026-05-01'
);

select public.gerar_programacao_contrato('00000000-0000-4000-8000-0000000000e3');

update public.itens_manutencao
  set resultado = 'ok'
  where manutencao_id = (
    select id from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-0000000000e3'
      and numero_visita = 1
  );

select public._teste_recusa(
  $$select public.registrar_visitas_anteriores(
    '00000000-0000-4000-8000-0000000000e3',
    1,
    array[date '2026-05-20'],
    true
  )$$,
  'Não é possível alterar visita já iniciada'
);

select public._exige(
  (
    select status = 'em_execucao'
      and registro_anterior = false
      and numero_visita = 1
    from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-0000000000e3'
      and numero_visita = 1
  ),
  'visita iniciada permanece como execucao do aplicativo'
);

select public._exige(
  (
    select count(*) = 1
      and bool_and(resultado = 'ok')
    from public.itens_manutencao i
    join public.manutencoes m on m.id = i.manutencao_id
    where m.contrato_id = '00000000-0000-4000-8000-0000000000e3'
      and m.numero_visita = 1
  ),
  'o checklist ja registrado nao e apagado'
);
