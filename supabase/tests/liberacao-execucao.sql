-- Programação não aparece no celular até o ADM liberar a execução.
-- Preventiva, avulsa, corretiva e retorno nascem fechadas.
-- Visita já encerrada permanece visível. O ADM continua vendo a agenda.

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);

select public._exige(
  (
    select not exists (
      select 1 from public.manutencoes
      where status = 'programada' and execucao_liberada_em is not null
    )
    and not exists (
      select 1 from public.manutencoes
      where status <> 'programada' and execucao_liberada_em is null
    )
  ),
  'so a visita ja iniciada ou encerrada fica liberada'
);

insert into public.contratos (
  id, numero_contrato, condominio_id, data_inicio_contrato, data_fim_contrato,
  data_inicio_manutencao, quantidade_visitas, visitas_anteriores, prestador_padrao_id, status
) values (
  '00000000-0000-4000-8000-0000000000f8',
  'TESTE-LIBERA-23',
  '00000000-0000-4000-8000-000000000010',
  date '2026-08-01',
  date '2026-09-01',
  date '2026-08-01',
  2,
  0,
  '00000000-0000-4000-8000-000000000030',
  'ativo'
);

insert into public.equipamentos_contrato (
  id, contrato_id, equipamento_matriz_id, nome_identificacao, data_entrada
) values (
  '00000000-0000-4000-8000-0000000001a1',
  '00000000-0000-4000-8000-0000000000f8',
  '00000000-0000-4000-8000-000000000040',
  'Esteira',
  date '2026-08-01'
);

select public.gerar_programacao_contrato(
  '00000000-0000-4000-8000-0000000000f8',
  0,
  array[]::date[],
  false
);

select public.criar_manutencao_avulsa(
  '00000000-0000-4000-8000-000000000010',
  date '2033-03-03',
  '00000000-0000-4000-8000-000000000030',
  jsonb_build_array('00000000-0000-4000-8000-000000000040')
);

insert into public.manutencoes (
  id, condominio_id, contrato_id, data_programada_original, data_programada_atual,
  prestador_id, tipo, origem, status
) values (
  '00000000-0000-4000-8000-0000000000fa',
  '00000000-0000-4000-8000-000000000010',
  '00000000-0000-4000-8000-0000000000f8',
  date '2033-04-04',
  date '2033-04-04',
  '00000000-0000-4000-8000-000000000030',
  'corretiva',
  'manual',
  'programada'
);

insert into public.itens_manutencao (
  id, manutencao_id, equipamento_contrato_id, nome_identificacao, resultado
) values (
  '00000000-0000-4000-8000-0000000000fb',
  '00000000-0000-4000-8000-0000000000fa',
  '00000000-0000-4000-8000-0000000001a1',
  'Esteira',
  'pendente'
);

select public.programar_retorno_ocorrencia(
  (
    select o.id
    from public.ocorrencias o
    where not exists (
      select 1
      from public.manutencoes m
      where m.ocorrencia_origem_id = o.id
        and m.status in ('programada', 'em_execucao')
    )
    order by o.created_at
    limit 1
  ),
  date '2033-05-05',
  '00000000-0000-4000-8000-000000000030'
);

select public._exige(
  (
    select count(*) = 4
      and bool_and(execucao_liberada_em is null)
      and bool_and(status = 'programada')
    from public.manutencoes
    where id = '00000000-0000-4000-8000-0000000000fa'
       or (contrato_id = '00000000-0000-4000-8000-0000000000f8' and tipo = 'preventiva' and numero_visita = 1)
       or (tipo = 'avulsa' and data_programada_atual = date '2033-03-03')
       or (tipo = 'corretiva_complementar' and data_programada_atual = date '2033-05-05')
  ),
  'os quatro tipos nascem sem liberacao'
);

select public._teste_recusa(
  $$select public.registrar_ok(
    (select i.id
     from public.itens_manutencao i
     join public.manutencoes m on m.id = i.manutencao_id
     where m.contrato_id = '00000000-0000-4000-8000-0000000000f8'
       and m.numero_visita = 1
     limit 1)
  )$$,
  'A execução ainda não foi liberada'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
select public._teste_recusa(
  $$select public.liberar_execucao('00000000-0000-4000-8000-0000000000fa')$$,
  'Somente o ADM libera a execução'
);

set role authenticated;
select public._exige(
  (
    select count(*) = 0
    from public.manutencoes
    where id = '00000000-0000-4000-8000-0000000000fa'
       or (contrato_id = '00000000-0000-4000-8000-0000000000f8' and tipo = 'preventiva')
       or (tipo = 'avulsa' and data_programada_atual = date '2033-03-03')
       or (tipo = 'corretiva_complementar' and data_programada_atual = date '2033-05-05')
  ),
  'o celular nao recebe a programacao fechada'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
select public.liberar_execucao(
  (select id from public.manutencoes
   where contrato_id = '00000000-0000-4000-8000-0000000000f8'
     and tipo = 'preventiva'
     and numero_visita = 1)
);

select public._exige(
  (
    select execucao_liberada_em is not null
      and execucao_liberada_por = '00000000-0000-4000-8000-000000000001'
      and status = 'programada'
      and numero_visita = 1
    from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-0000000000f8'
      and tipo = 'preventiva'
      and numero_visita = 1
  ),
  'liberar grava o momento e preserva a visita'
);

select public._exige(
  (
    select count(*) = 4
      and bool_and(execucao_liberada_em is null)
    from public.manutencoes
    where id = '00000000-0000-4000-8000-0000000000fa'
       or (tipo = 'avulsa' and data_programada_atual = date '2033-03-03')
       or (tipo = 'corretiva_complementar' and data_programada_atual = date '2033-05-05')
       or (
         contrato_id = '00000000-0000-4000-8000-0000000000f8'
         and tipo = 'preventiva'
         and numero_visita = 2
       )
  ),
  'liberar uma visita nao abre as outras'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
set role authenticated;
select public._exige(
  (
    select count(*) = 1
      and bool_and(numero_visita = 1)
    from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-0000000000f8'
       or id = '00000000-0000-4000-8000-0000000000fa'
       or (tipo = 'avulsa' and data_programada_atual = date '2033-03-03')
       or (tipo = 'corretiva_complementar' and data_programada_atual = date '2033-05-05')
  ),
  'o celular recebe so a visita liberada'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
select public.registrar_ok(
  (select i.id
   from public.itens_manutencao i
   join public.manutencoes m on m.id = i.manutencao_id
   where m.contrato_id = '00000000-0000-4000-8000-0000000000f8'
     and m.numero_visita = 1
   limit 1)
);
select public._exige(
  (
    select status = 'em_execucao'
      and numero_visita = 1
      and execucao_liberada_em is not null
    from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-0000000000f8'
      and numero_visita = 1
  ),
  'depois da liberacao a execucao comeca no primeiro registro'
);

reset role;
