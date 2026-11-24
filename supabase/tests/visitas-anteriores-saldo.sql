-- Saldo do contrato: visitas anteriores gravadas, sem ficha e sem duplicar a contagem.
-- Avulsa, corretiva e retorno não entram. A data de uma visita não move as outras.

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);

insert into public.contratos (
  id, numero_contrato, condominio_id, data_inicio_contrato, data_fim_contrato,
  data_inicio_manutencao, quantidade_visitas, visitas_anteriores, prestador_padrao_id, status
) values (
  '00000000-0000-4000-8000-0000000000b1',
  'TESTE-SALDO-36',
  '00000000-0000-4000-8000-000000000010',
  date '2024-12-01',
  date '2027-11-01',
  date '2024-12-01',
  36,
  23,
  '00000000-0000-4000-8000-000000000030',
  'ativo'
);

insert into public.equipamentos_contrato (
  id, contrato_id, equipamento_matriz_id, nome_identificacao, data_entrada
) values (
  '00000000-0000-4000-8000-0000000000b8',
  '00000000-0000-4000-8000-0000000000b1',
  '00000000-0000-4000-8000-000000000040',
  'Bike',
  date '2024-12-01'
);

select public._teste_recusa(
  $$select public.gerar_programacao_contrato(
    '00000000-0000-4000-8000-0000000000b1',
    10,
    array[]::date[],
    true
  )$$,
  'As visitas anteriores deste contrato já foram informadas'
);

select public._exige(
  (select count(*) = 0 from public.manutencoes where contrato_id = '00000000-0000-4000-8000-0000000000b1'),
  'quantidade divergente nao cria visita'
);

select public._exige(
  public.gerar_programacao_contrato(
    '00000000-0000-4000-8000-0000000000b1',
    23,
    array[]::date[],
    true
  ) = 13,
  'contrato em andamento gera as 13 visitas que faltam'
);

select public._exige(
  (
    select visitas_anteriores = 23
      and quantidade_visitas = 36
    from public.contratos
    where id = '00000000-0000-4000-8000-0000000000b1'
  ),
  'a quantidade anterior permanece gravada'
);

select public._exige(
  (
    select count(*) = 13
      and bool_and(registro_anterior = false)
      and bool_and(numero_visita between 24 and 36)
      and bool_and(status = 'programada')
    from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-0000000000b1'
      and tipo = 'preventiva'
  ),
  'as 23 anteriores nao viram ficha'
);

select public._exige(
  (
    select visitas_anteriores + (
      select count(*)
      from public.manutencoes
      where contrato_id = contratos.id
        and tipo = 'preventiva'
        and registro_anterior = false
    ) = quantidade_visitas
    from public.contratos
    where id = '00000000-0000-4000-8000-0000000000b1'
  ),
  'saldo inicial fecha 23 anteriores e 13 na agenda'
);

select public._teste_recusa(
  $$select public.registrar_visitas_anteriores(
    '00000000-0000-4000-8000-0000000000b1',
    25,
    array[]::date[],
    true
  )$$,
  'A quantidade de visitas anteriores passa do total do contrato'
);

select public._teste_recusa(
  $$select public.registrar_visitas_anteriores(
    '00000000-0000-4000-8000-0000000000b1',
    13,
    array[]::date[],
    true
  )$$,
  'A próxima visita precisa permanecer na programação'
);

select public._exige(
  public.registrar_visitas_anteriores(
    '00000000-0000-4000-8000-0000000000b1',
    2,
    array[]::date[],
    true
  ) = 25,
  'a retirada soma 2 ao total ja gravado e fica em 25'
);

select public._exige(
  (
    select visitas_anteriores = 25
      and quantidade_visitas = 36
    from public.contratos
    where id = '00000000-0000-4000-8000-0000000000b1'
  ),
  'nao duplica as 23 que ja estavam fora da agenda'
);

select public._exige(
  (
    select count(*) = 0
    from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-0000000000b1'
      and numero_visita in (24, 25)
  ),
  'saem so as duas visitas intactas seguintes'
);

