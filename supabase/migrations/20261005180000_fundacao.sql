-- ELEVA Manutenção — Fase 1
-- Perfil só entra se app_metadata.perfil for exatamente admin ou prestador.
-- user_metadata não concede perfil. Não há default prestador.

create extension if not exists pgcrypto;

create or replace function public.perfil_explicito(meta jsonb)
returns text
language sql
immutable
as $$
  select case
    when meta->>'perfil' in ('admin', 'prestador') then meta->>'perfil'
    else null
  end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table public.usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  email text unique,
  telefone text,
  perfil text check (perfil in ('admin', 'prestador')),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.condominios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cep text,
  endereco text not null,
  numero text,
  complemento text,
  bairro text not null,
  cidade text not null,
  estado text not null,
  quantidade_unidades integer check (quantidade_unidades is null or quantidade_unidades >= 0),
  ativo boolean not null default true,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sindicos (
  id uuid primary key default gen_random_uuid(),
  condominio_id uuid not null references public.condominios (id),
  nome text not null,
  whatsapp text,
  email text,
  data_inicio date,
  data_fim date,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (data_fim is null or data_inicio is null or data_fim >= data_inicio)
);

create unique index sindicos_um_ativo_por_condominio
  on public.sindicos (condominio_id)
  where ativo;

