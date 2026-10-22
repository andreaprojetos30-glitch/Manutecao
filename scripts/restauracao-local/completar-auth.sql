-- Depois da carga dos dados, cria um login vazio para cada usuário já
-- restaurado. Não altera linhas do esquema public.
-- O gatilho de produção que copia auth.users para usuarios não vem no backup
-- e não é recriado aqui: recriá-lo duplicaria os usuários.

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

  if to_regclass('public.usuarios') is null then
    raise exception 'A tabela usuarios ainda não foi restaurada.';
  end if;
end $$;

insert into auth.users (id)
select usuario.id
from public.usuarios as usuario
where not exists (
  select 1
  from auth.users as login
  where login.id = usuario.id
);
