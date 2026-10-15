-- ELEVA Manutenção — Fase 5A
-- Tratamento administrativo dentro da manutenção, sem fila separada.
-- O registro original do prestador permanece. O histórico não se apaga.

alter table public.ocorrencias
  drop constraint if exists ocorrencias_status_ocorrencia_check;

alter table public.ocorrencias
  add constraint ocorrencias_status_ocorrencia_check
  check (
    status_ocorrencia in (
      'aberta',
      'em_analise',
      'aguardando_orcamento',
      'aguardando_aprovacao',
      'aguardando_execucao',
      'retorno_programado',
      'aguardando_retorno',
      'resolvida',
      'encerrada'
    )
  );

alter table public.ocorrencias
  add column if not exists providencia text,
  add column if not exists solucao text;

create table if not exists public.historico_ocorrencias (
  id uuid primary key default gen_random_uuid(),
  ocorrencia_id uuid not null references public.ocorrencias (id),
  situacao_anterior text,
  situacao_nova text,
  observacao text,
  registrado_por uuid references public.usuarios (id),
  created_at timestamptz not null default now()
);

create index if not exists historico_ocorrencias_ordem_idx
  on public.historico_ocorrencias (ocorrencia_id, created_at);

create or replace function public.antes_de_gravar_ocorrencia()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.resolvida_no_local is null
     or nullif(trim(new.descricao_original), '') is null
     or nullif(trim(new.foto_url), '') is null then
    raise exception 'Ocorrência exige resolução, descrição e foto';
  end if;

  new.descricao_original := trim(new.descricao_original);
  new.foto_url := trim(new.foto_url);

  if not public.is_admin() then
    if tg_op = 'INSERT' then
      new.necessita_orcamento := false;
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

  return new;
end;
$$;

create or replace function public.antes_de_gravar_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  visita public.manutencoes%rowtype;
  contrato_do_equipamento uuid;
begin
  select * into visita from public.manutencoes where id = new.manutencao_id;
  if not found then
    raise exception 'Item sem manutenção';
  end if;

  if visita.status in ('realizada', 'aguardando_administracao', 'cancelada')
     and not public.is_admin() then
    raise exception 'Visita encerrada para edição do prestador';
  end if;

  if visita.tipo = 'avulsa' then
    if new.equipamento_contrato_id is not null or new.equipamento_matriz_id is null then
      raise exception 'Avulsa usa equipamento da matriz';
    end if;
  elsif visita.tipo = 'corretiva_complementar' then
    if (new.equipamento_contrato_id is null and new.equipamento_matriz_id is null)
       or (new.equipamento_contrato_id is not null and new.equipamento_matriz_id is not null) then
      raise exception 'O retorno deve usar o equipamento da ocorrência';
    end if;

    if new.equipamento_contrato_id is not null then
      select contrato_id into contrato_do_equipamento
      from public.equipamentos_contrato
      where id = new.equipamento_contrato_id;

      if contrato_do_equipamento is distinct from visita.contrato_id then
        raise exception 'Equipamento de outro contrato';
      end if;
    end if;
  else
    if new.equipamento_contrato_id is null or new.equipamento_matriz_id is not null then
      raise exception 'Visita de contrato usa equipamento do contrato';
    end if;

    select contrato_id into contrato_do_equipamento
    from public.equipamentos_contrato
    where id = new.equipamento_contrato_id;

    if contrato_do_equipamento is distinct from visita.contrato_id then
      raise exception 'Equipamento de outro contrato';
    end if;
  end if;

  if tg_op = 'UPDATE'
     and old.resultado = 'pendente'
     and new.resultado in ('ok', 'ocorrencia') then
    new.registrado_por := coalesce(new.registrado_por, auth.uid());
    new.registrado_em := coalesce(new.registrado_em, now());
  end if;

  if new.resultado in ('ok', 'ocorrencia') and visita.status = 'programada' then
    perform set_config('app.executando', 'on', true);
    update public.manutencoes
      set status = 'em_execucao'
      where id = visita.id
        and status = 'programada';
  end if;

  return new;
end;
$$;

create or replace function public.bloquear_historico_ocorrencia()
returns trigger
language plpgsql
as $$
begin
  raise exception 'O histórico da ocorrência não pode ser apagado';
end;
$$;

drop trigger if exists historico_ocorrencias_bloquear on public.historico_ocorrencias;
create trigger historico_ocorrencias_bloquear
  before update or delete on public.historico_ocorrencias
  for each row
  execute function public.bloquear_historico_ocorrencia();