create table public.prestadores (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid unique references public.usuarios (id),
  nome text not null,
  whatsapp text not null check (length(trim(whatsapp)) > 0),
  email text,
  ativo boolean not null default true,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.equipamentos_matriz (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  categoria text not null,
  fabricante text,
  modelo text,
  ativo boolean not null default true,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contratos (
  id uuid primary key default gen_random_uuid(),
  numero_contrato text not null unique,
  condominio_id uuid not null references public.condominios (id),
  tipo text not null default 'mensal' check (tipo = 'mensal'),
  data_inicio_contrato date not null,
  data_fim_contrato date,
  data_inicio_manutencao date not null,
  quantidade_visitas integer not null check (quantidade_visitas > 0),
  prestador_padrao_id uuid references public.prestadores (id),
  status text not null default 'ativo' check (status in ('ativo', 'encerrado', 'cancelado')),
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (data_fim_contrato is null or data_fim_contrato >= data_inicio_contrato)
);

create table public.equipamentos_contrato (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos (id),
  equipamento_matriz_id uuid not null references public.equipamentos_matriz (id),
  nome_identificacao text not null check (length(trim(nome_identificacao)) > 0),
  data_entrada date not null,
  ativo boolean not null default true,
  data_saida date,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (data_saida is null or data_saida >= data_entrada)
);

create table public.manutencoes (
  id uuid primary key default gen_random_uuid(),
  condominio_id uuid not null references public.condominios (id),
  contrato_id uuid references public.contratos (id),
  numero_visita integer,
  data_programada_original date not null,
  data_programada_atual date not null,
  data_realizada date,
  prestador_id uuid references public.prestadores (id),
  tipo text not null check (tipo in ('preventiva', 'corretiva', 'corretiva_complementar', 'avulsa')),
  origem text not null check (origem in ('automatica', 'manual')),
  status text not null default 'programada' check (
    status in ('programada', 'em_execucao', 'aguardando_administracao', 'realizada', 'cancelada')
  ),
  finalizada_em timestamptz,
  finalizada_por uuid references public.usuarios (id),
  observacoes_administrativas text,
  pdf_url text,
  ocorrencia_origem_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint manutencoes_tipo_vinculos check (
    (
      tipo = 'avulsa'
      and contrato_id is null
      and numero_visita is null
      and ocorrencia_origem_id is null
    )
    or (
      tipo = 'preventiva'
      and contrato_id is not null
      and numero_visita is not null
      and numero_visita > 0
      and ocorrencia_origem_id is null
    )
    or (
      tipo = 'corretiva'
      and contrato_id is not null
      and numero_visita is null
      and ocorrencia_origem_id is null
    )
    or (
      tipo = 'corretiva_complementar'
      and numero_visita is null
      and ocorrencia_origem_id is not null
    )
  )
);

create unique index manutencoes_numero_por_contrato
  on public.manutencoes (contrato_id, numero_visita)
  where numero_visita is not null;

create index manutencoes_prestador_idx on public.manutencoes (prestador_id);
create index manutencoes_condominio_idx on public.manutencoes (condominio_id);
create index manutencoes_status_idx on public.manutencoes (status);

create table public.historico_reagendamentos (
  id uuid primary key default gen_random_uuid(),
  manutencao_id uuid not null references public.manutencoes (id),
  data_anterior date not null,
  nova_data date not null,
  alterado_por uuid references public.usuarios (id),
  motivo text,
  created_at timestamptz not null default now()
);

create table public.itens_manutencao (
  id uuid primary key default gen_random_uuid(),
  manutencao_id uuid not null references public.manutencoes (id),
  equipamento_contrato_id uuid references public.equipamentos_contrato (id),
  equipamento_matriz_id uuid references public.equipamentos_matriz (id),
  nome_identificacao text not null check (length(trim(nome_identificacao)) > 0),
  resultado text not null default 'pendente' check (resultado in ('pendente', 'ok', 'ocorrencia')),
  registrado_por uuid references public.usuarios (id),
  registrado_em timestamptz,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index itens_um_equipamento_contrato
  on public.itens_manutencao (manutencao_id, equipamento_contrato_id)
  where equipamento_contrato_id is not null;

create unique index itens_um_equipamento_avulso
  on public.itens_manutencao (manutencao_id, equipamento_matriz_id, nome_identificacao)
  where equipamento_matriz_id is not null;

create table public.ocorrencias (
  id uuid primary key default gen_random_uuid(),
  item_manutencao_id uuid not null unique references public.itens_manutencao (id),
  resolvida_no_local boolean not null,
  descricao_original text not null,
  foto_url text not null,
  necessita_orcamento boolean not null default false,
  necessita_retorno boolean not null default false,
  classificacao_interna text check (
    classificacao_interna is null
    or classificacao_interna in (
      'Contratual',
      'Corretiva',
      'Corretiva complementar/retorno',
      'Corretiva fora de contrato/com custo'
    )
  ),
  descricao_padronizada text,
  texto_para_sindico text,
  enviar_para_sindico boolean not null default false,
  status_ocorrencia text not null check (
    status_ocorrencia in (
      'aberta',
      'em_analise',
      'aguardando_orcamento',
      'aguardando_retorno',
      'resolvida',
      'encerrada'
    )
  ),
  observacoes_administrativas text,
  data_registro timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.manutencoes
  add constraint manutencoes_ocorrencia_origem_fk
  foreign key (ocorrencia_origem_id) references public.ocorrencias (id);

create index manutencoes_ocorrencia_origem_idx
  on public.manutencoes (ocorrencia_origem_id);

create table public.auditoria (
  id uuid primary key default gen_random_uuid(),
  tabela text not null,
  registro_id uuid not null,
  acao text not null,
  ator_id uuid references public.usuarios (id),
  detalhe jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios
    where id = auth.uid()
      and perfil = 'admin'
      and ativo = true
  );
$$;

create or replace function public.is_prestador()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios
    where id = auth.uid()
      and perfil = 'prestador'
      and ativo = true
  );
$$;

create or replace function public.prestador_id_atual()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.prestadores p
  join public.usuarios u on u.id = p.usuario_id
  where p.usuario_id = auth.uid()
    and p.ativo = true
    and u.ativo = true
    and u.perfil = 'prestador'
  limit 1;
$$;

create or replace function public.handle_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  novo_perfil text;
  nome_base text;
begin
  novo_perfil := public.perfil_explicito(new.raw_app_meta_data);
  nome_base := nullif(trim(coalesce(new.raw_user_meta_data->>'nome', '')), '');
  if nome_base is null then
    nome_base := nullif(split_part(coalesce(new.email, ''), '@', 1), '');
  end if;
  if nome_base is null then
    nome_base := 'Usuário';
  end if;

  if tg_op = 'INSERT' then
    insert into public.usuarios (id, nome, email, telefone, perfil)
    values (
      new.id,
      nome_base,
      new.email,
      nullif(trim(coalesce(new.raw_user_meta_data->>'telefone', '')), ''),
      novo_perfil
    );
  elsif new.raw_app_meta_data is distinct from old.raw_app_meta_data
     or new.email is distinct from old.email then
    update public.usuarios
      set email = new.email,
          perfil = case
            when new.raw_app_meta_data is distinct from old.raw_app_meta_data then novo_perfil
            else perfil
          end
      where id = new.id;
  end if;

  return new;
end;
$$;

create trigger on_auth_user
  after insert or update of email, raw_app_meta_data
  on auth.users
  for each row
  execute function public.handle_auth_user();

create or replace function public.data_visita_mensal(p_inicio date, p_indice integer)
returns date
language plpgsql
immutable
as $$
declare
  dia integer;
  primeiro_dia date;
  ultimo_dia date;
begin
  if p_indice < 0 then
    raise exception 'Índice de visita inválido';
  end if;

  dia := extract(day from p_inicio)::integer;
  primeiro_dia := (date_trunc('month', p_inicio::timestamp) + make_interval(months => p_indice))::date;
  ultimo_dia := (primeiro_dia + interval '1 month' - interval '1 day')::date;

  if dia > extract(day from ultimo_dia)::integer then
    return ultimo_dia;
  end if;

  return make_date(
    extract(year from primeiro_dia)::integer,
    extract(month from primeiro_dia)::integer,
    dia
  );
end;
$$;

create or replace function public.agenda_incompativel(
  p_inicio date,
  p_quantidade integer,
  p_fim date
)
returns boolean
language sql
immutable
as $$
  select p_fim is not null
    and p_quantidade > 0
    and (
      p_inicio > p_fim
      or public.data_visita_mensal(p_inicio, p_quantidade - 1) > p_fim
    );
$$;

create or replace function public.equipamento_participa(
  p_entrada date,
  p_saida date,
  p_programada date
)
returns boolean
language sql
immutable
as $$
  select p_programada >= p_entrada
    and (p_saida is null or p_programada <= p_saida);
$$;

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

create trigger manutencoes_validar
  before insert or update on public.manutencoes
  for each row
  execute function public.validar_manutencao();

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

create trigger manutencoes_atualizar
  before update on public.manutencoes
  for each row
  execute function public.antes_de_atualizar_visita();

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

create trigger itens_gravar
  before insert or update on public.itens_manutencao
  for each row
  execute function public.antes_de_gravar_item();

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
  elsif new.status_ocorrencia is null then
    new.status_ocorrencia := case
      when new.resolvida_no_local then 'resolvida'
      else 'aberta'
    end;
  end if;

  return new;
end;
$$;

create trigger ocorrencias_gravar
  before insert or update on public.ocorrencias
  for each row
  execute function public.antes_de_gravar_ocorrencia();

create or replace function public.conferir_par_item_ocorrencia()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  item_id uuid;
  resultado text;
  qtd integer;
begin
  if tg_table_name = 'itens_manutencao' then
    item_id := coalesce(new.id, old.id);
  else
    item_id := coalesce(new.item_manutencao_id, old.item_manutencao_id);
  end if;

  select i.resultado into resultado
  from public.itens_manutencao i
  where i.id = item_id;

  if not found then
    select count(*) into qtd
    from public.ocorrencias
    where item_manutencao_id = item_id;

    if qtd <> 0 then
      raise exception 'Ocorrência órfã';
    end if;

    return null;
  end if;

  select count(*) into qtd
  from public.ocorrencias
  where item_manutencao_id = item_id;

  if resultado = 'ocorrencia' and qtd <> 1 then
    raise exception 'Ocorrência exige resolução, descrição e foto';
  end if;

  if resultado in ('ok', 'pendente') and qtd <> 0 then
    raise exception 'Equipamento sem ocorrência não guarda ocorrência';
  end if;

  return null;
end;
$$;

create constraint trigger itens_ocorrencia_coerente
  after insert or update or delete on public.itens_manutencao
  deferrable initially deferred
  for each row
  execute function public.conferir_par_item_ocorrencia();

create constraint trigger ocorrencias_item_coerente
  after insert or update or delete on public.ocorrencias
  deferrable initially deferred
  for each row
  execute function public.conferir_par_item_ocorrencia();

create or replace function public.visita_do_item(p_item uuid)
returns public.manutencoes
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  visita public.manutencoes%rowtype;
begin
  select m.* into visita
  from public.itens_manutencao i
  join public.manutencoes m on m.id = i.manutencao_id
  where i.id = p_item;

  if not found then
    raise exception 'Equipamento não encontrado';
  end if;

  return visita;
end;
$$;

create or replace function public.exigir_execucao(p_visita public.manutencoes)
returns void
language plpgsql
stable
as $$
begin
  if auth.uid() is null or not (public.is_admin() or public.is_prestador()) then
    raise exception 'Sem acesso operacional';
  end if;

  if p_visita.status not in ('programada', 'em_execucao') then
    raise exception 'Visita encerrada para edição do prestador';
  end if;

  if public.is_prestador()
     and p_visita.prestador_id is distinct from public.prestador_id_atual() then
    raise exception 'Visita não atribuída';
  end if;
end;
$$;

create or replace function public.registrar_ok(p_item uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  visita public.manutencoes%rowtype;
begin
  visita := public.visita_do_item(p_item);
  perform public.exigir_execucao(visita);
  perform set_config('app.executando', 'on', true);

  delete from public.ocorrencias where item_manutencao_id = p_item;

  update public.itens_manutencao
    set resultado = 'ok',
        registrado_por = auth.uid(),
        registrado_em = now()
    where id = p_item;
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
     or nullif(trim(coalesce(p_descricao, '')), '') is null
     or nullif(trim(coalesce(p_foto, '')), '') is null then
    raise exception 'Ocorrência exige resolução, descrição e foto';
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
    trim(p_foto),
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

create or replace function public.finalizar_manutencao(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  visita public.manutencoes%rowtype;
  total integer;
  pendentes integer;
  sem_ficha integer;
  nao_resolvidas integer;
  novo text;
begin
  if auth.uid() is null or not (public.is_admin() or public.is_prestador()) then
    raise exception 'Sem acesso operacional';
  end if;

  select * into visita from public.manutencoes where id = p_id for update;
  if not found then
    raise exception 'Visita não encontrada';
  end if;

  if public.is_prestador()
     and visita.prestador_id is distinct from public.prestador_id_atual() then
    raise exception 'Visita não atribuída';
  end if;

  if visita.status not in ('programada', 'em_execucao') then
    raise exception 'Visita não pode ser finalizada neste status';
  end if;

  select count(*) into total
  from public.itens_manutencao
  where manutencao_id = p_id;

  if total = 0 then
    raise exception 'Visita sem equipamentos não pode ser finalizada';
  end if;

  select count(*) into pendentes
  from public.itens_manutencao
  where manutencao_id = p_id
    and resultado = 'pendente';

  if pendentes > 0 then
    raise exception 'Todos os equipamentos precisam ser tratados';
  end if;

  select count(*) into sem_ficha
  from public.itens_manutencao i
  where i.manutencao_id = p_id
    and i.resultado = 'ocorrencia'
    and not exists (
      select 1 from public.ocorrencias o where o.item_manutencao_id = i.id
    );

  if sem_ficha > 0 then
    raise exception 'Ocorrência exige resolução, descrição e foto';
  end if;

  select count(*) into nao_resolvidas
  from public.itens_manutencao i
  join public.ocorrencias o on o.item_manutencao_id = i.id
  where i.manutencao_id = p_id
    and o.resolvida_no_local = false;

  if nao_resolvidas > 0 then
    novo := 'aguardando_administracao';
  else
    novo := 'realizada';
  end if;

  perform set_config('app.finalizando', 'on', true);

  update public.manutencoes
    set status = novo,
        data_realizada = coalesce(data_realizada, current_date),
        finalizada_em = now(),
        finalizada_por = auth.uid()
    where id = p_id;

  return novo;
end;
$$;

create or replace function public.cancelar_manutencao(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  situacao text;
begin
  if not public.is_admin() then
    raise exception 'Somente o ADM pode cancelar uma visita';
  end if;

  select status into situacao from public.manutencoes where id = p_id for update;
  if not found then
    raise exception 'Visita não encontrada';
  end if;

  if situacao in ('realizada', 'aguardando_administracao', 'cancelada') then
    raise exception 'Visita já encerrada';
  end if;

  perform set_config('app.cancelando', 'on', true);

  update public.manutencoes
    set status = 'cancelada'
    where id = p_id;
end;
$$;

create trigger usuarios_updated
  before update on public.usuarios
  for each row execute function public.set_updated_at();
create trigger condominios_updated
  before update on public.condominios
  for each row execute function public.set_updated_at();
create trigger sindicos_updated
  before update on public.sindicos
  for each row execute function public.set_updated_at();
create trigger prestadores_updated
  before update on public.prestadores
  for each row execute function public.set_updated_at();
create trigger equipamentos_matriz_updated
  before update on public.equipamentos_matriz
  for each row execute function public.set_updated_at();
create trigger contratos_updated
  before update on public.contratos
  for each row execute function public.set_updated_at();
create trigger equipamentos_contrato_updated
  before update on public.equipamentos_contrato
  for each row execute function public.set_updated_at();
create trigger manutencoes_updated
  before update on public.manutencoes
  for each row execute function public.set_updated_at();
create trigger itens_updated
  before update on public.itens_manutencao
  for each row execute function public.set_updated_at();
create trigger ocorrencias_updated
  before update on public.ocorrencias
  for each row execute function public.set_updated_at();

alter table public.usuarios enable row level security;
alter table public.condominios enable row level security;
alter table public.sindicos enable row level security;
alter table public.prestadores enable row level security;
alter table public.equipamentos_matriz enable row level security;
alter table public.contratos enable row level security;
alter table public.equipamentos_contrato enable row level security;
alter table public.manutencoes enable row level security;
alter table public.historico_reagendamentos enable row level security;
alter table public.itens_manutencao enable row level security;
alter table public.ocorrencias enable row level security;
alter table public.auditoria enable row level security;

create policy admin_total on public.usuarios
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy ler_a_si_mesmo on public.usuarios
  for select to authenticated
  using (id = auth.uid());

create policy admin_total on public.condominios
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy prestador_le_condominio on public.condominios
  for select to authenticated
  using (
    public.is_prestador()
    and id in (
      select m.condominio_id
      from public.manutencoes m
      where m.prestador_id = public.prestador_id_atual()
    )
  );

create policy admin_total on public.sindicos
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy admin_total on public.prestadores
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy prestador_le_a_si on public.prestadores
  for select to authenticated
  using (public.is_prestador() and usuario_id = auth.uid());

create policy admin_total on public.equipamentos_matriz
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy prestador_le_matriz on public.equipamentos_matriz
  for select to authenticated
  using (
    public.is_prestador()
    and (
      id in (
        select i.equipamento_matriz_id
        from public.itens_manutencao i
        where i.equipamento_matriz_id is not null
      )
      or id in (
        select ec.equipamento_matriz_id
        from public.equipamentos_contrato ec
      )
    )
  );

create policy admin_total on public.contratos
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy prestador_le_contrato on public.contratos
  for select to authenticated
  using (
    public.is_prestador()
    and id in (
      select m.contrato_id
      from public.manutencoes m
      where m.contrato_id is not null
        and m.prestador_id = public.prestador_id_atual()
    )
  );

create policy admin_total on public.equipamentos_contrato
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy prestador_le_equipamento on public.equipamentos_contrato
  for select to authenticated
  using (
    public.is_prestador()
    and contrato_id in (
      select m.contrato_id
      from public.manutencoes m
      where m.contrato_id is not null
        and m.prestador_id = public.prestador_id_atual()
    )
  );

create policy admin_total on public.manutencoes
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy prestador_le_visita on public.manutencoes
  for select to authenticated
  using (
    public.is_prestador()
    and prestador_id = public.prestador_id_atual()
  );

create policy admin_total on public.historico_reagendamentos
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy admin_total on public.itens_manutencao
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy prestador_le_item on public.itens_manutencao
  for select to authenticated
  using (
    public.is_prestador()
    and manutencao_id in (
      select m.id
      from public.manutencoes m
      where m.prestador_id = public.prestador_id_atual()
    )
  );

create policy admin_total on public.ocorrencias
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy prestador_le_ocorrencia on public.ocorrencias
  for select to authenticated
  using (
    public.is_prestador()
    and item_manutencao_id in (select i.id from public.itens_manutencao i)
  );

create policy admin_total on public.auditoria
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;

revoke all on function public.registrar_ok(uuid) from public;
revoke all on function public.registrar_ocorrencia(uuid, boolean, text, text) from public;
revoke all on function public.finalizar_manutencao(uuid) from public;
revoke all on function public.cancelar_manutencao(uuid) from public;
grant execute on function public.registrar_ok(uuid) to authenticated;
grant execute on function public.registrar_ocorrencia(uuid, boolean, text, text) to authenticated;
grant execute on function public.finalizar_manutencao(uuid) to authenticated;
grant execute on function public.cancelar_manutencao(uuid) to authenticated;