select public._exige(
  (
    select numero_visita = 26
      and data_programada_original = public.data_visita_mensal(date '2024-12-01', 25)
      and data_programada_atual = public.data_visita_mensal(date '2024-12-01', 25)
    from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-0000000000b1'
      and numero_visita = 26
  ),
  'a proxima conserva numero e data mensal'
);

select public._exige(
  public.registrar_visitas_anteriores(
    '00000000-0000-4000-8000-0000000000b1',
    1,
    array[]::date[],
    true
  ) = 26,
  'nova retirada soma 1 e fica em 26, nao em 3 nem em 48'
);

select public._exige(
  (
    select count(*) = 10
    from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-0000000000b1'
      and tipo = 'preventiva'
  ),
  'restam 10 preventivas na agenda'
);

select set_config('app.finalizando', 'on', false);
update public.manutencoes
  set status = 'realizada',
      data_realizada = data_programada_atual
  where contrato_id = '00000000-0000-4000-8000-0000000000b1'
    and numero_visita = 27;
select set_config('app.finalizando', 'off', false);

select public._teste_recusa(
  $$select public.registrar_visitas_anteriores(
    '00000000-0000-4000-8000-0000000000b1',
    1,
    array[]::date[],
    true
  )$$,
  'Não é possível alterar visita já iniciada'
);

select public._exige(
  (
    select visitas_anteriores = 26
      and (
        select count(*)
        from public.manutencoes
        where contrato_id = '00000000-0000-4000-8000-0000000000b1'
          and tipo = 'preventiva'
          and status = 'realizada'
          and numero_visita = 27
      ) = 1
    from public.contratos
    where id = '00000000-0000-4000-8000-0000000000b1'
  ),
  'visita realizada pelo sistema continua no saldo e nao vira anterior de novo'
);

select public.reagendar_visita(
  (select id from public.manutencoes where contrato_id = '00000000-0000-4000-8000-0000000000b1' and numero_visita = 29),
  date '2027-06-20'
);

select public._exige(
  (
    select visitas_anteriores = 26
      and quantidade_visitas = 36
      and (
        select numero_visita = 29
          and data_programada_atual = date '2027-06-20'
          and data_programada_original = public.data_visita_mensal(date '2024-12-01', 28)
        from public.manutencoes
        where contrato_id = '00000000-0000-4000-8000-0000000000b1'
          and numero_visita = 29
      )
      and (
        select data_programada_atual = public.data_visita_mensal(date '2024-12-01', 29)
        from public.manutencoes
        where contrato_id = '00000000-0000-4000-8000-0000000000b1'
          and numero_visita = 30
      )
    from public.contratos
    where id = '00000000-0000-4000-8000-0000000000b1'
  ),
  'reagendar uma visita nao altera as outras nem o saldo'
);

insert into public.manutencoes (
  condominio_id, data_programada_original, data_programada_atual, prestador_id, tipo, origem, status
) values (
  '00000000-0000-4000-8000-000000000010',
  date '2031-08-17',
  date '2031-08-17',
  '00000000-0000-4000-8000-000000000030',
  'avulsa',
  'manual',
  'programada'
);

insert into public.manutencoes (
  condominio_id, contrato_id, data_programada_original, data_programada_atual, prestador_id, tipo, origem, status
) values (
  '00000000-0000-4000-8000-000000000010',
  '00000000-0000-4000-8000-0000000000b1',
  date '2027-01-06',
  date '2027-01-06',
  '00000000-0000-4000-8000-000000000030',
  'corretiva',
  'manual',
  'programada'
);

do $$
declare
  item uuid;
  ocorrencia uuid;
