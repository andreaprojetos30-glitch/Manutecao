BEGIN;

-- ELEVA Manutenção — numeração de contratos em andamento.
-- A quantidade anterior só reserva o número. Não cria ficha, data, checklist nem comprovante.
-- Programação já gerada só perde visitas iniciais ainda intactas, mediante confirmação.
-- Esta migration não altera registros existentes.

create or replace function public.visita_anterior_intacta(p_visita public.manutencoes)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_visita.id is not null
    and p_visita.tipo = 'preventiva'
    and p_visita.origem = 'automatica'
    and p_visita.status = 'programada'
    and p_visita.registro_anterior = false
    and p_visita.numero_visita is not null
    and p_visita.data_realizada is null
    and p_visita.finalizada_em is null
    and nullif(trim(coalesce(p_visita.pdf_url, '')), '') is null
    and p_visita.data_programada_atual = p_visita.data_programada_original
    and not exists (
      select 1
      from public.historico_reagendamentos h
      where h.manutencao_id = p_visita.id
    )
    and not exists (
      select 1
      from public.itens_manutencao i
      where i.manutencao_id = p_visita.id
        and (
          i.resultado <> 'pendente'
          or i.registrado_em is not null
          or i.registrado_por is not null
          or nullif(trim(coalesce(i.observacao, '')), '') is not null
        )
    )
    and not exists (
      select 1
      from public.ocorrencias o
      join public.itens_manutencao i on i.id = o.item_manutencao_id
      where i.manutencao_id = p_visita.id
    );
$$;

create or replace function public.validar_pedido_visitas_anteriores(
  p_total integer,
  p_anteriores integer,
  p_datas date[],
  p_confirmar boolean
) returns void
language plpgsql
set search_path = public
as $$
begin
  if p_anteriores is null or p_anteriores < 0 then
    raise exception 'Informe a quantidade de visitas anteriores';
  end if;

  if p_anteriores = 0 then
    return;
  end if;

  if p_confirmar is distinct from true then
    raise exception 'Confirme as visitas anteriores';
  end if;

  if p_anteriores > p_total then
    raise exception 'A quantidade de visitas anteriores passa do total do contrato';
  end if;

  if p_anteriores >= p_total then
    raise exception 'A próxima visita precisa permanecer na programação';
  end if;
end;
$$;

