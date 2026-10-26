-- Destinatário dos comprovantes. Os dados deste arquivo são desfeitos no final.

begin;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);

create temp table foto_seed as
select id, md5(to_jsonb(m.*)::text) as foto
from public.manutencoes m
where id in (
  '00000000-0000-4000-8000-000000000060',
  '00000000-0000-4000-8000-000000000061',
  '00000000-0000-4000-8000-000000000062',
  '00000000-0000-4000-8000-000000000063',
  '00000000-0000-4000-8000-000000000064',
  '00000000-0000-4000-8000-000000000065',
  '00000000-0000-4000-8000-000000000066'
);

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

select public._exige(
  position('whatsapp' in lower(pg_get_functiondef('public.ler_link_confirmacao_sindico(text)'::regprocedure))) = 0
  and position('whatsapp' in lower(pg_get_functiondef('public.resumo_link_confirmacao_sindico(uuid)'::regprocedure))) = 0
  and position('update public.manutencoes' in lower(pg_get_functiondef('public.definir_destinatario_comprovante(uuid, text, text, text, text, text, date)'::regprocedure))) = 0
  and position('update public.manutencoes' in lower(pg_get_functiondef('public.registrar_confirmacao_sindico(text)'::regprocedure))) = 0
  and position('wa.me' in lower(pg_get_functiondef('public.definir_destinatario_comprovante(uuid, text, text, text, text, text, date)'::regprocedure))) = 0,
  'o destinatario nao altera a visita, nao publica whatsapp e nao envia mensagem'
);

insert into public.condominios (id, nome, endereco, bairro, cidade, estado) values
  ('c1111111-1111-4111-8111-111111111111', 'Condomínio Destinatário', 'Rua D', 'Centro', 'Campinas', 'SP'),
  ('c2222222-2222-4222-8222-222222222222', 'Condomínio Vizinho', 'Rua E', 'Centro', 'Campinas', 'SP');

insert into public.sindicos (id, condominio_id, nome, whatsapp, data_inicio, ativo) values
  ('c3111111-1111-4111-8111-111111111111', 'c1111111-1111-4111-8111-111111111111', 'Síndico Um', '19911111111', date '2026-01-01', true),
  ('c5111111-1111-4111-8111-111111111111', 'c2222222-2222-4222-8222-222222222222', 'Síndico Vizinho', '19922222222', date '2026-01-01', true);

insert into public.manutencoes (
  id, condominio_id, data_programada_original, data_programada_atual, prestador_id, tipo, origem
) values
  ('c6111111-1111-4111-8111-111111111111', 'c1111111-1111-4111-8111-111111111111', date '2026-10-20', date '2026-10-20', '00000000-0000-4000-8000-000000000030', 'avulsa', 'manual'),
  ('c7111111-1111-4111-8111-111111111111', 'c1111111-1111-4111-8111-111111111111', date '2026-10-21', date '2026-10-21', '00000000-0000-4000-8000-000000000030', 'avulsa', 'manual'),
  ('c8111111-1111-4111-8111-111111111111', 'c2222222-2222-4222-8222-222222222222', date '2026-10-22', date '2026-10-22', '00000000-0000-4000-8000-000000000030', 'avulsa', 'manual'),
  ('c9111111-1111-4111-8111-111111111111', 'c1111111-1111-4111-8111-111111111111', date '2026-10-23', date '2026-10-23', '00000000-0000-4000-8000-000000000030', 'avulsa', 'manual');

insert into public.itens_manutencao (id, manutencao_id, equipamento_matriz_id, nome_identificacao) values
  ('c6111111-1111-4111-8111-111111111171', 'c6111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000040', 'Equipamento'),
  ('c7111111-1111-4111-8111-111111111171', 'c7111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000040', 'Equipamento'),
  ('c8111111-1111-4111-8111-111111111171', 'c8111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000040', 'Equipamento'),
  ('c9111111-1111-4111-8111-111111111171', 'c9111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000040', 'Equipamento');