begin
  select i.id into item
  from public.itens_manutencao i
  join public.manutencoes m on m.id = i.manutencao_id
  where m.contrato_id = '00000000-0000-4000-8000-0000000000b1'
    and m.numero_visita = 28;

  update public.itens_manutencao
    set resultado = 'ocorrencia'
    where id = item;

  insert into public.ocorrencias (
    item_manutencao_id, resolvida_no_local, descricao_original, foto_url, status_ocorrencia
  ) values (
    item, false, 'Rolamento com ruído', 'fotos/rolamento.jpg', 'aberta'
  )
  returning id into ocorrencia;

  insert into public.manutencoes (
    condominio_id, contrato_id, data_programada_original, data_programada_atual,
    prestador_id, tipo, origem, status, ocorrencia_origem_id
  ) values (
    '00000000-0000-4000-8000-000000000010',
    '00000000-0000-4000-8000-0000000000b1',
    date '2027-01-20',
    date '2027-01-20',
    '00000000-0000-4000-8000-000000000030',
    'corretiva_complementar',
    'manual',
    'programada',
    ocorrencia
  );
end $$;

select public._exige(
  (
    select visitas_anteriores = 26
      and quantidade_visitas = 36
      and (
        select count(*)
        from public.manutencoes
        where contrato_id = '00000000-0000-4000-8000-0000000000b1'
          and tipo = 'preventiva'
          and registro_anterior = false
      ) = 10
      and (
        select count(*)
        from public.manutencoes
        where condominio_id = '00000000-0000-4000-8000-000000000010'
          and tipo = 'avulsa'
          and data_programada_atual = date '2031-08-17'
      ) = 1
      and (
        select count(*)
        from public.manutencoes
        where contrato_id = '00000000-0000-4000-8000-0000000000b1'
          and tipo in ('corretiva', 'corretiva_complementar')
      ) = 2
    from public.contratos
    where id = '00000000-0000-4000-8000-0000000000b1'
  ),
  'avulsa, corretiva e retorno nao consomem o saldo'
);

select public._teste_recusa(
  $$update public.contratos
    set visitas_anteriores = 30
    where id = '00000000-0000-4000-8000-0000000000b1'$$,
  'As visitas anteriores permanecem'
);

insert into public.contratos (
  id, numero_contrato, condominio_id, data_inicio_contrato, data_fim_contrato,
  data_inicio_manutencao, quantidade_visitas, prestador_padrao_id, status
) values (
  '00000000-0000-4000-8000-0000000000b2',
  'TESTE-SALDO-NOVO',
  '00000000-0000-4000-8000-000000000010',
  date '2026-01-15',
  date '2026-03-15',
  date '2026-01-15',
  3,
  '00000000-0000-4000-8000-000000000030',
  'ativo'
);

insert into public.equipamentos_contrato (
  id, contrato_id, equipamento_matriz_id, nome_identificacao, data_entrada
) values (
  '00000000-0000-4000-8000-0000000000b9',
  '00000000-0000-4000-8000-0000000000b2',
  '00000000-0000-4000-8000-000000000040',
  'Esteira',
  date '2026-01-15'
);

select public._exige(
  (select visitas_anteriores = 0 from public.contratos where id = '00000000-0000-4000-8000-0000000000b2'),
  'contrato novo comeca com zero visitas anteriores'
);

select public._exige(
  public.gerar_programacao_contrato(
    '00000000-0000-4000-8000-0000000000b2',
    0,
    array[]::date[],
    false
  ) = 3,
  'contrato novo gera as tres visitas'
);

select public._exige(
  (
    select count(*) = 3
      and bool_or(numero_visita = 1 and data_programada_original = date '2026-01-15')
      and bool_or(numero_visita = 3 and data_programada_original = date '2026-03-15')
      and bool_and(registro_anterior = false)
    from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-0000000000b2'
      and tipo = 'preventiva'
  ),
  'contrato novo comeca na visita 1'
);

select public._exige(
  public.registrar_visitas_anteriores(
    '00000000-0000-4000-8000-0000000000b2',
    1,
    array[]::date[],
    true
  ) = 1,
  'retirada em contrato novo grava 1 anterior'
);

select public._exige(
  (
    select visitas_anteriores = 1
      and (
        select count(*) = 2
          and bool_and(numero_visita > 1)
        from public.manutencoes
        where contrato_id = '00000000-0000-4000-8000-0000000000b2'
          and tipo = 'preventiva'
      )
    from public.contratos
    where id = '00000000-0000-4000-8000-0000000000b2'
  ),
  'contrato novo fica com 1 anterior e 2 visitas na agenda'
);