create or replace function public.gerar_programacao_contrato(
  p_contrato_id uuid,
  p_anteriores integer default 0,
  p_datas date[] default array[]::date[],
  p_confirmar boolean default false
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  contrato public.contratos%rowtype;
  i integer;
  data_visita date;
  criada integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Somente o ADM gera a programação';
  end if;

  select * into contrato
  from public.contratos
  where id = p_contrato_id
  for update;

  if not found then
    raise exception 'Contrato não encontrado';
  end if;

  if contrato.status <> 'ativo' then
    raise exception 'Só é possível gerar a programação de um contrato ativo';
  end if;

  if contrato.quantidade_visitas > 240 then
    raise exception 'A quantidade de visitas está alta demais para gerar de uma vez. Confira o número';
  end if;

  if exists (
    select 1
    from public.manutencoes
    where contrato_id = p_contrato_id
      and tipo = 'preventiva'
      and origem = 'automatica'
  ) then
    raise exception 'A programação deste contrato já foi gerada';
  end if;

  if not exists (
    select 1 from public.equipamentos_contrato where contrato_id = p_contrato_id and ativo
  ) then
    raise exception 'Adicione ao menos um equipamento antes de gerar a programação';
  end if;

  perform public.validar_pedido_visitas_anteriores(
    contrato.quantidade_visitas,
    coalesce(p_anteriores, 0),
    p_datas,
    p_confirmar
  );

  for i in coalesce(p_anteriores, 0) .. contrato.quantidade_visitas - 1 loop
    data_visita := public.data_visita_mensal(contrato.data_inicio_manutencao, i);
    insert into public.manutencoes (
      condominio_id,
      contrato_id,
      numero_visita,
      data_programada_original,
      data_programada_atual,
      prestador_id,
      tipo,
      origem,
      status
    ) values (
      contrato.condominio_id,
      contrato.id,
      i + 1,
      data_visita,
      data_visita,
      contrato.prestador_padrao_id,
      'preventiva',
      'automatica',
      'programada'
    );
    criada := criada + 1;
  end loop;

  insert into public.itens_manutencao (
    manutencao_id, equipamento_contrato_id, nome_identificacao, resultado
  )
  select
    m.id,
    ec.id,
    public.rotulo_unidade_contrato(em.nome, ec.nome_identificacao, ec.identificacao),
    'pendente'
  from public.manutencoes m
  join public.equipamentos_contrato ec
    on ec.contrato_id = m.contrato_id
   and ec.ativo
  join public.equipamentos_matriz em on em.id = ec.equipamento_matriz_id
  where m.contrato_id = p_contrato_id
    and m.tipo = 'preventiva'
    and m.origem = 'automatica'
    and m.status = 'programada'
    and m.registro_anterior = false
    and not exists (
      select 1
      from public.itens_manutencao i
      where i.manutencao_id = m.id
        and i.equipamento_contrato_id = ec.id
    );

  return criada;
end;
$$;

create or replace function public.registrar_visitas_anteriores(
  p_contrato_id uuid,
  p_anteriores integer,
  p_datas date[],
  p_confirmar boolean
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  contrato public.contratos%rowtype;
  visita public.manutencoes%rowtype;
  ids uuid[] := array[]::uuid[];
  i integer;
begin
  if not public.is_admin() then
    raise exception 'Somente o ADM registra visita anterior';
  end if;

  select * into contrato
  from public.contratos
  where id = p_contrato_id
  for update;

  if not found then
    raise exception 'Contrato não encontrado';
  end if;

  if not exists (
    select 1
    from public.manutencoes
    where contrato_id = p_contrato_id
      and tipo = 'preventiva'
      and origem = 'automatica'
  ) then
    raise exception 'A programação deste contrato ainda não foi gerada';
  end if;

  perform public.validar_pedido_visitas_anteriores(
    contrato.quantidade_visitas,
    coalesce(p_anteriores, 0),
    p_datas,
    p_confirmar
  );

  if coalesce(p_anteriores, 0) = 0 then
    raise exception 'Informe a quantidade de visitas anteriores';
  end if;

  for i in 1 .. p_anteriores loop
    select * into visita
    from public.manutencoes
    where contrato_id = p_contrato_id
      and numero_visita = i
      and tipo = 'preventiva'
      and origem = 'automatica'
    for update;

    if not found then
      raise exception 'Não é possível alterar visita já iniciada';
    end if;
    if not public.visita_anterior_intacta(visita) then
      raise exception 'Não é possível alterar visita já iniciada';
    end if;

    ids := ids || visita.id;
  end loop;

  perform set_config('app.retirar_visita_anterior', 'on', true);
  delete from public.manutencoes where id = any(ids);
  perform set_config('app.retirar_visita_anterior', 'off', true);

  return p_anteriores;
end;
$$;

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
    if current_setting('app.retirar_visita_anterior', true) = 'on' then
      raise exception 'Somente o ADM registra visita anterior';
    end if;
    raise exception 'Somente o ADM pode excluir uma manutenção avulsa';
  end if;

  if old.tipo = 'preventiva' then
    if current_setting('app.retirar_visita_anterior', true) is distinct from 'on' then
      raise exception 'Manutenção preventiva do contrato não pode ser excluída';
    end if;
    if not public.visita_anterior_intacta(old) then
      raise exception 'Não é possível alterar visita já iniciada';
    end if;

    insert into public.auditoria (tabela, registro_id, acao, ator_id, detalhe)
    values (
      'manutencoes',
      old.id,
      'exclusao',
      auth.uid(),
      jsonb_build_object(
        'motivo', 'visita anterior sem ficha',
        'numero_visita', old.numero_visita,
        'contrato_id', old.contrato_id,
        'data_programada', old.data_programada_original
      )
    );

    delete from public.historico_reagendamentos where manutencao_id = old.id;
    delete from public.itens_manutencao where manutencao_id = old.id;
    return old;
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

revoke all on function public.visita_anterior_intacta(public.manutencoes) from public, anon, authenticated;
revoke all on function public.validar_pedido_visitas_anteriores(integer, integer, date[], boolean) from public, anon, authenticated;
revoke all on function public.gerar_programacao_contrato(uuid, integer, date[], boolean) from public, anon;
grant execute on function public.gerar_programacao_contrato(uuid, integer, date[], boolean) to authenticated;
grant execute on function public.registrar_visitas_anteriores(uuid, integer, date[], boolean) to authenticated;
COMMIT;
