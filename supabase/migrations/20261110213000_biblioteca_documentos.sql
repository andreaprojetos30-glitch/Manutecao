-- ELEVA Manutenção — Fase 6, Bloco 3C, Etapa 1.
-- Leitura dos documentos já gravados, agrupados pelo condomínio.
-- Não cria comunicado, não gera PDF, não altera numeração e não mexe no marco.

create or replace function public.biblioteca_documentos_condominio(
  p_admin uuid,
  p_condominio_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  visitas jsonb;
  documentos jsonb;
begin
  perform public.exigir_adm_do_link(p_admin, 'Somente o ADM consulta os documentos do condomínio');

  if not exists (select 1 from public.condominios where id = p_condominio_id) then
    return null;
  end if;

  select coalesce(jsonb_agg(item.linha order by item.data_programada desc, item.id), '[]'::jsonb)
    into visitas
  from (
    select
      m.data_programada_atual as data_programada,
      m.id,
      jsonb_build_object(
        'id', m.id,
        'tipo', m.tipo,
        'numero_visita', m.numero_visita,
        'quantidade_visitas', contrato.quantidade_visitas,
        'data_programada', m.data_programada_atual,
        'data_efetiva', m.data_realizada,
        'status', m.status,
        'registro_anterior', m.registro_anterior
      ) as linha
    from public.manutencoes m
    left join public.contratos contrato on contrato.id = m.contrato_id
    where m.condominio_id = p_condominio_id
  ) item;

  select coalesce(jsonb_agg(item.linha order by item.data_efetiva desc, item.ordem, item.codigo), '[]'::jsonb)
    into documentos
  from (
    select
      m.data_realizada as data_efetiva,
      0 as ordem,
      '' as codigo,
      jsonb_build_object(
        'manutencao_id', m.id,
        'classe', 'comprovante',
        'codigo', null,
        'caminho', m.pdf_url
      ) as linha
    from public.manutencoes m
    where m.condominio_id = p_condominio_id
      and m.data_realizada is not null
      and m.pdf_url = lower(m.id::text) || '/comprovante.pdf'
      and position('://' in m.pdf_url) = 0
    union all
    select
      m.data_realizada,
      case when d.classe = 'declaracao' then 2 else 1 end,
      d.codigo,
      jsonb_build_object(
        'manutencao_id', d.manutencao_id,
        'classe', d.classe,
        'codigo', d.codigo,
        'caminho', d.caminho
      )
    from public.documentos_confirmacao d
    join public.manutencoes m on m.id = d.manutencao_id
    where m.condominio_id = p_condominio_id
      and m.data_realizada is not null
      and d.classe in ('confirmacao', 'declaracao')
      and d.caminho = lower(d.manutencao_id::text) || '/confirmacoes/' || d.codigo || '.pdf'
      and position('comprovante.pdf' in d.caminho) = 0
      and position('://' in d.caminho) = 0
  ) item;

  return jsonb_build_object('visitas', visitas, 'documentos', documentos);
end;
$$;

comment on function public.biblioteca_documentos_condominio(uuid, uuid) is
  'Consulta somente leitura da biblioteca do condomínio. Não grava documento nem altera o acompanhamento.';

revoke all on function public.biblioteca_documentos_condominio(uuid, uuid) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    revoke all on function public.biblioteca_documentos_condominio(uuid, uuid) from service_role;
    grant execute on function public.biblioteca_documentos_condominio(uuid, uuid) to service_role;
  end if;
end $$;
