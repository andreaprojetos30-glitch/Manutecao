select public._exige(
  (select count(*) = 0
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'prestadores'
     and column_name in ('pin', 'pin_hash', 'senha')),
  'ficha do prestador nao guarda PIN'
);
select public._exige(
  (select relrowsecurity and relforcerowsecurity
   from pg_class
   where oid = 'public.prestador_acesso'::regclass),
  'PIN fica fora das politicas do prestador'
);
select public._exige(
  (select count(*) = 0 from pg_policies where tablename = 'prestador_acesso'),
  'PIN nao tem policy para a sessao'
);
select public._exige(
  not has_table_privilege('authenticated', 'public.prestador_acesso', 'select')
  and not has_table_privilege('authenticated', 'public.prestador_acesso', 'insert')
  and not has_table_privilege('authenticated', 'public.prestador_acesso', 'update')
  and not has_table_privilege('authenticated', 'public.prestador_acesso', 'delete')
  and not has_table_privilege('anon', 'public.prestador_acesso', 'select'),
  'sessao do prestador nao le nem grava o PIN'
);
select public._teste_recusa(
  $$insert into public.prestador_acesso (prestador_id, pin_hash)
    select id, '123' from public.prestadores limit 1$$,
  'prestador_acesso_pin'
);
select public._exige(
  (select count(*) = 1 from pg_policies where policyname = 'prestador_le_visita'),
  'prestador continua vendo so a propria visita'
);
select public._exige(
  (select count(*) = 1 from pg_policies where policyname = 'fotos_prestador_insert'),
  'prestador continua enviando foto da visita'
);
select public._exige(
  (select count(*) = 1 from pg_policies where policyname = 'fotos_prestador_delete'),
  'prestador continua substituindo a foto da visita aberta'
);

insert into public.prestador_acesso (prestador_id, pin_hash)
select id, 'scrypt$sal$hash-longo' from public.prestadores limit 1;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
select public._teste_recusa(
  $$select pin_hash from public.prestador_acesso$$,
  'permission denied'
);
select public._teste_recusa(
  $$update public.prestador_acesso set pin_hash = '123'$$,
  'permission denied'
);
reset role;
