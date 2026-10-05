-- ELEVA Manutenção — Fase 3
-- Número amigável, equipamentos do contrato e programação mensal.
-- A data de fim não recalcula a agenda. Não existe contrato avulso.

create table public.sequencia_contratos (
  ano integer primary key,
  ultimo integer not null check (ultimo >= 0)
);

alter table public.sequencia_contratos enable row level security;
revoke all on table public.sequencia_contratos from public, anon, authenticated;

create index if not exists equipamentos_contrato_contrato_idx
  on public.equipamentos_contrato (contrato_id);

create index if not exists manutencoes_contrato_idx
  on public.manutencoes (contrato_id);

create or replace function public.proximo_numero_contrato()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  ano_ref integer;
  maior integer;
  n integer;
begin
  if not public.is_admin() then
    raise exception 'Somente o ADM cria contrato';
  end if;

  ano_ref := extract(year from (timezone('America/Sao_Paulo', now())))::integer;

  select coalesce(max((substring(numero_contrato from ('^' || ano_ref::text || '-([0-9]+)$')))::integer), 0)
    into maior
  from public.contratos
  where numero_contrato ~ ('^' || ano_ref::text || '-[0-9]+$');

  insert into public.sequencia_contratos as s (ano, ultimo)
  values (ano_ref, maior)
  on conflict (ano) do update
    set ultimo = greatest(s.ultimo, excluded.ultimo);

  update public.sequencia_contratos as s
    set ultimo = s.ultimo + 1
    where s.ano = ano_ref
  returning s.ultimo into n;

  return ano_ref::text || '-' || lpad(n::text, 3, '0');
end;
$$;

create or replace function public.sincronizar_itens_contrato(p_contrato_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  visita record;
  equip record;
begin
  if not public.is_admin() then
    raise exception 'Somente o ADM altera o contrato';
  end if;

  if not exists (select 1 from public.contratos where id = p_contrato_id) then
    raise exception 'Contrato não encontrado';
  end if;

  for visita in
    select id, data_programada_atual, status
    from public.manutencoes
    where contrato_id = p_contrato_id
      and tipo = 'preventiva'
      and status in ('programada', 'em_execucao')
  loop
    for equip in
      select ec.id, ec.nome_identificacao
      from public.equipamentos_contrato ec
      where ec.contrato_id = p_contrato_id
        and public.equipamento_participa(ec.data_entrada, ec.data_saida, visita.data_programada_atual)
        and not exists (
          select 1
          from public.itens_manutencao i
          where i.manutencao_id = visita.id
            and i.equipamento_contrato_id = ec.id
        )
    loop
      insert into public.itens_manutencao (
        manutencao_id, equipamento_contrato_id, nome_identificacao, resultado
      ) values (
        visita.id, equip.id, equip.nome_identificacao, 'pendente'
      );
    end loop;

    if visita.status = 'programada' then
      delete from public.itens_manutencao i
      using public.equipamentos_contrato ec
      where i.equipamento_contrato_id = ec.id
        and i.manutencao_id = visita.id
        and i.resultado = 'pendente'
        and not public.equipamento_participa(ec.data_entrada, ec.data_saida, visita.data_programada_atual);

      update public.itens_manutencao i
        set nome_identificacao = ec.nome_identificacao
      from public.equipamentos_contrato ec
      where i.equipamento_contrato_id = ec.id
        and i.manutencao_id = visita.id
        and i.resultado = 'pendente'
        and i.nome_identificacao is distinct from ec.nome_identificacao;
    end if;
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
    select 1 from public.equipamentos_contrato where contrato_id = p_contrato_id
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

  perform public.sincronizar_itens_contrato(p_contrato_id);
  return criada;
end;
$$;

create or replace function public.salvar_equipamento_contrato(
  p_id uuid,
  p_contrato_id uuid,
  p_matriz_id uuid,
  p_nome text,
  p_entrada date,
  p_saida date
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

  nome_limpo := nullif(trim(coalesce(p_nome, '')), '');
  if nome_limpo is null then
    raise exception 'Informe a identificação do equipamento';
  end if;

  if char_length(nome_limpo) > 80 then
    raise exception 'Use uma identificação do equipamento mais curta';
  end if;

  if p_entrada is null then
    raise exception 'Informe a data de entrada';
  end if;

  if p_saida is not null and p_saida < p_entrada then
    raise exception 'A data de saída precisa ser igual ou posterior à entrada';
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
      contrato_id, equipamento_matriz_id, nome_identificacao, data_entrada, data_saida
    ) values (
      p_contrato_id, p_matriz_id, nome_limpo, p_entrada, p_saida
    )
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
          nome_identificacao = nome_limpo,
          data_entrada = p_entrada,
          data_saida = p_saida
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
        i.resultado <> 'pendente'
        or m.status <> 'programada'
      )
  ) then
    raise exception 'Este equipamento já entrou em visita. Informe a data de saída';
  end if;

  delete from public.itens_manutencao
  where equipamento_contrato_id = p_id;

  delete from public.equipamentos_contrato
  where id = p_id;
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
  end if;

  return new;
end;
$$;

drop trigger if exists contratos_proteger_agenda on public.contratos;
create trigger contratos_proteger_agenda
  before update on public.contratos
  for each row
  execute function public.proteger_agenda_gerada();

revoke all on function public.proximo_numero_contrato() from public;
revoke all on function public.sincronizar_itens_contrato(uuid) from public;
revoke all on function public.gerar_programacao_contrato(uuid) from public;
revoke all on function public.salvar_equipamento_contrato(uuid, uuid, uuid, text, date, date) from public;
revoke all on function public.remover_equipamento_contrato(uuid) from public;

grant execute on function public.proximo_numero_contrato() to authenticated;
grant execute on function public.gerar_programacao_contrato(uuid) to authenticated;
grant execute on function public.salvar_equipamento_contrato(uuid, uuid, uuid, text, date, date) to authenticated;
grant execute on function public.remover_equipamento_contrato(uuid) to authenticated;
