-- ELEVA Manutenção — adequação da Fase 3
-- Preventiva anterior à implantação entra na numeração, sem checklist.
-- A data mensal original permanece. O prestador não vê esse registro.
-- Esta migration não depende da Fase 5A.

alter table public.manutencoes
  add column if not exists registro_anterior boolean not null default false;

alter table public.manutencoes
  drop constraint if exists manutencoes_registro_anterior_check;

alter table public.manutencoes
  add constraint manutencoes_registro_anterior_check
  check (
    registro_anterior = false
    or (
      tipo = 'preventiva'
      and numero_visita is not null
      and status = 'realizada'
      and data_realizada is not null
    )
  );

create or replace function public.validar_manutencao()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  condo_contrato uuid;
  condo_origem uuid;
begin
  if tg_op = 'INSERT' and new.status is distinct from 'programada' then
    raise exception 'Visita nova começa programada';
  end if;

  if tg_op = 'INSERT' and new.registro_anterior then
    raise exception 'Visita anterior exige confirmação do ADM';
  end if;

  if new.contrato_id is not null then
    select condominio_id into condo_contrato
    from public.contratos
    where id = new.contrato_id;

    if condo_contrato is null then
      raise exception 'Contrato não encontrado';
    end if;

    if condo_contrato <> new.condominio_id then
      raise exception 'O condomínio da visita deve ser o do contrato';
    end if;
  end if;

  if new.ocorrencia_origem_id is not null then
    select m.condominio_id into condo_origem
    from public.ocorrencias o
    join public.itens_manutencao i on i.id = o.item_manutencao_id
    join public.manutencoes m on m.id = i.manutencao_id
    where o.id = new.ocorrencia_origem_id;

    if condo_origem is null then
      raise exception 'Ocorrência de origem não encontrada';
    end if;

    if condo_origem <> new.condominio_id then
      raise exception 'O retorno deve ser do mesmo condomínio da ocorrência';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.antes_de_atualizar_visita()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.registro_anterior is distinct from old.registro_anterior
     and current_setting('app.registro_anterior', true) is distinct from 'on' then
    raise exception 'Visita anterior exige confirmação do ADM';
  end if;

  if new.data_programada_atual is distinct from old.data_programada_atual then
    if not public.is_admin() then
      raise exception 'Somente o ADM pode reagendar';
    end if;

    if old.status <> 'programada' then
      raise exception 'Só é possível reagendar uma visita programada';
    end if;

    insert into public.historico_reagendamentos (
      manutencao_id, data_anterior, nova_data, alterado_por
    ) values (
      old.id, old.data_programada_atual, new.data_programada_atual, auth.uid()
    );
  end if;

  if new.status is distinct from old.status then
    if new.status = 'cancelada'
       and current_setting('app.cancelando', true) is distinct from 'on' then
      raise exception 'Somente o ADM pode cancelar uma visita';
    end if;

    if new.status in ('realizada', 'aguardando_administracao')
       and current_setting('app.finalizando', true) is distinct from 'on'
       and not (
         new.registro_anterior
         and current_setting('app.registro_anterior', true) = 'on'
       ) then
      raise exception 'Finalização inválida';
    end if;

    if new.registro_anterior and old.registro_anterior is not true then
      if old.status is distinct from 'programada' then
        raise exception 'Não é possível alterar visita já iniciada';
      end if;

      if new.status is distinct from 'realizada'
         or new.numero_visita is distinct from old.numero_visita
         or new.data_programada_original is distinct from old.data_programada_original
         or new.data_programada_atual is distinct from old.data_programada_atual
         or new.contrato_id is distinct from old.contrato_id
         or new.tipo is distinct from 'preventiva'
         or new.data_realizada is null then
        raise exception 'A numeração e as datas programadas permanecem';
      end if;

      if exists (
        select 1
        from public.itens_manutencao
        where manutencao_id = old.id
          and resultado <> 'pendente'
      ) or exists (
        select 1
        from public.itens_manutencao i
        join public.ocorrencias o on o.item_manutencao_id = i.id
        where i.manutencao_id = old.id
      ) then
        raise exception 'Não é possível alterar visita já iniciada';
      end if;
    end if;

    if new.status = 'em_execucao' then
      if old.status is distinct from 'programada'
         or current_setting('app.executando', true) is distinct from 'on' then
        raise exception 'A execução começa no primeiro registro de equipamento';
      end if;
    end if;

    if old.status in ('realizada', 'aguardando_administracao', 'cancelada')
       and not public.is_admin() then
      raise exception 'Visita encerrada para edição do prestador';
    end if;

    insert into public.auditoria (tabela, registro_id, acao, ator_id, detalhe)
    values (
      'manutencoes',
      new.id,
      'status',
      auth.uid(),
      jsonb_build_object('de', old.status, 'para', new.status)
    );
  end if;

  return new;
end;
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

  if coalesce(cardinality(p_datas), 0) <> p_anteriores
     or exists (
       select 1
       from unnest(p_datas) as data_efetiva
       where data_efetiva is null
     ) then
    raise exception 'Informe a data efetiva de cada visita anterior';
  end if;
end;
$$;

create or replace function public.concluir_visita_anterior(p_id uuid, p_data date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_data is null then
    raise exception 'Informe a data efetiva de cada visita anterior';
  end if;

  delete from public.itens_manutencao as item
  where item.manutencao_id = p_id
    and item.resultado = 'pendente'
    and not exists (
      select 1
      from public.ocorrencias o
      where o.item_manutencao_id = item.id
    );

  perform set_config('app.registro_anterior', 'on', true);

  update public.manutencoes
    set status = 'realizada',
        registro_anterior = true,
        data_realizada = p_data,
        prestador_id = null
    where id = p_id
      and status = 'programada'
      and tipo = 'preventiva'
      and registro_anterior = false
      and numero_visita is not null;

  if not found then
    perform set_config('app.registro_anterior', 'off', true);
    raise exception 'Não é possível alterar visita já iniciada';
  end if;

  perform set_config('app.registro_anterior', 'off', true);
end;
$$;

drop function if exists public.gerar_programacao_contrato(uuid);

create function public.gerar_programacao_contrato(
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
  nova uuid;
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

  for i in 0 .. contrato.quantidade_visitas - 1 loop
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
    )
    returning id into nova;

    if i < coalesce(p_anteriores, 0) then
      perform public.concluir_visita_anterior(nova, p_datas[i + 1]);
    end if;

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

    perform public.concluir_visita_anterior(visita.id, p_datas[i]);
  end loop;

  return p_anteriores;
end;
$$;

revoke all on function public.validar_pedido_visitas_anteriores(integer, integer, date[], boolean) from public, anon, authenticated;
revoke all on function public.concluir_visita_anterior(uuid, date) from public, anon, authenticated;
revoke all on function public.gerar_programacao_contrato(uuid, integer, date[], boolean) from public, anon;
revoke all on function public.registrar_visitas_anteriores(uuid, integer, date[], boolean) from public, anon;
grant execute on function public.gerar_programacao_contrato(uuid, integer, date[], boolean) to authenticated;
grant execute on function public.registrar_visitas_anteriores(uuid, integer, date[], boolean) to authenticated;

drop policy if exists prestador_le_visita on public.manutencoes;
create policy prestador_le_visita on public.manutencoes
  for select to authenticated
  using (
    public.is_prestador()
    and prestador_id = public.prestador_id_atual()
    and registro_anterior is not true
  );