select public._liberar_teste('c6111111-1111-4111-8111-111111111111', 'c6111111-1111-4111-8111-111111111171');
select public._liberar_teste('c7111111-1111-4111-8111-111111111111', 'c7111111-1111-4111-8111-111111111171');
select public._liberar_teste('c8111111-1111-4111-8111-111111111111', 'c8111111-1111-4111-8111-111111111171');
select public._liberar_teste('c9111111-1111-4111-8111-111111111111', 'c9111111-1111-4111-8111-111111111171');

select public._exige(
  (public.resolver_destinatario_confirmacao('c1111111-1111-4111-8111-111111111111')->>'origem') = 'sindico'
  and (public.resolver_destinatario_confirmacao('c1111111-1111-4111-8111-111111111111')->>'sindico_id') = 'c3111111-1111-4111-8111-111111111111'
  and (public.resolver_destinatario_confirmacao('c1111111-1111-4111-8111-111111111111')->>'nome') = 'Síndico Um',
  'sem indicacao, o destinatario e o sindico ativo'
);

select public.emitir_link_confirmacao_sindico(
  'c7111111-1111-4111-8111-111111111111',
  'confirmaJaFeitaabcdefghijklmnopqrstuvwxyzAB',
  '00000000-0000-4000-8000-000000000001'
);
select public.registrar_confirmacao_sindico('confirmaJaFeitaabcdefghijklmnopqrstuvwxyzAB');

select public._exige(
  (select sindico_id::text from public.confirmacoes_sindico where manutencao_id = 'c7111111-1111-4111-8111-111111111111') = 'c3111111-1111-4111-8111-111111111111'
  and (select destinatario_papel from public.confirmacoes_sindico where manutencao_id = 'c7111111-1111-4111-8111-111111111111') = 'sindico'
  and (select sindico_nome from public.confirmacoes_sindico where manutencao_id = 'c7111111-1111-4111-8111-111111111111') = 'Síndico Um',
  'a confirmacao grava o sindico autorizado na emissao'
);

select public.emitir_link_confirmacao_sindico(
  'c6111111-1111-4111-8111-111111111111',
  'destinoSindicoAaabcdefghijklmnopqrstuvwxyzA',
  '00000000-0000-4000-8000-000000000001'
);
select public.emitir_link_confirmacao_sindico(
  'c8111111-1111-4111-8111-111111111111',
  'vizinhoLinkAabcdefghijklmnopqrstuvwxyzABCDE',
  '00000000-0000-4000-8000-000000000001'
);

select public._exige(
  (select sindico_destinatario_id::text from public.links_confirmacao_sindico where manutencao_id = 'c6111111-1111-4111-8111-111111111111' and revogado_em is null) = 'c3111111-1111-4111-8111-111111111111'
  and (select destinatario_papel from public.links_confirmacao_sindico where manutencao_id = 'c6111111-1111-4111-8111-111111111111' and revogado_em is null) = 'sindico',
  'o link fica vinculado ao sindico da emissao'
);

select public.registrar_sindico(
  'c1111111-1111-4111-8111-111111111111',
  'Síndico Dois',
  '19933333333',
  null,
  date '2026-02-01'
);

select public._exige(
  (select revogado_em is not null from public.links_confirmacao_sindico where manutencao_id = 'c6111111-1111-4111-8111-111111111111' and sindico_destinatario_id = 'c3111111-1111-4111-8111-111111111111')
  and (select revogado_em is null from public.links_confirmacao_sindico where manutencao_id = 'c7111111-1111-4111-8111-111111111111')
  and (select revogado_em is null from public.links_confirmacao_sindico where manutencao_id = 'c8111111-1111-4111-8111-111111111111')
  and (select sindico_nome from public.confirmacoes_sindico where manutencao_id = 'c7111111-1111-4111-8111-111111111111') = 'Síndico Um'
  and public.ler_link_confirmacao_sindico('confirmaJaFeitaabcdefghijklmnopqrstuvwxyzAB') is not null
  and public.ler_link_confirmacao_sindico('destinoSindicoAaabcdefghijklmnopqrstuvwxyzA') is null
  and (select count(*) from public.confirmacoes_sindico where manutencao_id = 'c6111111-1111-4111-8111-111111111111') = 0,
  'trocar o sindico destinatario revoga so o link pendente daquele condominio'
);

