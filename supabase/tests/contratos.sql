begin;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
select public._teste_recusa(
  $$select public.proximo_numero_contrato()$$,
  'Somente o ADM cria contrato'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);

select public._exige(
  (select data_fim_contrato = date '2026-12-31' from public.contratos where id = '00000000-0000-4000-8000-000000000021'),
  'contrato sem fim digitado recebe a data da ultima visita'
);

do $$
declare
  ano_ref text := to_char(timezone('America/Sao_Paulo', now()), 'YYYY');
  antes integer;
  n1 text;
  n2 text;
begin
  select coalesce(max((substring(numero_contrato from ano_ref || '-([0-9]+)$'))::integer), 0)
    into antes
  from public.contratos
  where numero_contrato ~ ('^' || ano_ref || '-[0-9]+$');

  n1 := public.proximo_numero_contrato();
  n2 := public.proximo_numero_contrato();

  if n1 !~ '^[0-9]{4}-[0-9]{3}$' then
    raise exception 'numero deveria ser amigavel, veio %', n1;
  end if;
  if n1 <> ano_ref || '-' || lpad((antes + 1)::text, 3, '0') then
    raise exception 'numero esperado % veio %', ano_ref || '-' || lpad((antes + 1)::text, 3, '0'), n1;
  end if;
  if n2 <> ano_ref || '-' || lpad((antes + 2)::text, 3, '0') or n1 = n2 then
    raise exception 'sequencia duplicada ou fora de ordem: % %', n1, n2;
  end if;
end $$;

select public._teste_recusa(
  $$select public.gerar_programacao_contrato('00000000-0000-4000-8000-000000000020')$$,
  'A programação deste contrato já foi gerada'
);

insert into public.contratos (
  id, numero_contrato, condominio_id, data_inicio_contrato, data_fim_contrato,
  data_inicio_manutencao, quantidade_visitas, prestador_padrao_id, status
) values (
  '00000000-0000-4000-8000-0000000000c1',
  'TESTE-AGENDA',
  '00000000-0000-4000-8000-000000000010',
  date '2026-01-01',
  date '2026-02-28',
  date '2026-01-31',
  3,
  '00000000-0000-4000-8000-000000000030',
  'ativo'
);

select public._teste_recusa(
  $$select public.gerar_programacao_contrato('00000000-0000-4000-8000-0000000000c1')$$,
  'Adicione ao menos um equipamento antes de gerar a programação'
);

insert into public.equipamentos_contrato (id, contrato_id, equipamento_matriz_id, nome_identificacao, data_entrada, data_saida) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000040', 'Esteira 01', date '2026-01-31', null),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000040', 'Bike 01', date '2026-01-31', date '2026-01-31'),
  ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000040', 'Elíptico 01', date '2026-03-31', null);

