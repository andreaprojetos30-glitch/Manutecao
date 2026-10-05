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
  (select count(*) = 2 from public.itens_manutencao i join public.manutencoes m on m.id = i.manutencao_id
   where m.contrato_id = '00000000-0000-4000-8000-0000000000c1' and m.numero_visita = 1),
  'visita 1 tem esteira e bike'
);
select public._exige(
  (select count(*) = 1 from public.itens_manutencao i join public.manutencoes m on m.id = i.manutencao_id
   where m.contrato_id = '00000000-0000-4000-8000-0000000000c1' and m.numero_visita = 2 and i.nome_identificacao = 'Esteira 01'),
  'visita 2 fica so com a esteira'
);
select public._exige(
  (select count(*) = 0 from public.itens_manutencao i join public.manutencoes m on m.id = i.manutencao_id
   where m.contrato_id = '00000000-0000-4000-8000-0000000000c1' and m.numero_visita = 2 and i.nome_identificacao = 'Bike 01'),
  'bike nao passa do dia de saida'
);
select public._exige(
  (select count(*) = 1 from public.itens_manutencao i join public.manutencoes m on m.id = i.manutencao_id
   where m.contrato_id = '00000000-0000-4000-8000-0000000000c1' and m.numero_visita = 3 and i.nome_identificacao = 'Elíptico 01'),
  'eliptico entra na data de entrada'
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

select public.salvar_equipamento_contrato(
  null,
  '00000000-0000-4000-8000-0000000000c1',
  '00000000-0000-4000-8000-000000000040',
  ' Esteira 02 ',
  date '2026-02-28',
  null
);
select public._exige(
  (select count(*) = 2 from public.itens_manutencao i join public.manutencoes m on m.id = i.manutencao_id
   where m.contrato_id = '00000000-0000-4000-8000-0000000000c1' and m.numero_visita = 2),
  'equipamento novo entra na visita programada'
);
select public._exige(
  (select count(*) = 0 from public.itens_manutencao i join public.manutencoes m on m.id = i.manutencao_id
   where m.contrato_id = '00000000-0000-4000-8000-0000000000c1' and m.numero_visita = 1 and i.nome_identificacao = 'Esteira 02'),
  'equipamento novo nao entra antes da data de entrada'
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

select set_config('app.finalizando', 'on', true);
update public.manutencoes
  set status = 'realizada'
where contrato_id = '00000000-0000-4000-8000-0000000000c1'
  and numero_visita = 2;

select public.salvar_equipamento_contrato(
  null,
  '00000000-0000-4000-8000-0000000000c1',
  '00000000-0000-4000-8000-000000000040',
  'Novo 01',
  date '2026-01-31',
  null
);
select public._exige(
  (select count(*) = 1 from public.itens_manutencao i join public.manutencoes m on m.id = i.manutencao_id
   where m.contrato_id = '00000000-0000-4000-8000-0000000000c1' and m.numero_visita = 1 and i.nome_identificacao = 'Novo 01' and i.resultado = 'pendente'),
  'em execucao recebe equipamento novo como pendente'
);
select public._exige(
  (select resultado = 'ok' from public.itens_manutencao i join public.manutencoes m on m.id = i.manutencao_id
   where m.contrato_id = '00000000-0000-4000-8000-0000000000c1' and m.numero_visita = 1 and i.nome_identificacao = 'Esteira 01'),
  'item ja marcado nao e apagado'
);
select public._exige(
  (select count(*) = 0 from public.itens_manutencao i join public.manutencoes m on m.id = i.manutencao_id
   where m.contrato_id = '00000000-0000-4000-8000-0000000000c1' and m.numero_visita = 2 and i.nome_identificacao = 'Novo 01'),
  'visita realizada nao recebe equipamento novo'
);

select public.salvar_equipamento_contrato(
  '00000000-0000-4000-8000-0000000000d1',
  '00000000-0000-4000-8000-0000000000c1',
  '00000000-0000-4000-8000-000000000040',
  'Esteira 01',
  date '2026-01-31',
  date '2026-02-28'
);
select public._exige(
  (select count(*) = 0 from public.itens_manutencao i join public.manutencoes m on m.id = i.manutencao_id
   where m.contrato_id = '00000000-0000-4000-8000-0000000000c1' and m.numero_visita = 3 and i.nome_identificacao = 'Esteira 01'),
  'visita programada perde o equipamento depois da saida'
);
select public._exige(
  (select count(*) = 1 from public.itens_manutencao i join public.manutencoes m on m.id = i.manutencao_id
   where m.contrato_id = '00000000-0000-4000-8000-0000000000c1' and m.numero_visita = 2 and i.nome_identificacao = 'Esteira 01'),
  'visita realizada conserva o equipamento'
);

select public.salvar_equipamento_contrato(
  (select id from public.equipamentos_contrato where contrato_id = '00000000-0000-4000-8000-0000000000c1' and nome_identificacao = 'Esteira 02'),
  '00000000-0000-4000-8000-0000000000c1',
  '00000000-0000-4000-8000-000000000040',
  'Esteira 02A',
  date '2026-02-28',
  null
);
select public._exige(
  (select count(*) = 1 from public.itens_manutencao i join public.manutencoes m on m.id = i.manutencao_id
   where m.contrato_id = '00000000-0000-4000-8000-0000000000c1' and m.numero_visita = 3 and i.nome_identificacao = 'Esteira 02A'),
  'visita programada acompanha o nome'
);
select public._exige(
  (select count(*) = 1 from public.itens_manutencao i join public.manutencoes m on m.id = i.manutencao_id
   where m.contrato_id = '00000000-0000-4000-8000-0000000000c1' and m.numero_visita = 2 and i.nome_identificacao = 'Esteira 02'),
  'visita realizada conserva o nome antigo'
);

select public._teste_recusa(
  $$select public.remover_equipamento_contrato('00000000-0000-4000-8000-0000000000d1')$$,
  'Este equipamento já entrou em visita. Informe a data de saída'
);

select public.salvar_equipamento_contrato(
  null,
  '00000000-0000-4000-8000-0000000000c1',
  '00000000-0000-4000-8000-000000000040',
  'So 01',
  date '2026-03-31',
  null
);
select public.remover_equipamento_contrato(
  (select id from public.equipamentos_contrato where contrato_id = '00000000-0000-4000-8000-0000000000c1' and nome_identificacao = 'So 01')
);
select public._exige(
  (select count(*) = 0 from public.equipamentos_contrato where contrato_id = '00000000-0000-4000-8000-0000000000c1' and nome_identificacao = 'So 01'),
  'remove equipamento que so estava pendente'
);
select public._exige(
  (select count(*) = 0 from public.itens_manutencao i join public.manutencoes m on m.id = i.manutencao_id
   where m.contrato_id = '00000000-0000-4000-8000-0000000000c1' and i.nome_identificacao = 'So 01'),
  'remove o item pendente junto'
);

select public._teste_recusa(
  $$select public.salvar_equipamento_contrato(
    null,
    '00000000-0000-4000-8000-0000000000c1',
    (select id from public.equipamentos_matriz where nome = 'Bicicleta'),
    'Bike parada',
    date '2026-01-31',
    null
  )$$,
  'Selecione um equipamento da lista'
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

set local role anon;
select public._teste_recusa(
  $$select public.proximo_numero_contrato()$$,
  'permission denied'
);
reset role;

commit;
