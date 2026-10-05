begin;

select public._exige(
  (select count(*) = 1 from public.condominios
    where nome ilike '%porta%' or cidade ilike '%porta%' or bairro ilike '%porta%'),
  'busca por nome'
);
select public._exige(
  (select count(*) = 2 from public.condominios
    where nome ilike '%campinas%' or cidade ilike '%campinas%' or bairro ilike '%campinas%'),
  'busca por cidade'
);
select public._exige(
  (select count(*) = 1 from public.condominios
    where nome ilike '%cambuí%' or cidade ilike '%cambuí%' or bairro ilike '%cambuí%'),
  'busca por bairro'
);

update public.condominios
  set ativo = false
  where id = '00000000-0000-4000-8000-000000000011';
select public._exige(
  (select count(*) = 1 from public.condominios where ativo and cidade = 'Campinas'),
  'inativo sai da lista de ativos'
);
update public.condominios
  set ativo = true
  where id = '00000000-0000-4000-8000-000000000011';
select public._exige(
  (select ativo from public.condominios where id = '00000000-0000-4000-8000-000000000011'),
  'reativar condominio'
);

select public._teste_recusa(
  $$insert into public.prestadores (nome, whatsapp) values ('Sem zap', '   ')$$,
  'check'
);

select public._teste_recusa(
  $$insert into public.sindicos (condominio_id, nome, ativo)
    values ('00000000-0000-4000-8000-000000000010', 'Segundo ativo', true)$$,
  'sindicos_um_ativo'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
select public._teste_recusa(
  $$select public.registrar_sindico(
      '00000000-0000-4000-8000-000000000010',
      'Invasor',
      null,
      null,
      date '2026-10-05'
    )$$,
  'Somente o ADM'
);
select public._exige(
  (select nome = 'Síndico Atual' and ativo from public.sindicos where condominio_id = '00000000-0000-4000-8000-000000000010'),
  'prestador nao troca sindico'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
select public.registrar_sindico(
  '00000000-0000-4000-8000-000000000010',
  'Maria Nova',
  '19922222222',
  'maria@condominio.test',
  date '2026-10-05'
);

select public._exige(
  (select count(*) = 1 from public.sindicos
    where condominio_id = '00000000-0000-4000-8000-000000000010'
      and ativo
      and nome = 'Maria Nova'),
  'novo sindico fica ativo'
);
select public._exige(
  (select count(*) = 1 from public.sindicos
    where condominio_id = '00000000-0000-4000-8000-000000000010'
      and not ativo
      and nome = 'Síndico Atual'
      and whatsapp = '19911111111'
      and data_fim = date '2026-10-04'),
  'sindico anterior permanece no historico'
);

update public.sindicos
  set nome = 'Síndico Corrigido'
  where condominio_id = '00000000-0000-4000-8000-000000000010'
    and not ativo;
select public._exige(
  (select nome = 'Maria Nova' from public.sindicos
    where condominio_id = '00000000-0000-4000-8000-000000000010' and ativo),
  'corrigir o historico nao altera o atual'
);

select public._teste_recusa(
  $$select public.registrar_sindico(
      '00000000-0000-4000-8000-000000000010',
      'Cedo demais',
      null,
      null,
      date '2026-10-01'
    )$$,
  'igual ou posterior'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);

select public._teste_recusa(
  $$select public.registrar_sindico(
      '00000000-0000-4000-8000-000000000010',
      'Invasor',
      null,
      null,
      date '2026-10-06'
    )$$,
  'Somente o ADM'
);

do $$
declare
  n integer;
begin
  update public.condominios set nome = 'Invadido' where id = '00000000-0000-4000-8000-000000000010';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'Prestador alterou condomínio';
  end if;

  update public.equipamentos_matriz set nome = 'Invadido' where id = '00000000-0000-4000-8000-000000000040';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'Prestador alterou a matriz';
  end if;

  update public.prestadores set whatsapp = '19000000000' where usuario_id = '00000000-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'Prestador alterou o próprio cadastro';
  end if;

  update public.sindicos set nome = 'Invadido' where nome = 'Maria Nova';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'Prestador alterou síndico';
  end if;
end $$;

select public._teste_recusa(
  $$insert into public.equipamentos_matriz (nome, categoria) values ('Bicicleta', 'Cardio')$$,
  'row-level security'
);
select public._exige(
  (select nome = 'Porta do Sol' from public.condominios where id = '00000000-0000-4000-8000-000000000010'),
  'nome do condominio intacto'
);
select public._exige(
  (select nome = 'Esteira' from public.equipamentos_matriz where id = '00000000-0000-4000-8000-000000000040'),
  'matriz intacta'
);
select public._exige(
  (select whatsapp = '19999999999' from public.prestadores where usuario_id = '00000000-0000-4000-8000-000000000002'),
  'whatsapp do prestador intacto'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true);
select public._exige((select count(*) = 0 from public.condominios), 'sem perfil nao ve condominio');
select public._exige((select count(*) = 0 from public.sindicos), 'sem perfil nao ve sindico');
select public._exige((select count(*) = 0 from public.prestadores), 'sem perfil nao ve prestador');
select public._exige((select count(*) = 0 from public.equipamentos_matriz), 'sem perfil nao ve matriz');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
select public._exige((select count(*) = 2 from public.condominios), 'ADM ve os condominios');
select public._exige((select count(*) = 2 from public.sindicos), 'ADM ve o historico de sindicos');
select public._exige((select count(*) >= 1 from public.equipamentos_matriz), 'ADM ve a matriz');

insert into public.condominios (nome, endereco, bairro, cidade, estado)
values ('Cadastro ADM', 'Rua C', 'Centro', 'Santos', 'SP');
select public._exige(
  (select count(*) = 1 from public.condominios where nome = 'Cadastro ADM'),
  'ADM cadastra condominio'
);

insert into public.equipamentos_matriz (nome, categoria, fabricante, modelo)
values ('Bicicleta', 'Cardio', 'Movement', 'Horizontal');
update public.equipamentos_matriz
  set ativo = false
  where nome = 'Bicicleta';
select public._exige(
  (select not ativo from public.equipamentos_matriz where nome = 'Bicicleta'),
  'ADM inativa equipamento da matriz'
);

reset role;
commit;