select public._exige(
  (select data_fim_contrato = date '2026-03-31' from public.contratos where id = '00000000-0000-4000-8000-0000000000c1'),
  'fim digitado diferente da programacao e substituido pela ultima visita'
);
select public._exige(
  public.gerar_programacao_contrato('00000000-0000-4000-8000-0000000000c1') = 3,
  'gera exatamente 3 visitas'
);
select public._exige(
  (select count(*) = 3 from public.manutencoes where contrato_id = '00000000-0000-4000-8000-0000000000c1' and tipo = 'preventiva' and origem = 'automatica' and status = 'programada'),
  'visitas nascem programadas'
);
select public._exige(
  (select data_programada_original = date '2026-01-31' and data_programada_atual = date '2026-01-31' and numero_visita = 1 and prestador_id = '00000000-0000-4000-8000-000000000030'
   from public.manutencoes where contrato_id = '00000000-0000-4000-8000-0000000000c1' and numero_visita = 1),
  'primeira visita na data de inicio'
);
select public._exige(
  (select data_programada_original = date '2026-02-28' from public.manutencoes where contrato_id = '00000000-0000-4000-8000-0000000000c1' and numero_visita = 2),
  'fevereiro usa o ultimo dia'
);
select public._exige(
  (select data_programada_original = date '2026-03-31' and data_programada_atual = date '2026-03-31'
   from public.manutencoes where contrato_id = '00000000-0000-4000-8000-0000000000c1' and numero_visita = 3),
  'ultima visita e fim do contrato caem em 31 de marco'
);
select public._exige(
  (select data_fim_contrato = date '2026-03-31' from public.contratos where id = '00000000-0000-4000-8000-0000000000c1'),
  'fim do contrato permanece a data da ultima visita gerada'
);
select public._exige(
  (select count(*) = 3 from public.itens_manutencao i join public.manutencoes m on m.id = i.manutencao_id
   where m.contrato_id = '00000000-0000-4000-8000-0000000000c1' and m.numero_visita = 1),
  'geracao coloca a composicao inteira na visita 1'
);
select public._exige(
  (select count(*) = 3 from public.itens_manutencao i join public.manutencoes m on m.id = i.manutencao_id
   where m.contrato_id = '00000000-0000-4000-8000-0000000000c1' and m.numero_visita = 2),
  'geracao coloca a composicao inteira na visita 2'
);
select public._exige(
  (select count(*) = 1 from public.itens_manutencao i join public.manutencoes m on m.id = i.manutencao_id
   where m.contrato_id = '00000000-0000-4000-8000-0000000000c1' and m.numero_visita = 1 and i.nome_identificacao = 'Bike 01'),
  'data de saida gravada nao tira o equipamento da geracao'
);
select public._exige(
  (select count(*) = 1 from public.itens_manutencao i join public.manutencoes m on m.id = i.manutencao_id
   where m.contrato_id = '00000000-0000-4000-8000-0000000000c1' and m.numero_visita = 1 and i.nome_identificacao = 'Elíptico 01'),
  'data de entrada gravada nao atrasa a entrada na geracao'
);

select public._teste_recusa(
  $$select public.gerar_programacao_contrato('00000000-0000-4000-8000-0000000000c1')$$,
  'A programação deste contrato já foi gerada'
);
select public._teste_recusa(
  $$update public.contratos set quantidade_visitas = 15 where id = '00000000-0000-4000-8000-0000000000c1'$$,
  'quantidade de visitas permanecem'
);
select public._teste_recusa(
  $$update public.contratos set data_inicio_manutencao = date '2026-02-01' where id = '00000000-0000-4000-8000-0000000000c1'$$,
  'data de início da manutenção'
);
select public._teste_recusa(
  $$update public.contratos set condominio_id = '00000000-0000-4000-8000-000000000011' where id = '00000000-0000-4000-8000-0000000000c1'$$,
  'O condomínio'
);

update public.contratos
  set data_fim_contrato = date '2026-12-31',
      prestador_padrao_id = '00000000-0000-4000-8000-000000000031'
  where id = '00000000-0000-4000-8000-0000000000c1';
select public._exige(
  (select data_fim_contrato = date '2026-03-31' and prestador_padrao_id = '00000000-0000-4000-8000-000000000031'
   from public.contratos where id = '00000000-0000-4000-8000-0000000000c1'),
  'fim digitado depois da programacao e ignorado'
);
select public._exige(
  (select data_programada_atual = date '2026-03-31' and prestador_id = '00000000-0000-4000-8000-000000000030'
   from public.manutencoes where contrato_id = '00000000-0000-4000-8000-0000000000c1' and numero_visita = 3),
  'trocar prestador padrao nao recalcula a visita'
);

update public.itens_manutencao
  set resultado = 'ok'
where nome_identificacao = 'Esteira 01'
  and manutencao_id = (
    select id from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-0000000000c1' and numero_visita = 1
  );
select public._exige(
  (select status = 'em_execucao' from public.manutencoes where contrato_id = '00000000-0000-4000-8000-0000000000c1' and numero_visita = 1),
  'primeiro ok coloca a visita em execucao'
);

select public._teste_recusa(
  $$select public.salvar_equipamento_contrato(
    null,
    '00000000-0000-4000-8000-0000000000c1',
    (select id from public.equipamentos_matriz where nome = 'Bicicleta'),
    'Bike parada'
  )$$,
  'Selecione um equipamento da lista'
);

