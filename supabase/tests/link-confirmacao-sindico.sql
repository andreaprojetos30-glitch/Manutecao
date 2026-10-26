-- Link do síndico: só token emitido antes, hash no banco, revogação imediata.
-- Os dados deste arquivo são desfeitos no final.

begin;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
select set_config('teste.visita_0060', (select status from public.manutencoes where id = '00000000-0000-4000-8000-000000000060'), true);
select set_config('teste.pdfs', (select count(*)::text from storage.objects where bucket_id = 'pdfs'), true);

select public._exige(
  to_regprocedure('public.registrar_confirmacao_sindico(uuid, text)') is null
  and to_regprocedure('public.registrar_confirmacao_sindico(text)') is not null
  and to_regclass('public.links_confirmacao_sindico') is not null,
  'a confirmacao antiga, que aceitava qualquer token, foi retirada'
);

select public._exige(
  position('ocorrencias' in lower(pg_get_functiondef('public.ler_link_confirmacao_sindico(text)'::regprocedure))) = 0
  and position('descricao_original' in lower(pg_get_functiondef('public.ler_link_confirmacao_sindico(text)'::regprocedure))) = 0
  and position('foto_url' in lower(pg_get_functiondef('public.ler_link_confirmacao_sindico(text)'::regprocedure))) = 0
  and position('providencia' in lower(pg_get_functiondef('public.ler_link_confirmacao_sindico(text)'::regprocedure))) = 0
  and position('solucao' in lower(pg_get_functiondef('public.ler_link_confirmacao_sindico(text)'::regprocedure))) = 0
  and position('ocorrencias' in lower(pg_get_functiondef('public.resumo_link_confirmacao_sindico(uuid)'::regprocedure))) = 0
  and position('update public.manutencoes' in lower(pg_get_functiondef('public.registrar_confirmacao_sindico(text)'::regprocedure))) = 0
  and position('update public.manutencoes' in lower(pg_get_functiondef('public.emitir_link_confirmacao_sindico(uuid, text, uuid)'::regprocedure))) = 0
  and position('whatsapp' in lower(pg_get_functiondef('public.emitir_link_confirmacao_sindico(uuid, text, uuid)'::regprocedure))) = 0,
  'o link nao le ocorrencia, nao altera a visita e nao envia whatsapp'
);

select public._exige(
  not has_table_privilege('anon', 'public.links_confirmacao_sindico', 'select')
  and not has_table_privilege('anon', 'public.links_confirmacao_sindico', 'insert')
  and not has_table_privilege('authenticated', 'public.links_confirmacao_sindico', 'select')
  and not has_function_privilege('anon', 'public.registrar_confirmacao_sindico(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.registrar_confirmacao_sindico(text)', 'execute')
  and not has_function_privilege('anon', 'public.emitir_link_confirmacao_sindico(uuid, text, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.emitir_link_confirmacao_sindico(uuid, text, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.ler_link_confirmacao_sindico(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.ler_link_confirmacao_sindico(text)', 'execute')
  and not has_function_privilege('anon', 'public.hash_token_confirmacao(text)', 'execute'),
  'anon e authenticated nao emitem nem leem o link'
);

create or replace function public._liberar_teste(p_visita uuid, p_item uuid)
returns void
language plpgsql
as $$
begin
  perform public.registrar_ok(p_item);
  if public.finalizar_manutencao(p_visita) is null then
    raise exception 'finalizacao de teste falhou';
  end if;
  perform public.registrar_comprovante(
    p_visita,
    lower(p_visita::text) || '/comprovante.pdf',
    false
  );
end;
$$;

