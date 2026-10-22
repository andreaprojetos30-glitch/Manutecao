-- Fase 5A somente no banco local de teste.
-- A transação reverte se qualquer comando falhar.
-- Não executa a migration de visitas anteriores.

\set ON_ERROR_STOP on

do $$
declare
  nome text;
  quantidade bigint;
begin
  if current_database() is distinct from 'eleva_manutencao_teste' then
    raise exception 'Banco recusado: %', current_database();
  end if;

  if inet_server_addr() is distinct from '127.0.0.1'::inet then
    raise exception 'Servidor recusado: %', inet_server_addr();
  end if;

  if inet_server_port() is distinct from 5432 then
    raise exception 'Porta recusada: %', inet_server_port();
  end if;

  if to_regclass('public.historico_ocorrencias') is not null then
    raise exception 'historico_ocorrencias já existe. Fase 5A não foi executada.';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'manutencoes'
      and column_name = 'registro_anterior'
  ) then
    raise exception 'registro_anterior já existe. Fase 5A não foi executada.';
  end if;

  for nome in
    select tablename
    from pg_tables
    where schemaname = 'public'
    order by tablename
  loop
    execute format('select count(*) from public.%I', nome) into quantidade;
    raise notice 'antes %: %', nome, quantidade;
  end loop;
end $$;

begin;

create temp table fase5a_contagem_antes (
  tabela text primary key,
  quantidade bigint not null
);

do $$
declare
  nome text;
  quantidade bigint;
begin
  for nome in
    select tablename
    from pg_tables
    where schemaname = 'public'
    order by tablename
  loop
    execute format('select count(*) from public.%I', nome) into quantidade;
    insert into fase5a_contagem_antes (tabela, quantidade) values (nome, quantidade);
  end loop;
end $$;

create temp table fase5a_ocorrencias_antes as
select
  count(*) as quantidade,
  md5(coalesce(string_agg(
    id::text
      || '|' || status_ocorrencia
      || '|' || resolvida_no_local::text
      || '|' || coalesce(descricao_original, '')
      || '|' || coalesce(foto_url, ''),
    E'\n'
    order by id
  ), '')) as assinatura
from public.ocorrencias;

\ir ../../supabase/migrations/20261014140000_tratamento_ocorrencias.sql

do $$
declare
  nome text;
  antes bigint;
  depois bigint;
  assinatura_antes text;
  assinatura_depois text;
  definicao text;
begin
  if to_regclass('public.historico_ocorrencias') is null then
    raise exception 'historico_ocorrencias não foi criada.';
  end if;

  if (
    select count(*)
    from public.historico_ocorrencias
  ) is distinct from 0 then
    raise exception 'O histórico novo deveria nascer vazio.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ocorrencias'
      and column_name = 'providencia'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ocorrencias'
      and column_name = 'solucao'
  ) then
    raise exception 'As colunas providencia e solucao não foram criadas.';
  end if;

  if exists (
    select 1
    from public.ocorrencias
    where providencia is not null
       or solucao is not null
  ) then
    raise exception 'Ocorrência existente foi alterada.';
  end if;

  select pg_get_constraintdef(oid) into definicao
  from pg_constraint
  where conname = 'ocorrencias_status_ocorrencia_check'
    and conrelid = 'public.ocorrencias'::regclass;

  if definicao is null
     or definicao not like '%aguardando_aprovacao%'
     or definicao not like '%aguardando_execucao%'
     or definicao not like '%retorno_programado%'
     or definicao not like '%aguardando_retorno%'
     or definicao not like '%encerrada%' then
    raise exception 'A lista de situações da ocorrência ficou incompleta.';
  end if;

  if to_regprocedure('public.registrar_tratamento_ocorrencia(uuid, text, text)') is null
     or to_regprocedure('public.programar_retorno_ocorrencia(uuid, date, uuid)') is null
     or to_regprocedure('public.bloquear_historico_ocorrencia()') is null then
    raise exception 'Função prevista da Fase 5A não foi criada.';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'historico_ocorrencias'
      and policyname = 'admin_le_historico_ocorrencia'
  ) then
    raise exception 'A política do histórico não foi criada.';
  end if;

  for nome, antes in
    select tabela, quantidade
    from fase5a_contagem_antes
    order by tabela
  loop
    execute format('select count(*) from public.%I', nome) into depois;
    if depois is distinct from antes then
      raise exception 'A quantidade de % mudou de % para %.', nome, antes, depois;
    end if;
  end loop;

  select assinatura into assinatura_antes
  from fase5a_ocorrencias_antes;

  select md5(coalesce(string_agg(
    id::text
      || '|' || status_ocorrencia
      || '|' || resolvida_no_local::text
      || '|' || coalesce(descricao_original, '')
      || '|' || coalesce(foto_url, ''),
    E'\n'
    order by id
  ), '')) into assinatura_depois
  from public.ocorrencias;

  if assinatura_depois is distinct from assinatura_antes then
    raise exception 'O conteúdo das ocorrências existentes mudou.';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'manutencoes'
      and column_name = 'registro_anterior'
  ) then
    raise exception 'A migration de visitas anteriores foi detectada.';
  end if;
end $$;

commit;

do $$
declare
  nome text;
  quantidade bigint;
begin
  for nome in
    select tablename
    from pg_tables
    where schemaname = 'public'
    order by tablename
  loop
    execute format('select count(*) from public.%I', nome) into quantidade;
    raise notice 'depois %: %', nome, quantidade;
  end loop;

  raise notice 'Fase 5A aplicada no banco local.';
end $$;