insert into public.contratos (
  id, numero_contrato, condominio_id, data_inicio_contrato, data_inicio_manutencao, quantidade_visitas, status
)
select
  '00000000-0000-4000-8000-0000000000c6',
  'TESTE-COMPOSICAO',
  '00000000-0000-4000-8000-000000000010',
  (timezone('America/Sao_Paulo', now()))::date,
  ((timezone('America/Sao_Paulo', now()))::date - interval '3 months')::date,
  6,
  'ativo';

select public.salvar_equipamento_contrato(
  null,
  '00000000-0000-4000-8000-0000000000c6',
  '00000000-0000-4000-8000-000000000040',
  'Esteira 01'
);
select public._exige(
  (select count(*) = 0 from public.manutencoes where contrato_id = '00000000-0000-4000-8000-0000000000c6'),
  'adicionar equipamento antes da programacao nao cria visita'
);
select public.remover_equipamento_contrato(
  (select id from public.equipamentos_contrato where contrato_id = '00000000-0000-4000-8000-0000000000c6' and nome_identificacao = 'Esteira 01')
);
select public._exige(
  (select count(*) = 0 from public.equipamentos_contrato where contrato_id = '00000000-0000-4000-8000-0000000000c6'),
  'remove equipamento antes da programacao'
);

select public.salvar_equipamento_contrato(
  null,
  '00000000-0000-4000-8000-0000000000c6',
  '00000000-0000-4000-8000-000000000040',
  'Esteira 01'
);
insert into public.equipamentos_contrato (contrato_id, equipamento_matriz_id, nome_identificacao, data_entrada)
select '00000000-0000-4000-8000-0000000000c6', '00000000-0000-4000-8000-000000000040', 'Bike 01', data_inicio_manutencao
from public.contratos where id = '00000000-0000-4000-8000-0000000000c6';

select public._exige(public.gerar_programacao_contrato('00000000-0000-4000-8000-0000000000c6') = 6, 'gera 6 visitas da composicao');
select public._exige(
  (select data_programada_atual < (timezone('America/Sao_Paulo', now()))::date
   from public.manutencoes where contrato_id = '00000000-0000-4000-8000-0000000000c6' and numero_visita = 1),
  'a primeira visita desta composicao ja passou'
);
select public._exige(
  (select data_programada_atual >= (timezone('America/Sao_Paulo', now()))::date
   from public.manutencoes where contrato_id = '00000000-0000-4000-8000-0000000000c6' and numero_visita = 5),
  'a quinta visita desta composicao e hoje ou futura'
);
select public._exige(
  (select count(*) = 2 from public.itens_manutencao i join public.manutencoes m on m.id = i.manutencao_id
   where m.contrato_id = '00000000-0000-4000-8000-0000000000c6' and m.numero_visita = 1),
  'visita passada nasce com a composicao'
);
select public._exige(
  (select count(*) = 2 from public.itens_manutencao i join public.manutencoes m on m.id = i.manutencao_id
   where m.contrato_id = '00000000-0000-4000-8000-0000000000c6' and m.numero_visita = 5),
  'visita futura nasce com a composicao'
);

update public.itens_manutencao
  set resultado = 'ok'
where nome_identificacao = 'Esteira 01'
  and manutencao_id = (
    select id from public.manutencoes
    where contrato_id = '00000000-0000-4000-8000-0000000000c6' and numero_visita = 2
  );
select set_config('app.finalizando', 'on', true);
update public.manutencoes
  set status = 'realizada'
where contrato_id = '00000000-0000-4000-8000-0000000000c6' and numero_visita = 3;
update public.manutencoes
  set status = 'aguardando_administracao'
where contrato_id = '00000000-0000-4000-8000-0000000000c6' and numero_visita = 4;
select set_config('app.finalizando', 'off', true);
select set_config('app.cancelando', 'on', true);
update public.manutencoes
  set status = 'cancelada'
where contrato_id = '00000000-0000-4000-8000-0000000000c6' and numero_visita = 6;
select set_config('app.cancelando', 'off', true);

