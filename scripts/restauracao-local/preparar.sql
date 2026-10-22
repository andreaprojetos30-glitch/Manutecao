-- Prepara o PostgreSQL local para receber o backup do esquema public.
-- Não copia dados e não aplica migrations.
-- Só aceita o banco local de teste.

do $$
begin
  if current_database() is distinct from 'eleva_manutencao_teste' then
    raise exception 'Banco recusado: %', current_database();
  end if;

  if inet_server_addr() is distinct from '127.0.0.1'::inet then
    raise exception 'Servidor recusado: %', inet_server_addr();
  end if;

  if inet_server_port() is distinct from 5432 then
    raise exception 'Porta recusada: %', inet_server_port();
  end if;

  if exists (select 1 from pg_tables where schemaname = 'public') then
    raise exception 'O esquema public já tem tabelas. Preparação cancelada.';
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then
    create role supabase_admin nologin;
  end if;
end $$;

grant supabase_admin to postgres;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create extension if not exists pgcrypto;
