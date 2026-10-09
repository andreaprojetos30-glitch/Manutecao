-- ELEVA Manutenção — Fase 3
-- Exclui só manutenção avulsa ainda programada, sem execução nem ocorrência.
-- Preventiva de contrato e visita já iniciada permanecem.
-- A exclusão fica na auditoria, com responsável, momento e identificação.

create or replace function public.antes_de_excluir_visita()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_condominio text;
  v_prestador text;
  v_equipamentos text[];
begin
  if not public.is_admin() then
    raise exception 'Somente o ADM pode excluir uma manutenção avulsa';
  end if;

  if old.tipo = 'preventiva' then
    raise exception 'Manutenção preventiva do contrato não pode ser excluída';
  end if;

  if old.tipo <> 'avulsa' or old.contrato_id is not null or old.numero_visita is not null then
    raise exception 'Somente manutenção avulsa programada pode ser excluída';
  end if;

  if old.status in ('em_execucao', 'realizada', 'aguardando_administracao') then
    raise exception 'Manutenção já iniciada não pode ser excluída';
  end if;

  if old.status <> 'programada' then
    raise exception 'Somente manutenção avulsa programada pode ser excluída';
  end if;

  if old.data_realizada is not null
     or old.finalizada_em is not null
     or nullif(trim(coalesce(old.pdf_url, '')), '') is not null
     or exists (
       select 1
       from public.itens_manutencao i
       where i.manutencao_id = old.id
         and (
           i.resultado <> 'pendente'
           or i.registrado_em is not null
           or i.registrado_por is not null
         )
     )
     or exists (
       select 1
       from public.ocorrencias o
       join public.itens_manutencao i on i.id = o.item_manutencao_id
       where i.manutencao_id = old.id
     ) then
    raise exception 'Manutenção com execução ou ocorrência não pode ser excluída';
  end if;

  select nome into v_condominio
  from public.condominios
  where id = old.condominio_id;

  select nome into v_prestador
  from public.prestadores
  where id = old.prestador_id;

  select coalesce(array_agg(i.nome_identificacao order by i.nome_identificacao), '{}')
    into v_equipamentos
  from public.itens_manutencao i
  where i.manutencao_id = old.id;

  insert into public.auditoria (tabela, registro_id, acao, ator_id, detalhe)
  values (
    'manutencoes',
    old.id,
    'exclusao',
    auth.uid(),
    jsonb_build_object(
      'identificacao', 'Manutenção Avulsa ' || to_char(old.data_programada_atual, 'DD/MM/YYYY'),
      'condominio', v_condominio,
      'prestador', v_prestador,
      'data', old.data_programada_atual,
      'data_original', old.data_programada_original,
      'status', old.status,
      'equipamentos', to_jsonb(v_equipamentos)
    )
  );

  delete from public.historico_reagendamentos where manutencao_id = old.id;
  delete from public.itens_manutencao where manutencao_id = old.id;

  return old;
end;
$$;

create trigger manutencoes_excluir
  before delete on public.manutencoes
  for each row
  execute function public.antes_de_excluir_visita();

create or replace function public.excluir_manutencao_avulsa(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Somente o ADM pode excluir uma manutenção avulsa';
  end if;

  select id into v_id
  from public.manutencoes
  where id = p_id
  for update;

  if not found then
    raise exception 'Visita não encontrada';
  end if;

  delete from public.manutencoes where id = p_id;
end;
$$;

revoke all on function public.excluir_manutencao_avulsa(uuid) from public, anon;
grant execute on function public.excluir_manutencao_avulsa(uuid) to authenticated;