select public.salvar_equipamento_contrato(
  null,
  '00000000-0000-4000-8000-0000000000c6',
  '00000000-0000-4000-8000-000000000040',
  'Extra 01'
);
select public._exige(
  (select count(*) = 1 from public.itens_manutencao i join public.manutencoes m on m.id = i.manutencao_id
   where m.contrato_id = '00000000-0000-4000-8000-0000000000c6' and m.numero_visita = 5 and i.nome_identificacao = 'Extra 01'),
  'equipamento novo entra na visita futura programada'
);
select public._exige(
  (select count(*) = 0 from public.itens_manutencao i join public.manutencoes m on m.id = i.manutencao_id
   where m.contrato_id = '00000000-0000-4000-8000-0000000000c6'
     and m.numero_visita in (1, 2, 3, 4, 6)
     and i.nome_identificacao = 'Extra 01'),
  'equipamento novo nao entra em visita executada iniciada passada ou cancelada'
);
select public._exige(
  (select data_programada_atual = public.data_visita_mensal(
      (select data_inicio_manutencao from public.contratos where id = '00000000-0000-4000-8000-0000000000c6'),
      4
    )
   from public.manutencoes where contrato_id = '00000000-0000-4000-8000-0000000000c6' and numero_visita = 5),
  'inclusao nao altera a data da visita'
);
select public._exige(
  (select count(*) = 1 from public.itens_manutencao i join public.manutencoes m on m.id = i.manutencao_id
   where m.contrato_id = '00000000-0000-4000-8000-0000000000c6' and m.numero_visita = 5 and i.nome_identificacao = 'Extra 01'),
  'sincronizar de novo nao duplica o equipamento'
);
select public.sincronizar_itens_contrato('00000000-0000-4000-8000-0000000000c6');
select public._exige(
  (select count(*) = 1 from public.itens_manutencao i join public.manutencoes m on m.id = i.manutencao_id
   where m.contrato_id = '00000000-0000-4000-8000-0000000000c6' and m.numero_visita = 5 and i.nome_identificacao = 'Extra 01'),
  'segunda sincronizacao nao duplica o equipamento'
);

select public.salvar_equipamento_contrato(
  (select id from public.equipamentos_contrato where contrato_id = '00000000-0000-4000-8000-0000000000c6' and nome_identificacao = 'Extra 01'),
  '00000000-0000-4000-8000-0000000000c6',
  '00000000-0000-4000-8000-000000000040',
  'Extra recepção'
);
select public._exige(
  (select count(*) = 1 from public.itens_manutencao i join public.manutencoes m on m.id = i.manutencao_id
   where m.contrato_id = '00000000-0000-4000-8000-0000000000c6' and m.numero_visita = 5 and i.nome_identificacao = 'Extra recepção'),
  'visita futura programada acompanha a identificacao'
);

select public.remover_equipamento_contrato(
  (select id from public.equipamentos_contrato where contrato_id = '00000000-0000-4000-8000-0000000000c6' and nome_identificacao = 'Extra recepção')
);
select public._exige(
  (select count(*) = 0 from public.equipamentos_contrato where contrato_id = '00000000-0000-4000-8000-0000000000c6' and nome_identificacao = 'Extra recepção'),
  'retira equipamento que so estava na visita futura'
);
select public._exige(
  (select count(*) = 0 from public.itens_manutencao i join public.manutencoes m on m.id = i.manutencao_id
   where m.contrato_id = '00000000-0000-4000-8000-0000000000c6' and i.nome_identificacao = 'Extra recepção'),
  'retira o item pendente da visita futura'
);

