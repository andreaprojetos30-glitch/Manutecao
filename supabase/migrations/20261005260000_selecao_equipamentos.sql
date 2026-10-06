-- ELEVA Manutenção — Fase 3
-- Equipamentos do contrato entram em lote, a partir da matriz ativa.
-- A identificação de cada unidade é opcional e não nasce preenchida.

alter table public.equipamentos_contrato
  add column if not exists identificacao text;

alter table public.equipamentos_contrato
  drop constraint if exists equipamentos_contrato_identificacao_check;

alter table public.equipamentos_contrato
  add constraint equipamentos_contrato_identificacao_check
  check (
    identificacao is null
    or (length(trim(identificacao)) > 0 and length(identificacao) <= 80)
  );

create or replace function public.rotulo_unidade_contrato(
  p_nome_matriz text,
  p_nome_gravado text,
  p_identificacao text
) returns text
language sql
immutable
as $$
  select case
    when nullif(regexp_replace(trim(coalesce(p_identificacao, '')), '\s+', ' ', 'g'), '') is not null then
      regexp_replace(trim(coalesce(p_nome_matriz, '')), '\s+', ' ', 'g')
      || ' — '
      || regexp_replace(trim(p_identificacao), '\s+', ' ', 'g')
    when nullif(regexp_replace(trim(coalesce(p_nome_gravado, '')), '\s+', ' ', 'g'), '') is not null
      and regexp_replace(trim(coalesce(p_nome_gravado, '')), '\s+', ' ', 'g')
          is distinct from regexp_replace(trim(coalesce(p_nome_matriz, '')), '\s+', ' ', 'g') then
      regexp_replace(trim(p_nome_gravado), '\s+', ' ', 'g')
    else
      regexp_replace(trim(coalesce(p_nome_matriz, '')), '\s+', ' ', 'g')
  end;
$$;

-- Sequência automática antiga ("Esteira 01") deixa de ser identificação.
update public.equipamentos_contrato ec
set nome_identificacao = regexp_replace(trim(em.nome), '\s+', ' ', 'g')
from public.equipamentos_matriz em
where em.id = ec.equipamento_matriz_id
  and ec.identificacao is null
  and ec.nome_identificacao ~ ' [0-9]{2}$'
  and left(ec.nome_identificacao, length(ec.nome_identificacao) - 3) = regexp_replace(trim(em.nome), '\s+', ' ', 'g');

-- Texto já informado pelo ADM permanece como identificação opcional.
update public.equipamentos_contrato ec
set identificacao = regexp_replace(trim(ec.nome_identificacao), '\s+', ' ', 'g'),
    nome_identificacao = public.rotulo_unidade_contrato(
      em.nome,
      em.nome,
      regexp_replace(trim(ec.nome_identificacao), '\s+', ' ', 'g')
    )
from public.equipamentos_matriz em
where em.id = ec.equipamento_matriz_id
  and ec.identificacao is null
  and length(trim(ec.nome_identificacao)) between 1 and 80
  and lower(trim(ec.nome_identificacao)) <> 'sem identificação'
  and regexp_replace(trim(ec.nome_identificacao), '\s+', ' ', 'g')
      is distinct from regexp_replace(trim(em.nome), '\s+', ' ', 'g');

-- Só visitas futuras ainda programadas acompanham o rótulo novo.
update public.itens_manutencao i
set nome_identificacao = public.rotulo_unidade_contrato(em.nome, ec.nome_identificacao, ec.identificacao)
from public.equipamentos_contrato ec
join public.equipamentos_matriz em on em.id = ec.equipamento_matriz_id
join public.manutencoes m on m.contrato_id = ec.contrato_id
where i.equipamento_contrato_id = ec.id
  and i.manutencao_id = m.id
  and ec.ativo
  and i.resultado = 'pendente'
  and m.tipo = 'preventiva'
  and m.status = 'programada'
  and m.data_programada_atual >= (timezone('America/Sao_Paulo', now()))::date
  and i.nome_identificacao is distinct from public.rotulo_unidade_contrato(em.nome, ec.nome_identificacao, ec.identificacao);

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
    select
      visita.id,
      ec.id,
      public.rotulo_unidade_contrato(em.nome, ec.nome_identificacao, ec.identificacao),
      'pendente'
    from public.equipamentos_contrato ec
    join public.equipamentos_matriz em on em.id = ec.equipamento_matriz_id
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
      set nome_identificacao = public.rotulo_unidade_contrato(em.nome, ec.nome_identificacao, ec.identificacao)
    from public.equipamentos_contrato ec
    join public.equipamentos_matriz em on em.id = ec.equipamento_matriz_id
    where i.equipamento_contrato_id = ec.id
      and i.manutencao_id = visita.id
      and i.resultado = 'pendente'
      and ec.ativo
      and i.nome_identificacao is distinct from public.rotulo_unidade_contrato(em.nome, ec.nome_identificacao, ec.identificacao);
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
    and not exists (
      select 1
      from public.itens_manutencao i
      where i.manutencao_id = m.id
        and i.equipamento_contrato_id = ec.id
    );

  return criada;
