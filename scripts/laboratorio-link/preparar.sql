-- Laboratório local da confirmação do síndico.
-- Só grava no PostgreSQL 127.0.0.1:5432/eleva_manutencao_teste.
-- Cria registros fictícios e não altera as manutenções já existentes.

\set ON_ERROR_STOP on
\set HISTFILE
\pset pager off

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
end $$;

create temp table lab_existentes as
select id, md5(to_jsonb(m.*)::text) as foto
from public.manutencoes m;

do $$
begin
  if (select count(*) from lab_existentes) <> 7 then
    raise exception 'O laboratorio exige exatamente sete manutencoes existentes';
  end if;
  if exists (
    select 1
    from lab_existentes
    where id in (
      '1ab00000-0000-4000-8000-000000000070',
      '1ab00000-0000-4000-8000-000000000080',
      '1ab00000-0000-4000-8000-000000000090'
    )
  ) then
    raise exception 'Identificador de laboratorio colide com manutencao existente';
  end if;
  if exists (
    select 1 from public.condominios where id = '1ab00000-0000-4000-8000-000000000010'
  ) then
    raise exception 'O laboratorio ja esta preparado';
  end if;
end $$;

create temp table lab_auditoria_antes as
select id
from public.auditoria
where registro_id in (select id from lab_existentes);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('1ab00000-0000-4000-8000-000000000001', 'adm.laboratorio@eleva.teste', '{"perfil":"admin"}', '{"nome":"ADM Laboratório"}'),
  ('1ab00000-0000-4000-8000-000000000002', 'prestador.laboratorio@eleva.teste', '{"perfil":"prestador"}', '{"nome":"Prestador Laboratório"}');

insert into public.usuarios (id, nome, email, perfil) values
  ('1ab00000-0000-4000-8000-000000000001', 'ADM Laboratório', 'adm.laboratorio@eleva.teste', 'admin'),
  ('1ab00000-0000-4000-8000-000000000002', 'Prestador Laboratório', 'prestador.laboratorio@eleva.teste', 'prestador');

insert into public.condominios (id, nome, endereco, bairro, cidade, estado, observacoes) values
  (
    '1ab00000-0000-4000-8000-000000000010',
    'Condomínio Laboratório ELEVA',
    'Rua do Laboratório',
    'Centro',
    'Campinas',
    'SP',
    'Registro fictício do laboratório local. Não é um condomínio atendido.'
  );

insert into public.sindicos (id, condominio_id, nome, whatsapp, ativo) values
  (
    '1ab00000-0000-4000-8000-000000000020',
    '1ab00000-0000-4000-8000-000000000010',
    'Síndico Laboratório',
    '19900000000',
    true
  );

insert into public.prestadores (id, usuario_id, nome, whatsapp, observacoes) values
  (
    '1ab00000-0000-4000-8000-000000000030',
    '1ab00000-0000-4000-8000-000000000002',
    'Prestador Laboratório',
    '19900000000',
    'Registro fictício do laboratório local.'
  );

insert into public.equipamentos_matriz (id, nome, categoria, observacoes) values
  (
    '1ab00000-0000-4000-8000-000000000040',
    'Equipamento Laboratório',
    'Teste',
    'Registro fictício do laboratório local.'
  );

insert into public.manutencoes (
  id, condominio_id, data_programada_original, data_programada_atual, prestador_id, tipo, origem, observacoes_administrativas
) values
  ('1ab00000-0000-4000-8000-000000000070', '1ab00000-0000-4000-8000-000000000010', date '2026-10-20', date '2026-10-20', '1ab00000-0000-4000-8000-000000000030', 'avulsa', 'manual', 'Laboratório local — link ativo'),
  ('1ab00000-0000-4000-8000-000000000080', '1ab00000-0000-4000-8000-000000000010', date '2026-10-21', date '2026-10-21', '1ab00000-0000-4000-8000-000000000030', 'avulsa', 'manual', 'Laboratório local — link revogado'),
  ('1ab00000-0000-4000-8000-000000000090', '1ab00000-0000-4000-8000-000000000010', date '2026-10-22', date '2026-10-22', '1ab00000-0000-4000-8000-000000000030', 'avulsa', 'manual', 'Laboratório local — prova técnica');

insert into public.itens_manutencao (id, manutencao_id, equipamento_matriz_id, nome_identificacao) values
  ('1ab00000-0000-4000-8000-000000000071', '1ab00000-0000-4000-8000-000000000070', '1ab00000-0000-4000-8000-000000000040', 'Equipamento Laboratório'),
  ('1ab00000-0000-4000-8000-000000000081', '1ab00000-0000-4000-8000-000000000080', '1ab00000-0000-4000-8000-000000000040', 'Equipamento Laboratório'),
  ('1ab00000-0000-4000-8000-000000000091', '1ab00000-0000-4000-8000-000000000090', '1ab00000-0000-4000-8000-000000000040', 'Equipamento Laboratório');

