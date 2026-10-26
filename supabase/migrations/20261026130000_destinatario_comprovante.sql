-- ELEVA Manutenção — Fase 6, responsável pelo recebimento dos comprovantes.
-- O síndico continua o contato principal. Sem indicação, ele recebe os comprovantes.
-- Esta migration não altera registros de manutenção nem reescreve confirmações.

create table public.destinatarios_comprovante (
  id uuid primary key default gen_random_uuid(),
  condominio_id uuid not null references public.condominios (id),
  papel text not null,
  complemento text,
  sindico_id uuid references public.sindicos (id),
  nome text not null,
  whatsapp text,
  email text,
  data_inicio date not null,
  data_fim date,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint destinatarios_comprovante_papel_check check (
    papel in ('sindico', 'gerente', 'conselheiro', 'administradora', 'outro')
  ),
  constraint destinatarios_comprovante_nome_check check (length(trim(nome)) > 0),
  constraint destinatarios_comprovante_outro_check check (
    (papel = 'outro' and nullif(trim(coalesce(complemento, '')), '') is not null)
    or (papel <> 'outro' and complemento is null)
  ),
  constraint destinatarios_comprovante_sindico_check check (
    (papel = 'sindico' and sindico_id is not null)
    or (papel <> 'sindico' and sindico_id is null)
  ),
  constraint destinatarios_comprovante_whatsapp_check check (
    papel = 'sindico' or nullif(trim(coalesce(whatsapp, '')), '') is not null
  ),
  constraint destinatarios_comprovante_periodo_check check (
    (ativo = true and data_fim is null)
    or (ativo = false and data_fim is not null)
  ),
  constraint destinatarios_comprovante_datas_check check (
    data_fim is null or data_fim >= data_inicio
  )
);

create unique index destinatarios_comprovante_um_ativo
  on public.destinatarios_comprovante (condominio_id)
  where ativo;

create index destinatarios_comprovante_condominio_idx
  on public.destinatarios_comprovante (condominio_id);

comment on table public.destinatarios_comprovante is
  'Quem recebe e confirma os comprovantes. Sem linha ativa, o destinatário é o síndico ativo.';

alter table public.links_confirmacao_sindico
  add column destinatario_id uuid references public.destinatarios_comprovante (id),
  add column sindico_destinatario_id uuid references public.sindicos (id),
  add column destinatario_papel text,
  add column destinatario_nome text,
  add constraint links_confirmacao_sindico_vinculo_check check (
    (
      destinatario_id is null
      and sindico_destinatario_id is null
      and destinatario_papel is null
      and destinatario_nome is null
    )
    or (
      destinatario_papel in ('sindico', 'gerente', 'conselheiro', 'administradora', 'outro')
      and nullif(trim(destinatario_nome), '') is not null
      and (
        (
          destinatario_papel = 'sindico'
          and sindico_destinatario_id is not null
          and destinatario_id is null
        )
        or (
          destinatario_papel <> 'sindico'
          and destinatario_id is not null
          and sindico_destinatario_id is null
        )
      )
    )
  );

comment on column public.links_confirmacao_sindico.sindico_destinatario_id is
  'Síndico autorizado no momento da emissão, quando não há destinatário indicado.';

comment on column public.links_confirmacao_sindico.destinatario_id is
  'Destinatário indicado autorizado no momento da emissão.';

alter table public.confirmacoes_sindico
  alter column sindico_id drop not null,
  add column destinatario_id uuid references public.destinatarios_comprovante (id),
  add column destinatario_papel text,
  add column destinatario_nome text,
  add constraint confirmacoes_sindico_destinatario_check check (
    (
      destinatario_papel is null
      and destinatario_id is null
      and destinatario_nome is null
      and sindico_id is not null
    )
    or (
      destinatario_papel = 'sindico'
      and sindico_id is not null
      and destinatario_id is null
      and nullif(trim(destinatario_nome), '') is not null
    )
    or (
      destinatario_papel in ('gerente', 'conselheiro', 'administradora', 'outro')
      and sindico_id is null
      and destinatario_id is not null
      and nullif(trim(destinatario_nome), '') is not null
    )
  );

comment on column public.confirmacoes_sindico.destinatario_nome is
  'Nome de quem estava autorizado a receber no momento da confirmação. Não muda depois.';