select public._teste_recusa(
  $$select public.registrar_confirmacao_sindico('destinoSindicoAaabcdefghijklmnopqrstuvwxyzA')$$,
  'revogado'
);

select public.emitir_link_confirmacao_sindico(
  'c6111111-1111-4111-8111-111111111111',
  'destinoSindicoBbabcdefghijklmnopqrstuvwxyzA',
  '00000000-0000-4000-8000-000000000001'
);

alter table public.sindicos disable trigger sindicos_invalidar_links_do_destinatario;
update public.sindicos
  set ativo = false, data_fim = date '2026-03-01'
  where condominio_id = 'c1111111-1111-4111-8111-111111111111' and ativo;
insert into public.sindicos (id, condominio_id, nome, whatsapp, data_inicio, ativo) values
  ('c4111111-1111-4111-8111-111111111111', 'c1111111-1111-4111-8111-111111111111', 'Síndico Três', '19944444444', date '2026-03-02', true);
alter table public.sindicos enable trigger sindicos_invalidar_links_do_destinatario;

select public._exige(
  (select revogado_em is null from public.links_confirmacao_sindico where manutencao_id = 'c6111111-1111-4111-8111-111111111111' and destinatario_nome = 'Síndico Dois')
  and public.ler_link_confirmacao_sindico('destinoSindicoBbabcdefghijklmnopqrstuvwxyzA') is null
  and (select count(*) from public.confirmacoes_sindico where manutencao_id = 'c6111111-1111-4111-8111-111111111111') = 0
  and (select sindico_nome from public.confirmacoes_sindico where manutencao_id = 'c7111111-1111-4111-8111-111111111111') = 'Síndico Um',
  'sem a revogacao, o link antigo nao confirma em nome do sindico novo'
);
select public._teste_recusa(
  $$select public.registrar_confirmacao_sindico('destinoSindicoBbabcdefghijklmnopqrstuvwxyzA')$$,
  'não pertence mais ao responsável autorizado'
);

select public.registrar_confirmacao_sindico('vizinhoLinkAabcdefghijklmnopqrstuvwxyzABCDE');
select public._exige(
  (select sindico_nome from public.confirmacoes_sindico where manutencao_id = 'c8111111-1111-4111-8111-111111111111') = 'Síndico Vizinho',
  'o condominio vizinho confirma com o proprio sindico'
);

select public.definir_destinatario_comprovante(
  'c1111111-1111-4111-8111-111111111111',
  'gerente',
  'Gerente Ana',
  '19955555555',
  null,
  null,
  date '2026-04-01'
);

select public._exige(
  (select papel from public.destinatarios_comprovante where condominio_id = 'c1111111-1111-4111-8111-111111111111' and ativo) = 'gerente'
  and (select nome from public.sindicos where condominio_id = 'c1111111-1111-4111-8111-111111111111' and ativo) = 'Síndico Três'
  and (select count(*) from public.destinatarios_comprovante where condominio_id = 'c1111111-1111-4111-8111-111111111111' and ativo) = 1,
  'o gerente indicado nao substitui o sindico ativo'
);

select public.emitir_link_confirmacao_sindico(
  'c9111111-1111-4111-8111-111111111111',
  'destinoGerenteAaabcdefghijklmnopqrstuvwxyzA',
  '00000000-0000-4000-8000-000000000001'
);

alter table public.sindicos disable trigger sindicos_invalidar_links_do_destinatario;
update public.sindicos
  set ativo = false, data_fim = date '2026-05-01'
  where id = 'c4111111-1111-4111-8111-111111111111';
insert into public.sindicos (id, condominio_id, nome, whatsapp, data_inicio, ativo) values
  ('c6111111-1111-4111-8111-111111111112', 'c1111111-1111-4111-8111-111111111111', 'Síndico Quatro', '19966666666', date '2026-05-02', true);
alter table public.sindicos enable trigger sindicos_invalidar_links_do_destinatario;

