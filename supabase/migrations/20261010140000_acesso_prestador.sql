-- ELEVA Manutenção — acesso do prestador
-- O PIN e o link de ativação ficam fora das tabelas visíveis ao prestador
-- e ao ADM. Não há policy: só o servidor, com a chave de serviço, grava.
-- As permissões da Fase 4 permanecem como estão.

create table public.prestador_acesso (
  prestador_id uuid primary key references public.prestadores (id) on delete cascade,
  ativacao_hash text,
  ativacao_expira_em timestamptz,
  ativado_em timestamptz,
  pin_hash text,
  selo text,
  tentativas integer not null default 0 check (tentativas >= 0),
  bloqueios integer not null default 0 check (bloqueios >= 0),
  bloqueado_ate timestamptz,
  updated_at timestamptz not null default now(),
  constraint prestador_acesso_pin check (pin_hash is null or pin_hash !~ '^[0-9]{3}$')
);

create unique index prestador_acesso_ativacao
  on public.prestador_acesso (ativacao_hash)
  where ativacao_hash is not null;

create trigger prestador_acesso_updated
  before update on public.prestador_acesso
  for each row execute function public.set_updated_at();

alter table public.prestador_acesso enable row level security;
alter table public.prestador_acesso force row level security;

revoke all on table public.prestador_acesso from public;
revoke all on table public.prestador_acesso from anon;
revoke all on table public.prestador_acesso from authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on table public.prestador_acesso to service_role;
  end if;
end $$;
