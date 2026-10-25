-- Confirmação do síndico: uma por manutenção, só o hash, histórico preservado.

create or replace function public._exige(condicao boolean, mensagem text)
returns void
language plpgsql
as $$
begin
  if coalesce(condicao, false) is not true then
    raise exception '%', mensagem;
  end if;
end;
$$;

create or replace function public._teste_recusa(p_sql text, p_trecho text)
returns void
language plpgsql
as $$
begin
  execute p_sql;
  raise exception 'Esperava falha contendo "%"', p_trecho;
exception
  when others then
    if sqlerrm like 'Esperava falha contendo%' then
      raise;
    end if;
    if position(p_trecho in sqlerrm) = 0 and sqlstate is distinct from p_trecho then
      raise exception 'Mensagem diferente. Esperado "%", veio "%" (%).', p_trecho, sqlerrm, sqlstate;
    end if;
end;
$$;

select public._exige(
  to_regclass('public.confirmacoes_sindico') is not null,
  'tabela de confirmacao existe'
);
select public._exige(
  public.hash_token_confirmacao('abc') = 'sha256$ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0',
  'hash sha256 do token confere'
);
select public._exige(
  (
    select count(*) = 0
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'confirmacoes_sindico'
      and column_name in ('token', 'token_original', 'autenticado', 'identidade_autenticada', 'senha')
  ),
  'banco nao guarda o token nem declara autenticacao'
);
select public._exige(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'public.confirmacoes_sindico'::regclass
  ),
  'confirmacao fica fora do acesso direto'
);
select public._exige(
  (select count(*) = 0 from pg_policies where schemaname = 'public' and tablename = 'confirmacoes_sindico'),
  'confirmacao nao tem policy'
);
select public._exige(
  not has_table_privilege('anon', 'public.confirmacoes_sindico', 'select')
  and not has_table_privilege('anon', 'public.confirmacoes_sindico', 'insert')
  and not has_table_privilege('anon', 'public.confirmacoes_sindico', 'update')
  and not has_table_privilege('anon', 'public.confirmacoes_sindico', 'delete')
  and not has_table_privilege('authenticated', 'public.confirmacoes_sindico', 'select')
  and not has_table_privilege('authenticated', 'public.confirmacoes_sindico', 'insert')
  and not has_table_privilege('authenticated', 'public.confirmacoes_sindico', 'update')
  and not has_table_privilege('authenticated', 'public.confirmacoes_sindico', 'delete')
  and not has_function_privilege('anon', 'public.registrar_confirmacao_sindico(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.registrar_confirmacao_sindico(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.hash_token_confirmacao(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.hash_token_confirmacao(text)', 'execute'),
  'anon e authenticated nao acessam a confirmacao'
);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    perform public._exige(
      has_table_privilege('service_role', 'public.confirmacoes_sindico', 'select')
      and not has_table_privilege('service_role', 'public.confirmacoes_sindico', 'insert')
      and not has_table_privilege('service_role', 'public.confirmacoes_sindico', 'update')
      and not has_table_privilege('service_role', 'public.confirmacoes_sindico', 'delete')
      and has_function_privilege('service_role', 'public.registrar_confirmacao_sindico(uuid, text)', 'execute')
      and not has_function_privilege('service_role', 'public.hash_token_confirmacao(text)', 'execute'),
      'so o servidor le e executa a confirmacao'
    );
  end if;
end $$;

select public._exige(
  position('update public.manutencoes' in lower(pg_get_functiondef('public.registrar_confirmacao_sindico(uuid, text)'::regprocedure))) = 0
  and position('update public.manutencoes' in lower(pg_get_functiondef('public.validar_confirmacao_sindico()'::regprocedure))) = 0,
  'confirmacao nao altera a manutencao'
);

create temp table manutencoes_foto_confirmacao as
select id, to_jsonb(m.*) as foto
from public.manutencoes m;

insert into public.condominios (id, nome, endereco, bairro, cidade, estado) values
  ('c0ffee00-0000-4000-8000-000000000010', 'Condomínio Confirmação', 'Rua 1', 'Centro', 'Campinas', 'SP'),
  ('c0ffee00-0000-4000-8000-000000000011', 'Condomínio Sem Síndico', 'Rua 2', 'Centro', 'Campinas', 'SP'),
  ('c0ffee00-0000-4000-8000-000000000012', 'Condomínio Síndico Inativo', 'Rua 3', 'Centro', 'Campinas', 'SP');

insert into public.sindicos (id, condominio_id, nome, whatsapp, ativo) values
  ('c0ffee00-0000-4000-8000-000000000020', 'c0ffee00-0000-4000-8000-000000000010', 'Helena', '19999990000', true),
  ('c0ffee00-0000-4000-8000-000000000022', 'c0ffee00-0000-4000-8000-000000000012', 'Antigo', '19999990002', false);

insert into public.contratos (
  id, numero_contrato, condominio_id, data_inicio_contrato, data_inicio_manutencao, quantidade_visitas
) values (
  'c0ffee00-0000-4000-8000-000000000030',
  'TESTE-CONF-1',
  'c0ffee00-0000-4000-8000-000000000010',
  date '2026-01-31',
  date '2026-01-31',
  1
);