select set_config('request.jwt.claim.sub', '1ab00000-0000-4000-8000-000000000001', true);

select public.registrar_ok('1ab00000-0000-4000-8000-000000000071');
select public.finalizar_manutencao('1ab00000-0000-4000-8000-000000000070');
select public.registrar_comprovante(
  '1ab00000-0000-4000-8000-000000000070',
  '1ab00000-0000-4000-8000-000000000070/comprovante.pdf',
  false
);

select public.registrar_ok('1ab00000-0000-4000-8000-000000000081');
select public.finalizar_manutencao('1ab00000-0000-4000-8000-000000000080');
select public.registrar_comprovante(
  '1ab00000-0000-4000-8000-000000000080',
  '1ab00000-0000-4000-8000-000000000080/comprovante.pdf',
  false
);

select public.registrar_ok('1ab00000-0000-4000-8000-000000000091');
select public.finalizar_manutencao('1ab00000-0000-4000-8000-000000000090');
select public.registrar_comprovante(
  '1ab00000-0000-4000-8000-000000000090',
  '1ab00000-0000-4000-8000-000000000090/comprovante.pdf',
  false
);

create temp table lab_tokens (
  papel text primary key,
  token text not null
);

insert into lab_tokens (papel, token)
select papel, rtrim(translate(encode(gen_random_bytes(32), 'base64'), '+/', '-_'), '=')
from (values ('ativo'), ('revogado'), ('tecnico')) as papeis(papel);

do $$
begin
  if exists (select 1 from lab_tokens where token !~ '^[A-Za-z0-9_-]{43}$') then
    raise exception 'Token de laboratorio invalido';
  end if;
  if (select count(distinct token) from lab_tokens) <> 3 then
    raise exception 'Tokens de laboratorio repetidos';
  end if;
end $$;

select public.emitir_link_confirmacao_sindico(
  '1ab00000-0000-4000-8000-000000000070',
  (select token from lab_tokens where papel = 'ativo'),
  '1ab00000-0000-4000-8000-000000000001'
);

select public.emitir_link_confirmacao_sindico(
  '1ab00000-0000-4000-8000-000000000080',
  (select token from lab_tokens where papel = 'revogado'),
  '1ab00000-0000-4000-8000-000000000001'
);

select public.revogar_link_confirmacao_sindico(
  '1ab00000-0000-4000-8000-000000000080',
  '1ab00000-0000-4000-8000-000000000001'
);

select public.emitir_link_confirmacao_sindico(
  '1ab00000-0000-4000-8000-000000000090',
  (select token from lab_tokens where papel = 'tecnico'),
  '1ab00000-0000-4000-8000-000000000001'
);

do $$
begin
  if exists (
    select 1
    from lab_existentes anterior
    join public.manutencoes atual on atual.id = anterior.id
    where md5(to_jsonb(atual.*)::text) is distinct from anterior.foto
  ) then
    raise exception 'Manutencao existente foi alterada';
  end if;
  if exists (
    select 1
    from public.auditoria
    where registro_id in (select id from lab_existentes)
      and id not in (select id from lab_auditoria_antes)
  ) then
    raise exception 'Auditoria de manutencao existente foi gravada';
  end if;
  if exists (
    select 1
    from public.manutencoes
    where id in (
      '1ab00000-0000-4000-8000-000000000070',
      '1ab00000-0000-4000-8000-000000000080',
      '1ab00000-0000-4000-8000-000000000090'
    )
      and (
        pdf_url is distinct from lower(id::text) || '/comprovante.pdf'
        or position('://' in coalesce(pdf_url, '')) > 0
        or comprovante_liberado_em is null
      )
  ) then
    raise exception 'Comprovante ficticio ficou com caminho invalido';
  end if;
  if (select count(*) from public.confirmacoes_sindico where manutencao_id in (
    '1ab00000-0000-4000-8000-000000000070',
    '1ab00000-0000-4000-8000-000000000080',
    '1ab00000-0000-4000-8000-000000000090'
  )) <> 0 then
    raise exception 'O laboratorio nao deve nascer confirmado';
  end if;
end $$;

\pset tuples_only on
\pset format unaligned
\pset footer off
\o tmp/laboratorio-link.json
select json_build_object(
  'ativo', (select token from lab_tokens where papel = 'ativo'),
  'revogado', (select token from lab_tokens where papel = 'revogado'),
  'tecnico', (select token from lab_tokens where papel = 'tecnico')
)::text;
\o

select 'LAB_OK' as resultado,
  (select count(*) from lab_existentes) as existentes,
  (select count(*) from public.manutencoes) as total,
  (select count(*) from public.links_confirmacao_sindico where manutencao_id = '1ab00000-0000-4000-8000-000000000070' and revogado_em is null) as link_ativo,
  (select count(*) from public.links_confirmacao_sindico where manutencao_id = '1ab00000-0000-4000-8000-000000000080' and revogado_em is null) as link_revogado_ainda_ativo;

commit;
