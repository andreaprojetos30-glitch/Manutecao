-- Numeração sem ficha para visitas anteriores.
-- A migration nova não reescreve contratos já gravados.

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);

select public._exige(
  (
    select count(*) = 7
      and bool_and(registro_anterior)
      and bool_and(status = 'realizada')
      and bool_and(data_realizada is not null)
    from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-0000000000e1'
      and numero_visita between 1 and 7
  ),
  'registros anteriores ja gravados permanecem'
);

select public._exige(
  (
    select status = 'programada'
      and registro_anterior = false
      and numero_visita = 8
      and data_programada_original = date '2026-08-01'
    from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-0000000000e1'
      and numero_visita = 8
  ),
  'a visita seguinte de um registro antigo permanece'
);

select public._exige(
  (
    select count(*) = 2
      and bool_and(registro_anterior)
      and bool_and(data_realizada is not null)
    from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-0000000000e2'
      and numero_visita in (1, 2)
  ),
  'programacao ja marcada como anterior nao e apagada pela migration'
);

select public._exige(
  (
    select status = 'em_execucao'
      and registro_anterior = false
    from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-0000000000e3'
      and numero_visita = 1
  ),
  'visita executada anterior a migration permanece'
);

insert into public.contratos (
  id, numero_contrato, condominio_id, data_inicio_contrato, data_fim_contrato,
  data_inicio_manutencao, quantidade_visitas, prestador_padrao_id, status
) values (
  '00000000-0000-4000-8000-0000000000f1',
  'TESTE-NUM-NOVO',
  '00000000-0000-4000-8000-000000000010',
  date '2026-02-01',
  date '2026-03-01',
  date '2026-02-01',
  2,
  '00000000-0000-4000-8000-000000000030',
  'ativo'
);

insert into public.equipamentos_contrato (
  id, contrato_id, equipamento_matriz_id, nome_identificacao, data_entrada
) values (
  '00000000-0000-4000-8000-0000000000f8',
  '00000000-0000-4000-8000-0000000000f1',
  '00000000-0000-4000-8000-000000000040',
  'Esteira',
  date '2026-02-01'
);

select public._exige(
  public.gerar_programacao_contrato('00000000-0000-4000-8000-0000000000f1', 0, array[]::date[], false) = 2,
  'contrato novo gera as duas visitas'
);

select public._exige(
  (
    select count(*) = 2
      and bool_and(registro_anterior = false)
      and bool_and(data_realizada is null)
      and bool_and(status = 'programada')
      and bool_or(numero_visita = 1 and data_programada_original = date '2026-02-01')
      and bool_or(numero_visita = 2 and data_programada_original = date '2026-03-01')
    from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-0000000000f1'
  ),
  'contrato novo comeca na visita 1 sem data ficticia'
);

insert into public.contratos (
  id, numero_contrato, condominio_id, data_inicio_contrato, data_fim_contrato,
  data_inicio_manutencao, quantidade_visitas, prestador_padrao_id, status
) values (
  '00000000-0000-4000-8000-0000000000f2',
  'TESTE-NUM-36',
  '00000000-0000-4000-8000-000000000010',
  date '2024-12-01',
  date '2027-11-01',
  date '2024-12-01',
  36,
  '00000000-0000-4000-8000-000000000030',
  'ativo'
);

insert into public.equipamentos_contrato (
  id, contrato_id, equipamento_matriz_id, nome_identificacao, data_entrada
) values (
  '00000000-0000-4000-8000-0000000000f9',
  '00000000-0000-4000-8000-0000000000f2',
  '00000000-0000-4000-8000-000000000040',
  'Bike',
  date '2024-12-01'
);

select public._teste_recusa(
  $$select public.gerar_programacao_contrato(
    '00000000-0000-4000-8000-0000000000f2',
    23,
    array[date '2020-01-01'],
    false
  )$$,
  'Confirme as visitas anteriores'
);

select public._exige(
  (select count(*) = 0 from public.manutencoes where contrato_id = '00000000-0000-4000-8000-0000000000f2'),
  'recusa sem confirmacao nao cria visita'
);

