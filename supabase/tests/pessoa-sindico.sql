begin;

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);

select public._exige(
  (select count(*) = count(distinct pessoa_id) from public.sindicos),
  'cada periodo existente ficou com a propria pessoa'
);
select public._exige(
  (select count(*) = 0 from public.sindicos where pessoa_id is null),
  'todo periodo tem pessoa'
);
select public._exige(
  (
    select s1.pessoa_id <> s2.pessoa_id
      and s1.nome = 'Maria Igual'
      and s2.nome = 'Maria Igual'
      and s1.whatsapp = '19988887777'
      and s2.whatsapp = '19988887777'
    from public.sindicos s1
    join public.sindicos s2 on s2.id = 'e5222222-2222-4222-8222-222222222222'
    where s1.id = 'e5111111-1111-4111-8111-111111111111'
  ),
  'o mesmo nome e o mesmo WhatsApp nao foram unidos'
);

create temporary table _confirmacoes_antes as
select id, manutencao_id, sindico_id, sindico_nome, destinatario_nome
from public.confirmacoes_sindico;

create temporary table _links_antes as
select id, manutencao_id, sindico_destinatario_id, destinatario_nome, destinatario_papel
from public.links_confirmacao_sindico;

select public.registrar_sindico(
  '00000000-0000-4000-8000-000000000011',
  'Maria Igual',
  '19900000099',
  'nova@condominio.test',
  date '2099-01-15'
);

select public._exige(
  (
    select count(*) = 3
    from public.sindico_pessoas
    where nome = 'Maria Igual'
  ),
  'repetir o nome cria outra pessoa'
);
select public._exige(
  (
    select pessoa.nome = 'Maria Igual'
      and pessoa.whatsapp = '19988887777'
      and periodo.ativo = false
    from public.sindicos periodo
    join public.sindico_pessoas pessoa on pessoa.id = periodo.pessoa_id
    where periodo.id = 'e5222222-2222-4222-8222-222222222222'
  ),
  'o periodo antigo da Maria Igual permanece'
);

select public._teste_recusa(
  $$select public.registrar_sindico(
      '00000000-0000-4000-8000-000000000011',
      'Nome Digitado',
      '19000000000',
      'errado@condominio.test',
      date '2099-02-01',
      '00000000-0000-4000-8000-000000009999'
    )$$,
  'Pessoa não encontrada'
);

select public.registrar_sindico(
  '00000000-0000-4000-8000-000000000011',
  'Nome Digitado',
  '19000000000',
  'errado@condominio.test',
  date '2099-06-01',
  (select pessoa_id from public.sindicos where condominio_id = '00000000-0000-4000-8000-000000000010' and ativo)
);

select public._exige(
  (
    select count(*) = 1
    from public.sindicos ativo_dez
    join public.sindicos ativo_onze
      on ativo_onze.pessoa_id = ativo_dez.pessoa_id
     and ativo_onze.condominio_id = '00000000-0000-4000-8000-000000000011'
     and ativo_onze.ativo
    where ativo_dez.condominio_id = '00000000-0000-4000-8000-000000000010'
      and ativo_dez.ativo
      and ativo_onze.nome = ativo_dez.nome
      and ativo_onze.nome <> 'Nome Digitado'
  ),
  'a escolha liga a pessoa e ignora o nome digitado'
);

select public._teste_recusa(
  $$select public.registrar_sindico(
      '00000000-0000-4000-8000-000000000011',
      'De novo',
      null,
      null,
      date '2099-07-01',
      (select pessoa_id from public.sindicos where condominio_id = '00000000-0000-4000-8000-000000000010' and ativo)
    )$$,
  'Esta pessoa já é o síndico ativo deste condomínio'
);

select public.corrigir_pessoa_sindico(
  (select pessoa_id from public.sindicos where condominio_id = '00000000-0000-4000-8000-000000000010' and ativo),
  'Maria Atual',
  '19977776666',
  'maria.atual@condominio.test'
);

select public._exige(
  (
    select count(*) = 2
    from public.sindicos
    where ativo
      and nome = 'Maria Atual'
      and whatsapp = '19977776666'
      and email = 'maria.atual@condominio.test'
  ),
  'a correcao alcanca os periodos ativos da pessoa'
);
select public._exige(
  (
    select nome = 'Maria Igual' and whatsapp = '19988887777'
    from public.sindicos
    where id = 'e5111111-1111-4111-8111-111111111111'
  ),
  'periodo encerrado nao recebe a correcao da pessoa'
);

update public.sindicos
  set nome = 'Maria Igual Revisada'
  where id = 'e5111111-1111-4111-8111-111111111111';
select public._exige(
  (
    select periodo.nome = 'Maria Igual Revisada'
      and pessoa.nome = 'Maria Igual'
    from public.sindicos periodo
    join public.sindico_pessoas pessoa on pessoa.id = periodo.pessoa_id
    where periodo.id = 'e5111111-1111-4111-8111-111111111111'
  ),
  'corrigir o historico nao altera a pessoa'
);

select public._teste_recusa(
  $$update public.sindicos
      set pessoa_id = 'e5111111-1111-4111-8111-111111111111'
    where id = 'e5222222-2222-4222-8222-222222222222'$$,
  'O período permanece ligado à mesma pessoa'
);

update public.sindicos
  set ativo = false,
      data_fim = date '2099-06-01'
  where condominio_id = '00000000-0000-4000-8000-000000000011'
    and ativo;
select public._exige(
  (
    select ativo and nome = 'Maria Atual' and whatsapp = '19977776666'
    from public.sindicos
    where condominio_id = '00000000-0000-4000-8000-000000000010'
      and ativo
  ),
  'encerrar um condominio preserva o outro'
);

do $$
declare
  ok boolean;
begin
  select
    (select count(*) from public.confirmacoes_sindico) = (select count(*) from _confirmacoes_antes)
    and not exists (
      select 1
      from public.confirmacoes_sindico atual
      join _confirmacoes_antes antes on antes.id = atual.id
      where atual.sindico_id is distinct from antes.sindico_id
        or atual.sindico_nome is distinct from antes.sindico_nome
        or atual.destinatario_nome is distinct from antes.destinatario_nome
        or atual.manutencao_id is distinct from antes.manutencao_id
    )
  into ok;
  perform public._exige(ok, 'confirmacoes permanecem com o periodo e o nome da epoca');
end $$;
do $$
declare
  ok boolean;
begin
  select
    (select count(*) from public.links_confirmacao_sindico) = (select count(*) from _links_antes)
    and not exists (
      select 1
      from public.links_confirmacao_sindico atual
      join _links_antes antes on antes.id = atual.id
      where atual.sindico_destinatario_id is distinct from antes.sindico_destinatario_id
        or atual.destinatario_nome is distinct from antes.destinatario_nome
        or atual.destinatario_papel is distinct from antes.destinatario_papel
        or atual.manutencao_id is distinct from antes.manutencao_id
    )
  into ok;
  perform public._exige(ok, 'links permanecem com o destinatario da emissao');
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
select public._teste_recusa(
  $$select public.registrar_sindico(
      '00000000-0000-4000-8000-000000000011',
      'Invasor',
      null,
      null,
      date '2099-08-01'
    )$$,
  'Somente o ADM'
);
select public._teste_recusa(
  $$select public.corrigir_pessoa_sindico(
      (select id from public.sindico_pessoas limit 1),
      'Invasor',
      null,
      null
    )$$,
  'Somente o ADM'
);
