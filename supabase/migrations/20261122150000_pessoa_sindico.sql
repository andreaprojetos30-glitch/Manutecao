-- ELEVA Manutenção — pessoa do síndico.
-- Cada período de gestão continua em sindicos, com o mesmo id.
-- A pessoa é o contato reutilizável. A migração cria uma pessoa por período
-- já gravado e não une nomes iguais. Confirmações, links e comprovantes
-- seguem apontando para o período.

create table public.sindico_pessoas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  whatsapp text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sindico_pessoas_nome_check check (length(trim(nome)) > 0)
);

comment on table public.sindico_pessoas is
  'Pessoa do síndico. Um período de condomínio aponta para ela. Nomes iguais não são a mesma pessoa até a administração escolher.';

create trigger sindico_pessoas_updated
  before update on public.sindico_pessoas
  for each row execute function public.set_updated_at();

alter table public.sindicos
  add column pessoa_id uuid references public.sindico_pessoas (id) on delete restrict;

with pares as (
  select s.id as sindico_id, gen_random_uuid() as pessoa_id
  from public.sindicos s
),
gravadas as (
  insert into public.sindico_pessoas (id, nome, whatsapp, email, created_at, updated_at)
  select p.pessoa_id, s.nome, s.whatsapp, s.email, s.created_at, s.updated_at
  from pares p
  join public.sindicos s on s.id = p.sindico_id
  returning id
)
update public.sindicos s
  set pessoa_id = p.pessoa_id
  from pares p
  where s.id = p.sindico_id
    and exists (select 1 from gravadas g where g.id = p.pessoa_id);

alter table public.sindicos
  alter column pessoa_id set not null;

create index sindicos_pessoa_idx
  on public.sindicos (pessoa_id);

comment on column public.sindicos.pessoa_id is
  'Pessoa deste período. O id do período não muda e continua sendo a referência das confirmações.';

create or replace function public.proteger_pessoa_do_periodo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.pessoa_id is distinct from new.pessoa_id then
    raise exception 'O período permanece ligado à mesma pessoa';
  end if;
  return new;
end;
$$;

drop trigger if exists sindicos_proteger_pessoa on public.sindicos;
create trigger sindicos_proteger_pessoa
  before update on public.sindicos
  for each row
  execute function public.proteger_pessoa_do_periodo();

create or replace function public.sincronizar_contato_sindico_ativo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('app.sincronizando_pessoa', true), '') = 'on' then
    return new;
  end if;

  if old.ativo is not true then
    return new;
  end if;

  if new.nome is not distinct from old.nome
    and new.whatsapp is not distinct from old.whatsapp
    and new.email is not distinct from old.email then
    return new;
  end if;

  perform set_config('app.sincronizando_pessoa', 'on', true);

  update public.sindico_pessoas
    set nome = new.nome,
        whatsapp = new.whatsapp,
        email = new.email
    where id = new.pessoa_id;

  update public.sindicos
    set nome = new.nome,
        whatsapp = new.whatsapp,
        email = new.email
    where pessoa_id = new.pessoa_id
      and ativo
      and id <> new.id;

  return new;
end;
$$;

drop trigger if exists sindicos_sincronizar_pessoa on public.sindicos;
create trigger sindicos_sincronizar_pessoa
  before update on public.sindicos
  for each row
  execute function public.sincronizar_contato_sindico_ativo();

drop function if exists public.registrar_sindico(uuid, text, text, text, date);