create or replace function public.registrar_tratamento_ocorrencia(
  p_ocorrencia uuid,
  p_situacao text,
  p_observacao text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  atual public.ocorrencias%rowtype;
  texto text;
  situacao text;
begin
  if not public.is_admin() then
    raise exception 'Somente o ADM trata a ocorrência';
  end if;

  select * into atual from public.ocorrencias where id = p_ocorrencia;
  if not found then
    raise exception 'Ocorrência não encontrada';
  end if;

  situacao := trim(coalesce(p_situacao, ''));
  if situacao not in (
    'aberta',
    'em_analise',
    'aguardando_orcamento',
    'aguardando_aprovacao',
    'aguardando_execucao',
    'retorno_programado',
    'resolvida'
  ) then
    raise exception 'Escolha a situação da ocorrência';
  end if;

  texto := nullif(trim(coalesce(p_observacao, '')), '');
  if texto is null then
    if situacao = 'resolvida' then
      raise exception 'Informe a solução adotada';
    end if;
    raise exception 'Informe a observação ou a providência';
  end if;

  update public.ocorrencias
    set status_ocorrencia = situacao,
        observacoes_administrativas = texto,
        providencia = case when situacao = 'resolvida' then providencia else texto end,
        solucao = case when situacao = 'resolvida' then texto else solucao end
    where id = atual.id;

  insert into public.historico_ocorrencias (
    ocorrencia_id,
    situacao_anterior,
    situacao_nova,
    observacao,
    registrado_por
  ) values (
    atual.id,
    case when atual.status_ocorrencia is distinct from situacao then atual.status_ocorrencia else null end,
    case when atual.status_ocorrencia is distinct from situacao then situacao else null end,
    texto,
    auth.uid()
  );
end;
$$;

create or replace function public.programar_retorno_ocorrencia(
  p_ocorrencia uuid,
  p_data date,
  p_prestador uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  atual public.ocorrencias%rowtype;
  item public.itens_manutencao%rowtype;
  origem public.manutencoes%rowtype;
  prestador_ativo boolean;
  nova uuid;
begin
  if not public.is_admin() then
    raise exception 'Somente o ADM trata a ocorrência';
  end if;

  select * into atual from public.ocorrencias where id = p_ocorrencia;
  if not found then
    raise exception 'Ocorrência não encontrada';
  end if;

  if p_data is null then
    raise exception 'Informe a data';
  end if;

  select ativo into prestador_ativo
  from public.prestadores
  where id = p_prestador;

  if not found or prestador_ativo is not true then
    raise exception 'Selecione o prestador';
  end if;

  if exists (
    select 1
    from public.manutencoes
    where ocorrencia_origem_id = atual.id
      and status in ('programada', 'em_execucao')
  ) then
    raise exception 'Já existe um retorno em aberto para esta ocorrência';
  end if;

  select * into item from public.itens_manutencao where id = atual.item_manutencao_id;
  select * into origem from public.manutencoes where id = item.manutencao_id;

  insert into public.manutencoes (
    condominio_id,
    contrato_id,
    numero_visita,
    data_programada_original,
    data_programada_atual,
    prestador_id,
    tipo,
    origem,
    status,
    ocorrencia_origem_id
  ) values (
    origem.condominio_id,
    case when item.equipamento_contrato_id is not null then origem.contrato_id else null end,
    null,
    p_data,
    p_data,
    p_prestador,
    'corretiva_complementar',
    'manual',
    'programada',
    atual.id
  )
  returning id into nova;

  insert into public.itens_manutencao (
    manutencao_id,
    equipamento_contrato_id,
    equipamento_matriz_id,
    nome_identificacao,
    resultado
  ) values (
    nova,
    item.equipamento_contrato_id,
    item.equipamento_matriz_id,
    item.nome_identificacao,
    'pendente'
  );

  update public.ocorrencias
    set status_ocorrencia = 'retorno_programado',
        necessita_retorno = true,
        providencia = coalesce(providencia, 'Retorno técnico programado')
    where id = atual.id;

  insert into public.historico_ocorrencias (
    ocorrencia_id,
    situacao_anterior,
    situacao_nova,
    observacao,
    registrado_por
  ) values (
    atual.id,
    case when atual.status_ocorrencia is distinct from 'retorno_programado' then atual.status_ocorrencia else null end,
    case when atual.status_ocorrencia is distinct from 'retorno_programado' then 'retorno_programado' else null end,
    'Retorno técnico programado',
    auth.uid()
  );

  return nova;
end;
$$;

revoke all on function public.registrar_tratamento_ocorrencia(uuid, text, text) from public, anon;
revoke all on function public.programar_retorno_ocorrencia(uuid, date, uuid) from public, anon;
grant execute on function public.registrar_tratamento_ocorrencia(uuid, text, text) to authenticated;
grant execute on function public.programar_retorno_ocorrencia(uuid, date, uuid) to authenticated;

alter table public.historico_ocorrencias enable row level security;

drop policy if exists admin_le_historico_ocorrencia on public.historico_ocorrencias;
create policy admin_le_historico_ocorrencia on public.historico_ocorrencias
  for select to authenticated
  using (public.is_admin());

revoke all on table public.historico_ocorrencias from public, anon, authenticated;
grant select on table public.historico_ocorrencias to authenticated;
