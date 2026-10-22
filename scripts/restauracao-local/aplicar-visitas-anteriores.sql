-- Adequação das visitas anteriores, somente no banco local de teste.
-- A transação reverte se qualquer comando falhar.
-- Não cria visitas e não executa a programação.

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

  if to_regclass('public.historico_ocorrencias') is null then
    raise exception 'A Fase 5A não está presente. Nada foi aplicado.';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'manutencoes'
      and column_name = 'registro_anterior'
  ) then
    raise exception 'registro_anterior já existe. Nada foi aplicado.';
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

create temp table visitas_contagem_antes (
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
    insert into visitas_contagem_antes (tabela, quantidade) values (nome, quantidade);
  end loop;
end $$;

create temp table visitas_manutencoes_antes as
select md5(coalesce(string_agg(
  id::text
    || '|' || coalesce(contrato_id::text, '')
    || '|' || coalesce(numero_visita::text, '')
    || '|' || tipo
    || '|' || status
    || '|' || coalesce(prestador_id::text, '')
    || '|' || data_programada_original::text
    || '|' || data_programada_atual::text
    || '|' || coalesce(data_realizada::text, '')
    || '|' || coalesce(ocorrencia_origem_id::text, ''),
  E'\n'
  order by id
), '')) as assinatura
from public.manutencoes;

create temp table visitas_ocorrencias_antes as
select md5(coalesce(string_agg(
  id::text
    || '|' || status_ocorrencia
    || '|' || resolvida_no_local::text
    || '|' || coalesce(descricao_original, '')
    || '|' || coalesce(foto_url, '')
    || '|' || coalesce(providencia, '')
    || '|' || coalesce(solucao, ''),
  E'\n'
  order by id
), '')) as assinatura
from public.ocorrencias;

\ir ../../supabase/migrations/20261017120000_visitas_anteriores.sql

do $$
declare
  nome text;
  antes bigint;
  depois bigint;
  assinatura_antes text;
  assinatura_depois text;
  argumentos text;
  politica text;
  definicao text;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'manutencoes'
      and column_name = 'registro_anterior'
      and is_nullable = 'NO'
      and data_type = 'boolean'
  ) then
    raise exception 'A coluna registro_anterior não foi criada como boolean obrigatório.';
  end if;

  if exists (
    select 1
    from public.manutencoes
    where registro_anterior
  ) then
    raise exception 'Alguma visita existente foi marcada como registro anterior.';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'manutencoes_registro_anterior_check'
      and conrelid = 'public.manutencoes'::regclass
  ) then
    raise exception 'A restrição de registro anterior não foi criada.';
  end if;

  select pg_get_function_identity_arguments(rotina.oid) into argumentos
  from pg_proc as rotina
  join pg_namespace as esquema on esquema.oid = rotina.pronamespace
  where esquema.nspname = 'public'
    and rotina.proname = 'gerar_programacao_contrato';

  if argumentos is distinct from 'p_contrato_id uuid, p_anteriores integer, p_datas date[], p_confirmar boolean' then
    raise exception 'A função gerar_programacao_contrato não ficou com a nova assinatura.';
  end if;

  if (
    select count(*)
    from pg_proc as rotina
    join pg_namespace as esquema on esquema.oid = rotina.pronamespace
    where esquema.nspname = 'public'
      and rotina.proname = 'gerar_programacao_contrato'
  ) is distinct from 1 then
    raise exception 'A função gerar_programacao_contrato ficou duplicada.';
  end if;

  if to_regprocedure('public.registrar_visitas_anteriores(uuid, integer, date[], boolean)') is null
     or to_regprocedure('public.concluir_visita_anterior(uuid, date)') is null
     or to_regprocedure('public.validar_pedido_visitas_anteriores(integer, integer, date[], boolean)') is null then
    raise exception 'Função prevista das visitas anteriores não foi criada.';
  end if;

  select pg_get_expr(polqual, polrelid) into politica
  from pg_policy
  where polname = 'prestador_le_visita'
    and polrelid = 'public.manutencoes'::regclass;

  if politica is null or politica not like '%registro_anterior%' then
    raise exception 'A política do prestador não esconde o registro anterior.';
  end if;

  if to_regclass('public.historico_ocorrencias') is null
     or to_regprocedure('public.registrar_tratamento_ocorrencia(uuid, text, text)') is null
     or to_regprocedure('public.programar_retorno_ocorrencia(uuid, date, uuid)') is null then
    raise exception 'A Fase 5A deixou de estar presente.';
  end if;

  select pg_get_constraintdef(restricao.oid) into definicao
  from pg_constraint as restricao
  where restricao.conname = 'ocorrencias_status_ocorrencia_check'
    and restricao.conrelid = 'public.ocorrencias'::regclass;

  if definicao is null
     or definicao not like '%retorno_programado%'
     or definicao not like '%aguardando_aprovacao%'
     or definicao not like '%aguardando_execucao%' then
    raise exception 'As situações da Fase 5A não permaneceram.';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'historico_ocorrencias'
      and policyname = 'admin_le_historico_ocorrencia'
  ) then
    raise exception 'A política do histórico da Fase 5A não permaneceu.';
  end if;

  for nome, antes in
    select tabela, quantidade
    from visitas_contagem_antes
    order by tabela
  loop
    execute format('select count(*) from public.%I', nome) into depois;
    if depois is distinct from antes then
      raise exception 'A quantidade de % mudou de % para %.', nome, antes, depois;
    end if;
  end loop;

  select assinatura into assinatura_antes from visitas_manutencoes_antes;
  select md5(coalesce(string_agg(
    id::text
      || '|' || coalesce(contrato_id::text, '')
      || '|' || coalesce(numero_visita::text, '')
      || '|' || tipo
      || '|' || status
      || '|' || coalesce(prestador_id::text, '')
      || '|' || data_programada_original::text
      || '|' || data_programada_atual::text
      || '|' || coalesce(data_realizada::text, '')
      || '|' || coalesce(ocorrencia_origem_id::text, ''),
    E'\n'
    order by id
  ), '')) into assinatura_depois
  from public.manutencoes;

  if assinatura_depois is distinct from assinatura_antes then
    raise exception 'As visitas existentes foram alteradas.';
  end if;

  select assinatura into assinatura_antes from visitas_ocorrencias_antes;
  select md5(coalesce(string_agg(
    id::text
      || '|' || status_ocorrencia
      || '|' || resolvida_no_local::text
      || '|' || coalesce(descricao_original, '')
      || '|' || coalesce(foto_url, '')
      || '|' || coalesce(providencia, '')
      || '|' || coalesce(solucao, ''),
    E'\n'
    order by id
  ), '')) into assinatura_depois
  from public.ocorrencias;

  if assinatura_depois is distinct from assinatura_antes then
    raise exception 'As ocorrências da Fase 5A foram alteradas.';
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

  raise notice 'Visitas anteriores aplicadas no banco local.';
end $$;
