-- O ADM retira a liberação e troca o prestador só da visita programada.
-- A troca de visita liberada exige nova autorização.
-- O histórico guarda responsável e momento, sem apagar o anterior.

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);

insert into public.contratos (
  id, numero_contrato, condominio_id, data_inicio_contrato, data_fim_contrato,
  data_inicio_manutencao, quantidade_visitas, visitas_anteriores, prestador_padrao_id, status
) values (
  '00000000-0000-4000-8000-00000000e240',
  'TESTE-TROCA-24',
  '00000000-0000-4000-8000-000000000010',
  date '2026-10-01',
  date '2026-11-01',
  date '2026-10-01',
  2,
  0,
  '00000000-0000-4000-8000-000000000030',
  'ativo'
);

insert into public.equipamentos_contrato (
  id, contrato_id, equipamento_matriz_id, nome_identificacao, data_entrada
) values (
  '00000000-0000-4000-8000-00000000e241',
  '00000000-0000-4000-8000-00000000e240',
  '00000000-0000-4000-8000-000000000040',
  'Esteira troca',
  date '2026-10-01'
);

select public.gerar_programacao_contrato(
  '00000000-0000-4000-8000-00000000e240',
  0,
  array[]::date[],
  false
);

select public._teste_recusa(
  $$select public.retirar_liberacao_execucao(
    (select id from public.manutencoes
     where contrato_id = '00000000-0000-4000-8000-00000000e240'
       and numero_visita = 1)
  )$$,
  'Esta visita não está liberada'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
select public._teste_recusa(
  $$select public.retirar_liberacao_execucao(
    (select id from public.manutencoes
     where contrato_id = '00000000-0000-4000-8000-00000000e240'
       and numero_visita = 1)
  )$$,
  'Somente o ADM retira a liberação'
);
select public._teste_recusa(
  $$select public.trocar_prestador_visita(
    (select id from public.manutencoes
     where contrato_id = '00000000-0000-4000-8000-00000000e240'
       and numero_visita = 1),
    '00000000-0000-4000-8000-000000000031'
  )$$,
  'Somente o ADM troca o prestador'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
select public.liberar_execucao(
  (select id from public.manutencoes
   where contrato_id = '00000000-0000-4000-8000-00000000e240'
     and numero_visita = 1)
);

select public._exige(
  (
    select count(*) = 1
      and bool_and(acao = 'liberacao')
      and bool_and(prestador_novo_id = '00000000-0000-4000-8000-000000000030')
      and bool_and(responsavel_id = '00000000-0000-4000-8000-000000000001')
      and bool_and(created_at is not null)
    from public.historico_execucao
    where manutencao_id = (
      select id from public.manutencoes
      where contrato_id = '00000000-0000-4000-8000-00000000e240'
        and numero_visita = 1
    )
  ),
  'liberar grava responsavel e momento'
);

select public.retirar_liberacao_execucao(
  (select id from public.manutencoes
   where contrato_id = '00000000-0000-4000-8000-00000000e240'
     and numero_visita = 1)
);

select public._exige(
  (
    select status = 'programada'
      and execucao_liberada_em is null
      and execucao_liberada_por is null
      and prestador_id = '00000000-0000-4000-8000-000000000030'
      and numero_visita = 1
    from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-00000000e240'
      and numero_visita = 1
  ),
  'retirar devolve a visita para a programacao'
);

select public._exige(
  (
    select count(*) = 2
      and count(*) filter (where acao = 'liberacao') = 1
      and count(*) filter (where acao = 'retirada') = 1
      and bool_and(responsavel_id = '00000000-0000-4000-8000-000000000001')
      and bool_and(created_at is not null)
    from public.historico_execucao
    where manutencao_id = (
      select id from public.manutencoes
      where contrato_id = '00000000-0000-4000-8000-00000000e240'
        and numero_visita = 1
    )
  ),
  'a retirada preserva a liberacao anterior'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
set role authenticated;
select public._exige(
  (
    select count(*) = 0
    from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-00000000e240'
  ),
  'depois da retirada o celular nao ve a visita'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
select public._teste_recusa(
  $$select public.registrar_ok(
    (select i.id
     from public.itens_manutencao i
     join public.manutencoes m on m.id = i.manutencao_id
     where m.contrato_id = '00000000-0000-4000-8000-00000000e240'
       and m.numero_visita = 1
     limit 1)
  )$$,
  'A execução ainda não foi liberada'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
select set_config('app.liberando_execucao', 'off', true);
select set_config('app.trocando_prestador', 'off', true);
select public._teste_recusa(
  $$update public.manutencoes
    set execucao_liberada_em = now()
    where contrato_id = '00000000-0000-4000-8000-00000000e240'
      and numero_visita = 1$$,
  'A liberação da execução só ocorre pelo botão da ficha'
);
select public._teste_recusa(
  $$update public.manutencoes
    set prestador_id = '00000000-0000-4000-8000-000000000031'
    where contrato_id = '00000000-0000-4000-8000-00000000e240'
      and numero_visita = 1$$,
  'A troca de prestador só ocorre pelo botão da ficha'
);

select public.liberar_execucao(
  (select id from public.manutencoes
   where contrato_id = '00000000-0000-4000-8000-00000000e240'
     and numero_visita = 1)
);
select public.trocar_prestador_visita(
  (select id from public.manutencoes
   where contrato_id = '00000000-0000-4000-8000-00000000e240'
     and numero_visita = 1),
  '00000000-0000-4000-8000-000000000031'
);

select public._exige(
  (
    select m.status = 'programada'
      and m.execucao_liberada_em is null
      and m.prestador_id = '00000000-0000-4000-8000-000000000031'
      and m.numero_visita = 1
      and c.prestador_padrao_id = '00000000-0000-4000-8000-000000000030'
      and (
        select m2.prestador_id = '00000000-0000-4000-8000-000000000030'
          and m2.execucao_liberada_em is null
          and m2.numero_visita = 2
        from public.manutencoes m2
        where m2.contrato_id = m.contrato_id
          and m2.numero_visita = 2
      )
    from public.manutencoes m
    join public.contratos c on c.id = m.contrato_id
    where m.contrato_id = '00000000-0000-4000-8000-00000000e240'
      and m.numero_visita = 1
  ),
  'a troca vale so para a visita liberada e pede nova autorizacao'
);

select public._exige(
  (
    select count(*) filter (where acao = 'liberacao') = 2
      and count(*) filter (where acao = 'retirada') = 2
      and count(*) filter (
        where acao = 'troca_prestador'
          and prestador_anterior_id = '00000000-0000-4000-8000-000000000030'
          and prestador_novo_id = '00000000-0000-4000-8000-000000000031'
          and responsavel_id = '00000000-0000-4000-8000-000000000001'
          and created_at is not null
      ) = 1
    from public.historico_execucao
    where manutencao_id = (
      select id from public.manutencoes
      where contrato_id = '00000000-0000-4000-8000-00000000e240'
        and numero_visita = 1
    )
  ),
  'troca e retiradas permanecem junto da primeira liberacao'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', false);
set role authenticated;
select public._exige(
  (
    select count(*) = 0
    from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-00000000e240'
  ),
  'o prestador novo nao recebe a visita sem nova liberacao'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
select public.trocar_prestador_visita(
  (select id from public.manutencoes
   where contrato_id = '00000000-0000-4000-8000-00000000e240'
     and numero_visita = 2),
  '00000000-0000-4000-8000-000000000031'
);

select public._exige(
  (
    select execucao_liberada_em is null
      and prestador_id = '00000000-0000-4000-8000-000000000031'
      and (
        select count(*) = 1
          and bool_and(acao = 'troca_prestador')
        from public.historico_execucao h
        where h.manutencao_id = m.id
      )
    from public.manutencoes m
    where contrato_id = '00000000-0000-4000-8000-00000000e240'
      and numero_visita = 2
  ),
  'troca sem liberacao nao cria retirada'
);

select public.liberar_execucao(
  (select id from public.manutencoes
   where contrato_id = '00000000-0000-4000-8000-00000000e240'
     and numero_visita = 1)
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
set role authenticated;
select public._exige(
  (
    select count(*) = 0
    from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-00000000e240'
      and numero_visita = 1
  ),
  'o prestador anterior perde a visita'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', false);
set role authenticated;
select public._exige(
  (
    select count(*) = 1
      and bool_and(numero_visita = 1)
    from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-00000000e240'
  ),
  'so a nova liberacao chega ao prestador novo'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', false);
select public.registrar_ok(
  (select i.id
   from public.itens_manutencao i
   join public.manutencoes m on m.id = i.manutencao_id
   where m.contrato_id = '00000000-0000-4000-8000-00000000e240'
     and m.numero_visita = 1
   limit 1)
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
select public._teste_recusa(
  $$select public.retirar_liberacao_execucao(
    (select id from public.manutencoes
     where contrato_id = '00000000-0000-4000-8000-00000000e240'
       and numero_visita = 1)
  )$$,
  'Só é possível retirar a liberação de uma visita programada'
);
select public._teste_recusa(
  $$select public.trocar_prestador_visita(
    (select id from public.manutencoes
     where contrato_id = '00000000-0000-4000-8000-00000000e240'
       and numero_visita = 1),
    '00000000-0000-4000-8000-000000000030'
  )$$,
  'Só é possível trocar o prestador de uma visita programada'
);

select public._exige(
  (
    select status = 'em_execucao'
      and execucao_liberada_em is not null
      and prestador_id = '00000000-0000-4000-8000-000000000031'
    from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-00000000e240'
      and numero_visita = 1
  ),
  'visita iniciada conserva liberacao e prestador'
);

select public._teste_recusa(
  $$delete from public.historico_execucao
    where manutencao_id = (
      select id from public.manutencoes
      where contrato_id = '00000000-0000-4000-8000-00000000e240'
        and numero_visita = 1
    )$$,
  'O histórico da execução não pode ser apagado'
);

reset role;
