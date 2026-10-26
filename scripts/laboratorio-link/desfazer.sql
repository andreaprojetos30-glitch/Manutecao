-- Remove somente os registros fictícios do laboratório local.
-- Recusa outro banco. Não mexe nas manutenções que já existiam.

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
from public.manutencoes m
where id not in (
  '1ab00000-0000-4000-8000-000000000070',
  '1ab00000-0000-4000-8000-000000000080',
  '1ab00000-0000-4000-8000-000000000090'
);

do $$
begin
  if (select count(*) from lab_existentes) <> 7 then
    raise exception 'Ha manutencoes fora do conjunto esperado. Nada foi apagado';
  end if;
end $$;

alter table public.links_confirmacao_sindico disable trigger links_confirmacao_sindico_imutavel;
alter table public.confirmacoes_sindico disable trigger confirmacoes_sindico_imutavel;
alter table public.manutencoes disable trigger manutencoes_excluir;

delete from public.historico_ocorrencias
where ocorrencia_id in (
  select o.id
  from public.ocorrencias o
  join public.itens_manutencao i on i.id = o.item_manutencao_id
  where i.manutencao_id in (
    '1ab00000-0000-4000-8000-000000000070',
    '1ab00000-0000-4000-8000-000000000080',
    '1ab00000-0000-4000-8000-000000000090'
  )
);

delete from public.confirmacoes_sindico
where manutencao_id in (
  '1ab00000-0000-4000-8000-000000000070',
  '1ab00000-0000-4000-8000-000000000080',
  '1ab00000-0000-4000-8000-000000000090'
);

delete from public.links_confirmacao_sindico
where manutencao_id in (
  '1ab00000-0000-4000-8000-000000000070',
  '1ab00000-0000-4000-8000-000000000080',
  '1ab00000-0000-4000-8000-000000000090'
);

delete from public.ocorrencias
where item_manutencao_id in (
  '1ab00000-0000-4000-8000-000000000071',
  '1ab00000-0000-4000-8000-000000000081',
  '1ab00000-0000-4000-8000-000000000091'
);

delete from public.itens_manutencao
where id in (
  '1ab00000-0000-4000-8000-000000000071',
  '1ab00000-0000-4000-8000-000000000081',
  '1ab00000-0000-4000-8000-000000000091'
);

delete from public.auditoria
where registro_id in (
  '1ab00000-0000-4000-8000-000000000001',
  '1ab00000-0000-4000-8000-000000000002',
  '1ab00000-0000-4000-8000-000000000010',
  '1ab00000-0000-4000-8000-000000000020',
  '1ab00000-0000-4000-8000-000000000030',
  '1ab00000-0000-4000-8000-000000000040',
  '1ab00000-0000-4000-8000-000000000070',
  '1ab00000-0000-4000-8000-000000000071',
  '1ab00000-0000-4000-8000-000000000080',
  '1ab00000-0000-4000-8000-000000000081',
  '1ab00000-0000-4000-8000-000000000090',
  '1ab00000-0000-4000-8000-000000000091'
);

delete from public.manutencoes
where id in (
  '1ab00000-0000-4000-8000-000000000070',
  '1ab00000-0000-4000-8000-000000000080',
  '1ab00000-0000-4000-8000-000000000090'
);

delete from public.equipamentos_matriz
where id = '1ab00000-0000-4000-8000-000000000040';

delete from public.prestadores
where id = '1ab00000-0000-4000-8000-000000000030';

delete from public.sindicos
where id = '1ab00000-0000-4000-8000-000000000020';

delete from public.condominios
where id = '1ab00000-0000-4000-8000-000000000010';

delete from public.usuarios
where id in (
  '1ab00000-0000-4000-8000-000000000001',
  '1ab00000-0000-4000-8000-000000000002'
);

delete from auth.users
where id in (
  '1ab00000-0000-4000-8000-000000000001',
  '1ab00000-0000-4000-8000-000000000002'
);

alter table public.manutencoes enable trigger manutencoes_excluir;
alter table public.confirmacoes_sindico enable trigger confirmacoes_sindico_imutavel;
alter table public.links_confirmacao_sindico enable trigger links_confirmacao_sindico_imutavel;

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
  if (select count(*) from public.manutencoes) <> 7 then
    raise exception 'A limpeza nao voltou para as sete manutencoes';
  end if;
  if exists (
    select 1 from public.condominios where id = '1ab00000-0000-4000-8000-000000000010'
  ) then
    raise exception 'O condominio ficticio permaneceu';
  end if;
  if exists (
    select 1
    from pg_trigger
    where tgname in (
      'links_confirmacao_sindico_imutavel',
      'confirmacoes_sindico_imutavel',
      'manutencoes_excluir'
    )
      and tgenabled = 'D'
  ) then
    raise exception 'Gatilho de protecao ficou desligado';
  end if;
end $$;

select 'LAB_LIMPO' as resultado,
  (select count(*) from public.manutencoes) as manutencoes,
  (select count(*) from public.links_confirmacao_sindico) as links,
  (select count(*) from public.confirmacoes_sindico) as confirmacoes;

commit;
