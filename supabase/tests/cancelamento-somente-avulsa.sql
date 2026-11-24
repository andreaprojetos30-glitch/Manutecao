-- Preventiva contratual não cancela. Avulsa cancela e permanece no histórico.
-- Reagendar não mexe em número, saldo nem nas outras datas.
-- Retirar visita intacta anterior à implantação não grava cancelamento.

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);

insert into public.contratos (
  id, numero_contrato, condominio_id, data_inicio_contrato, data_fim_contrato,
  data_inicio_manutencao, quantidade_visitas, visitas_anteriores, prestador_padrao_id, status
) values (
  '00000000-0000-4000-8000-0000000000d9',
  'TESTE-CANCEL-3',
  '00000000-0000-4000-8000-000000000010',
  date '2026-04-15',
  date '2026-06-15',
  date '2026-04-15',
  3,
  0,
  '00000000-0000-4000-8000-000000000030',
  'ativo'
);

insert into public.equipamentos_contrato (
  id, contrato_id, equipamento_matriz_id, nome_identificacao, data_entrada
) values (
  '00000000-0000-4000-8000-0000000000d7',
  '00000000-0000-4000-8000-0000000000d9',
  '00000000-0000-4000-8000-000000000040',
  'Bike',
  date '2026-04-15'
);

select public._exige(
  public.gerar_programacao_contrato(
    '00000000-0000-4000-8000-0000000000d9',
    0,
    array[]::date[],
    false
  ) = 3,
  'contrato novo gera as tres preventivas'
);

select public._teste_recusa(
  $$select public.cancelar_manutencao(
    (select id from public.manutencoes
     where contrato_id = '00000000-0000-4000-8000-0000000000d9' and numero_visita = 1)
  )$$,
  'Visita preventiva do contrato não pode ser cancelada'
);

select set_config('app.cancelando', 'on', true);
select public._teste_recusa(
  $$update public.manutencoes
      set status = 'cancelada'
    where contrato_id = '00000000-0000-4000-8000-0000000000d9'
      and numero_visita = 1$$,
  'Visita preventiva do contrato não pode ser cancelada'
);
select set_config('app.cancelando', 'off', true);

select public._exige(
  (
    select count(*) = 3
      and bool_and(status = 'programada')
      and bool_and(tipo = 'preventiva')
      and bool_and(registro_anterior = false)
    from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-0000000000d9'
  ),
  'tentar cancelar a preventiva nao muda status nem quantidade'
);

select public._exige(
  (
    select visitas_anteriores = 0 and quantidade_visitas = 3
    from public.contratos
    where id = '00000000-0000-4000-8000-0000000000d9'
  ),
  'tentar cancelar a preventiva nao mexe no saldo do contrato'
);

insert into public.manutencoes (
  id, condominio_id, contrato_id, numero_visita, data_programada_original, data_programada_atual,
  prestador_id, tipo, origem, status
) values (
  '00000000-0000-4000-8000-0000000000d2',
  '00000000-0000-4000-8000-000000000010',
  '00000000-0000-4000-8000-0000000000d9',
  null,
  date '2026-05-20',
  date '2026-05-20',
  '00000000-0000-4000-8000-000000000030',
  'corretiva',
  'manual',
  'programada'
);

select public._teste_recusa(
  $$select public.cancelar_manutencao('00000000-0000-4000-8000-0000000000d2')$$,
  'Somente manutenção avulsa pode ser cancelada'
);

select public._exige(
  (select status = 'programada' and numero_visita is null from public.manutencoes where id = '00000000-0000-4000-8000-0000000000d2'),
  'corretiva permanece programada'
);

select public.reagendar_visita(
  (select id from public.manutencoes
   where contrato_id = '00000000-0000-4000-8000-0000000000d9' and numero_visita = 2),
  date '2026-08-02'
);

select public._exige(
  (
    select numero_visita = 2
      and status = 'programada'
      and tipo = 'preventiva'
      and data_programada_atual = date '2026-08-02'
      and data_programada_original = date '2026-05-15'
      and contrato_id = '00000000-0000-4000-8000-0000000000d9'
    from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-0000000000d9'
      and numero_visita = 2
  ),
  'reagendar preserva numero, tipo, contrato e data original'
);

select public._exige(
  (
    select count(*) = 1
      and bool_and(data_anterior = date '2026-05-15')
      and bool_and(nova_data = date '2026-08-02')
    from public.historico_reagendamentos
    where manutencao_id = (
      select id from public.manutencoes
      where contrato_id = '00000000-0000-4000-8000-0000000000d9' and numero_visita = 2
    )
  ),
  'reagendar grava o historico desta visita'
);

select public._exige(
  (
    select data_programada_atual = date '2026-04-15'
    from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-0000000000d9' and numero_visita = 1
  )
  and (
    select data_programada_atual = date '2026-06-15'
    from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-0000000000d9' and numero_visita = 3
  ),
  'reagendar uma preventiva nao move as outras'
);