insert into public.manutencoes (
  id, condominio_id, contrato_id, numero_visita,
  data_programada_original, data_programada_atual, prestador_id, tipo, origem
) values
  ('a1111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000020', 7, date '2026-07-31', date '2026-07-31', '00000000-0000-4000-8000-000000000030', 'preventiva', 'automatica'),
  ('a2222222-2222-4222-8222-222222222222', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000020', 8, date '2026-08-31', date '2026-08-31', '00000000-0000-4000-8000-000000000030', 'preventiva', 'automatica'),
  ('a5555555-5555-4555-8555-555555555555', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000020', 9, date '2026-09-30', date '2026-09-30', '00000000-0000-4000-8000-000000000030', 'preventiva', 'automatica'),
  ('a9999999-9999-4999-8999-999999999999', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000020', 10, date '2026-10-31', date '2026-10-31', '00000000-0000-4000-8000-000000000030', 'preventiva', 'automatica');

insert into public.manutencoes (
  id, condominio_id, data_programada_original, data_programada_atual, prestador_id, tipo, origem
) values
  ('a3333333-3333-4333-8333-333333333333', '00000000-0000-4000-8000-000000000010', date '2026-10-25', date '2026-10-25', '00000000-0000-4000-8000-000000000030', 'avulsa', 'manual'),
  ('a4444444-4444-4444-8444-444444444444', '00000000-0000-4000-8000-000000000010', date '2026-10-26', date '2026-10-26', '00000000-0000-4000-8000-000000000030', 'avulsa', 'manual'),
  ('a8888888-8888-4888-8888-888888888888', '00000000-0000-4000-8000-000000000010', date '2026-10-27', date '2026-10-27', '00000000-0000-4000-8000-000000000030', 'avulsa', 'manual');

insert into public.condominios (id, nome, endereco, bairro, cidade, estado) values
  ('b1111111-1111-4111-8111-111111111111', 'Condomínio Sem Síndico Link', 'Rua Sem', 'Centro', 'Campinas', 'SP');

insert into public.manutencoes (
  id, condominio_id, data_programada_original, data_programada_atual, prestador_id, tipo, origem
) values
  ('a6666666-6666-4666-8666-666666666666', 'b1111111-1111-4111-8111-111111111111', date '2026-10-28', date '2026-10-28', '00000000-0000-4000-8000-000000000030', 'avulsa', 'manual'),
  ('a7777777-7777-4777-8777-777777777777', '00000000-0000-4000-8000-000000000011', date '2026-10-29', date '2026-10-29', '00000000-0000-4000-8000-000000000030', 'avulsa', 'manual');

insert into public.itens_manutencao (id, manutencao_id, equipamento_contrato_id, nome_identificacao) values
  ('a1111111-1111-4111-8111-111111111171', 'a1111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000050', 'Esteira 01'),
  ('a2222222-2222-4222-8222-222222222271', 'a2222222-2222-4222-8222-222222222222', '00000000-0000-4000-8000-000000000050', 'Esteira 01'),
  ('a9999999-9999-4999-8999-999999999971', 'a9999999-9999-4999-8999-999999999999', '00000000-0000-4000-8000-000000000050', 'Esteira 01');

insert into public.itens_manutencao (id, manutencao_id, equipamento_matriz_id, nome_identificacao) values
  ('a3333333-3333-4333-8333-333333333371', 'a3333333-3333-4333-8333-333333333333', '00000000-0000-4000-8000-000000000040', 'Esteira portátil'),
  ('a6666666-6666-4666-8666-666666666671', 'a6666666-6666-4666-8666-666666666666', '00000000-0000-4000-8000-000000000040', 'Esteira portátil'),
  ('a7777777-7777-4777-8777-777777777771', 'a7777777-7777-4777-8777-777777777777', '00000000-0000-4000-8000-000000000040', 'Esteira do outro'),
  ('a8888888-8888-4888-8888-888888888871', 'a8888888-8888-4888-8888-888888888888', '00000000-0000-4000-8000-000000000040', 'Esteira avulsa');

select public._liberar_teste('a1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111171');
select public._liberar_teste('a2222222-2222-4222-8222-222222222222', 'a2222222-2222-4222-8222-222222222271');
select public._liberar_teste('a6666666-6666-4666-8666-666666666666', 'a6666666-6666-4666-8666-666666666671');
select public._liberar_teste('a7777777-7777-4777-8777-777777777777', 'a7777777-7777-4777-8777-777777777771');
select public._liberar_teste('a8888888-8888-4888-8888-888888888888', 'a8888888-8888-4888-8888-888888888871');
select public.registrar_ok('a3333333-3333-4333-8333-333333333371');
select public.finalizar_manutencao('a3333333-3333-4333-8333-333333333333');

select public.registrar_ocorrencia(
  'a9999999-9999-4999-8999-999999999971',
  false,
  'SEGREDO-OCORRENCIA-INTERNA',
  'SEGREDO-FOTO/interna.jpg'
);
select public._exige(
  public.finalizar_manutencao('a9999999-9999-4999-8999-999999999999') = 'aguardando_administracao',
  'pendencia encaminhada aguarda o ADM'
);
select public.registrar_comprovante(
  'a9999999-9999-4999-8999-999999999999',
  'a9999999-9999-4999-8999-999999999999/comprovante.pdf',
  true,
  'A visita foi realizada. Há uma questão em acompanhamento.'
);

select set_config('app.cancelando', 'on', true);
update public.manutencoes
  set status = 'cancelada'
  where id = 'a4444444-4444-4444-8444-444444444444';
select set_config('app.cancelando', 'off', true);

select set_config('app.registro_anterior', 'on', true);
update public.manutencoes
  set registro_anterior = true,
      status = 'realizada',
      data_realizada = data_programada_atual
  where id = 'a5555555-5555-4555-8555-555555555555';
select set_config('app.registro_anterior', 'off', true);

select public._exige(length('confirmaVisitaUmabcdefghijklmnopqrstuvwxyzA') = 43, 'token valido tem 43');
select public._exige(length('substituiSegundoabcdefghijklmnopqrstuvwxyzA') = 43, 'token substituido tem 43');
select public._exige(length('revogaPrimeiroLkabcdefghijklmnopqrstuvwxyzA') = 43, 'token revogado tem 43');
select public._exige(length('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz') = 43, 'token novo tem 43');
select public._exige(length('NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN') = 43, 'token ausente tem 43');

select set_config('request.jwt.claim.sub', '', true);

select public._teste_recusa(
  $$select public.emitir_link_confirmacao_sindico(
    'a1111111-1111-4111-8111-111111111111',
    'confirmaVisitaUmabcdefghijklmnopqrstuvwxyzA',
    '00000000-0000-4000-8000-000000000002'
  )$$,
  'Somente o ADM emite o link'
);

select public._teste_recusa(
  $$select public.emitir_link_confirmacao_sindico(
    'a3333333-3333-4333-8333-333333333333',
    'confirmaVisitaUmabcdefghijklmnopqrstuvwxyzA',
    '00000000-0000-4000-8000-000000000001'
  )$$,
  'O comprovante ainda não foi liberado'
);

select public._teste_recusa(
  $$select public.emitir_link_confirmacao_sindico(
    'a4444444-4444-4444-8444-444444444444',
    'confirmaVisitaUmabcdefghijklmnopqrstuvwxyzA',
    '00000000-0000-4000-8000-000000000001'
  )$$,
  'Manutenção cancelada não recebe link'
);

select public._teste_recusa(
  $$select public.emitir_link_confirmacao_sindico(
    'a5555555-5555-4555-8555-555555555555',
    'confirmaVisitaUmabcdefghijklmnopqrstuvwxyzA',
    '00000000-0000-4000-8000-000000000001'
  )$$,
  'Registro anterior não recebe link'
);

select public._exige(
  public.emitir_link_confirmacao_sindico(
    'a1111111-1111-4111-8111-111111111111',
    'confirmaVisitaUmabcdefghijklmnopqrstuvwxyzA',
    '00000000-0000-4000-8000-000000000001'
  ) is not null,
  'ADM emite o link depois do comprovante'
);

select public._exige(
  (
    select token_hash = public.hash_token_confirmacao('confirmaVisitaUmabcdefghijklmnopqrstuvwxyzA')
      and position('confirmaVisitaUmabcdefghijklmnopqrstuvwxyzA' in token_hash) = 0
      and position('confirmaVisitaUmabcdefghijklmnopqrstuvwxyzA' in to_jsonb(l.*)::text) = 0
      and revogado_em is null
    from public.links_confirmacao_sindico l
    where manutencao_id = 'a1111111-1111-4111-8111-111111111111'
  ),
  'o banco guarda so o hash do token emitido'
);

select public._exige(
  public.ler_link_confirmacao_sindico('curto') is null
  and public.ler_link_confirmacao_sindico('NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN') is null,
  'token invalido ou nao emitido nao abre a pagina'
);

select public._teste_recusa(
  $$select public.registrar_confirmacao_sindico('curto')$$,
  'Informe o token do link'
);
select public._teste_recusa(
  $$select public.registrar_confirmacao_sindico('NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN')$$,
  'Este link não foi emitido'
);

select public._exige(
  (
    select (pagina->>'condominio') = 'Porta do Sol'
      and (pagina->>'tipo') = 'preventiva'
      and (pagina->>'numero_visita') = '7'
      and (pagina->>'quantidade_visitas') = '12'
      and (pagina->>'data_efetiva') is not null
      and (pagina->>'caminho_pdf') = 'a1111111-1111-4111-8111-111111111111/comprovante.pdf'
      and position('://' in pagina->>'caminho_pdf') = 0
      and (pagina->>'confirmado_em') is null
      and (pagina->>'manutencao_id') = 'a1111111-1111-4111-8111-111111111111'
      and position('a7777777-7777-4777-8777-777777777777' in pagina::text) = 0
      and position('Outro Predio' in pagina::text) = 0
      and position('SEGREDO' in pagina::text) = 0
    from public.ler_link_confirmacao_sindico('confirmaVisitaUmabcdefghijklmnopqrstuvwxyzA') pagina
  ),
  'token valido abre so a propria manutencao'
);

select public._exige(
  not exists (
    select 1
    from jsonb_object_keys(public.ler_link_confirmacao_sindico('confirmaVisitaUmabcdefghijklmnopqrstuvwxyzA')) chave
    where chave in ('token', 'token_hash', 'ocorrencias', 'descricao', 'foto', 'providencia', 'solucao')
  ),
  'a leitura nao devolve token nem ocorrencia'
);

select public._teste_recusa(
  $$insert into public.confirmacoes_sindico (manutencao_id, token_hash, sindico_id, sindico_nome)
    values (
      'a2222222-2222-4222-8222-222222222222',
      public.hash_token_confirmacao('NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN'),
      '00000000-0000-4000-8000-000000000001',
      'Pessoa falsa'
    )$$,
  'Este link não foi emitido'
);

select public._exige(
  public.registrar_confirmacao_sindico('confirmaVisitaUmabcdefghijklmnopqrstuvwxyzA') is not null,
  'token emitido confirma'
);

select set_config(
  'teste.confirmacao_id',
  (select id::text from public.confirmacoes_sindico where manutencao_id = 'a1111111-1111-4111-8111-111111111111'),
  true
);
select set_config(
  'teste.confirmado_em',
  (select confirmado_em::text from public.confirmacoes_sindico where manutencao_id = 'a1111111-1111-4111-8111-111111111111'),
  true
);

select public._teste_recusa(
  $$select public.registrar_confirmacao_sindico('confirmaVisitaUmabcdefghijklmnopqrstuvwxyzA')$$,
  'já tem confirmação'
);

select public._exige(
  (select count(*) = 1 from public.confirmacoes_sindico where manutencao_id = 'a1111111-1111-4111-8111-111111111111')
  and (
    select id::text = current_setting('teste.confirmacao_id')
      and confirmado_em::text = current_setting('teste.confirmado_em')
      and sindico_nome = (select nome from public.sindicos where condominio_id = '00000000-0000-4000-8000-000000000010' and ativo)
      and meio = 'link'
      and token_hash = public.hash_token_confirmacao('confirmaVisitaUmabcdefghijklmnopqrstuvwxyzA')
      and position('confirmaVisitaUmabcdefghijklmnopqrstuvwxyzA' in to_jsonb(c.*)::text) = 0
    from public.confirmacoes_sindico c
    where manutencao_id = 'a1111111-1111-4111-8111-111111111111'
  ),
  'segundo clique nao gera outro registro'
);

select public._exige(
  (
    select status = 'realizada'
      and pdf_url = 'a1111111-1111-4111-8111-111111111111/comprovante.pdf'
    from public.manutencoes
    where id = 'a1111111-1111-4111-8111-111111111111'
  )
  and (public.ler_link_confirmacao_sindico('confirmaVisitaUmabcdefghijklmnopqrstuvwxyzA')->>'confirmado_em') is not null,
  'depois da confirmacao a visita permanece e o link mostra o registro'
);

select public._teste_recusa(
  $$select public.emitir_link_confirmacao_sindico(
    'a1111111-1111-4111-8111-111111111111',
    'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz',
    '00000000-0000-4000-8000-000000000001'
  )$$,
  'já tem confirmação'
);
select public._teste_recusa(
  $$select public.revogar_link_confirmacao_sindico(
    'a1111111-1111-4111-8111-111111111111',
    '00000000-0000-4000-8000-000000000001'
  )$$,
  'A confirmação já foi registrada'
);

select public._teste_recusa(
  $$update public.confirmacoes_sindico
      set sindico_nome = 'Outra pessoa'
    where manutencao_id = 'a1111111-1111-4111-8111-111111111111'$$,
  'não pode ser alterada'
);

select public._exige(
  public.emitir_link_confirmacao_sindico(
    'a2222222-2222-4222-8222-222222222222',
    'revogaPrimeiroLkabcdefghijklmnopqrstuvwxyzA',
    '00000000-0000-4000-8000-000000000001'
  ) is not null,
  'emite o link que sera revogado'
);
select public.revogar_link_confirmacao_sindico(
  'a2222222-2222-4222-8222-222222222222',
  '00000000-0000-4000-8000-000000000001'
);
select public._exige(
  public.ler_link_confirmacao_sindico('revogaPrimeiroLkabcdefghijklmnopqrstuvwxyzA') is null,
  'link revogado deixa de abrir na hora'
);
select public._teste_recusa(
  $$select public.registrar_confirmacao_sindico('revogaPrimeiroLkabcdefghijklmnopqrstuvwxyzA')$$,
  'Este link foi revogado'
);

select public._exige(
  public.emitir_link_confirmacao_sindico(
    'a2222222-2222-4222-8222-222222222222',
    'substituiSegundoabcdefghijklmnopqrstuvwxyzA',
    '00000000-0000-4000-8000-000000000001'
  ) is not null,
  'gera outro link'
);
select public._exige(
  public.emitir_link_confirmacao_sindico(
    'a2222222-2222-4222-8222-222222222222',
    'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz',
    '00000000-0000-4000-8000-000000000001'
  ) is not null,
  'substituir invalida o anterior na hora'
);
select public._exige(
  public.ler_link_confirmacao_sindico('substituiSegundoabcdefghijklmnopqrstuvwxyzA') is null
  and public.ler_link_confirmacao_sindico('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz') is not null
  and (
    select count(*) = 1
    from public.links_confirmacao_sindico
    where manutencao_id = 'a2222222-2222-4222-8222-222222222222'
      and revogado_em is null
  ),
  'so o ultimo link permanece ativo'
);
select public._teste_recusa(
  $$select public.registrar_confirmacao_sindico('substituiSegundoabcdefghijklmnopqrstuvwxyzA')$$,
  'Este link foi revogado'
);
select public._exige(
  public.registrar_confirmacao_sindico('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz') is not null,
  'o link substituto confirma'
);

select public._exige(
  public.emitir_link_confirmacao_sindico(
    'a6666666-6666-4666-8666-666666666666',
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMnope',
    '00000000-0000-4000-8000-000000000001'
  ) is not null,
  'da para emitir sem sindico ativo'
);
select public._teste_recusa(
  $$select public.registrar_confirmacao_sindico('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMnope')$$,
  'Não há síndico ativo'
);
select public._exige(
  (select count(*) = 0 from public.confirmacoes_sindico where manutencao_id = 'a6666666-6666-4666-8666-666666666666'),
  'sem sindico nao grava confirmacao'
);

insert into public.sindicos (id, condominio_id, nome, whatsapp, ativo) values
  ('b2222222-2222-4222-8222-222222222222', 'b1111111-1111-4111-8111-111111111111', 'Helena Nova', '19900000099', true);

select public._exige(
  public.registrar_confirmacao_sindico('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMnope') is not null,
  'confirmacao usa o sindico que estiver ativo'
);
select public._exige(
  (
    select sindico_id = 'b2222222-2222-4222-8222-222222222222'
      and sindico_nome = 'Helena Nova'
      and meio = 'link'
    from public.confirmacoes_sindico
    where manutencao_id = 'a6666666-6666-4666-8666-666666666666'
  ),
  'retrato guarda o sindico da hora da confirmacao'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
select public._exige(
  public.emitir_link_confirmacao_sindico(
    'a8888888-8888-4888-8888-888888888888',
    '0123456789abcdefghijklmnopqrstuvwxyzABCDEFG',
    '00000000-0000-4000-8000-000000000001'
  ) is not null,
  'prepara a troca de sindico'
);
select public._exige(
  public.emitir_link_confirmacao_sindico(
    'a8888888-8888-4888-8888-888888888888',
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefg',
    '00000000-0000-4000-8000-000000000001'
  ) is not null,
  'o segundo endereco substitui o primeiro antes da confirmacao'
);
select public.registrar_sindico(
  '00000000-0000-4000-8000-000000000010',
  'Carlos Posterior',
  '19900000001',
  null,
  date '2099-01-01'
);
select public._exige(
  public.registrar_confirmacao_sindico('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefg') is not null,
  'confirmacao depois da troca usa o sindico novo'
);
select public._exige(
  (
    select sindico_nome = 'Carlos Posterior'
    from public.confirmacoes_sindico
    where manutencao_id = 'a8888888-8888-4888-8888-888888888888'
  )
  and (
    select sindico_nome <> 'Carlos Posterior'
      and sindico_nome = (
        select sindico_nome from public.confirmacoes_sindico
        where manutencao_id = 'a1111111-1111-4111-8111-111111111111'
      )
    from public.confirmacoes_sindico
    where manutencao_id = 'a1111111-1111-4111-8111-111111111111'
  ),
  'troca posterior nao reescreve a confirmacao antiga'
);

select public._teste_recusa(
  $$select public.registrar_confirmacao_sindico('0123456789abcdefghijklmnopqrstuvwxyzABCDEFG')$$,
  'Este link foi revogado'
);

insert into public.sindicos (id, condominio_id, nome, whatsapp, ativo) values
  ('b3333333-3333-4333-8333-333333333333', '00000000-0000-4000-8000-000000000011', 'Síndico do Outro', '19900000002', true);

select public._exige(
  public.emitir_link_confirmacao_sindico(
    'a7777777-7777-4777-8777-777777777777',
    'outrocondominio0000000000000000000000000000',
    '00000000-0000-4000-8000-000000000001'
  ) is not null,
  'emite o link do outro condominio'
);
select public._exige(length('outrocondominio0000000000000000000000000000') = 43, 'token do outro condominio tem 43');
select public._exige(
  position('Porta do Sol' in public.ler_link_confirmacao_sindico('outrocondominio0000000000000000000000000000')::text) = 0
  and position('a1111111-1111-4111-8111-111111111111' in public.ler_link_confirmacao_sindico('outrocondominio0000000000000000000000000000')::text) = 0
  and (public.ler_link_confirmacao_sindico('outrocondominio0000000000000000000000000000')->>'condominio') = 'Outro Predio'
  and (public.ler_link_confirmacao_sindico('outrocondominio0000000000000000000000000000')->>'caminho_pdf') = 'a7777777-7777-4777-8777-777777777777/comprovante.pdf',
  'o token do outro condominio nao abre a primeira manutencao'
);
select public._exige(
  public.registrar_confirmacao_sindico('outrocondominio0000000000000000000000000000') is not null,
  'o link do outro condominio confirma'
);
select public._exige(
  (select count(*) = 1 from public.confirmacoes_sindico where manutencao_id = 'a1111111-1111-4111-8111-111111111111')
  and (select count(*) = 1 from public.confirmacoes_sindico where manutencao_id = 'a7777777-7777-4777-8777-777777777777')
  and (
    select manutencao_id = 'a7777777-7777-4777-8777-777777777777'
    from public.confirmacoes_sindico
    where token_hash = public.hash_token_confirmacao('outrocondominio0000000000000000000000000000')
  ),
  'confirmar um link nao grava a outra manutencao'
);

select public._exige(
  public.emitir_link_confirmacao_sindico(
    'a9999999-9999-4999-8999-999999999999',
    'segretointerno00000000000000000000000000000',
    '00000000-0000-4000-8000-000000000001'
  ) is not null,
  'emite o link da visita com pendencia'
);
select public._exige(length('segretointerno00000000000000000000000000000') = 43, 'token da pendencia tem 43');
select public._exige(
  position('SEGREDO' in public.ler_link_confirmacao_sindico('segretointerno00000000000000000000000000000')::text) = 0
  and position('acompanhamento' in public.ler_link_confirmacao_sindico('segretointerno00000000000000000000000000000')::text) = 0
  and (public.ler_link_confirmacao_sindico('segretointerno00000000000000000000000000000')->>'condominio') = 'Porta do Sol',
  'a pagina nao expoe a ocorrencia interna'
);

select public._exige(
  not exists (
    select 1
    from jsonb_object_keys(public.resumo_link_confirmacao_sindico('a1111111-1111-4111-8111-111111111111')) chave
    where chave in ('token', 'token_hash', 'caminho_pdf', 'manutencao_id')
  )
  and (public.resumo_link_confirmacao_sindico('a1111111-1111-4111-8111-111111111111')->>'meio') = 'link'
  and (public.resumo_link_confirmacao_sindico('a1111111-1111-4111-8111-111111111111')->>'sindico_nome') is not null,
  'o resumo do ADM nao devolve o token'
);

select public._teste_recusa(
  $$delete from public.links_confirmacao_sindico
    where manutencao_id = 'a2222222-2222-4222-8222-222222222222'$$,
  'não pode ser apagado'
);
select public._teste_recusa(
  $$update public.links_confirmacao_sindico
      set token_hash = public.hash_token_confirmacao('NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN')
    where manutencao_id = 'a1111111-1111-4111-8111-111111111111'
      and revogado_em is null$$,
  'não pode ser alterado'
);

select public._exige(
  (select status from public.manutencoes where id = '00000000-0000-4000-8000-000000000060') = current_setting('teste.visita_0060')
  and (select count(*)::text from storage.objects where bucket_id = 'pdfs') = current_setting('teste.pdfs'),
  'o teste nao mexe na visita anterior nem cria arquivo publico'
);

set local role anon;
select public._teste_recusa(
  $$select * from public.links_confirmacao_sindico$$,
  '42501'
);
select public._teste_recusa(
  $$select public.registrar_confirmacao_sindico('confirmaVisitaUmabcdefghijklmnopqrstuvwxyzA')$$,
  '42501'
);
reset role;

set local role authenticated;
select public._teste_recusa(
  $$select public.emitir_link_confirmacao_sindico(
    'a3333333-3333-4333-8333-333333333333',
    'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz',
    '00000000-0000-4000-8000-000000000001'
  )$$,
  '42501'
);
reset role;

rollback;