insert into public.manutencoes (
  id, condominio_id, data_programada_original, data_programada_atual, tipo, origem
) values
  ('c0ffee00-0000-4000-8000-000000000040', 'c0ffee00-0000-4000-8000-000000000010', date '2026-10-25', date '2026-10-25', 'avulsa', 'manual'),
  ('c0ffee00-0000-4000-8000-000000000041', 'c0ffee00-0000-4000-8000-000000000010', date '2026-10-25', date '2026-10-25', 'avulsa', 'manual'),
  ('c0ffee00-0000-4000-8000-000000000043', 'c0ffee00-0000-4000-8000-000000000011', date '2026-10-25', date '2026-10-25', 'avulsa', 'manual'),
  ('c0ffee00-0000-4000-8000-000000000044', 'c0ffee00-0000-4000-8000-000000000012', date '2026-10-25', date '2026-10-25', 'avulsa', 'manual'),
  ('c0ffee00-0000-4000-8000-000000000045', 'c0ffee00-0000-4000-8000-000000000010', date '2026-10-26', date '2026-10-26', 'avulsa', 'manual'),
  ('c0ffee00-0000-4000-8000-000000000046', 'c0ffee00-0000-4000-8000-000000000010', date '2026-10-27', date '2026-10-27', 'avulsa', 'manual'),
  ('c0ffee00-0000-4000-8000-000000000047', 'c0ffee00-0000-4000-8000-000000000010', date '2026-10-28', date '2026-10-28', 'avulsa', 'manual');

insert into public.manutencoes (
  id, condominio_id, contrato_id, numero_visita,
  data_programada_original, data_programada_atual, tipo, origem
) values (
  'c0ffee00-0000-4000-8000-000000000042',
  'c0ffee00-0000-4000-8000-000000000010',
  'c0ffee00-0000-4000-8000-000000000030',
  1,
  date '2026-01-31',
  date '2026-01-31',
  'preventiva',
  'automatica'
);

select set_config('app.cancelando', 'on', true);
update public.manutencoes
  set status = 'cancelada'
  where id = 'c0ffee00-0000-4000-8000-000000000041';
select set_config('app.cancelando', 'off', true);

select set_config('app.registro_anterior', 'on', true);
update public.manutencoes
  set registro_anterior = true,
      status = 'realizada',
      data_realizada = data_programada_atual
  where id = 'c0ffee00-0000-4000-8000-000000000042';
select set_config('app.registro_anterior', 'off', true);

select public._exige(
  public.registrar_confirmacao_sindico(
    'c0ffee00-0000-4000-8000-000000000040',
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ'
  ) is not null,
  'confirmacao criada'
);

select public._exige(
  (select count(*) = 1 from public.confirmacoes_sindico where manutencao_id = 'c0ffee00-0000-4000-8000-000000000040'),
  'uma confirmacao por manutencao'
);
select public._exige(
  (
    select sindico_id = 'c0ffee00-0000-4000-8000-000000000020'
      and sindico_nome = 'Helena'
      and meio = 'link'
      and confirmado_em <= clock_timestamp()
      and confirmado_em > clock_timestamp() - interval '5 minutes'
      and token_hash = public.hash_token_confirmacao('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ')
      and token_hash <> 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ'
      and position('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ' in token_hash) = 0
      and position('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ' in to_jsonb(c.*)::text) = 0
    from public.confirmacoes_sindico c
    where manutencao_id = 'c0ffee00-0000-4000-8000-000000000040'
  ),
  'registro guarda hash, link e retrato do sindico'
);

select public._teste_recusa(
  $$select public.registrar_confirmacao_sindico(
      'c0ffee00-0000-4000-8000-000000000040',
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq'
    )$$,
  'já tem confirmação'
);

select public._teste_recusa(
  $$select public.registrar_confirmacao_sindico(
      'c0ffee00-0000-4000-8000-000000000045',
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ'
    )$$,
  'já foi utilizado'
);

select public._teste_recusa(
  $$select public.registrar_confirmacao_sindico(
      'c0ffee00-0000-4000-8000-000000000045',
      'curto'
    )$$,
  'token do link'
);

select public._teste_recusa(
  $$select public.registrar_confirmacao_sindico(
      'c0ffee00-0000-4000-8000-000000000041',
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq'
    )$$,
  'cancelada não recebe'
);

select public._teste_recusa(
  $$select public.registrar_confirmacao_sindico(
      'c0ffee00-0000-4000-8000-000000000042',
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq'
    )$$,
  'Registro anterior não recebe'
);

select public._teste_recusa(
  $$select public.registrar_confirmacao_sindico(
      'c0ffee00-0000-4000-8000-000000000043',
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq'
    )$$,
  'Não há síndico ativo'
);

select public._teste_recusa(
  $$select public.registrar_confirmacao_sindico(
      'c0ffee00-0000-4000-8000-000000000044',
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq'
    )$$,
  'Não há síndico ativo'
);

