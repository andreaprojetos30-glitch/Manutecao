-- ELEVA Manutenção — Fase 6, confirmação do síndico.
-- Uma confirmação por manutenção. O banco guarda o hash do token, nunca o token.
-- O meio fica em "link": a confirmação não autentica a identidade do síndico.
-- O id e o nome do síndico ficam copiados e não mudam depois da substituição.
-- Esta migration não altera registros de manutenção já existentes.

create or replace function public.hash_token_confirmacao(p_token text)
returns text
language sql
immutable
strict
set search_path = public
as $$
  select 'sha256$' || rtrim(translate(encode(digest(p_token, 'sha256'), 'base64'), '+/', '-_'), '=');
$$;

create table public.confirmacoes_sindico (
  id uuid primary key default gen_random_uuid(),
  manutencao_id uuid not null references public.manutencoes (id) on delete restrict,
  token_hash text not null,
  sindico_id uuid not null references public.sindicos (id) on delete restrict,
  sindico_nome text not null,
  confirmado_em timestamptz not null default clock_timestamp(),
  meio text not null default 'link',
  constraint confirmacoes_sindico_manutencao_unica unique (manutencao_id),
  constraint confirmacoes_sindico_token_hash_unico unique (token_hash),
  constraint confirmacoes_sindico_token_hash_check check (token_hash ~ '^sha256[$][A-Za-z0-9_-]{43}$'),
  constraint confirmacoes_sindico_nome_check check (length(trim(sindico_nome)) > 0),
  constraint confirmacoes_sindico_meio_check check (meio = 'link')
);

comment on table public.confirmacoes_sindico is
  'Confirmação da manutenção recebida pelo link. Não autentica a identidade do síndico.';

comment on column public.confirmacoes_sindico.token_hash is
  'Hash sha256 do token aleatório do link. O token original não é gravado.';

comment on column public.confirmacoes_sindico.sindico_id is
  'Síndico ativo no momento da confirmação. O histórico permanece após a substituição.';

comment on column public.confirmacoes_sindico.sindico_nome is
  'Nome do síndico no momento da confirmação. Não acompanha alteração posterior do cadastro.';

comment on column public.confirmacoes_sindico.meio is
  'Sempre link. Não declara que a identidade do síndico foi autenticada.';

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

create trigger confirmacoes_sindico_validar
  before insert on public.confirmacoes_sindico
  for each row execute function public.validar_confirmacao_sindico();

create or replace function public.impedir_alteracao_confirmacao_sindico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'A confirmação do síndico não pode ser alterada';
end;
$$;

create trigger confirmacoes_sindico_imutavel
  before update or delete on public.confirmacoes_sindico
  for each row execute function public.impedir_alteracao_confirmacao_sindico();

create or replace function public.registrar_confirmacao_sindico(
  p_manutencao_id uuid,
  p_token text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  visita public.manutencoes%rowtype;
  sindico public.sindicos%rowtype;
  novo_id uuid;
  hash text;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'Informe o token do link';
  end if;

  select * into visita
  from public.manutencoes
  where id = p_manutencao_id
  for update;

  if not found then
    raise exception 'Manutenção não encontrada';
  end if;

  if visita.status = 'cancelada' then
    raise exception 'Manutenção cancelada não recebe confirmação';
  end if;

  if visita.registro_anterior then
    raise exception 'Registro anterior não recebe confirmação';
  end if;

  select * into sindico
  from public.sindicos
  where condominio_id = visita.condominio_id
    and ativo = true;

  if not found or nullif(trim(sindico.nome), '') is null then
    raise exception 'Não há síndico ativo neste condomínio';
  end if;

  if exists (
    select 1
    from public.confirmacoes_sindico
    where manutencao_id = visita.id
  ) then
    raise exception 'Esta manutenção já tem confirmação';
  end if;

  hash := public.hash_token_confirmacao(p_token);
  if position(p_token in hash) > 0 or hash = p_token then
    raise exception 'A confirmação guarda somente o hash do token';
  end if;

  if exists (
    select 1
    from public.confirmacoes_sindico
    where token_hash = hash
  ) then
    raise exception 'Este link já foi utilizado';
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
      if sqlerrm like '%token_hash%' then
        raise exception 'Este link já foi utilizado';
      end if;
      raise exception 'Esta manutenção já tem confirmação';
  end;

  return novo_id;
end;
$$;

revoke all on function public.hash_token_confirmacao(text) from public, anon, authenticated;
revoke all on function public.validar_confirmacao_sindico() from public, anon, authenticated;
revoke all on function public.impedir_alteracao_confirmacao_sindico() from public, anon, authenticated;
revoke all on function public.registrar_confirmacao_sindico(uuid, text) from public, anon, authenticated;

alter table public.confirmacoes_sindico enable row level security;
alter table public.confirmacoes_sindico force row level security;

revoke all on table public.confirmacoes_sindico from public;
revoke all on table public.confirmacoes_sindico from anon;
revoke all on table public.confirmacoes_sindico from authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    revoke all on table public.confirmacoes_sindico from service_role;
    grant select on table public.confirmacoes_sindico to service_role;
    revoke all on function public.hash_token_confirmacao(text) from service_role;
    revoke all on function public.validar_confirmacao_sindico() from service_role;
    revoke all on function public.impedir_alteracao_confirmacao_sindico() from service_role;
    revoke all on function public.registrar_confirmacao_sindico(uuid, text) from service_role;
    grant execute on function public.registrar_confirmacao_sindico(uuid, text) to service_role;
  end if;
end $$;