end;
$$;

create or replace function public.adicionar_equipamentos_contrato(
  p_contrato_id uuid,
  p_selecao jsonb
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  matriz_id uuid;
  quantidade integer;
  matriz_nome text;
  matriz_ativa boolean;
  criados integer := 0;
  i integer;
  inicio date;
  vistos uuid[] := '{}';
begin
  if not public.is_admin() then
    raise exception 'Somente o ADM altera o contrato';
  end if;

  if not exists (select 1 from public.contratos where id = p_contrato_id) then
    raise exception 'Contrato não encontrado';
  end if;

  if p_selecao is null or jsonb_typeof(p_selecao) <> 'array' or jsonb_array_length(p_selecao) = 0 then
    raise exception 'Selecione ao menos um equipamento';
  end if;

  select data_inicio_manutencao into inicio
  from public.contratos
  where id = p_contrato_id;

  for item in select value from jsonb_array_elements(p_selecao)
  loop
    if coalesce(item->>'matriz_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Selecione um equipamento da lista';
    end if;

    matriz_id := (item->>'matriz_id')::uuid;
    if matriz_id = any (vistos) then
      raise exception 'Selecione um equipamento da lista';
    end if;
    vistos := array_append(vistos, matriz_id);

    if coalesce(item->>'quantidade', '') !~ '^[0-9]+$' or char_length(item->>'quantidade') > 2 then
      if coalesce(item->>'quantidade', '') ~ '^[0-9]+$' and char_length(item->>'quantidade') > 2 then
        raise exception 'A quantidade está alta demais. Confira o número';
      end if;
      raise exception 'Informe a quantidade';
    end if;

    quantidade := (item->>'quantidade')::integer;
    if quantidade < 1 then
      raise exception 'Informe a quantidade';
    end if;
    if quantidade > 99 then
      raise exception 'A quantidade está alta demais. Confira o número';
    end if;

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

    for i in 1..quantidade loop
      insert into public.equipamentos_contrato (
        contrato_id, equipamento_matriz_id, nome_identificacao, identificacao, data_entrada, ativo
      ) values (
        p_contrato_id, matriz_id, matriz_nome, null, inicio, true
      );
      criados := criados + 1;
    end loop;
  end loop;

  perform public.sincronizar_itens_contrato(p_contrato_id);
  return criados;
end;
$$;

create or replace function public.definir_identificacao_equipamento(
  p_id uuid,
  p_identificacao text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  equip public.equipamentos_contrato%rowtype;
  matriz_nome text;
  ident text;
  rotulo text;
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

  select nome into matriz_nome
  from public.equipamentos_matriz
  where id = equip.equipamento_matriz_id;

  if not found then
    raise exception 'Selecione um equipamento da lista';
  end if;

  ident := nullif(regexp_replace(trim(coalesce(p_identificacao, '')), '\s+', ' ', 'g'), '');
  if ident is not null and lower(ident) = 'sem identificação' then
    ident := null;
  end if;
  if ident is not null and char_length(ident) > 80 then
    raise exception 'Use uma identificação do equipamento mais curta';
  end if;

  rotulo := public.rotulo_unidade_contrato(matriz_nome, matriz_nome, ident);
  if rotulo is null or length(trim(rotulo)) = 0 then
    raise exception 'Selecione um equipamento da lista';
  end if;

  update public.equipamentos_contrato
    set identificacao = ident,
        nome_identificacao = rotulo
    where id = p_id;

  perform public.sincronizar_itens_contrato(equip.contrato_id);
end;
$$;

revoke all on function public.rotulo_unidade_contrato(text, text, text) from public, anon, authenticated;
revoke all on function public.adicionar_equipamentos_contrato(uuid, jsonb) from public;
revoke all on function public.definir_identificacao_equipamento(uuid, text) from public;
grant execute on function public.adicionar_equipamentos_contrato(uuid, jsonb) to authenticated;
grant execute on function public.definir_identificacao_equipamento(uuid, text) to authenticated;