create or replace function public.registrar_sindico(
  p_condominio_id uuid,
  p_nome text,
  p_whatsapp text,
  p_email text,
  p_data_inicio date,
  p_pessoa_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  atual public.sindicos%rowtype;
  pessoa public.sindico_pessoas%rowtype;
  novo_id uuid;
  pessoa_escolhida uuid;
  fim date;
  nome_limpo text;
  zap text;
  correio text;
begin
  if not public.is_admin() then
    raise exception 'Somente o ADM cadastra síndico';
  end if;

  if not exists (select 1 from public.condominios where id = p_condominio_id) then
    raise exception 'Condomínio não encontrado';
  end if;

  if p_data_inicio is null then
    raise exception 'Informe a data de início';
  end if;

  if p_pessoa_id is not null then
    select * into pessoa
    from public.sindico_pessoas
    where id = p_pessoa_id;

    if not found then
      raise exception 'Pessoa não encontrada';
    end if;

    if exists (
      select 1
      from public.sindicos
      where condominio_id = p_condominio_id
        and ativo
        and pessoa_id = pessoa.id
    ) then
      raise exception 'Esta pessoa já é o síndico ativo deste condomínio';
    end if;

    pessoa_escolhida := pessoa.id;
    nome_limpo := pessoa.nome;
    zap := pessoa.whatsapp;
    correio := pessoa.email;
  else
    nome_limpo := nullif(trim(coalesce(p_nome, '')), '');
    if nome_limpo is null then
      raise exception 'Informe o nome do síndico';
    end if;

    zap := nullif(trim(coalesce(p_whatsapp, '')), '');
    correio := nullif(trim(coalesce(p_email, '')), '');

    insert into public.sindico_pessoas (nome, whatsapp, email)
    values (nome_limpo, zap, correio)
    returning id into pessoa_escolhida;
  end if;

  select * into atual
  from public.sindicos
  where condominio_id = p_condominio_id
    and ativo
  for update;

  if found then
    if atual.data_inicio is not null and p_data_inicio < atual.data_inicio then
      raise exception 'A data de início precisa ser igual ou posterior à do síndico atual';
    end if;

    fim := p_data_inicio - 1;
    if atual.data_inicio is not null and fim < atual.data_inicio then
      fim := atual.data_inicio;
    end if;

    update public.sindicos
      set ativo = false,
          data_fim = fim
      where id = atual.id;
  end if;

  insert into public.sindicos (
    condominio_id, pessoa_id, nome, whatsapp, email, data_inicio, ativo
  ) values (
    p_condominio_id,
    pessoa_escolhida,
    nome_limpo,
    zap,
    correio,
    p_data_inicio,
    true
  )
  returning id into novo_id;

  return novo_id;
end;
$$;

create or replace function public.corrigir_pessoa_sindico(
  p_pessoa_id uuid,
  p_nome text,
  p_whatsapp text,
  p_email text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  nome_limpo text;
  zap text;
  correio text;
begin
  if not public.is_admin() then
    raise exception 'Somente o ADM cadastra síndico';
  end if;

  if not exists (select 1 from public.sindico_pessoas where id = p_pessoa_id) then
    raise exception 'Pessoa não encontrada';
  end if;

  nome_limpo := nullif(trim(coalesce(p_nome, '')), '');
  if nome_limpo is null then
    raise exception 'Informe o nome do síndico';
  end if;

  zap := nullif(trim(coalesce(p_whatsapp, '')), '');
  correio := nullif(trim(coalesce(p_email, '')), '');

  perform set_config('app.sincronizando_pessoa', 'on', true);

  update public.sindico_pessoas
    set nome = nome_limpo,
        whatsapp = zap,
        email = correio
    where id = p_pessoa_id;

  update public.sindicos
    set nome = nome_limpo,
        whatsapp = zap,
        email = correio
    where pessoa_id = p_pessoa_id
      and ativo;
end;
$$;

revoke all on function public.proteger_pessoa_do_periodo() from public, anon, authenticated;
revoke all on function public.sincronizar_contato_sindico_ativo() from public, anon, authenticated;
revoke all on function public.registrar_sindico(uuid, text, text, text, date, uuid) from public, anon, authenticated;
revoke all on function public.corrigir_pessoa_sindico(uuid, text, text, text) from public, anon, authenticated;

grant execute on function public.registrar_sindico(uuid, text, text, text, date, uuid) to authenticated;
grant execute on function public.corrigir_pessoa_sindico(uuid, text, text, text) to authenticated;

alter table public.sindico_pessoas enable row level security;
alter table public.sindico_pessoas force row level security;

revoke all on table public.sindico_pessoas from public, anon, authenticated;

create policy admin_total on public.sindico_pessoas
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on table public.sindico_pessoas to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    revoke all on table public.sindico_pessoas from service_role;
    grant select on table public.sindico_pessoas to service_role;
    revoke all on function public.registrar_sindico(uuid, text, text, text, date, uuid) from service_role;
    revoke all on function public.corrigir_pessoa_sindico(uuid, text, text, text) from service_role;
  end if;
end $$;
