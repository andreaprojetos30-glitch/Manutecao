-- ELEVA Manutenção — Fase 3
-- O fim do contrato é a data da última visita mensal.
-- Não é digitado. Início do contrato continua sendo só a vigência.

create or replace function public.fim_contrato(p_inicio date, p_quantidade integer)
returns date
language sql
immutable
as $$
  select case
    when p_inicio is null or p_quantidade is null or p_quantidade < 1 then null
    else public.data_visita_mensal(p_inicio, p_quantidade - 1)
  end;
$$;

create or replace function public.calcular_fim_contrato()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.data_inicio_manutencao is not null
     and new.quantidade_visitas is not null
     and new.quantidade_visitas >= 1 then
    new.data_fim_contrato := public.fim_contrato(new.data_inicio_manutencao, new.quantidade_visitas);
  end if;
  return new;
end;
$$;

drop trigger if exists contratos_calcular_fim on public.contratos;
create trigger contratos_calcular_fim
  before insert or update on public.contratos
  for each row
  execute function public.calcular_fim_contrato();

do $$
declare
  nome text;
begin
  select con.conname into nome
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'contratos'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) like '%data_inicio_contrato%';

  if nome is null then
    raise exception 'Restrição antiga do fim do contrato não encontrada';
  end if;

  execute format('alter table public.contratos drop constraint %I', nome);
end $$;

update public.contratos
set data_fim_contrato = public.fim_contrato(data_inicio_manutencao, quantidade_visitas)
where data_fim_contrato is distinct from public.fim_contrato(data_inicio_manutencao, quantidade_visitas);

alter table public.contratos
  alter column data_fim_contrato set not null;

alter table public.contratos
  drop constraint if exists contratos_fim_calculado;

alter table public.contratos
  add constraint contratos_fim_calculado
  check (data_fim_contrato = public.fim_contrato(data_inicio_manutencao, quantidade_visitas));

drop function if exists public.agenda_incompativel(date, integer, date);