select public._exige(
  public.gerar_programacao_contrato(
    '00000000-0000-4000-8000-0000000000f2',
    23,
    array[date '2020-01-01'],
    true
  ) = 13,
  'gera so as treze visitas restantes'
);

select public._exige(
  (
    select count(*) = 0
    from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-0000000000f2'
      and numero_visita <= 23
  ),
  'visitas anteriores nao viram ficha'
);

select public._exige(
  (
    select numero_visita = 24
      and status = 'programada'
      and registro_anterior = false
      and data_realizada is null
      and pdf_url is null
      and data_programada_original = date '2026-11-01'
      and data_programada_atual = date '2026-11-01'
    from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-0000000000f2'
      and numero_visita = 24
  ),
  'a proxima visita e a 24 na data mensal'
);

select public._exige(
  (
    select numero_visita = 36
      and data_programada_original = public.data_visita_mensal(date '2024-12-01', 35)
      and data_realizada is null
    from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-0000000000f2'
      and numero_visita = 36
  ),
  'a ultima visita conserva a posicao 36'
);

select public._exige(
  (
    select data_inicio_manutencao = date '2024-12-01'
      and quantidade_visitas = 36
      and data_fim_contrato = public.fim_contrato(date '2024-12-01', 36)
    from public.contratos
    where id = '00000000-0000-4000-8000-0000000000f2'
  ),
  'inicio e fim do contrato permanecem'
);

select public._exige(
  (
    select count(*) = 13
      and bool_and(m.numero_visita >= 24)
      and bool_and(i.resultado = 'pendente')
    from public.itens_manutencao i
    join public.manutencoes m on m.id = i.manutencao_id
    where m.contrato_id = '00000000-0000-4000-8000-0000000000f2'
  ),
  'checklist so existe a partir da visita 24'
);

insert into public.contratos (
  id, numero_contrato, condominio_id, data_inicio_contrato, data_fim_contrato,
  data_inicio_manutencao, quantidade_visitas, prestador_padrao_id, status
) values (
  '00000000-0000-4000-8000-0000000000f3',
  'TESTE-NUM-EXISTE',
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
  '00000000-0000-4000-8000-0000000000fa',
  '00000000-0000-4000-8000-0000000000f3',
  '00000000-0000-4000-8000-000000000040',
  'Elíptico',
  date '2026-03-01'
);

select public.gerar_programacao_contrato('00000000-0000-4000-8000-0000000000f3');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
select public._teste_recusa(
  $$select public.registrar_visitas_anteriores(
    '00000000-0000-4000-8000-0000000000f3',
    2,
    array[]::date[],
    true
  )$$,
  'Somente o ADM registra visita anterior'
);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);

select public._teste_recusa(
  $$select public.registrar_visitas_anteriores(
    '00000000-0000-4000-8000-0000000000f3',
    2,
    array[]::date[],
    false
  )$$,
  'Confirme as visitas anteriores'
);

select public._exige(
  (select count(*) = 4 from public.manutencoes where contrato_id = '00000000-0000-4000-8000-0000000000f3'),
  'sem confirmacao a programacao existente permanece'
);

select public._exige(
  public.registrar_visitas_anteriores(
    '00000000-0000-4000-8000-0000000000f3',
    2,
    array[]::date[],
    true
  ) = 2,
  'retira as duas primeiras ainda intactas'
);

select public._exige(
  (
    select count(*) = 0
    from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-0000000000f3'
      and numero_visita in (1, 2)
  ),
  'as visitas retiradas nao deixam ficha'
);

select public._exige(
  (
    select numero_visita = 3
      and status = 'programada'
      and registro_anterior = false
      and data_realizada is null
      and data_programada_original = date '2026-05-01'
      and data_programada_atual = date '2026-05-01'
    from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-0000000000f3'
      and numero_visita = 3
  ),
  'a visita 3 conserva numero e data'
);

