-- A foto pode faltar. A descrição continua obrigatória.
-- O registro antigo e a foto já gravada não são alterados.

begin;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);

select public._exige(
  (
    select is_nullable = 'YES'
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ocorrencias'
      and column_name = 'foto_url'
  ),
  'foto da ocorrencia pode ficar vazia'
);

select public._exige(
  (
    select descricao_original = 'Correia solta'
      and foto_url = 'fotos/correia.jpg'
    from public.ocorrencias
    where item_manutencao_id = '00000000-0000-4000-8000-000000000074'
  ),
  'foto ja registrada permanece antes do novo registro'
);

insert into public.manutencoes (
  id, condominio_id, data_programada_original, data_programada_atual, prestador_id, tipo, origem
) values (
  '00000000-0000-4000-8000-000000000951',
  '00000000-0000-4000-8000-000000000010',
  date '2027-04-01',
  date '2027-04-01',
  '00000000-0000-4000-8000-000000000030',
  'avulsa',
  'manual'
);

insert into public.itens_manutencao (id, manutencao_id, equipamento_matriz_id, nome_identificacao) values
  ('00000000-0000-4000-8000-000000000961', '00000000-0000-4000-8000-000000000951', '00000000-0000-4000-8000-000000000040', 'Esteira sem foto'),
  ('00000000-0000-4000-8000-000000000962', '00000000-0000-4000-8000-000000000951', '00000000-0000-4000-8000-000000000040', 'Bicicleta sem foto');

select public._teste_recusa(
  $$select public.registrar_ocorrencia('00000000-0000-4000-8000-000000000961', true, '   ', null)$$,
  'Ocorrência exige resolução e descrição'
);

select public.registrar_ocorrencia(
  '00000000-0000-4000-8000-000000000961',
  true,
  'Ajuste feito no local',
  null
);
select public.registrar_ocorrencia(
  '00000000-0000-4000-8000-000000000962',
  false,
  'Correia ainda solta',
  '   '
);

select public._exige(
  (
    select resolvida_no_local = true
      and descricao_original = 'Ajuste feito no local'
      and foto_url is null
      and status_ocorrencia = 'resolvida'
    from public.ocorrencias
    where item_manutencao_id = '00000000-0000-4000-8000-000000000961'
  ),
  'resolvida no local grava sem foto'
);
select public._exige(
  (
    select resolvida_no_local = false
      and descricao_original = 'Correia ainda solta'
      and foto_url is null
      and status_ocorrencia = 'aberta'
    from public.ocorrencias
    where item_manutencao_id = '00000000-0000-4000-8000-000000000962'
  ),
  'nao resolvida no local grava sem foto'
);
select public._exige(
  (
    select descricao_original = 'Correia solta'
      and foto_url = 'fotos/correia.jpg'
    from public.ocorrencias
    where item_manutencao_id = '00000000-0000-4000-8000-000000000074'
  ),
  'foto ja registrada permanece'
);

rollback;