select public.remover_equipamento_contrato(
  (select id from public.equipamentos_contrato where contrato_id = '00000000-0000-4000-8000-0000000000c6' and nome_identificacao = 'Esteira 01')
);
select public._exige(
  (select ativo is false from public.equipamentos_contrato where contrato_id = '00000000-0000-4000-8000-0000000000c6' and nome_identificacao = 'Esteira 01'),
  'equipamento com historico fica inativo'
);
select public._exige(
  (select count(*) = 1 from public.itens_manutencao i join public.manutencoes m on m.id = i.manutencao_id
   where m.contrato_id = '00000000-0000-4000-8000-0000000000c6' and m.numero_visita = 2 and i.nome_identificacao = 'Esteira 01' and i.resultado = 'ok'),
  'visita em execucao conserva o equipamento'
);
select public._exige(
  (select count(*) = 1 from public.itens_manutencao i join public.manutencoes m on m.id = i.manutencao_id
   where m.contrato_id = '00000000-0000-4000-8000-0000000000c6' and m.numero_visita = 3 and i.nome_identificacao = 'Esteira 01'),
  'visita realizada conserva o equipamento'
);
select public._exige(
  (select count(*) = 1 from public.itens_manutencao i join public.manutencoes m on m.id = i.manutencao_id
   where m.contrato_id = '00000000-0000-4000-8000-0000000000c6' and m.numero_visita = 4 and i.nome_identificacao = 'Esteira 01'),
  'visita aguardando administracao conserva o equipamento'
);
select public._exige(
  (select count(*) = 1 from public.itens_manutencao i join public.manutencoes m on m.id = i.manutencao_id
   where m.contrato_id = '00000000-0000-4000-8000-0000000000c6' and m.numero_visita = 1 and i.nome_identificacao = 'Esteira 01'),
  'visita programada passada conserva o equipamento'
);
select public._exige(
  (select count(*) = 1 from public.itens_manutencao i join public.manutencoes m on m.id = i.manutencao_id
   where m.contrato_id = '00000000-0000-4000-8000-0000000000c6' and m.numero_visita = 6 and i.nome_identificacao = 'Esteira 01'),
  'visita cancelada conserva o equipamento'
);
select public._exige(
  (select count(*) = 0 from public.itens_manutencao i join public.manutencoes m on m.id = i.manutencao_id
   where m.contrato_id = '00000000-0000-4000-8000-0000000000c6' and m.numero_visita = 5 and i.nome_identificacao = 'Esteira 01'),
  'retirada tira o equipamento da visita futura programada'
);

insert into public.contratos (
  id, numero_contrato, condominio_id, data_inicio_contrato, data_inicio_manutencao, quantidade_visitas, status
) values (
  '00000000-0000-4000-8000-0000000000c2',
  'TESTE-15',
  '00000000-0000-4000-8000-000000000010',
  date '2026-01-01',
  date '2026-01-15',
  15,
  'ativo'
);
insert into public.equipamentos_contrato (contrato_id, equipamento_matriz_id, nome_identificacao, data_entrada) values
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-000000000040', 'Esteira 15', date '2026-01-15');
select public._exige(public.gerar_programacao_contrato('00000000-0000-4000-8000-0000000000c2') = 15, 'quantidade 15 nao vira 12');
select public._exige(
  (select data_programada_atual = public.data_visita_mensal(date '2026-01-15', 14)
   from public.manutencoes where contrato_id = '00000000-0000-4000-8000-0000000000c2' and numero_visita = 15),
  'a visita 15 cai 14 meses depois'
);

insert into public.contratos (
  id, numero_contrato, condominio_id, data_inicio_contrato, data_inicio_manutencao, quantidade_visitas, status
) values (
  '00000000-0000-4000-8000-0000000000c4',
  'TESTE-BISSEXTO',
  '00000000-0000-4000-8000-000000000010',
  date '2024-01-01',
  date '2024-01-31',
  2,
  'ativo'
);
insert into public.equipamentos_contrato (contrato_id, equipamento_matriz_id, nome_identificacao, data_entrada) values
  ('00000000-0000-4000-8000-0000000000c4', '00000000-0000-4000-8000-000000000040', 'Esteira bissexto', date '2024-01-31');
select public.gerar_programacao_contrato('00000000-0000-4000-8000-0000000000c4');
select public._exige(
  (select data_programada_atual = date '2024-02-29' from public.manutencoes where contrato_id = '00000000-0000-4000-8000-0000000000c4' and numero_visita = 2),
  'bissexto usa 29 de fevereiro'
);

