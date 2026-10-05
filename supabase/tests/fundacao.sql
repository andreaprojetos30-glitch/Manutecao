begin;

create or replace function public._exige(condicao boolean, mensagem text)
returns void
language plpgsql
as $$
begin
  if coalesce(condicao, false) is not true then
    raise exception '%', mensagem;
  end if;
end;
$$;

create or replace function public._teste_recusa(p_sql text, p_trecho text)
returns void
language plpgsql
as $$
begin
  execute p_sql;
  raise exception 'Esperava falha contendo "%"', p_trecho;
exception
  when others then
    if sqlerrm like 'Esperava falha contendo%' then
      raise;
    end if;
    if position(p_trecho in sqlerrm) = 0 then
      raise exception 'Mensagem diferente. Esperado "%", veio "%"', p_trecho, sqlerrm;
    end if;
end;
$$;

select public._exige(public.data_visita_mensal(date '2026-01-31', 1) = date '2026-02-28', 'fevereiro deveria ir para o dia 28');
select public._exige(public.data_visita_mensal(date '2024-01-31', 1) = date '2024-02-29', 'bissexto deveria ir para o dia 29');
select public._exige(public.data_visita_mensal(date '2026-01-31', 2) = date '2026-03-31', 'marco deveria manter o dia 31');
select public._exige(public.data_visita_mensal(date '2026-03-15', 0) = date '2026-03-15', 'a primeira visita mantem a data de inicio');
select public._exige(public.agenda_incompativel(date '2026-01-31', 12, date '2026-06-30'), 'agenda alem do fim deveria alertar');
select public._exige(not public.agenda_incompativel(date '2026-01-31', 12, null), 'sem data fim nao ha alerta');
select public._exige(not public.agenda_incompativel(date '2026-01-15', 2, date '2026-02-15'), 'visita no dia do fim nao estoura');
select public._exige(public.agenda_incompativel(date '2026-01-15', 2, date '2026-02-14'), 'visita depois do fim deveria alertar');
select public._exige(public.equipamento_participa(date '2026-03-01', null, date '2026-03-01'), 'entra na data de entrada');
select public._exige(not public.equipamento_participa(date '2026-03-01', null, date '2026-02-28'), 'nao entra antes da entrada');
select public._exige(public.equipamento_participa(date '2026-01-01', date '2026-03-10', date '2026-03-10'), 'participa na data de saida');
select public._exige(not public.equipamento_participa(date '2026-01-01', date '2026-03-10', date '2026-03-11'), 'nao participa depois da saida');

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000001', 'adm@eleva.test', '{"perfil":"admin"}', '{"nome":"Ana ADM"}'),
  ('00000000-0000-4000-8000-000000000002', 'paulo@eleva.test', '{"perfil":"prestador"}', '{"nome":"Paulo"}'),
  ('00000000-0000-4000-8000-000000000003', 'outro@eleva.test', '{"perfil":"prestador"}', '{"nome":"Outro"}'),
  ('00000000-0000-4000-8000-000000000004', 'sem@eleva.test', '{}', '{"nome":"Sem Perfil","perfil":"admin"}'),
  ('00000000-0000-4000-8000-000000000005', 'ruim@eleva.test', '{"perfil":"sindico"}', '{"nome":"Ruim"}');

select public._exige((select perfil from public.usuarios where id = '00000000-0000-4000-8000-000000000001') = 'admin', 'admin explicito');
select public._exige((select perfil from public.usuarios where id = '00000000-0000-4000-8000-000000000002') = 'prestador', 'prestador explicito');
select public._exige((select perfil from public.usuarios where id = '00000000-0000-4000-8000-000000000004') is null, 'user metadata nao promove');
select public._exige((select nome from public.usuarios where id = '00000000-0000-4000-8000-000000000004') = 'Sem Perfil', 'nome pode vir do user metadata');
select public._exige((select perfil from public.usuarios where id = '00000000-0000-4000-8000-000000000005') is null, 'perfil invalido fica nulo');

