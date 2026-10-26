-- ELEVA Manutenção — Fase 6, link da confirmação do síndico.
-- O ADM emite o token antes do clique. O banco guarda só o hash.
-- A confirmação reconhece apenas um link vigente, já emitido.
-- Revogar ou gerar outro invalida o anterior na hora.
-- Depois da confirmação o registro não muda e o link usado continua só para consulta.
-- Esta migration não altera manutenções já existentes.

create table public.links_confirmacao_sindico (
  id uuid primary key default gen_random_uuid(),
  manutencao_id uuid not null references public.manutencoes (id) on delete restrict,
  token_hash text not null,
  emitido_em timestamptz not null default clock_timestamp(),
  emitido_por uuid not null references public.usuarios (id) on delete restrict,
  revogado_em timestamptz,
  revogado_por uuid references public.usuarios (id) on delete restrict,
  constraint links_confirmacao_sindico_token_hash_unico unique (token_hash),
  constraint links_confirmacao_sindico_token_hash_check check (token_hash ~ '^sha256[$][A-Za-z0-9_-]{43}$'),
  constraint links_confirmacao_sindico_revogacao_check check (
    (revogado_em is null and revogado_por is null)
    or (revogado_em is not null and revogado_por is not null)
  )
);

create unique index links_confirmacao_sindico_um_ativo
  on public.links_confirmacao_sindico (manutencao_id)
  where revogado_em is null;

create index links_confirmacao_sindico_manutencao_idx
  on public.links_confirmacao_sindico (manutencao_id);

comment on table public.links_confirmacao_sindico is
  'Link emitido pelo ADM antes da confirmação. O token original não é gravado.';

comment on column public.links_confirmacao_sindico.token_hash is
  'Hash sha256 do token aleatório. O token só existe na URL entregue ao ADM no momento da emissão.';

comment on column public.links_confirmacao_sindico.revogado_em is
  'Preenchido na revogação ou quando outro link é emitido. O endereço anterior deixa de valer na hora.';

comment on column public.confirmacoes_sindico.token_hash is
  'Hash sha256 do token emitido antes da confirmação. O token original não é gravado.';