select public.conferir_saldo_visitas('00000000-0000-4000-8000-0000000000d9');
select public._exige(
  (
    select visitas_anteriores = 0 and quantidade_visitas = 3
    from public.contratos
    where id = '00000000-0000-4000-8000-0000000000d9'
  ),
  'reagendar nao altera o saldo contratual'
);

select public._teste_recusa(
  $$update public.manutencoes
      set numero_visita = 9
    where contrato_id = '00000000-0000-4000-8000-0000000000d9'
      and numero_visita = 2$$,
  'A numeração e o vínculo contratual da visita permanecem'
);

select public.criar_manutencao_avulsa(
  '00000000-0000-4000-8000-000000000010',
  date '2032-07-01',
  '00000000-0000-4000-8000-000000000030',
  jsonb_build_array('00000000-0000-4000-8000-000000000040')
);

select public.reagendar_visita(
  (select id from public.manutencoes where tipo = 'avulsa' and data_programada_atual = date '2032-07-01' order by created_at desc limit 1),
  date '2032-07-15'
);

select public.cancelar_manutencao(
  (select id from public.manutencoes where tipo = 'avulsa' and data_programada_atual = date '2032-07-15' order by created_at desc limit 1)
);

select public._exige(
  (
    select status = 'cancelada'
      and tipo = 'avulsa'
      and contrato_id is null
      and numero_visita is null
      and data_programada_original = date '2032-07-01'
      and data_programada_atual = date '2032-07-15'
    from public.manutencoes
    where tipo = 'avulsa' and data_programada_atual = date '2032-07-15'
  ),
  'cancelar avulsa preserva a visita e o historico de data'
);

select public._exige(
  (
    select count(*) = 1
    from public.historico_reagendamentos h
    join public.manutencoes m on m.id = h.manutencao_id
    where m.tipo = 'avulsa'
      and m.data_programada_atual = date '2032-07-15'
      and h.data_anterior = date '2032-07-01'
      and h.nova_data = date '2032-07-15'
  ),
  'o historico da avulsa cancelada permanece'
);

select public._exige(
  (
    select visitas_anteriores = 0
      and quantidade_visitas = 3
      and (
        select count(*) = 3
        from public.manutencoes
        where contrato_id = '00000000-0000-4000-8000-0000000000d9'
          and tipo = 'preventiva'
          and status = 'programada'
      )
    from public.contratos
    where id = '00000000-0000-4000-8000-0000000000d9'
  ),
  'cancelar avulsa nao altera o saldo nem as preventivas'
);

select public.criar_manutencao_avulsa(
  '00000000-0000-4000-8000-000000000010',
  date '2032-07-02',
  '00000000-0000-4000-8000-000000000030',
  jsonb_build_array('00000000-0000-4000-8000-000000000040')
);

select set_config('app.executando', 'on', true);
update public.manutencoes
  set status = 'em_execucao'
where tipo = 'avulsa' and data_programada_atual = date '2032-07-02';
select set_config('app.executando', 'off', true);

select public.cancelar_manutencao(
  (select id from public.manutencoes where tipo = 'avulsa' and data_programada_atual = date '2032-07-02')
);

select public._exige(
  (select status = 'cancelada' from public.manutencoes where tipo = 'avulsa' and data_programada_atual = date '2032-07-02'),
  'avulsa em execucao pode ser cancelada e permanece gravada'
);

select public.criar_manutencao_avulsa(
  '00000000-0000-4000-8000-000000000010',
  date '2032-07-03',
  '00000000-0000-4000-8000-000000000030',
  jsonb_build_array('00000000-0000-4000-8000-000000000040')
);

select set_config('app.finalizando', 'on', true);
update public.manutencoes
  set status = 'realizada'
where tipo = 'avulsa' and data_programada_atual = date '2032-07-03';
select set_config('app.finalizando', 'off', true);

select public._teste_recusa(
  $$select public.cancelar_manutencao(
    (select id from public.manutencoes where tipo = 'avulsa' and data_programada_atual = date '2032-07-03')
  )$$,
  'Visita já encerrada'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
select public._teste_recusa(
  $$select public.cancelar_manutencao(
    (select id from public.manutencoes
     where contrato_id = '00000000-0000-4000-8000-0000000000d9' and numero_visita = 3)
  )$$,
  'Somente o ADM pode cancelar uma visita'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
select public._exige(
  public.registrar_visitas_anteriores(
    '00000000-0000-4000-8000-0000000000d9',
    1,
    array[]::date[],
    true
  ) = 1,
  'retirar a visita intacta continua disponivel'
);

select public._exige(
  (
    select visitas_anteriores = 1
      and quantidade_visitas = 3
      and (
        select count(*) = 0
        from public.manutencoes
        where contrato_id = '00000000-0000-4000-8000-0000000000d9'
          and status = 'cancelada'
      )
      and (
        select count(*) = 2
          and bool_and(status = 'programada')
          and bool_and(numero_visita in (2, 3))
        from public.manutencoes
        where contrato_id = '00000000-0000-4000-8000-0000000000d9'
          and tipo = 'preventiva'
      )
    from public.contratos
    where id = '00000000-0000-4000-8000-0000000000d9'
  ),
  'retirar visita intacta nao cancela e nao renumera as que ficam'
);
