-- Leitura do banco local. Não grava dados e não aplica migrations.

do $$
declare
  nome text;
  quantidade bigint;
  total_linhas bigint := 0;
  orfaos bigint;
  politicas bigint;
  gatilhos_desligados bigint;
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

  if (
    select count(*)
    from pg_tables
    where schemaname = 'public'
  ) is distinct from 14 then
    raise exception 'Era esperado 14 tabelas em public.';
  end if;

  if to_regclass('public.historico_ocorrencias') is not null then
    raise exception 'historico_ocorrencias já existe. O backup não está antes da Fase 5A.';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'manutencoes'
      and column_name = 'registro_anterior'
  ) then
    raise exception 'registro_anterior já existe. O backup não está antes da adequação da Fase 3.';
  end if;

  if not exists (
    select 1
    from pg_proc as rotina
    join pg_namespace as esquema on esquema.oid = rotina.pronamespace
    where esquema.nspname = 'public'
      and rotina.proname = 'gerar_programacao_contrato'
      and pg_get_function_identity_arguments(rotina.oid) = 'p_contrato_id uuid'
  ) then
    raise exception 'gerar_programacao_contrato não está na assinatura antiga, de um argumento.';
  end if;

  select count(*) into politicas
  from pg_policies
  where schemaname = 'public';

  if politicas is distinct from 21 then
    raise exception 'Eram esperadas 21 políticas de segurança. Encontradas: %', politicas;
  end if;

  select count(*) into gatilhos_desligados
  from pg_trigger as gatilho
  join pg_class as relacao on relacao.oid = gatilho.tgrelid
  join pg_namespace as esquema on esquema.oid = relacao.relnamespace
  where esquema.nspname = 'public'
    and not gatilho.tgisinternal
    and gatilho.tgenabled = 'D';

  if gatilhos_desligados > 0 then
    raise exception 'Há gatilhos desligados. A carga dos dados não terminou de forma limpa.';
  end if;

  select count(*) into orfaos
  from public.usuarios as usuario
  where not exists (
    select 1
    from auth.users as login
    where login.id = usuario.id
  );

  if orfaos > 0 then
    raise exception 'Há % usuários sem correspondente em auth.users. Rode a etapa completar.', orfaos;
  end if;

  for nome in
    select tablename
    from pg_tables
    where schemaname = 'public'
    order by tablename
  loop
    execute format('select count(*) from public.%I', nome) into quantidade;
    total_linhas := total_linhas + quantidade;
    raise notice 'tabela %: % linhas', nome, quantidade;
  end loop;

  if total_linhas = 0 then
    raise exception 'Nenhuma linha foi restaurada.';
  end if;

  raise notice 'Restauração local conferida.';
end $$;