create or replace function public.resolver_destinatario_confirmacao(p_condominio_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  indicado public.destinatarios_comprovante%rowtype;
  sindico public.sindicos%rowtype;
begin
  select * into indicado
  from public.destinatarios_comprovante
  where condominio_id = p_condominio_id
    and ativo;

  if found then
    if nullif(trim(indicado.nome), '') is null then
      return null;
    end if;
    if indicado.papel = 'sindico' then
      select * into sindico
      from public.sindicos
      where id = indicado.sindico_id
        and condominio_id = p_condominio_id
        and ativo;
      if not found or nullif(trim(sindico.nome), '') is null then
        return null;
      end if;
    end if;
    return jsonb_build_object(
      'origem', case when indicado.papel = 'sindico' then 'sindico' else 'indicado' end,
      'destinatario_id', case when indicado.papel = 'sindico' then null else indicado.id end,
      'sindico_id', case when indicado.papel = 'sindico' then indicado.sindico_id else null end,
      'papel', indicado.papel,
      'nome', trim(case when indicado.papel = 'sindico' then sindico.nome else indicado.nome end),
      'complemento', indicado.complemento
    );
  end if;

  select * into sindico
  from public.sindicos
  where condominio_id = p_condominio_id
    and ativo;

  if not found or nullif(trim(sindico.nome), '') is null then
    return null;
  end if;

  return jsonb_build_object(
    'origem', 'sindico',
    'destinatario_id', null,
    'sindico_id', sindico.id,
    'papel', 'sindico',
    'nome', trim(sindico.nome),
    'complemento', null
  );
end;
$$;

create or replace function public.vinculo_confirma_destinatario(
  p_papel text,
  p_destinatario_id uuid,
  p_sindico_id uuid,
  p_atual jsonb
)
returns boolean
language sql
immutable
as $$
  select p_atual is not null
    and p_papel is not null
    and p_papel = p_atual->>'papel'
    and (
      (
        p_papel = 'sindico'
        and p_sindico_id is not null
        and p_destinatario_id is null
        and p_atual->>'origem' = 'sindico'
        and p_sindico_id = (p_atual->>'sindico_id')::uuid
      )
      or (
        p_papel <> 'sindico'
        and p_destinatario_id is not null
        and p_sindico_id is null
        and p_atual->>'origem' = 'indicado'
        and p_destinatario_id = (p_atual->>'destinatario_id')::uuid
      )
    );
$$;

create or replace function public.revogar_links_pendentes_do_condominio(
  p_condominio_id uuid,
  p_revogado_por uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  atualizados integer;
begin
  perform public.exigir_adm_do_link(p_revogado_por, 'Somente o ADM revoga o link');

  update public.links_confirmacao_sindico link
    set revogado_em = clock_timestamp(),
        revogado_por = p_revogado_por
    where link.revogado_em is null
      and link.manutencao_id in (
        select visita.id
        from public.manutencoes visita
        where visita.condominio_id = p_condominio_id
      )
      and not exists (
        select 1
        from public.confirmacoes_sindico confirmacao
        where confirmacao.manutencao_id = link.manutencao_id
      );

  get diagnostics atualizados = row_count;
  return atualizados;
end;
$$;

create or replace function public.sindicos_invalidar_links_do_destinatario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'UPDATE' or old.ativo is not true or new.ativo is true then
    return new;
  end if;

  if exists (
    select 1
    from public.destinatarios_comprovante indicado
    where indicado.condominio_id = new.condominio_id
      and indicado.ativo
      and not (indicado.papel = 'sindico' and indicado.sindico_id = old.id)
  ) then
    return new;
  end if;

  if auth.uid() is null then
    raise exception 'Sem responsável para invalidar os links pendentes';
  end if;

  perform public.revogar_links_pendentes_do_condominio(new.condominio_id, auth.uid());
  return new;
end;
$$;

drop trigger if exists sindicos_invalidar_links_do_destinatario on public.sindicos;
create trigger sindicos_invalidar_links_do_destinatario
  after update on public.sindicos
  for each row execute function public.sindicos_invalidar_links_do_destinatario();

create or replace function public.proteger_historico_destinatario()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.ativo = false and new.ativo = true then
    raise exception 'Um destinatário encerrado não volta a ficar ativo';
  end if;
  if new.condominio_id is distinct from old.condominio_id
     or new.papel is distinct from old.papel
     or new.sindico_id is distinct from old.sindico_id then
    raise exception 'O destinatário não pode trocar de condomínio nem de papel';
  end if;
  if old.data_fim is not null and new.data_fim is distinct from old.data_fim then
    raise exception 'A data de fim de um período encerrado não pode ser alterada';
  end if;
  return new;
end;
$$;

drop trigger if exists destinatarios_comprovante_historico on public.destinatarios_comprovante;
create trigger destinatarios_comprovante_historico
  before update on public.destinatarios_comprovante
  for each row execute function public.proteger_historico_destinatario();

drop trigger if exists destinatarios_comprovante_updated on public.destinatarios_comprovante;
create trigger destinatarios_comprovante_updated
  before update on public.destinatarios_comprovante
  for each row execute function public.set_updated_at();

create or replace function public.definir_destinatario_comprovante(
  p_condominio_id uuid,
  p_papel text,
  p_nome text,
  p_whatsapp text,
  p_email text,
  p_complemento text,
  p_data_inicio date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  atual public.destinatarios_comprovante%rowtype;
  novo_id uuid;
  fim date;
  nome_limpo text;
  whatsapp_limpo text;
  complemento_limpo text;
begin
  if not public.is_admin() then
    raise exception 'Somente o ADM indica quem recebe os comprovantes';
  end if;

  if not exists (select 1 from public.condominios where id = p_condominio_id) then
    raise exception 'Condomínio não encontrado';
  end if;

  if p_papel is null or p_papel not in ('gerente', 'conselheiro', 'administradora', 'outro') then
    raise exception 'Informe o papel de quem recebe os comprovantes';
  end if;

  nome_limpo := nullif(trim(coalesce(p_nome, '')), '');
  if nome_limpo is null then
    raise exception 'Informe o nome de quem recebe os comprovantes';
  end if;

  whatsapp_limpo := nullif(trim(coalesce(p_whatsapp, '')), '');
  if whatsapp_limpo is null then
    raise exception 'Informe o WhatsApp de quem recebe os comprovantes';
  end if;

  complemento_limpo := nullif(trim(coalesce(p_complemento, '')), '');
  if p_papel = 'outro' and complemento_limpo is null then
    raise exception 'Informe qual é o responsável';
  end if;
  if p_papel <> 'outro' then
    complemento_limpo := null;
  end if;

  if p_data_inicio is null then
    raise exception 'Informe a data de início';
  end if;

  select * into atual
  from public.destinatarios_comprovante
  where condominio_id = p_condominio_id
    and ativo
  for update;

  if found then
    if p_data_inicio < atual.data_inicio then
      raise exception 'A data de início precisa ser igual ou posterior à do destinatário atual';
    end if;
    fim := p_data_inicio - 1;
    if fim < atual.data_inicio then
      fim := atual.data_inicio;
    end if;
    update public.destinatarios_comprovante
      set ativo = false,
          data_fim = fim
      where id = atual.id;
  end if;

  insert into public.destinatarios_comprovante (
    condominio_id, papel, complemento, nome, whatsapp, email, data_inicio, ativo
  ) values (
    p_condominio_id,
    p_papel,
    complemento_limpo,
    nome_limpo,
    whatsapp_limpo,
    nullif(trim(coalesce(p_email, '')), ''),
    p_data_inicio,
    true
  )
  returning id into novo_id;

  perform public.revogar_links_pendentes_do_condominio(p_condominio_id, auth.uid());
  return novo_id;
end;
$$;

create or replace function public.encerrar_destinatario_comprovante(p_condominio_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  atual public.destinatarios_comprovante%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Somente o ADM indica quem recebe os comprovantes';
  end if;

  select * into atual
  from public.destinatarios_comprovante
  where condominio_id = p_condominio_id
    and ativo
  for update;

  if not found then
    raise exception 'Não há destinatário indicado para encerrar';
  end if;

  update public.destinatarios_comprovante
    set ativo = false,
        data_fim = greatest(current_date, atual.data_inicio)
    where id = atual.id;

  perform public.revogar_links_pendentes_do_condominio(p_condominio_id, auth.uid());
end;
$$;

create or replace function public.impedir_alteracao_link_confirmacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'O link de confirmação não pode ser apagado';
  end if;

  if new.manutencao_id is distinct from old.manutencao_id
     or new.token_hash is distinct from old.token_hash
     or new.emitido_em is distinct from old.emitido_em
     or new.emitido_por is distinct from old.emitido_por
     or new.destinatario_id is distinct from old.destinatario_id
     or new.sindico_destinatario_id is distinct from old.sindico_destinatario_id
     or new.destinatario_papel is distinct from old.destinatario_papel
     or new.destinatario_nome is distinct from old.destinatario_nome
     or old.revogado_em is not null
     or new.revogado_em is null
     or new.revogado_por is null then
    raise exception 'O link de confirmação não pode ser alterado';
  end if;

  return new;
end;
$$;

create or replace function public.emitir_link_confirmacao_sindico(
  p_manutencao_id uuid,
  p_token text,
  p_emitido_por uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  visita public.manutencoes%rowtype;
  hash text;
  novo_id uuid;
  atual jsonb;
begin
  perform public.exigir_adm_do_link(p_emitido_por, 'Somente o ADM emite o link');

  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'Informe o token do link';
  end if;

  hash := public.hash_token_confirmacao(p_token);
  if position(p_token in hash) > 0 or hash = p_token then
    raise exception 'A confirmação guarda somente o hash do token';
  end if;

  select * into visita
  from public.manutencoes
  where id = p_manutencao_id
  for update;

  if not found then
    raise exception 'Manutenção não encontrada';
  end if;

  if visita.status = 'cancelada' then
    raise exception 'Manutenção cancelada não recebe link';
  end if;

  if visita.registro_anterior then
    raise exception 'Registro anterior não recebe link';
  end if;

  if visita.status not in ('realizada', 'aguardando_administracao')
     or not public.comprovante_privado_liberado(visita) then
    raise exception 'O comprovante ainda não foi liberado';
  end if;

  if exists (
    select 1
    from public.confirmacoes_sindico
    where manutencao_id = visita.id
  ) then
    raise exception 'Esta manutenção já tem confirmação';
  end if;

  atual := public.resolver_destinatario_confirmacao(visita.condominio_id);
  if atual is null then
    raise exception 'Não há responsável autorizado para receber o comprovante';
  end if;

  update public.links_confirmacao_sindico
    set revogado_em = clock_timestamp(),
        revogado_por = p_emitido_por
    where manutencao_id = visita.id
      and revogado_em is null;

  insert into public.links_confirmacao_sindico (
    manutencao_id,
    token_hash,
    emitido_por,
    destinatario_id,
    sindico_destinatario_id,
    destinatario_papel,
    destinatario_nome
  ) values (
    visita.id,
    hash,
    p_emitido_por,
    case when atual->>'papel' = 'sindico' then null else (atual->>'destinatario_id')::uuid end,
    case when atual->>'papel' = 'sindico' then (atual->>'sindico_id')::uuid else null end,
    atual->>'papel',
    atual->>'nome'
  )
  returning id into novo_id;

  return novo_id;
exception
  when unique_violation then
    raise exception 'Este link já foi emitido';
end;
$$;

create or replace function public.ler_link_confirmacao_sindico(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  hash text;
  link public.links_confirmacao_sindico%rowtype;
  visita public.manutencoes%rowtype;
  condominio_nome text;
  quantidade integer;
  confirmacao public.confirmacoes_sindico%rowtype;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    return null;
  end if;

  hash := public.hash_token_confirmacao(p_token);

  select * into link
  from public.links_confirmacao_sindico
  where token_hash = hash
    and revogado_em is null;

  if not found then
    return null;
  end if;

  select * into visita
  from public.manutencoes
  where id = link.manutencao_id;

  if not found
     or visita.status = 'cancelada'
     or visita.registro_anterior
     or visita.status not in ('realizada', 'aguardando_administracao')
     or not public.comprovante_privado_liberado(visita) then
    return null;
  end if;

  select nome into condominio_nome
  from public.condominios
  where id = visita.condominio_id;

  if nullif(trim(coalesce(condominio_nome, '')), '') is null then
    return null;
  end if;

  select quantidade_visitas into quantidade
  from public.contratos
  where id = visita.contrato_id;

  select * into confirmacao
  from public.confirmacoes_sindico
  where manutencao_id = visita.id;

  if not found
     and not public.vinculo_confirma_destinatario(
       link.destinatario_papel,
       link.destinatario_id,
       link.sindico_destinatario_id,
       public.resolver_destinatario_confirmacao(visita.condominio_id)
     ) then
    return null;
  end if;

  return jsonb_build_object(
    'manutencao_id', visita.id,
    'condominio', trim(condominio_nome),
    'tipo', visita.tipo,
    'numero_visita', visita.numero_visita,
    'quantidade_visitas', quantidade,
    'data_efetiva', visita.data_realizada,
    'caminho_pdf', visita.pdf_url,
    'confirmado_em', confirmacao.confirmado_em,
    'sindico_id', confirmacao.sindico_id,
    'sindico_nome', confirmacao.sindico_nome,
    'meio', confirmacao.meio
  );
end;
$$;

create or replace function public.resumo_link_confirmacao_sindico(p_manutencao_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  visita public.manutencoes%rowtype;
  emitido timestamptz;
  confirmacao public.confirmacoes_sindico%rowtype;
  atual jsonb;
begin
  select * into visita
  from public.manutencoes
  where id = p_manutencao_id;

  if not found then
    return null;
  end if;

  select emitido_em into emitido
  from public.links_confirmacao_sindico
  where manutencao_id = visita.id
    and revogado_em is null;

  select * into confirmacao
  from public.confirmacoes_sindico
  where manutencao_id = visita.id;

  atual := public.resolver_destinatario_confirmacao(visita.condominio_id);

  return jsonb_build_object(
    'link_ativo', emitido is not null,
    'emitido_em', emitido,
    'confirmado_em', confirmacao.confirmado_em,
    'sindico_id', confirmacao.sindico_id,
    'sindico_nome', confirmacao.sindico_nome,
    'meio', confirmacao.meio,
    'destinatario_nome', case
      when confirmacao.id is not null then coalesce(confirmacao.destinatario_nome, confirmacao.sindico_nome)
      else atual->>'nome'
    end,
    'destinatario_papel', case
      when confirmacao.id is not null then coalesce(confirmacao.destinatario_papel, 'sindico')
      else atual->>'papel'
    end,
    'destinatario_complemento', case
      when confirmacao.id is not null then null
      else atual->>'complemento'
    end
  );
end;
$$;

create or replace function public.validar_confirmacao_sindico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  visita public.manutencoes%rowtype;
  link public.links_confirmacao_sindico%rowtype;
  atual jsonb;
begin
  select * into visita
  from public.manutencoes
  where id = new.manutencao_id;

  if not found then
    raise exception 'Manutenção não encontrada';
  end if;

  if visita.status = 'cancelada' then
    raise exception 'Manutenção cancelada não recebe confirmação';
  end if;

  if visita.registro_anterior then
    raise exception 'Registro anterior não recebe confirmação';
  end if;

  if not public.comprovante_privado_liberado(visita) then
    raise exception 'O comprovante ainda não foi liberado';
  end if;

  select * into link
  from public.links_confirmacao_sindico
  where manutencao_id = new.manutencao_id
    and token_hash = new.token_hash
    and revogado_em is null;

  if not found then
    if exists (
      select 1
      from public.links_confirmacao_sindico
      where manutencao_id = new.manutencao_id
        and token_hash = new.token_hash
        and revogado_em is not null
    ) then
      raise exception 'Este link foi revogado';
    end if;
    raise exception 'Este link não foi emitido';
  end if;

  if link.destinatario_papel is null then
    raise exception 'Este link precisa ser gerado de novo';
  end if;

  atual := public.resolver_destinatario_confirmacao(visita.condominio_id);
  if atual is null then
    raise exception 'Não há responsável autorizado para receber o comprovante';
  end if;

  if not public.vinculo_confirma_destinatario(
    link.destinatario_papel,
    link.destinatario_id,
    link.sindico_destinatario_id,
    atual
  ) then
    raise exception 'Este link não pertence mais ao responsável autorizado';
  end if;

  new.meio := 'link';
  new.confirmado_em := clock_timestamp();
  new.destinatario_papel := atual->>'papel';
  new.destinatario_nome := atual->>'nome';
  if atual->>'papel' = 'sindico' then
    new.sindico_id := (atual->>'sindico_id')::uuid;
    new.destinatario_id := null;
    new.sindico_nome := atual->>'nome';
  else
    new.sindico_id := null;
    new.destinatario_id := (atual->>'destinatario_id')::uuid;
    new.sindico_nome := atual->>'nome';
  end if;
  return new;
end;
$$;

create or replace function public.registrar_confirmacao_sindico(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  hash text;
  link public.links_confirmacao_sindico%rowtype;
  visita public.manutencoes%rowtype;
  atual jsonb;
  novo_id uuid;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'Informe o token do link';
  end if;

  hash := public.hash_token_confirmacao(p_token);
  if position(p_token in hash) > 0 or hash = p_token then
    raise exception 'A confirmação guarda somente o hash do token';
  end if;

  select * into link
  from public.links_confirmacao_sindico
  where token_hash = hash;

  if not found then
    raise exception 'Este link não foi emitido';
  end if;

  if link.revogado_em is not null then
    raise exception 'Este link foi revogado';
  end if;

  select * into visita
  from public.manutencoes
  where id = link.manutencao_id
  for update;

  if not found then
    raise exception 'Manutenção não encontrada';
  end if;

  select * into link
  from public.links_confirmacao_sindico
  where token_hash = hash
    and manutencao_id = visita.id
  for update;

  if not found then
    raise exception 'Este link não foi emitido';
  end if;

  if link.revogado_em is not null then
    raise exception 'Este link foi revogado';
  end if;

  if visita.status = 'cancelada' then
    raise exception 'Manutenção cancelada não recebe confirmação';
  end if;

  if visita.registro_anterior then
    raise exception 'Registro anterior não recebe confirmação';
  end if;

  if not public.comprovante_privado_liberado(visita) then
    raise exception 'O comprovante ainda não foi liberado';
  end if;

  if exists (
    select 1
    from public.confirmacoes_sindico
    where manutencao_id = visita.id
  ) then
    raise exception 'Esta manutenção já tem confirmação';
  end if;

  if link.destinatario_papel is null then
    raise exception 'Este link precisa ser gerado de novo';
  end if;

  atual := public.resolver_destinatario_confirmacao(visita.condominio_id);
  if atual is null then
    raise exception 'Não há responsável autorizado para receber o comprovante';
  end if;

  if not public.vinculo_confirma_destinatario(
    link.destinatario_papel,
    link.destinatario_id,
    link.sindico_destinatario_id,
    atual
  ) then
    raise exception 'Este link não pertence mais ao responsável autorizado';
  end if;

  begin
    insert into public.confirmacoes_sindico (
      manutencao_id,
      token_hash,
      sindico_id,
      sindico_nome,
      destinatario_id,
      destinatario_papel,
      destinatario_nome
    ) values (
      visita.id,
      hash,
      case when atual->>'papel' = 'sindico' then (atual->>'sindico_id')::uuid else null end,
      atual->>'nome',
      case when atual->>'papel' = 'sindico' then null else (atual->>'destinatario_id')::uuid end,
      atual->>'papel',
      atual->>'nome'
    )
    returning id into novo_id;
  exception
    when unique_violation then
      raise exception 'Esta manutenção já tem confirmação';
  end;

  return novo_id;
end;
$$;

revoke all on function public.resolver_destinatario_confirmacao(uuid) from public, anon, authenticated;
revoke all on function public.vinculo_confirma_destinatario(text, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.revogar_links_pendentes_do_condominio(uuid, uuid) from public, anon, authenticated;
revoke all on function public.sindicos_invalidar_links_do_destinatario() from public, anon, authenticated;
revoke all on function public.proteger_historico_destinatario() from public, anon, authenticated;
revoke all on function public.definir_destinatario_comprovante(uuid, text, text, text, text, text, date) from public, anon, authenticated;
revoke all on function public.encerrar_destinatario_comprovante(uuid) from public, anon, authenticated;

grant execute on function public.definir_destinatario_comprovante(uuid, text, text, text, text, text, date) to authenticated;
grant execute on function public.encerrar_destinatario_comprovante(uuid) to authenticated;

alter table public.destinatarios_comprovante enable row level security;
alter table public.destinatarios_comprovante force row level security;

revoke all on table public.destinatarios_comprovante from public, anon, authenticated;

create policy admin_total on public.destinatarios_comprovante
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    revoke all on table public.destinatarios_comprovante from service_role;
    grant select on table public.destinatarios_comprovante to service_role;
    revoke all on function public.resolver_destinatario_confirmacao(uuid) from service_role;
    revoke all on function public.vinculo_confirma_destinatario(text, uuid, uuid, jsonb) from service_role;
    revoke all on function public.revogar_links_pendentes_do_condominio(uuid, uuid) from service_role;
    revoke all on function public.definir_destinatario_comprovante(uuid, text, text, text, text, text, date) from service_role;
    revoke all on function public.encerrar_destinatario_comprovante(uuid) from service_role;
    grant execute on function public.definir_destinatario_comprovante(uuid, text, text, text, text, text, date) to service_role;
    grant execute on function public.encerrar_destinatario_comprovante(uuid) to service_role;
    grant execute on function public.revogar_links_pendentes_do_condominio(uuid, uuid) to service_role;
  end if;
end $$;
