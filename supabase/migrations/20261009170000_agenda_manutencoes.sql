-- ELEVA Manutenção — Fase 3
-- Agenda do ADM, reagendamento individual e manutenção avulsa.
-- Reagendar uma visita não mexe nas outras.
-- Só visita ainda programada muda de data. O prestador não reagenda.

create or replace function public.antes_de_atualizar_visita()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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
       and current_setting('app.finalizando', true) is distinct from 'on' then
      raise exception 'Finalização inválida';
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

create or replace function public.reagendar_visita(p_id uuid, p_data date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  visita public.manutencoes%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Somente o ADM pode reagendar';
  end if;

  select * into visita
  from public.manutencoes
  where id = p_id
  for update;

  if not found then
    raise exception 'Visita não encontrada';
  end if;

  if visita.status <> 'programada' then
    raise exception 'Só é possível reagendar uma visita programada';
  end if;

  if p_data is null then
    raise exception 'Informe a data';
  end if;

  if p_data = visita.data_programada_atual then
    raise exception 'Informe uma data diferente da atual';
  end if;

  update public.manutencoes
    set data_programada_atual = p_data
    where id = p_id;
end;
$$;

create or replace function public.criar_manutencao_avulsa(
  p_condominio_id uuid,
  p_data date,
  p_prestador_id uuid,
  p_matrizes jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  matriz_id uuid;
  matriz_nome text;
  matriz_ativa boolean;
  condo_ativo boolean;
  prestador_ativo boolean;
  nova uuid;
  vistos uuid[] := '{}';
begin
  if not public.is_admin() then
    raise exception 'Somente o ADM cria manutenção avulsa';
  end if;

  select ativo into condo_ativo
  from public.condominios
  where id = p_condominio_id;

  if not found or condo_ativo is not true then
    raise exception 'Selecione o condomínio';
  end if;

  if p_data is null then
    raise exception 'Informe a data';
  end if;

  select ativo into prestador_ativo
  from public.prestadores
  where id = p_prestador_id;

  if not found or prestador_ativo is not true then
    raise exception 'Selecione o prestador';
  end if;

  if p_matrizes is null or jsonb_typeof(p_matrizes) <> 'array' or jsonb_array_length(p_matrizes) = 0 then
    raise exception 'Selecione ao menos um equipamento';
  end if;

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
    p_condominio_id,
    null,
    null,
    p_data,
    p_data,
    p_prestador_id,
    'avulsa',
    'manual',
    'programada'
  )
  returning id into nova;

  for item in select value from jsonb_array_elements(p_matrizes)
  loop
    if jsonb_typeof(item) <> 'string'
       or coalesce(item #>> '{}', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Selecione um equipamento da lista';
    end if;

    matriz_id := (item #>> '{}')::uuid;
    if matriz_id = any (vistos) then
      raise exception 'Selecione um equipamento da lista';
    end if;
    vistos := array_append(vistos, matriz_id);

    select nome, ativo into matriz_nome, matriz_ativa
    from public.equipamentos_matriz
    where id = matriz_id;

    if not found or matriz_ativa is not true then
      raise exception 'Selecione um equipamento da lista';
    end if;

    matriz_nome := regexp_replace(trim(matriz_nome), '\s+', ' ', 'g');
    if matriz_nome = '' then
      raise exception 'Selecione um equipamento da lista';
    end if;

    insert into public.itens_manutencao (
      manutencao_id, equipamento_matriz_id, nome_identificacao, resultado
    ) values (
      nova, matriz_id, matriz_nome, 'pendente'
    );
  end loop;

  return nova;
end;
$$;

revoke all on function public.reagendar_visita(uuid, date) from public, anon;
revoke all on function public.criar_manutencao_avulsa(uuid, date, uuid, jsonb) from public, anon;
grant execute on function public.reagendar_visita(uuid, date) to authenticated;
grant execute on function public.criar_manutencao_avulsa(uuid, date, uuid, jsonb) to authenticated;
