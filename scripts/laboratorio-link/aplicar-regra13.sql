-- Aplica as duas migrações novas e cria a manutenção visual do laboratório.
-- Só grava em 127.0.0.1:5432/eleva_manutencao_teste.
-- Não confirma a manutenção nova e não altera as sete manutenções anteriores.

\set ON_ERROR_STOP on
\set HISTFILE
\pset pager off
set client_min_messages to warning;

begin;

do $$
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
  if current_user is distinct from 'postgres' then
    raise exception 'Usuario recusado: %', current_user;
  end if;
  if to_regclass('public.destinatarios_comprovante') is not null then
    raise exception 'A migracao do destinatario ja foi aplicada';
  end if;
  if position('encerrada' in pg_get_functiondef('public.ler_link_confirmacao_sindico(text)'::regprocedure)) > 0 then
    raise exception 'A migracao de encerramento ja foi aplicada';
  end if;
end $$;

create temp table regra13_reais as
select id, md5(to_jsonb(m.*)::text) as foto
from public.manutencoes m
where condominio_id is distinct from '1ab00000-0000-4000-8000-000000000010';

create temp table regra13_lab as
select id, md5(to_jsonb(m.*)::text) as foto
from public.manutencoes m
where id in (
  '1ab00000-0000-4000-8000-000000000070',
  '1ab00000-0000-4000-8000-000000000080',
  '1ab00000-0000-4000-8000-000000000090'
);

create temp table regra13_confirmacao_antiga as
select md5(
  coalesce(sindico_id::text, '') || '|' ||
  coalesce(sindico_nome, '') || '|' ||
  coalesce(meio, '') || '|' ||
  coalesce(confirmado_em::text, '') || '|' ||
  coalesce(token_hash, '')
) as foto
from public.confirmacoes_sindico
where manutencao_id = '1ab00000-0000-4000-8000-000000000070';

create temp table regra13_auditoria as
select id
from public.auditoria
where registro_id in (select id from regra13_reais);

do $$
begin
  if (select count(*) from regra13_reais) <> 7 then
    raise exception 'O laboratorio exige exatamente sete manutencoes anteriores';
  end if;
  if (select count(*) from regra13_lab) <> 3 then
    raise exception 'As manutencoes ficticias anteriores nao foram encontradas';
  end if;
  if (select count(*) from regra13_confirmacao_antiga) <> 1 then
    raise exception 'A manutencao ficticia ja confirmada nao foi encontrada';
  end if;
  if exists (select 1 from public.condominios where id = '1ab00000-0000-4000-8000-000000000010') is not true then
    raise exception 'O laboratorio ainda nao foi preparado';
  end if;
  if exists (select 1 from public.manutencoes where id = '1ab00000-0000-4000-8000-0000000000a0') then
    raise exception 'A manutencao visual ja existe';
  end if;
end $$;

\ir ../../supabase/migrations/20261026130000_destinatario_comprovante.sql
\ir ../../supabase/migrations/20261026140000_encerrar_link_confirmado.sql

do $$
begin
  if to_regclass('public.destinatarios_comprovante') is null then
    raise exception 'A tabela de destinatarios nao foi criada';
  end if;
  if position('encerrada' in pg_get_functiondef('public.ler_link_confirmacao_sindico(text)'::regprocedure)) = 0 then
    raise exception 'A leitura do link nao encerra a confirmacao';
  end if;
  if position('update public.manutencoes' in lower(pg_get_functiondef('public.ler_link_confirmacao_sindico(text)'::regprocedure))) > 0 then
    raise exception 'A leitura do link nao pode alterar manutencoes';
  end if;
end $$;

insert into public.manutencoes (
  id, condominio_id, data_programada_original, data_programada_atual, prestador_id, tipo, origem, observacoes_administrativas
) values (
  '1ab00000-0000-4000-8000-0000000000a0',
  '1ab00000-0000-4000-8000-000000000010',
  date '2026-10-26',
  date '2026-10-26',
  '1ab00000-0000-4000-8000-000000000030',
  'avulsa',
  'manual',
  'Laboratório local — confirmação visual'
);

insert into public.itens_manutencao (id, manutencao_id, equipamento_matriz_id, nome_identificacao) values (
  '1ab00000-0000-4000-8000-0000000000a1',
  '1ab00000-0000-4000-8000-0000000000a0',
  '1ab00000-0000-4000-8000-000000000040',
  'Equipamento Laboratório Visual'
);

select set_config('request.jwt.claim.sub', '1ab00000-0000-4000-8000-000000000001', true);

