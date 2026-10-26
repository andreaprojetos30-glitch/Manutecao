-- Manutenção fictícia para conferir o envio pelo WhatsApp.
-- Só grava em 127.0.0.1:5432/eleva_manutencao_teste.
-- Não confirma, não registra envio e não altera as manutenções já existentes.

\set ON_ERROR_STOP on
\set HISTFILE
\pset pager off

begin;

do $$
begin
  if current_database() is distinct from 'eleva_manutencao_teste' then
    raise exception 'Banco recusado';
  end if;
  if inet_server_addr() is distinct from '127.0.0.1'::inet then
    raise exception 'Servidor recusado';
  end if;
  if inet_server_port() is distinct from 5432 then
    raise exception 'Porta recusada';
  end if;
  if to_regclass('public.links_confirmacao_cifrado') is null then
    raise exception 'A migracao do WhatsApp ainda nao foi aplicada';
  end if;
end $$;

create temp table lab_antes as
select id, md5(to_jsonb(m.*)::text) as foto
from public.manutencoes m
where id <> '1ab00000-0000-4000-8000-0000000000c0';

create temp table lab_auditoria_antes as
select id
from public.auditoria
where registro_id in (select id from lab_antes);

do $$
begin
  if (select count(*) from lab_antes where id::text not like '1ab00000-%') <> 7 then
    raise exception 'As sete manutencoes anteriores nao foram encontradas';
  end if;
end $$;

insert into public.condominios (id, nome, endereco, bairro, cidade, estado, observacoes)
select
  '1ab00000-0000-4000-8000-000000000011',
  'Condomínio WhatsApp Laboratório',
  'Rua da Conferência',
  'Centro',
  'Campinas',
  'SP',
  'Registro fictício do laboratório local. Não é um condomínio atendido.'
where not exists (
  select 1 from public.condominios where id = '1ab00000-0000-4000-8000-000000000011'
);

insert into public.sindicos (id, condominio_id, nome, whatsapp, ativo)
select
  '1ab00000-0000-4000-8000-000000000021',
  '1ab00000-0000-4000-8000-000000000011',
  'Síndico WhatsApp Laboratório',
  '19911110000',
  true
where not exists (
  select 1 from public.sindicos where id = '1ab00000-0000-4000-8000-000000000021'
);

insert into public.manutencoes (
  id, condominio_id, data_programada_original, data_programada_atual, prestador_id, tipo, origem, observacoes_administrativas
)
select
  '1ab00000-0000-4000-8000-0000000000c0',
  '1ab00000-0000-4000-8000-000000000011',
  date '2026-10-26',
  date '2026-10-26',
  '1ab00000-0000-4000-8000-000000000030',
  'avulsa',
  'manual',
  'Laboratório local — conferência do WhatsApp'
where not exists (
  select 1 from public.manutencoes where id = '1ab00000-0000-4000-8000-0000000000c0'
);

insert into public.itens_manutencao (id, manutencao_id, equipamento_matriz_id, nome_identificacao)
select
  '1ab00000-0000-4000-8000-0000000000c1',
  '1ab00000-0000-4000-8000-0000000000c0',
  '1ab00000-0000-4000-8000-000000000040',
  'Equipamento Laboratório'
where not exists (
  select 1 from public.itens_manutencao where id = '1ab00000-0000-4000-8000-0000000000c1'
);

select set_config('request.jwt.claim.sub', '1ab00000-0000-4000-8000-000000000001', true);

do $$
declare
  situacao text;
  caminho text;
begin
  select status into situacao
  from public.manutencoes
  where id = '1ab00000-0000-4000-8000-0000000000c0';

  caminho := '1ab00000-0000-4000-8000-0000000000c0/comprovante.pdf';

  if situacao = 'programada' then
    perform public.registrar_ok('1ab00000-0000-4000-8000-0000000000c1');
    if public.finalizar_manutencao('1ab00000-0000-4000-8000-0000000000c0') is null then
      raise exception 'A finalizacao ficticia falhou';
    end if;
    perform public.registrar_comprovante(
      '1ab00000-0000-4000-8000-0000000000c0',
      caminho,
      false
    );
  elsif situacao = 'realizada' and exists (
    select 1 from public.manutencoes
    where id = '1ab00000-0000-4000-8000-0000000000c0'
      and pdf_url is null
  ) then
    perform public.registrar_comprovante(
      '1ab00000-0000-4000-8000-0000000000c0',
      caminho,
      false
    );
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from lab_antes anterior
    join public.manutencoes atual on atual.id = anterior.id
    where md5(to_jsonb(atual.*)::text) is distinct from anterior.foto
  ) then
    raise exception 'Manutencao existente foi alterada';
  end if;
  if exists (
    select 1
    from public.auditoria
    where registro_id in (select id from lab_antes)
      and id not in (select id from lab_auditoria_antes)
  ) then
    raise exception 'Auditoria de manutencao existente foi gravada';
  end if;
  if exists (
    select 1 from public.confirmacoes_sindico
    where manutencao_id = '1ab00000-0000-4000-8000-0000000000c0'
  ) then
    raise exception 'A manutencao de conferencia nao pode nascer confirmada';
  end if;
  if exists (
    select 1 from public.comunicacoes_comprovante
    where manutencao_id = '1ab00000-0000-4000-8000-0000000000c0'
  ) then
    raise exception 'A manutencao de conferencia nao pode nascer com envio';
  end if;
  if not exists (
    select 1 from public.manutencoes
    where id = '1ab00000-0000-4000-8000-0000000000c0'
      and status = 'realizada'
      and pdf_url = '1ab00000-0000-4000-8000-0000000000c0/comprovante.pdf'
      and comprovante_liberado_em is not null
      and registro_anterior = false
  ) then
    raise exception 'O comprovante ficticio nao ficou liberado';
  end if;
end $$;

commit;