update auth.users
  set raw_user_meta_data = '{"nome":"Ruim","perfil":"admin"}'
  where id = '00000000-0000-4000-8000-000000000005';
select public._exige((select perfil from public.usuarios where id = '00000000-0000-4000-8000-000000000005') is null, 'atualizar user metadata nao concede perfil');

update auth.users
  set raw_app_meta_data = '{"perfil":"admin"}'
  where id = '00000000-0000-4000-8000-000000000005';
select public._exige((select perfil from public.usuarios where id = '00000000-0000-4000-8000-000000000005') = 'admin', 'app metadata libera o perfil');

update auth.users
  set raw_app_meta_data = '{}'::jsonb
  where id = '00000000-0000-4000-8000-000000000005';
select public._exige((select perfil from public.usuarios where id = '00000000-0000-4000-8000-000000000005') is null, 'tirar app metadata remove o acesso');

insert into public.condominios (id, nome, endereco, bairro, cidade, estado) values
  ('00000000-0000-4000-8000-000000000010', 'Porta do Sol', 'Rua A', 'Centro', 'Campinas', 'SP'),
  ('00000000-0000-4000-8000-000000000011', 'Outro Predio', 'Rua B', 'Cambuí', 'Campinas', 'SP');

insert into public.sindicos (condominio_id, nome, whatsapp) values
  ('00000000-0000-4000-8000-000000000010', 'Síndico Atual', '19911111111');

insert into public.prestadores (id, usuario_id, nome, whatsapp) values
  ('00000000-0000-4000-8000-000000000030', '00000000-0000-4000-8000-000000000002', 'Paulo', '19999999999'),
  ('00000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000003', 'Outro', '19988888888');

insert into public.contratos (
  id, numero_contrato, condominio_id, data_inicio_contrato, data_inicio_manutencao, quantidade_visitas, data_fim_contrato
) values
  ('00000000-0000-4000-8000-000000000020', '2026-001', '00000000-0000-4000-8000-000000000010', date '2026-01-01', date '2026-01-31', 12, date '2026-12-31'),
  ('00000000-0000-4000-8000-000000000021', '2026-002', '00000000-0000-4000-8000-000000000010', date '2026-01-01', date '2026-01-31', 12, null);

insert into public.equipamentos_matriz (id, nome, categoria) values
  ('00000000-0000-4000-8000-000000000040', 'Esteira', 'Cardio');

insert into public.equipamentos_contrato (id, contrato_id, equipamento_matriz_id, nome_identificacao, data_entrada) values
  ('00000000-0000-4000-8000-000000000050', '00000000-0000-4000-8000-000000000020', '00000000-0000-4000-8000-000000000040', 'Esteira 01', date '2026-01-01'),
  ('00000000-0000-4000-8000-000000000051', '00000000-0000-4000-8000-000000000020', '00000000-0000-4000-8000-000000000040', 'Esteira 02', date '2026-01-01'),
  ('00000000-0000-4000-8000-000000000053', '00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000040', 'Esteira alheia', date '2026-01-01');