select public.registrar_ok('1ab00000-0000-4000-8000-0000000000a1');
select public.finalizar_manutencao('1ab00000-0000-4000-8000-0000000000a0');
select public.registrar_comprovante(
  '1ab00000-0000-4000-8000-0000000000a0',
  '1ab00000-0000-4000-8000-0000000000a0/comprovante.pdf',
  false
);

create temp table lab_tokens (
  papel text primary key,
  token text not null
);

insert into lab_tokens (papel, token)
select 'visual', rtrim(translate(encode(gen_random_bytes(32), 'base64'), '+/', '-_'), '=');

do $$
begin
  if (select token from lab_tokens where papel = 'visual') !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'Token visual invalido';
  end if;
end $$;

select public.emitir_link_confirmacao_sindico(
  '1ab00000-0000-4000-8000-0000000000a0',
  (select token from lab_tokens where papel = 'visual'),
  '1ab00000-0000-4000-8000-000000000001'
);

do $$
begin
  if exists (
    select 1
    from regra13_reais anterior
    join public.manutencoes atual on atual.id = anterior.id
    where md5(to_jsonb(atual.*)::text) is distinct from anterior.foto
  ) then
    raise exception 'Manutencao anterior foi alterada';
  end if;
  if (select count(*) from public.manutencoes where condominio_id is distinct from '1ab00000-0000-4000-8000-000000000010') <> 7 then
    raise exception 'A quantidade de manutencoes anteriores mudou';
  end if;
  if exists (
    select 1
    from regra13_lab anterior
    join public.manutencoes atual on atual.id = anterior.id
    where md5(to_jsonb(atual.*)::text) is distinct from anterior.foto
  ) then
    raise exception 'Manutencao ficticia anterior foi alterada';
  end if;
  if exists (
    select 1
    from public.auditoria
    where registro_id in (select id from regra13_reais)
      and id not in (select id from regra13_auditoria)
  ) then
    raise exception 'Auditoria de manutencao anterior foi gravada';
  end if;
  if (
    select md5(
      coalesce(sindico_id::text, '') || '|' ||
      coalesce(sindico_nome, '') || '|' ||
      coalesce(meio, '') || '|' ||
      coalesce(confirmado_em::text, '') || '|' ||
      coalesce(token_hash, '')
    )
    from public.confirmacoes_sindico
    where manutencao_id = '1ab00000-0000-4000-8000-000000000070'
  ) is distinct from (select foto from regra13_confirmacao_antiga) then
    raise exception 'A confirmacao antiga foi reescrita';
  end if;
  if (select count(*) from public.confirmacoes_sindico where manutencao_id = '1ab00000-0000-4000-8000-0000000000a0') <> 0 then
    raise exception 'A manutencao visual nao deve nascer confirmada';
  end if;
  if not exists (
    select 1
    from public.links_confirmacao_sindico
    where manutencao_id = '1ab00000-0000-4000-8000-0000000000a0'
      and revogado_em is null
      and destinatario_papel = 'sindico'
      and destinatario_nome = 'Síndico Laboratório'
      and destinatario_id is null
      and sindico_destinatario_id = '1ab00000-0000-4000-8000-000000000020'
  ) then
    raise exception 'O link visual nao ficou vinculado ao sindico do laboratorio';
  end if;
  if exists (
    select 1
    from public.manutencoes
    where id = '1ab00000-0000-4000-8000-0000000000a0'
      and (
        pdf_url is distinct from lower(id::text) || '/comprovante.pdf'
        or comprovante_liberado_em is null
        or status <> 'realizada'
      )
  ) then
    raise exception 'A manutencao visual ficou sem comprovante liberado';
  end if;
end $$;

commit;

\pset tuples_only on
\pset format unaligned
\pset footer off
\o tmp/laboratorio-visual.json
select json_build_object(
  'visual', (select token from lab_tokens where papel = 'visual')
)::text;
\o

\pset tuples_only off
\pset format aligned
\pset footer on
select 'LAB_OK' as resultado,
  (select count(*) from public.manutencoes where condominio_id is distinct from '1ab00000-0000-4000-8000-000000000010') as existentes,
  (select count(*) from public.manutencoes) as total,
  (select count(*) from public.confirmacoes_sindico where manutencao_id = '1ab00000-0000-4000-8000-0000000000a0') as visual_confirmacoes,
  (select count(*) from public.confirmacoes_sindico where manutencao_id = '1ab00000-0000-4000-8000-000000000070') as antiga_confirmada,
  (select count(*) from public.links_confirmacao_sindico where manutencao_id = '1ab00000-0000-4000-8000-0000000000a0' and revogado_em is null) as link_visual,
  (select data_realizada from public.manutencoes where id = '1ab00000-0000-4000-8000-0000000000a0') as data_efetiva;