insert into public.contratos (
  id, numero_contrato, condominio_id, data_inicio_contrato, data_inicio_manutencao, quantidade_visitas, status
) values (
  '00000000-0000-4000-8000-0000000000c3',
  'TESTE-CANCELADO',
  '00000000-0000-4000-8000-000000000010',
  date '2026-01-01',
  date '2026-01-01',
  4,
  'cancelado'
);
insert into public.equipamentos_contrato (contrato_id, equipamento_matriz_id, nome_identificacao, data_entrada) values
  ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-000000000040', 'Esteira cancelada', date '2026-01-01');
select public._teste_recusa(
  $$select public.gerar_programacao_contrato('00000000-0000-4000-8000-0000000000c3')$$,
  'Só é possível gerar a programação de um contrato ativo'
);

insert into public.contratos (
  id, numero_contrato, condominio_id, data_inicio_contrato, data_inicio_manutencao, quantidade_visitas, status
) values (
  '00000000-0000-4000-8000-0000000000c5',
  'TESTE-FIM',
  '00000000-0000-4000-8000-000000000010',
  date '2026-01-01',
  date '2026-10-14',
  12,
  'ativo'
);
select public._exige(
  (select data_fim_contrato = date '2027-09-14' from public.contratos where id = '00000000-0000-4000-8000-0000000000c5'),
  'doze visitas a partir de 14/10/2026 terminam em 14/09/2027'
);
update public.contratos
  set data_inicio_contrato = date '2028-03-01',
      data_fim_contrato = date '2030-01-01'
  where id = '00000000-0000-4000-8000-0000000000c5';
select public._exige(
  (select data_inicio_contrato = date '2028-03-01' and data_fim_contrato = date '2027-09-14'
   from public.contratos where id = '00000000-0000-4000-8000-0000000000c5'),
  'inicio da vigencia nao altera o fim e data digitada e ignorada'
);
update public.contratos
  set quantidade_visitas = 1
  where id = '00000000-0000-4000-8000-0000000000c5';
select public._exige(
  (select data_fim_contrato = date '2026-10-14' from public.contratos where id = '00000000-0000-4000-8000-0000000000c5'),
  'uma visita termina no proprio inicio da manutencao'
);
update public.contratos
  set data_inicio_manutencao = date '2026-01-31',
      quantidade_visitas = 3
  where id = '00000000-0000-4000-8000-0000000000c5';
select public._exige(
  (select data_fim_contrato = date '2026-03-31' from public.contratos where id = '00000000-0000-4000-8000-0000000000c5'),
  'fim acompanha o ultimo dia valido da programacao'
);

select public._teste_recusa(
  $$select public.adicionar_equipamentos_contrato('00000000-0000-4000-8000-0000000000c5', '[]'::jsonb)$$,
  'Selecione ao menos um equipamento'
);
select public._teste_recusa(
  $$select public.adicionar_equipamentos_contrato(
      '00000000-0000-4000-8000-0000000000c5',
      jsonb_build_array(jsonb_build_object(
        'matriz_id', (select id from public.equipamentos_matriz where nome = 'Bicicleta'),
        'quantidade', 1
      ))
    )$$,
  'Selecione um equipamento da lista'
);
select public._teste_recusa(
  $$select public.adicionar_equipamentos_contrato(
      '00000000-0000-4000-8000-0000000000c5',
      jsonb_build_array(jsonb_build_object('matriz_id', '00000000-0000-4000-8000-000000000040', 'quantidade', 0))
    )$$,
  'Informe a quantidade'
);
select public._teste_recusa(
  $$select public.adicionar_equipamentos_contrato(
      '00000000-0000-4000-8000-0000000000c5',
      jsonb_build_array(jsonb_build_object('matriz_id', '00000000-0000-4000-8000-000000000040', 'quantidade', 100))
    )$$,
  'A quantidade está alta demais'
);
select public._exige(
  public.adicionar_equipamentos_contrato(
    '00000000-0000-4000-8000-0000000000c5',
    jsonb_build_array(jsonb_build_object('matriz_id', '00000000-0000-4000-8000-000000000040', 'quantidade', 3))
  ) = 3,
  'tres unidades do mesmo equipamento entram de uma vez'
);
select public._exige(
  (select count(*) = 3
   from public.equipamentos_contrato
   where contrato_id = '00000000-0000-4000-8000-0000000000c5'
     and equipamento_matriz_id = '00000000-0000-4000-8000-000000000040'
     and ativo
     and identificacao is null
     and nome_identificacao = 'Esteira'),
  'unidades nascem sem identificacao e com o nome da matriz'
);
select public._exige(
  (select count(*) = 0
   from public.equipamentos_contrato
   where contrato_id = '00000000-0000-4000-8000-0000000000c5'
     and nome_identificacao ~ ' [0-9]{2}$'),
  'nao preenche 01 automaticamente'
);
select public._exige(
  (select count(*) = 0 from public.manutencoes where contrato_id = '00000000-0000-4000-8000-0000000000c5'),
  'incluir equipamentos antes da programacao nao cria visita'
);