select public._exige(
  (select revogado_em is null from public.links_confirmacao_sindico where manutencao_id = 'c9111111-1111-4111-8111-111111111111')
  and public.ler_link_confirmacao_sindico('destinoGerenteAaabcdefghijklmnopqrstuvwxyzA') is not null,
  'trocar o sindico nao invalida o link do gerente'
);

update public.destinatarios_comprovante
  set ativo = false, data_fim = date '2026-04-01'
  where condominio_id = 'c1111111-1111-4111-8111-111111111111' and ativo;
insert into public.destinatarios_comprovante (
  id, condominio_id, papel, nome, whatsapp, data_inicio, ativo
) values (
  'c9111111-1111-4111-8111-111111111191',
  'c1111111-1111-4111-8111-111111111111',
  'conselheiro',
  'Conselheiro Bia',
  '19977777777',
  date '2026-04-02',
  true
);

select public._exige(
  public.ler_link_confirmacao_sindico('destinoGerenteAaabcdefghijklmnopqrstuvwxyzA') is null
  and (select count(*) from public.confirmacoes_sindico where manutencao_id = 'c9111111-1111-4111-8111-111111111111') = 0,
  'o link do gerente anterior nao abre para o conselheiro novo'
);
select public._teste_recusa(
  $$select public.registrar_confirmacao_sindico('destinoGerenteAaabcdefghijklmnopqrstuvwxyzA')$$,
  'não pertence mais ao responsável autorizado'
);

select public.emitir_link_confirmacao_sindico(
  'c9111111-1111-4111-8111-111111111111',
  'destinoConselhoAabcdefghijklmnopqrstuvwxyzA',
  '00000000-0000-4000-8000-000000000001'
);
select public.registrar_confirmacao_sindico('destinoConselhoAabcdefghijklmnopqrstuvwxyzA');
select public._exige(
  (select destinatario_papel from public.confirmacoes_sindico where manutencao_id = 'c9111111-1111-4111-8111-111111111111') = 'conselheiro'
  and (select destinatario_nome from public.confirmacoes_sindico where manutencao_id = 'c9111111-1111-4111-8111-111111111111') = 'Conselheiro Bia'
  and (select sindico_id is null from public.confirmacoes_sindico where manutencao_id = 'c9111111-1111-4111-8111-111111111111')
  and (select sindico_nome from public.confirmacoes_sindico where manutencao_id = 'c7111111-1111-4111-8111-111111111111') = 'Síndico Um',
  'a confirmacao do conselheiro nao reescreve a confirmacao antiga'
);

insert into public.links_confirmacao_sindico (
  manutencao_id, token_hash, emitido_por
) values (
  'c6111111-1111-4111-8111-111111111111',
  public.hash_token_confirmacao('linkLegadoAntigoAabcdefghijklmnopqrstuvwxyz'),
  '00000000-0000-4000-8000-000000000001'
);
select public._teste_recusa(
  $$select public.registrar_confirmacao_sindico('linkLegadoAntigoAabcdefghijklmnopqrstuvwxyz')$$,
  'precisa ser gerado de novo'
);

select public._teste_recusa(
  $$select public.definir_destinatario_comprovante(
    'c2222222-2222-4222-8222-222222222222', 'gerente', 'Sem Telefone', ' ', null, null, date '2026-04-01'
  )$$,
  'WhatsApp'
);
select public._teste_recusa(
  $$select public.definir_destinatario_comprovante(
    'c2222222-2222-4222-8222-222222222222', 'outro', 'Porteiro', '19988888888', null, ' ', date '2026-04-01'
  )$$,
  'qual é o responsável'
);

select public._exige(
  not exists (
    select 1
    from foto_seed anterior
    join public.manutencoes atual on atual.id = anterior.id
    where md5(to_jsonb(atual.*)::text) is distinct from anterior.foto
  ),
  'as manutencoes anteriores permanecem iguais'
);

set local role anon;
select public._teste_recusa(
  $$select * from public.destinatarios_comprovante$$,
  '42501'
);
reset role;

rollback;
