-- O link confirmado deixa de abrir o comprovante. Os dados deste arquivo são desfeitos no final.

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

select public._exige(length('encerrarLinkAaabcdefghijklmnopqrstuvwxyzABC') = 43, 'token encerrado tem 43');
select public._exige(length('vizinhoEncerAaabcdefghijklmnopqrstuvwxyzABC') = 43, 'token vizinho tem 43');

select public._exige(
  position('vinculo_confirma_destinatario' in pg_get_functiondef('public.ler_link_confirmacao_sindico(text)'::regprocedure)) > 0
  and position('encerrada' in pg_get_functiondef('public.ler_link_confirmacao_sindico(text)'::regprocedure)) > 0
  and position('update public.manutencoes' in lower(pg_get_functiondef('public.ler_link_confirmacao_sindico(text)'::regprocedure))) = 0
  and position('update public.confirmacoes_sindico' in lower(pg_get_functiondef('public.ler_link_confirmacao_sindico(text)'::regprocedure))) = 0
  and position('whatsapp' in lower(pg_get_functiondef('public.ler_link_confirmacao_sindico(text)'::regprocedure))) = 0
  and position('wa.me' in lower(pg_get_functiondef('public.ler_link_confirmacao_sindico(text)'::regprocedure))) = 0,
  'encerrar o link preserva o destinatario e nao reescreve visita nem confirmacao'
);

insert into public.condominios (id, nome, endereco, bairro, cidade, estado) values
  ('d1111111-1111-4111-8111-111111111111', 'Condomínio Encerramento', 'Rua F', 'Centro', 'Campinas', 'SP');

insert into public.sindicos (id, condominio_id, nome, whatsapp, data_inicio, ativo) values
  ('d3111111-1111-4111-8111-111111111111', 'd1111111-1111-4111-8111-111111111111', 'Síndico Encerrado', '19922222222', date '2026-01-01', true);

insert into public.manutencoes (
  id, condominio_id, data_programada_original, data_programada_atual, prestador_id, tipo, origem
) values
  ('d6111111-1111-4111-8111-111111111111', 'd1111111-1111-4111-8111-111111111111', date '2026-10-26', date '2026-10-26', '00000000-0000-4000-8000-000000000030', 'avulsa', 'manual'),
  ('d7111111-1111-4111-8111-111111111111', 'd1111111-1111-4111-8111-111111111111', date '2026-10-27', date '2026-10-27', '00000000-0000-4000-8000-000000000030', 'avulsa', 'manual');

insert into public.itens_manutencao (id, manutencao_id, equipamento_matriz_id, nome_identificacao) values
  ('d6111111-1111-4111-8111-111111111171', 'd6111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000040', 'Equipamento'),
  ('d7111111-1111-4111-8111-111111111171', 'd7111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000040', 'Equipamento');

select public._liberar_teste('d6111111-1111-4111-8111-111111111111', 'd6111111-1111-4111-8111-111111111171');
select public._liberar_teste('d7111111-1111-4111-8111-111111111111', 'd7111111-1111-4111-8111-111111111171');

select public.emitir_link_confirmacao_sindico(
  'd6111111-1111-4111-8111-111111111111',
  'encerrarLinkAaabcdefghijklmnopqrstuvwxyzABC',
  '00000000-0000-4000-8000-000000000001'
);
select public.emitir_link_confirmacao_sindico(
  'd7111111-1111-4111-8111-111111111111',
  'vizinhoEncerAaabcdefghijklmnopqrstuvwxyzABC',
  '00000000-0000-4000-8000-000000000001'
);

select public._exige(
  (public.ler_link_confirmacao_sindico('encerrarLinkAaabcdefghijklmnopqrstuvwxyzABC')->>'caminho_pdf')
    = 'd6111111-1111-4111-8111-111111111111/comprovante.pdf'
  and (public.ler_link_confirmacao_sindico('encerrarLinkAaabcdefghijklmnopqrstuvwxyzABC')->>'condominio') = 'Condomínio Encerramento'
  and (public.ler_link_confirmacao_sindico('encerrarLinkAaabcdefghijklmnopqrstuvwxyzABC')->>'situacao') is null
  and (public.ler_link_confirmacao_sindico('encerrarLinkAaabcdefghijklmnopqrstuvwxyzABC')->>'destinatario_papel') is null,
  'antes da confirmacao o comprovante continua visivel'
);

select public.registrar_confirmacao_sindico('encerrarLinkAaabcdefghijklmnopqrstuvwxyzABC');

select public._exige(
  (public.ler_link_confirmacao_sindico('encerrarLinkAaabcdefghijklmnopqrstuvwxyzABC')->>'situacao') = 'encerrada'
  and (public.ler_link_confirmacao_sindico('encerrarLinkAaabcdefghijklmnopqrstuvwxyzABC')->>'manutencao_id')
    = 'd6111111-1111-4111-8111-111111111111'
  and (
    select count(*)
    from jsonb_object_keys(public.ler_link_confirmacao_sindico('encerrarLinkAaabcdefghijklmnopqrstuvwxyzABC')) chave
    where chave not in ('situacao', 'manutencao_id')
  ) = 0
  and (
    select count(*)
    from jsonb_object_keys(public.ler_link_confirmacao_sindico('encerrarLinkAaabcdefghijklmnopqrstuvwxyzABC'))
  ) = 2,
  'depois da confirmacao o link original nao devolve o comprovante'
);

select public._exige(
  (public.ler_link_confirmacao_sindico('vizinhoEncerAaabcdefghijklmnopqrstuvwxyzABC')->>'caminho_pdf')
    = 'd7111111-1111-4111-8111-111111111111/comprovante.pdf'
  and (public.resumo_link_confirmacao_sindico('d6111111-1111-4111-8111-111111111111')->>'confirmado_em') is not null
  and (public.resumo_link_confirmacao_sindico('d6111111-1111-4111-8111-111111111111')->>'sindico_nome') = 'Síndico Encerrado'
  and (public.resumo_link_confirmacao_sindico('d6111111-1111-4111-8111-111111111111')->>'destinatario_papel') = 'sindico'
  and (select count(*) from public.confirmacoes_sindico where manutencao_id = 'd6111111-1111-4111-8111-111111111111') = 1
  and (select sindico_nome from public.confirmacoes_sindico where manutencao_id = 'd6111111-1111-4111-8111-111111111111') = 'Síndico Encerrado'
  and (select revogado_em is null from public.links_confirmacao_sindico where manutencao_id = 'd6111111-1111-4111-8111-111111111111'),
  'a confirmacao e o outro link permanecem'
);

select public._exige(
  (
    select count(*)
    from public.manutencoes m
    join foto_seed s on s.id = m.id
    where md5(to_jsonb(m.*)::text) is distinct from s.foto
  ) = 0,
  'as manutencoes anteriores permanecem'
);

rollback;