select public._exige(
  (
    select count(*) = 1
      and bool_and(i.resultado = 'pendente')
    from public.itens_manutencao i
    join public.manutencoes m on m.id = i.manutencao_id
    where m.contrato_id = '00000000-0000-4000-8000-0000000000f3'
      and m.numero_visita = 4
  ),
  'a visita seguinte conserva o checklist'
);

select public._teste_recusa(
  $$delete from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-0000000000f3'
      and numero_visita = 4$$,
  'Manutenção preventiva do contrato não pode ser excluída'
);

select public._exige(
  (select count(*) = 1 from public.manutencoes where contrato_id = '00000000-0000-4000-8000-0000000000f3' and numero_visita = 4),
  'exclusao direta de preventiva continua recusada'
);

insert into public.contratos (
  id, numero_contrato, condominio_id, data_inicio_contrato, data_fim_contrato,
  data_inicio_manutencao, quantidade_visitas, prestador_padrao_id, status
) values (
  '00000000-0000-4000-8000-0000000000f4',
  'TESTE-NUM-EXEC',
  '00000000-0000-4000-8000-000000000010',
  date '2026-04-01',
  date '2026-06-01',
  date '2026-04-01',
  3,
  '00000000-0000-4000-8000-000000000030',
  'ativo'
);

insert into public.equipamentos_contrato (
  id, contrato_id, equipamento_matriz_id, nome_identificacao, data_entrada
) values (
  '00000000-0000-4000-8000-0000000000fb',
  '00000000-0000-4000-8000-0000000000f4',
  '00000000-0000-4000-8000-000000000040',
  'Esteira',
  date '2026-04-01'
);

select public.gerar_programacao_contrato('00000000-0000-4000-8000-0000000000f4');

update public.itens_manutencao
  set resultado = 'ok'
  where manutencao_id = (
    select id from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-0000000000f4'
      and numero_visita = 2
  );

select public._teste_recusa(
  $$select public.registrar_visitas_anteriores(
    '00000000-0000-4000-8000-0000000000f4',
    2,
    array[]::date[],
    true
  )$$,
  'Não é possível alterar visita já iniciada'
);

select public._exige(
  (
    select count(*) = 3
      and bool_or(numero_visita = 1 and status = 'programada')
      and bool_or(numero_visita = 2 and status = 'em_execucao')
    from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-0000000000f4'
  ),
  'falha no meio nao apaga a visita intacta anterior'
);

select public._exige(
  (
    select count(*) = 1 and bool_and(resultado = 'ok')
    from public.itens_manutencao i
    join public.manutencoes m on m.id = i.manutencao_id
    where m.contrato_id = '00000000-0000-4000-8000-0000000000f4'
      and m.numero_visita = 2
  ),
  'checklist executado permanece'
);

insert into public.contratos (
  id, numero_contrato, condominio_id, data_inicio_contrato, data_fim_contrato,
  data_inicio_manutencao, quantidade_visitas, prestador_padrao_id, status
) values (
  '00000000-0000-4000-8000-0000000000f5',
  'TESTE-NUM-OCORR',
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
  '00000000-0000-4000-8000-0000000000fc',
  '00000000-0000-4000-8000-0000000000f5',
  '00000000-0000-4000-8000-000000000040',
  'Bike',
  date '2026-05-01'
);

select public.gerar_programacao_contrato('00000000-0000-4000-8000-0000000000f5');

do $$
declare
  item uuid;
begin
  select i.id into item
  from public.itens_manutencao i
  join public.manutencoes m on m.id = i.manutencao_id
  where m.contrato_id = '00000000-0000-4000-8000-0000000000f5'
    and m.numero_visita = 1;

  update public.itens_manutencao
    set resultado = 'ocorrencia'
    where id = item;

  insert into public.ocorrencias (
    item_manutencao_id, resolvida_no_local, descricao_original, foto_url, status_ocorrencia
  ) values (
    item, false, 'Correia solta', 'fotos/correia.jpg', 'aberta'
  );
end $$;