select public._teste_recusa(
  $$update public.confirmacoes_sindico
      set sindico_nome = 'Outra pessoa'
    where manutencao_id = 'c0ffee00-0000-4000-8000-000000000040'$$,
  'não pode ser alterada'
);

select public._teste_recusa(
  $$delete from public.confirmacoes_sindico
    where manutencao_id = 'c0ffee00-0000-4000-8000-000000000040'$$,
  'não pode ser alterada'
);

update public.sindicos
  set nome = 'Helena Atual'
  where id = 'c0ffee00-0000-4000-8000-000000000020';

select public._exige(
  (
    select sindico_id = 'c0ffee00-0000-4000-8000-000000000020'
      and sindico_nome = 'Helena'
    from public.confirmacoes_sindico
    where manutencao_id = 'c0ffee00-0000-4000-8000-000000000040'
  ),
  'trocar o nome do sindico nao reescreve a confirmacao'
);

update public.sindicos
  set ativo = false,
      data_fim = date '2026-10-25'
  where id = 'c0ffee00-0000-4000-8000-000000000020';

insert into public.sindicos (id, condominio_id, nome, whatsapp, ativo) values
  ('c0ffee00-0000-4000-8000-000000000021', 'c0ffee00-0000-4000-8000-000000000010', 'Carlos', '19999990001', true);

select public._exige(
  (
    select sindico_id = 'c0ffee00-0000-4000-8000-000000000020'
      and sindico_nome = 'Helena'
    from public.confirmacoes_sindico
    where manutencao_id = 'c0ffee00-0000-4000-8000-000000000040'
  ),
  'substituir o sindico preserva o retrato anterior'
);

select public._teste_recusa(
  $$delete from public.sindicos where id = 'c0ffee00-0000-4000-8000-000000000020'$$,
  'confirmacoes_sindico_sindico_id_fkey'
);

select public._exige(
  public.registrar_confirmacao_sindico(
    'c0ffee00-0000-4000-8000-000000000045',
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq'
  ) is not null,
  'nova confirmacao usa o sindico ativo da hora'
);

select public._exige(
  (
    select sindico_id = 'c0ffee00-0000-4000-8000-000000000021'
      and sindico_nome = 'Carlos'
      and meio = 'link'
    from public.confirmacoes_sindico
    where manutencao_id = 'c0ffee00-0000-4000-8000-000000000045'
  )
  and (
    select sindico_nome = 'Helena'
    from public.confirmacoes_sindico
    where manutencao_id = 'c0ffee00-0000-4000-8000-000000000040'
  ),
  'cada confirmacao conserva o seu sindico'
);

insert into public.confirmacoes_sindico (
  manutencao_id, token_hash, sindico_id, sindico_nome, meio
) values (
  'c0ffee00-0000-4000-8000-000000000046',
  public.hash_token_confirmacao('0123456789012345678901234567890123456789012'),
  'ffffffff-ffff-4000-8000-000000000099',
  'Pessoa falsa',
  'autenticado'
);

select public._exige(
  (
    select sindico_id = 'c0ffee00-0000-4000-8000-000000000021'
      and sindico_nome = 'Carlos'
      and meio = 'link'
      and position('0123456789012345678901234567890123456789012' in to_jsonb(c.*)::text) = 0
    from public.confirmacoes_sindico c
    where manutencao_id = 'c0ffee00-0000-4000-8000-000000000046'
  ),
  'gravacao direta ainda usa o sindico ativo e o meio link'
);

select public._teste_recusa(
  $$insert into public.confirmacoes_sindico (manutencao_id, token_hash, sindico_id, sindico_nome)
    values (
      'c0ffee00-0000-4000-8000-000000000047',
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ',
      'c0ffee00-0000-4000-8000-000000000021',
      'Carlos'
    )$$,
  'confirmacoes_sindico_token_hash_check'
);

select public._exige(
  (
    select count(*) = (select count(*) from manutencoes_foto_confirmacao)
      and bool_and(to_jsonb(m.*) = f.foto)
    from public.manutencoes m
    join manutencoes_foto_confirmacao f on f.id = m.id
  ),
  'manutencoes anteriores a confirmacao permanecem'
);

set local role anon;
select public._teste_recusa(
  $$select * from public.confirmacoes_sindico$$,
  '42501'
);
select public._teste_recusa(
  $$select public.registrar_confirmacao_sindico(
      'c0ffee00-0000-4000-8000-000000000047',
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq'
    )$$,
  '42501'
);
reset role;

set local role authenticated;
select public._teste_recusa(
  $$select token_hash from public.confirmacoes_sindico$$,
  '42501'
);
select public._teste_recusa(
  $$insert into public.confirmacoes_sindico (manutencao_id, token_hash, sindico_id, sindico_nome)
    values (
      'c0ffee00-0000-4000-8000-000000000047',
      'sha256$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ',
      'c0ffee00-0000-4000-8000-000000000021',
      'Carlos'
    )$$,
  '42501'
);
reset role;
