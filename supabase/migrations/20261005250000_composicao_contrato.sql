-- ELEVA Manutenção — Fase 3
-- A composição atual do contrato entra nas visitas.
-- Depois da programação, só visitas futuras ainda programadas mudam.
-- data_entrada e data_saida permanecem no banco e não comandam a agenda.

create or replace function public.sincronizar_itens_contrato(p_contrato_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  hoje date := (timezone('America/Sao_Paulo', now()))::date;
  visita record;
begin
  if not public.is_admin() then
    raise exception 'Somente o ADM altera o contrato';
  end if;

  if not exists (select 1 from public.contratos where id = p_contrato_id) then
    raise exception 'Contrato não encontrado';
  end if;

  for visita in
    select id
    from public.manutencoes
    where contrato_id = p_contrato_id
      and tipo = 'preventiva'
      and status = 'programada'
      and data_programada_atual >= hoje
  loop
    insert into public.itens_manutencao (
      manutencao_id, equipamento_contrato_id, nome_identificacao, resultado
    )
    select visita.id, ec.id, ec.nome_identificacao, 'pendente'
    from public.equipamentos_contrato ec
    where ec.contrato_id = p_contrato_id
      and ec.ativo
      and not exists (
        select 1
        from public.itens_manutencao i
        where i.manutencao_id = visita.id
          and i.equipamento_contrato_id = ec.id
      );

    delete from public.itens_manutencao i
    using public.equipamentos_contrato ec
    where i.equipamento_contrato_id = ec.id
      and i.manutencao_id = visita.id
      and i.resultado = 'pendente'
      and ec.ativo is not true;

    update public.itens_manutencao i
      set nome_identificacao = ec.nome_identificacao
    from public.equipamentos_contrato ec
    where i.equipamento_contrato_id = ec.id
      and i.manutencao_id = visita.id
      and i.resultado = 'pendente'
      and ec.ativo
      and i.nome_identificacao is distinct from ec.nome_identificacao;
  end loop;
end;
$$;

create or replace function public.gerar_programacao_contrato(p_contrato_id uuid)
returns integer
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
    );
    criada := criada + 1;
  end loop;

  insert into public.itens_manutencao (
    manutencao_id, equipamento_contrato_id, nome_identificacao, resultado
  )
  select m.id, ec.id, ec.nome_identificacao, 'pendente'
  from public.manutencoes m
  join public.equipamentos_contrato ec
    on ec.contrato_id = m.contrato_id
   and ec.ativo
  where m.contrato_id = p_contrato_id
    and m.tipo = 'preventiva'
    and m.origem = 'automatica'
    and m.status = 'programada'
    and not exists (
      select 1
      from public.itens_manutencao i
      where i.manutencao_id = m.id
        and i.equipamento_contrato_id = ec.id
    );

  return criada;
end;
$$;

drop function if exists public.salvar_equipamento_contrato(uuid, uuid, uuid, text, date, date);

create function public.salvar_equipamento_contrato(
  p_id uuid,
  p_contrato_id uuid,
  p_matriz_id uuid,
  p_nome text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  nome_limpo text;
  matriz_ativa boolean;
  atual public.equipamentos_contrato%rowtype;
  novo uuid;
begin
  if not public.is_admin() then
    raise exception 'Somente o ADM altera o contrato';
  end if;

  if not exists (select 1 from public.contratos where id = p_contrato_id) then
    raise exception 'Contrato não encontrado';
  end if;

  nome_limpo := nullif(regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g'), '');
  if nome_limpo is null or lower(nome_limpo) = 'sem identificação' then
    raise exception 'Informe a identificação do equipamento';
  end if;

  if char_length(nome_limpo) > 80 then
    raise exception 'Use uma identificação do equipamento mais curta';
  end if;

  select ativo into matriz_ativa
  from public.equipamentos_matriz
  where id = p_matriz_id;

  if not found then
    raise exception 'Selecione um equipamento da lista';
  end if;

  if p_id is null then
    if matriz_ativa is not true then
      raise exception 'Selecione um equipamento da lista';
    end if;

    insert into public.equipamentos_contrato (
      contrato_id, equipamento_matriz_id, nome_identificacao, data_entrada, ativo
    )
    select p_contrato_id, p_matriz_id, nome_limpo, c.data_inicio_manutencao, true
    from public.contratos c
    where c.id = p_contrato_id
    returning id into novo;
  else
    select * into atual
    from public.equipamentos_contrato
    where id = p_id
      and contrato_id = p_contrato_id
    for update;

    if not found then
      raise exception 'Equipamento não encontrado';
    end if;

    if p_matriz_id is distinct from atual.equipamento_matriz_id and matriz_ativa is not true then
      raise exception 'Selecione um equipamento da lista';
    end if;

    update public.equipamentos_contrato
      set equipamento_matriz_id = p_matriz_id,
          nome_identificacao = nome_limpo
      where id = p_id;

    novo := p_id;
  end if;

  perform public.sincronizar_itens_contrato(p_contrato_id);
  return novo;
end;
$$;

create or replace function public.remover_equipamento_contrato(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  equip public.equipamentos_contrato%rowtype;
  hoje date := (timezone('America/Sao_Paulo', now()))::date;
begin
  if not public.is_admin() then
    raise exception 'Somente o ADM altera o contrato';
  end if;

  select * into equip
  from public.equipamentos_contrato
  where id = p_id
  for update;

  if not found then
    raise exception 'Equipamento não encontrado';
  end if;

  if exists (
    select 1
    from public.itens_manutencao i
    join public.manutencoes m on m.id = i.manutencao_id
    where i.equipamento_contrato_id = p_id
      and (
        m.status <> 'programada'
        or m.data_programada_atual < hoje
        or i.resultado <> 'pendente'
      )
  ) then
    update public.equipamentos_contrato
      set ativo = false
      where id = p_id;

    perform public.sincronizar_itens_contrato(equip.contrato_id);
    return;
  end if;

  delete from public.itens_manutencao
  where equipamento_contrato_id = p_id;

  delete from public.equipamentos_contrato
  where id = p_id;
end;
$$;

revoke all on function public.salvar_equipamento_contrato(uuid, uuid, uuid, text) from public;
grant execute on function public.salvar_equipamento_contrato(uuid, uuid, uuid, text) to authenticated;