select public.adicionar_equipamentos_contrato(
  '00000000-0000-4000-8000-0000000000c6',
  jsonb_build_array(jsonb_build_object('matriz_id', '00000000-0000-4000-8000-000000000040', 'quantidade', 2))
);
select public._exige(
  (select count(*) = 2
   from public.itens_manutencao i
   join public.manutencoes m on m.id = i.manutencao_id
   where m.contrato_id = '00000000-0000-4000-8000-0000000000c6'
     and m.numero_visita = 5
     and i.nome_identificacao = 'Esteira'),
  'duas unidades entram na visita futura programada'
);
select public._exige(
  (select count(*) = 0
   from public.itens_manutencao i
   join public.manutencoes m on m.id = i.manutencao_id
   where m.contrato_id = '00000000-0000-4000-8000-0000000000c6'
     and m.numero_visita in (1, 2, 3, 4, 6)
     and i.nome_identificacao = 'Esteira'),
  'lote novo nao entra em visita protegida'
);

select public.definir_identificacao_equipamento(
  (select id from public.equipamentos_contrato
   where contrato_id = '00000000-0000-4000-8000-0000000000c6'
     and ativo
     and identificacao is null
     and nome_identificacao = 'Esteira'
   order by created_at
   limit 1),
  '01'
);
select public._exige(
  (select count(*) = 1
   from public.itens_manutencao i
   join public.manutencoes m on m.id = i.manutencao_id
   where m.contrato_id = '00000000-0000-4000-8000-0000000000c6'
     and m.numero_visita = 5
     and i.nome_identificacao = 'Esteira — 01'),
  'identificacao informada acompanha a visita futura'
);
select public._exige(
  (select count(*) = 0
   from public.itens_manutencao i
   join public.manutencoes m on m.id = i.manutencao_id
   where m.contrato_id = '00000000-0000-4000-8000-0000000000c6'
     and m.numero_visita in (1, 2, 3, 4, 6)
     and i.nome_identificacao = 'Esteira — 01'),
  'identificacao nova nao altera visita protegida'
);
select public._exige(
  (select count(*) = 1
   from public.itens_manutencao i
   join public.manutencoes m on m.id = i.manutencao_id
   where m.contrato_id = '00000000-0000-4000-8000-0000000000c6'
     and m.numero_visita = 1
     and i.nome_identificacao = 'Esteira 01'),
  'visita protegida conserva o nome que ja tinha'
);

select public.definir_identificacao_equipamento(
  (select id from public.equipamentos_contrato
   where contrato_id = '00000000-0000-4000-8000-0000000000c6' and identificacao = '01'),
  'sem identificação'
);
select public._exige(
  (select count(*) = 2
   from public.equipamentos_contrato
   where contrato_id = '00000000-0000-4000-8000-0000000000c6'
     and ativo
     and identificacao is null
     and nome_identificacao = 'Esteira'),
  'identificacao vazia nao grava um texto padrao'
);

set local role anon;
select public._teste_recusa(
  $$select public.proximo_numero_contrato()$$,
  'permission denied'
);
select public._teste_recusa(
  $$select public.adicionar_equipamentos_contrato('00000000-0000-4000-8000-0000000000c5', '[]'::jsonb)$$,
  'permission denied'
);
reset role;

commit;