create or replace function public.exigir_adm_do_link(p_usuario uuid, p_mensagem text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and auth.uid() is distinct from p_usuario then
    raise exception '%', p_mensagem;
  end if;

  if not exists (
    select 1
    from public.usuarios
    where id = p_usuario
      and perfil = 'admin'
      and ativo = true
  ) then
    raise exception '%', p_mensagem;
  end if;
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
     or old.revogado_em is not null
     or new.revogado_em is null
     or new.revogado_por is null then
    raise exception 'O link de confirmação não pode ser alterado';
  end if;

  return new;
end;
$$;

create trigger links_confirmacao_sindico_imutavel
  before update or delete on public.links_confirmacao_sindico
  for each row execute function public.impedir_alteracao_link_confirmacao();

create or replace function public.comprovante_privado_liberado(p_visita public.manutencoes)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_visita.pdf_url = lower(p_visita.id::text) || '/comprovante.pdf'
    and position('://' in coalesce(p_visita.pdf_url, '')) = 0
    and p_visita.comprovante_liberado_em is not null
    and p_visita.data_realizada is not null;
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

  update public.links_confirmacao_sindico
    set revogado_em = clock_timestamp(),
        revogado_por = p_emitido_por
    where manutencao_id = visita.id
      and revogado_em is null;

  insert into public.links_confirmacao_sindico (
    manutencao_id,
    token_hash,
    emitido_por
  ) values (
    visita.id,
    hash,
    p_emitido_por
  )
  returning id into novo_id;

  return novo_id;
exception
  when unique_violation then
    raise exception 'Este link já foi emitido';
end;
$$;

create or replace function public.revogar_link_confirmacao_sindico(
  p_manutencao_id uuid,
  p_revogado_por uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  visita public.manutencoes%rowtype;
  atualizados integer;
begin
  perform public.exigir_adm_do_link(p_revogado_por, 'Somente o ADM revoga o link');

  select * into visita
  from public.manutencoes
  where id = p_manutencao_id
  for update;

  if not found then
    raise exception 'Manutenção não encontrada';
  end if;

  if exists (
    select 1
    from public.confirmacoes_sindico
    where manutencao_id = visita.id
  ) then
    raise exception 'A confirmação já foi registrada';
  end if;

  update public.links_confirmacao_sindico
    set revogado_em = clock_timestamp(),
        revogado_por = p_revogado_por
    where manutencao_id = visita.id
      and revogado_em is null;

  get diagnostics atualizados = row_count;
  if atualizados = 0 then
    raise exception 'Não há link para revogar';
  end if;
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

  return jsonb_build_object(
    'link_ativo', emitido is not null,
    'emitido_em', emitido,
    'confirmado_em', confirmacao.confirmado_em,
    'sindico_id', confirmacao.sindico_id,
    'sindico_nome', confirmacao.sindico_nome,
    'meio', confirmacao.meio
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
  sindico public.sindicos%rowtype;
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

  if exists (
    select 1
    from public.links_confirmacao_sindico
    where manutencao_id = new.manutencao_id
      and token_hash = new.token_hash
      and revogado_em is not null
  ) and not exists (
    select 1
    from public.links_confirmacao_sindico
    where manutencao_id = new.manutencao_id
      and token_hash = new.token_hash
      and revogado_em is null
  ) then
    raise exception 'Este link foi revogado';
  end if;

  if not exists (
    select 1
    from public.links_confirmacao_sindico
    where manutencao_id = new.manutencao_id
      and token_hash = new.token_hash
      and revogado_em is null
  ) then
    raise exception 'Este link não foi emitido';
  end if;

  select * into sindico
  from public.sindicos
  where condominio_id = visita.condominio_id
    and ativo = true;

  if not found or nullif(trim(sindico.nome), '') is null then
    raise exception 'Não há síndico ativo neste condomínio';
  end if;

  new.sindico_id := sindico.id;
  new.sindico_nome := trim(sindico.nome);
  new.meio := 'link';
  new.confirmado_em := clock_timestamp();
  return new;
end;
$$;

drop function if exists public.registrar_confirmacao_sindico(uuid, text);

create or replace function public.registrar_confirmacao_sindico(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  hash text;
  link_manutencao uuid;
  link_revogado timestamptz;
  visita public.manutencoes%rowtype;
  sindico public.sindicos%rowtype;
  novo_id uuid;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'Informe o token do link';
  end if;

  hash := public.hash_token_confirmacao(p_token);
  if position(p_token in hash) > 0 or hash = p_token then
    raise exception 'A confirmação guarda somente o hash do token';
  end if;

  select manutencao_id, revogado_em
    into link_manutencao, link_revogado
  from public.links_confirmacao_sindico
  where token_hash = hash;

  if not found then
    raise exception 'Este link não foi emitido';
  end if;

  if link_revogado is not null then
    raise exception 'Este link foi revogado';
  end if;

  select * into visita
  from public.manutencoes
  where id = link_manutencao
  for update;

  if not found then
    raise exception 'Manutenção não encontrada';
  end if;

  select revogado_em into link_revogado
  from public.links_confirmacao_sindico
  where token_hash = hash
    and manutencao_id = visita.id
  for update;

  if not found then
    raise exception 'Este link não foi emitido';
  end if;

  if link_revogado is not null then
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

  select * into sindico
  from public.sindicos
  where condominio_id = visita.condominio_id
    and ativo = true;

  if not found or nullif(trim(sindico.nome), '') is null then
    raise exception 'Não há síndico ativo neste condomínio';
  end if;

  begin
    insert into public.confirmacoes_sindico (
      manutencao_id,
      token_hash,
      sindico_id,
      sindico_nome
    ) values (
      visita.id,
      hash,
      sindico.id,
      trim(sindico.nome)
    )
    returning id into novo_id;
  exception
    when unique_violation then
      raise exception 'Esta manutenção já tem confirmação';
  end;

  return novo_id;
end;
$$;

revoke all on function public.exigir_adm_do_link(uuid, text) from public, anon, authenticated;
revoke all on function public.impedir_alteracao_link_confirmacao() from public, anon, authenticated;
revoke all on function public.comprovante_privado_liberado(public.manutencoes) from public, anon, authenticated;
revoke all on function public.emitir_link_confirmacao_sindico(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.revogar_link_confirmacao_sindico(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ler_link_confirmacao_sindico(text) from public, anon, authenticated;
revoke all on function public.resumo_link_confirmacao_sindico(uuid) from public, anon, authenticated;
revoke all on function public.registrar_confirmacao_sindico(text) from public, anon, authenticated;

alter table public.links_confirmacao_sindico enable row level security;
alter table public.links_confirmacao_sindico force row level security;

revoke all on table public.links_confirmacao_sindico from public;
revoke all on table public.links_confirmacao_sindico from anon;
revoke all on table public.links_confirmacao_sindico from authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    revoke all on table public.links_confirmacao_sindico from service_role;
    grant select on table public.links_confirmacao_sindico to service_role;
    revoke all on function public.exigir_adm_do_link(uuid, text) from service_role;
    revoke all on function public.impedir_alteracao_link_confirmacao() from service_role;
    revoke all on function public.comprovante_privado_liberado(public.manutencoes) from service_role;
    revoke all on function public.hash_token_confirmacao(text) from service_role;
    revoke all on function public.validar_confirmacao_sindico() from service_role;
    revoke all on function public.emitir_link_confirmacao_sindico(uuid, text, uuid) from service_role;
    revoke all on function public.revogar_link_confirmacao_sindico(uuid, uuid) from service_role;
    revoke all on function public.ler_link_confirmacao_sindico(text) from service_role;
    revoke all on function public.resumo_link_confirmacao_sindico(uuid) from service_role;
    revoke all on function public.registrar_confirmacao_sindico(text) from service_role;
    grant execute on function public.emitir_link_confirmacao_sindico(uuid, text, uuid) to service_role;
    grant execute on function public.revogar_link_confirmacao_sindico(uuid, uuid) to service_role;
    grant execute on function public.ler_link_confirmacao_sindico(text) to service_role;
    grant execute on function public.resumo_link_confirmacao_sindico(uuid) to service_role;
    grant execute on function public.registrar_confirmacao_sindico(text) to service_role;
  end if;
end $$;