select public._teste_recusa(
  $$select public.registrar_visitas_anteriores(
    '00000000-0000-4000-8000-0000000000f5',
    1,
    array[]::date[],
    true
  )$$,
  'Não é possível alterar visita já iniciada'
);

select public._exige(
  (
    select count(*) = 1
      and bool_and(o.descricao_original = 'Correia solta')
      and bool_and(o.foto_url = 'fotos/correia.jpg')
    from public.ocorrencias o
    join public.itens_manutencao i on i.id = o.item_manutencao_id
    join public.manutencoes m on m.id = i.manutencao_id
    where m.contrato_id = '00000000-0000-4000-8000-0000000000f5'
      and m.numero_visita = 1
  ),
  'ocorrencia permanece'
);

insert into public.contratos (
  id, numero_contrato, condominio_id, data_inicio_contrato, data_fim_contrato,
  data_inicio_manutencao, quantidade_visitas, prestador_padrao_id, status
) values (
  '00000000-0000-4000-8000-0000000000f6',
  'TESTE-NUM-PDF',
  '00000000-0000-4000-8000-000000000010',
  date '2026-06-01',
  date '2026-07-01',
  date '2026-06-01',
  2,
  '00000000-0000-4000-8000-000000000030',
  'ativo'
);

insert into public.equipamentos_contrato (
  id, contrato_id, equipamento_matriz_id, nome_identificacao, data_entrada
) values (
  '00000000-0000-4000-8000-0000000000fd',
  '00000000-0000-4000-8000-0000000000f6',
  '00000000-0000-4000-8000-000000000040',
  'Elíptico',
  date '2026-06-01'
);

select public.gerar_programacao_contrato('00000000-0000-4000-8000-0000000000f6');

update public.manutencoes
  set pdf_url = 'pdfs/comprovante.pdf'
  where contrato_id = '00000000-0000-4000-8000-0000000000f6'
    and numero_visita = 1;

select public._teste_recusa(
  $$select public.registrar_visitas_anteriores(
    '00000000-0000-4000-8000-0000000000f6',
    1,
    array[]::date[],
    true
  )$$,
  'Não é possível alterar visita já iniciada'
);

select public._exige(
  (
    select pdf_url = 'pdfs/comprovante.pdf'
      and numero_visita = 1
    from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-0000000000f6'
      and numero_visita = 1
  ),
  'comprovante permanece'
);

insert into public.contratos (
  id, numero_contrato, condominio_id, data_inicio_contrato, data_fim_contrato,
  data_inicio_manutencao, quantidade_visitas, prestador_padrao_id, status
) values (
  '00000000-0000-4000-8000-0000000000f7',
  'TESTE-NUM-DATA',
  '00000000-0000-4000-8000-000000000010',
  date '2026-07-01',
  date '2026-08-01',
  date '2026-07-01',
  2,
  '00000000-0000-4000-8000-000000000030',
  'ativo'
);

insert into public.equipamentos_contrato (
  id, contrato_id, equipamento_matriz_id, nome_identificacao, data_entrada
) values (
  '00000000-0000-4000-8000-0000000000fe',
  '00000000-0000-4000-8000-0000000000f7',
  '00000000-0000-4000-8000-000000000040',
  'Esteira',
  date '2026-07-01'
);

select public.gerar_programacao_contrato('00000000-0000-4000-8000-0000000000f7');

select public.reagendar_visita(
  (select id from public.manutencoes where contrato_id = '00000000-0000-4000-8000-0000000000f7' and numero_visita = 1),
  date '2026-07-15'
);

select public._teste_recusa(
  $$select public.registrar_visitas_anteriores(
    '00000000-0000-4000-8000-0000000000f7',
    1,
    array[]::date[],
    true
  )$$,
  'Não é possível alterar visita já iniciada'
);

select public._exige(
  (
    select data_programada_atual = date '2026-07-15'
      and data_programada_original = date '2026-07-01'
      and numero_visita = 1
    from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-0000000000f7'
      and numero_visita = 1
  ),
  'visita reagendada permanece com a data informada'
);
