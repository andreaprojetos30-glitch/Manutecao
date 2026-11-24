-- ELEVA Manutenção — visitas anteriores gravadas no contrato.
-- A quantidade entra na numeração e no saldo. Não cria ficha nem comprovante.
-- A programação continua mensal. A retirada posterior soma só o que sai agora.
-- Esta migration não reescreve manutenções já gravadas.

alter table public.contratos
  add column if not exists visitas_anteriores integer not null default 0;

alter table public.contratos
  drop constraint if exists contratos_visitas_anteriores_check;

alter table public.contratos
  add constraint contratos_visitas_anteriores_check
  check (visitas_anteriores >= 0 and visitas_anteriores < quantidade_visitas);

comment on column public.contratos.visitas_anteriores is
  'Preventivas feitas antes do sistema. Entram na numeração e no saldo, sem ficha de manutenção.';

create or replace function public.conferir_saldo_visitas(p_contrato_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  contrato public.contratos%rowtype;
  na_agenda integer;
begin
  select * into contrato
  from public.contratos
  where id = p_contrato_id;

  if not found then
    raise exception 'Contrato não encontrado';
  end if;

  select count(*) into na_agenda
  from public.manutencoes
  where contrato_id = p_contrato_id
    and tipo = 'preventiva'
    and registro_anterior = false;

  if contrato.visitas_anteriores + na_agenda <> contrato.quantidade_visitas then
    raise exception 'O saldo de visitas do contrato ficou inconsistente';
  end if;
end;
$$;

create or replace function public.proteger_agenda_gerada()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.manutencoes
    where contrato_id = new.id
      and tipo = 'preventiva'
      and origem = 'automatica'
  ) then
    if new.condominio_id is distinct from old.condominio_id
       or new.data_inicio_manutencao is distinct from old.data_inicio_manutencao
       or new.quantidade_visitas is distinct from old.quantidade_visitas
       or new.numero_contrato is distinct from old.numero_contrato then
      raise exception 'A programação já foi gerada. O condomínio, a data de início da manutenção e a quantidade de visitas permanecem';
    end if;

    if new.visitas_anteriores is distinct from old.visitas_anteriores
       and current_setting('app.ajustar_visitas_anteriores', true) is distinct from 'on' then
      raise exception 'A programação já foi gerada. As visitas anteriores permanecem';
    end if;
  end if;

  return new;
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

  if coalesce(p_anteriores, 0) is distinct from contrato.visitas_anteriores then
    raise exception 'As visitas anteriores deste contrato já foram informadas';
  end if;

  perform public.validar_pedido_visitas_anteriores(
    contrato.quantidade_visitas,
    contrato.visitas_anteriores,
    p_datas,
    p_confirmar
  );

  for i in contrato.visitas_anteriores .. contrato.quantidade_visitas - 1 loop
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

  perform public.conferir_saldo_visitas(p_contrato_id);
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
  adicional integer;
  novo integer;
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

  adicional := coalesce(p_anteriores, 0);
  if adicional < 1 then
    raise exception 'Informe a quantidade de visitas anteriores';
  end if;

  novo := contrato.visitas_anteriores + adicional;

  perform public.validar_pedido_visitas_anteriores(
    contrato.quantidade_visitas,
    novo,
    p_datas,
    p_confirmar
  );

  for i in contrato.visitas_anteriores + 1 .. novo loop
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

  perform set_config('app.ajustar_visitas_anteriores', 'on', true);
  update public.contratos
    set visitas_anteriores = novo
    where id = p_contrato_id;
  perform set_config('app.ajustar_visitas_anteriores', 'off', true);

  perform public.conferir_saldo_visitas(p_contrato_id);
  return novo;
end;
$$;

revoke all on function public.conferir_saldo_visitas(uuid) from public, anon, authenticated;
revoke all on function public.gerar_programacao_contrato(uuid, integer, date[], boolean) from public, anon;
revoke all on function public.registrar_visitas_anteriores(uuid, integer, date[], boolean) from public, anon;
grant execute on function public.gerar_programacao_contrato(uuid, integer, date[], boolean) to authenticated;
grant execute on function public.registrar_visitas_anteriores(uuid, integer, date[], boolean) to authenticated;