insert into public.manutencoes (
  id, condominio_id, contrato_id, numero_visita,
  data_programada_original, data_programada_atual, prestador_id, tipo, origem
) values
  ('00000000-0000-4000-8000-000000000060', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000020', 1, date '2026-01-31', date '2026-01-31', '00000000-0000-4000-8000-000000000030', 'preventiva', 'automatica'),
  ('00000000-0000-4000-8000-000000000061', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000020', 2, date '2026-02-28', date '2026-02-28', '00000000-0000-4000-8000-000000000031', 'preventiva', 'automatica'),
  ('00000000-0000-4000-8000-000000000062', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000020', 3, date '2026-03-31', date '2026-03-31', '00000000-0000-4000-8000-000000000030', 'preventiva', 'automatica'),
  ('00000000-0000-4000-8000-000000000063', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000020', 4, date '2026-04-30', date '2026-04-30', '00000000-0000-4000-8000-000000000030', 'preventiva', 'automatica'),
  ('00000000-0000-4000-8000-000000000064', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000020', 5, date '2026-05-31', date '2026-05-31', '00000000-0000-4000-8000-000000000030', 'preventiva', 'automatica'),
  ('00000000-0000-4000-8000-000000000065', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000020', 6, date '2026-06-30', date '2026-06-30', '00000000-0000-4000-8000-000000000030', 'preventiva', 'automatica');

insert into public.manutencoes (
  id, condominio_id, data_programada_original, data_programada_atual, prestador_id, tipo, origem
) values (
  '00000000-0000-4000-8000-000000000066',
  '00000000-0000-4000-8000-000000000010',
  date '2026-04-02',
  date '2026-04-02',
  '00000000-0000-4000-8000-000000000030',
  'avulsa',
  'manual'
);

insert into public.itens_manutencao (id, manutencao_id, equipamento_contrato_id, nome_identificacao) values
  ('00000000-0000-4000-8000-000000000070', '00000000-0000-4000-8000-000000000060', '00000000-0000-4000-8000-000000000050', 'Esteira 01'),
  ('00000000-0000-4000-8000-000000000071', '00000000-0000-4000-8000-000000000061', '00000000-0000-4000-8000-000000000050', 'Esteira 01'),
  ('00000000-0000-4000-8000-000000000072', '00000000-0000-4000-8000-000000000062', '00000000-0000-4000-8000-000000000050', 'Esteira 01'),
  ('00000000-0000-4000-8000-000000000073', '00000000-0000-4000-8000-000000000062', '00000000-0000-4000-8000-000000000051', 'Esteira 02'),
  ('00000000-0000-4000-8000-000000000074', '00000000-0000-4000-8000-000000000063', '00000000-0000-4000-8000-000000000050', 'Esteira 01'),
  ('00000000-0000-4000-8000-000000000078', '00000000-0000-4000-8000-000000000064', '00000000-0000-4000-8000-000000000050', 'Esteira 01'),
  ('00000000-0000-4000-8000-000000000075', '00000000-0000-4000-8000-000000000065', '00000000-0000-4000-8000-000000000050', 'Esteira 01');

insert into public.itens_manutencao (id, manutencao_id, equipamento_matriz_id, nome_identificacao) values
  ('00000000-0000-4000-8000-000000000076', '00000000-0000-4000-8000-000000000066', '00000000-0000-4000-8000-000000000040', 'Esteira portátil');

select public._teste_recusa(
  $$insert into public.contratos (id, numero_contrato, condominio_id, tipo, data_inicio_contrato, data_inicio_manutencao, quantidade_visitas)
    values ('00000000-0000-4000-8000-000000000022', '2026-AV', '00000000-0000-4000-8000-000000000010', 'avulso', date '2026-01-01', date '2026-01-01', 1)$$,
  'check constraint'
);

select public._teste_recusa(
  $$insert into public.manutencoes (id, condominio_id, contrato_id, data_programada_original, data_programada_atual, prestador_id, tipo, origem)
    values ('00000000-0000-4000-8000-000000000069', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000020', date '2026-07-01', date '2026-07-01', '00000000-0000-4000-8000-000000000030', 'avulsa', 'manual')$$,
  'manutencoes_tipo_vinculos'
);

select public._teste_recusa(
  $$insert into public.itens_manutencao (manutencao_id, equipamento_contrato_id, nome_identificacao)
    values ('00000000-0000-4000-8000-000000000060', '00000000-0000-4000-8000-000000000053', 'Esteira alheia')$$,
  'Equipamento de outro contrato'
);

select public._exige((select status from public.manutencoes where id = '00000000-0000-4000-8000-000000000060') = 'programada', 'visita nasce programada');
select id from public.manutencoes where id = '00000000-0000-4000-8000-000000000060';
select public._exige((select status from public.manutencoes where id = '00000000-0000-4000-8000-000000000060') = 'programada', 'abrir a visita nao muda o status');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);

select public._teste_recusa(
  $$select public.registrar_ocorrencia('00000000-0000-4000-8000-000000000075', false, 'faltou foto', '   ')$$,
  'Ocorrência exige resolução, descrição e foto'
);
select public._exige((select count(*) = 0 from public.ocorrencias), 'foto vazia nao grava ocorrencia');

select public.registrar_ok('00000000-0000-4000-8000-000000000070');
select public._exige((select status from public.manutencoes where id = '00000000-0000-4000-8000-000000000060') = 'em_execucao', 'primeiro OK inicia a execucao');
select public._exige(public.finalizar_manutencao('00000000-0000-4000-8000-000000000060') = 'realizada', 'tudo OK finaliza como realizada');

select public._teste_recusa(
  $$select public.finalizar_manutencao('00000000-0000-4000-8000-000000000062')$$,
  'Todos os equipamentos precisam ser tratados'
);
select public.registrar_ok('00000000-0000-4000-8000-000000000072');
select public._teste_recusa(
  $$select public.finalizar_manutencao('00000000-0000-4000-8000-000000000062')$$,
  'Todos os equipamentos precisam ser tratados'
);
select public.registrar_ok('00000000-0000-4000-8000-000000000073');
select public._exige(public.finalizar_manutencao('00000000-0000-4000-8000-000000000062') = 'realizada', 'so finaliza com todos tratados');

select public.registrar_ocorrencia('00000000-0000-4000-8000-000000000074', false, 'Correia solta', 'fotos/correia.jpg');
select public._exige(
  (select status_ocorrencia = 'aberta' and resolvida_no_local = false and necessita_orcamento = false from public.ocorrencias where item_manutencao_id = '00000000-0000-4000-8000-000000000074'),
  'nao resolvida nasce aberta'
);
select public._exige(public.finalizar_manutencao('00000000-0000-4000-8000-000000000063') = 'aguardando_administracao', 'pendencia vai para o ADM');

select public.registrar_ocorrencia('00000000-0000-4000-8000-000000000078', true, 'Ajuste no local', 'fotos/ajuste.jpg');
select public._exige(
  (select status_ocorrencia = 'resolvida' and resolvida_no_local = true from public.ocorrencias where item_manutencao_id = '00000000-0000-4000-8000-000000000078'),
  'resolvida no local nasce resolvida'
);
select public._exige(public.finalizar_manutencao('00000000-0000-4000-8000-000000000064') = 'realizada', 'so resolvida no local fica realizada');

insert into public.manutencoes (
  id, condominio_id, contrato_id, data_programada_original, data_programada_atual,
  prestador_id, tipo, origem, ocorrencia_origem_id
)
select
  '00000000-0000-4000-8000-000000000067',
  '00000000-0000-4000-8000-000000000010',
  '00000000-0000-4000-8000-000000000020',
  date '2026-05-02',
  date '2026-05-02',
  '00000000-0000-4000-8000-000000000030',
  'corretiva_complementar',
  'manual',
  o.id
from public.ocorrencias o
where o.item_manutencao_id = '00000000-0000-4000-8000-000000000074';

select public._exige(
  (select count(*) = 1 from public.manutencoes where ocorrencia_origem_id = (
    select id from public.ocorrencias where item_manutencao_id = '00000000-0000-4000-8000-000000000074'
  )),
  'retorno aponta para a ocorrencia'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
update public.manutencoes
  set data_programada_atual = date '2026-03-02'
  where id = '00000000-0000-4000-8000-000000000061';
select public._exige((select count(*) = 1 from public.historico_reagendamentos where manutencao_id = '00000000-0000-4000-8000-000000000061'), 'reagendamento gera historico');
select public._exige((select data_programada_atual = date '2026-01-31' from public.manutencoes where id = '00000000-0000-4000-8000-000000000060'), 'reagendar uma visita nao move outra');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
select public._teste_recusa(
  $$update public.manutencoes set data_programada_atual = date '2026-08-01' where id = '00000000-0000-4000-8000-000000000066'$$,
  'Somente o ADM pode reagendar'
);
select public._teste_recusa(
  $$select public.cancelar_manutencao('00000000-0000-4000-8000-000000000065')$$,
  'Somente o ADM pode cancelar uma visita'
);
select public._teste_recusa(
  $$update public.manutencoes set status = 'cancelada' where id = '00000000-0000-4000-8000-000000000066'$$,
  'Somente o ADM pode cancelar uma visita'
);
select public._exige((select status = 'programada' from public.manutencoes where id = '00000000-0000-4000-8000-000000000066'), 'avulsa continua programada');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
select public.cancelar_manutencao('00000000-0000-4000-8000-000000000065');
select public._exige((select status = 'cancelada' from public.manutencoes where id = '00000000-0000-4000-8000-000000000065'), 'ADM cancela');

insert into storage.objects (bucket_id, name)
values ('fotos', '00000000-0000-4000-8000-000000000061/alheia.jpg');
insert into storage.objects (bucket_id, name)
values ('pdfs', '00000000-0000-4000-8000-000000000060/visita.pdf');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);

select public._exige((select count(*) = 7 from public.manutencoes), 'prestador ve so as visitas atribuidas');
select public._exige((select count(*) = 0 from public.manutencoes where id = '00000000-0000-4000-8000-000000000061'), 'prestador nao ve visita de outro');
select public._exige((select count(*) = 1 from public.condominios), 'prestador ve o condominio da visita');
select public._exige((select count(*) = 0 from public.sindicos), 'prestador nao ve sindico');
select public._exige((select count(*) = 1 from public.usuarios), 'prestador nao lista outros usuarios');

select public._teste_recusa(
  $$insert into public.condominios (nome, endereco, bairro, cidade, estado) values ('Novo', 'Rua C', 'Centro', 'Campinas', 'SP')$$,
  'row-level security'
);
select public._teste_recusa(
  $$insert into public.ocorrencias (item_manutencao_id, resolvida_no_local, descricao_original, foto_url, status_ocorrencia)
    values ('00000000-0000-4000-8000-000000000076', false, 'direto', 'fotos/x.jpg', 'aberta')$$,
  'row-level security'
);

do $$
declare
  n integer;
begin
  update public.usuarios set perfil = 'admin' where id = '00000000-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'Prestador alterou o proprio perfil';
  end if;
end $$;

insert into storage.objects (bucket_id, name)
values ('fotos', '00000000-0000-4000-8000-000000000066/foto.jpg');
select public._exige((select count(*) = 1 from storage.objects where bucket_id = 'fotos'), 'prestador so le a propria foto');
select public._teste_recusa(
  $$insert into storage.objects (bucket_id, name) values ('fotos', '00000000-0000-4000-8000-000000000061/invasao.jpg')$$,
  'row-level security'
);
select public._teste_recusa(
  $$insert into storage.objects (bucket_id, name) values ('pdfs', '00000000-0000-4000-8000-000000000066/laudo.pdf')$$,
  'row-level security'
);
select public._exige((select count(*) = 0 from storage.objects where bucket_id = 'pdfs'), 'prestador nao le PDF');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true);
select public._exige((select count(*) = 0 from public.manutencoes), 'sem perfil nao ve visitas');
select public._exige((select count(*) = 0 from public.condominios), 'sem perfil nao ve condominio');
select public._teste_recusa(
  $$select public.registrar_ok('00000000-0000-4000-8000-000000000076')$$,
  'Sem acesso operacional'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
select public._exige((select count(*) = 8 from public.manutencoes), 'ADM ve a operacao completa');
select public._exige((select count(*) = 2 from public.condominios), 'ADM ve os condominios');
select public._exige((select count(*) >= 1 from storage.objects where bucket_id = 'pdfs'), 'ADM le PDF');

reset role;
commit;
