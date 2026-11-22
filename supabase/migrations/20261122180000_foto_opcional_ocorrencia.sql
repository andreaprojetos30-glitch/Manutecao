-- A foto da ocorrência deixa de ser obrigatória.
-- Descrição e resolução continuam obrigatórias.
-- Nenhuma ocorrência já gravada é reescrita.

alter table public.ocorrencias
  alter column foto_url drop not null;

create or replace function public.antes_de_gravar_ocorrencia()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.resolvida_no_local is null
     or nullif(trim(new.descricao_original), '') is null then
    raise exception 'Ocorrência exige resolução e descrição';
  end if;

  new.descricao_original := trim(new.descricao_original);
  if nullif(trim(coalesce(new.foto_url, '')), '') is null then
    new.foto_url := null;
  else
    new.foto_url := trim(new.foto_url);
  end if;

  if not public.is_admin() then
    if tg_op = 'INSERT' then
      new.necessita_orcamento := false;
      new.orcamento_informado := false;
      new.necessita_retorno := false;
      new.classificacao_interna := null;
      new.descricao_padronizada := null;
      new.texto_para_sindico := null;
      new.enviar_para_sindico := false;
      new.observacoes_administrativas := null;
      new.providencia := null;
      new.solucao := null;
      new.status_ocorrencia := case
        when new.resolvida_no_local then 'resolvida'
        else 'aberta'
      end;
    else
      new.necessita_orcamento := old.necessita_orcamento;
      new.orcamento_informado := old.orcamento_informado;
      new.necessita_retorno := old.necessita_retorno;
      new.classificacao_interna := old.classificacao_interna;
      new.descricao_padronizada := old.descricao_padronizada;
      new.texto_para_sindico := old.texto_para_sindico;
      new.enviar_para_sindico := old.enviar_para_sindico;
      new.observacoes_administrativas := old.observacoes_administrativas;
      new.providencia := old.providencia;
      new.solucao := old.solucao;
      if new.resolvida_no_local is distinct from old.resolvida_no_local
         and old.status_ocorrencia in ('aberta', 'resolvida') then
        new.status_ocorrencia := case
          when new.resolvida_no_local then 'resolvida'
          else 'aberta'
        end;
      else
        new.status_ocorrencia := old.status_ocorrencia;
      end if;
    end if;
  end if;

  if new.resolvida_no_local then
    new.necessita_orcamento := false;
    new.orcamento_informado := false;
  end if;

  return new;
end;
$$;

create or replace function public.registrar_ocorrencia(
  p_item uuid,
  p_resolvida boolean,
  p_descricao text,
  p_foto text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  visita public.manutencoes%rowtype;
  nova uuid;
  status_inicial text;
begin
  if p_resolvida is null
     or nullif(trim(coalesce(p_descricao, '')), '') is null then
    raise exception 'Ocorrência exige resolução e descrição';
  end if;

  visita := public.visita_do_item(p_item);
  perform public.exigir_execucao(visita);
  perform set_config('app.executando', 'on', true);

  status_inicial := case when p_resolvida then 'resolvida' else 'aberta' end;

  update public.itens_manutencao
    set resultado = 'ocorrencia',
        registrado_por = auth.uid(),
        registrado_em = now()
    where id = p_item;

  insert into public.ocorrencias (
    item_manutencao_id,
    resolvida_no_local,
    descricao_original,
    foto_url,
    status_ocorrencia
  ) values (
    p_item,
    p_resolvida,
    trim(p_descricao),
    nullif(trim(coalesce(p_foto, '')), ''),
    status_inicial
  )
  on conflict (item_manutencao_id) do update
    set resolvida_no_local = excluded.resolvida_no_local,
        descricao_original = excluded.descricao_original,
        foto_url = excluded.foto_url,
        status_ocorrencia = excluded.status_ocorrencia
  returning id into nova;

  return nova;
end;
$$;
