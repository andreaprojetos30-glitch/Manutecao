-- Fase 6: liberação do comprovante. Os dados deste arquivo são desfeitos no final.

begin;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);

insert into public.manutencoes (
  id, condominio_id, contrato_id, numero_visita,
  data_programada_original, data_programada_atual, prestador_id, tipo, origem
) values
  ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000020', 201, date '2026-07-31', date '2026-07-31', '00000000-0000-4000-8000-000000000030', 'preventiva', 'automatica'),
  ('00000000-0000-4000-8000-000000000902', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000020', 202, date '2026-08-31', date '2026-08-31', '00000000-0000-4000-8000-000000000030', 'preventiva', 'automatica'),
  ('00000000-0000-4000-8000-000000000903', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000020', 203, date '2026-09-30', date '2026-09-30', '00000000-0000-4000-8000-000000000030', 'preventiva', 'automatica'),
  ('00000000-0000-4000-8000-000000000904', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000020', 204, date '2026-10-31', date '2026-10-31', '00000000-0000-4000-8000-000000000030', 'preventiva', 'automatica'),
  ('00000000-0000-4000-8000-000000000905', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000020', 205, date '2026-11-30', date '2026-11-30', '00000000-0000-4000-8000-000000000030', 'preventiva', 'automatica'),
  ('00000000-0000-4000-8000-000000000906', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000020', 206, date '2026-12-31', date '2026-12-31', '00000000-0000-4000-8000-000000000030', 'preventiva', 'automatica'),
  ('00000000-0000-4000-8000-000000000908', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000020', 208, date '2027-02-28', date '2027-02-28', '00000000-0000-4000-8000-000000000030', 'preventiva', 'automatica');

insert into public.manutencoes (
  id, condominio_id, contrato_id, numero_visita,
  data_programada_original, data_programada_atual, prestador_id, tipo, origem
) values (
  '00000000-0000-4000-8000-000000000909',
  '00000000-0000-4000-8000-000000000010',
  '00000000-0000-4000-8000-000000000020',
  null,
  date '2027-03-15',
  date '2027-03-15',
  '00000000-0000-4000-8000-000000000030',
  'corretiva',
  'manual'
);

insert into public.manutencoes (
  id, condominio_id, data_programada_original, data_programada_atual, prestador_id, tipo, origem
) values (
  '00000000-0000-4000-8000-00000000090a',
  '00000000-0000-4000-8000-000000000010',
  date '2027-03-16',
  date '2027-03-16',
  '00000000-0000-4000-8000-000000000030',
  'avulsa',
  'manual'
);

insert into public.itens_manutencao (id, manutencao_id, equipamento_contrato_id, nome_identificacao) values
  ('00000000-0000-4000-8000-000000000911', '00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000050', 'Esteira 01'),
  ('00000000-0000-4000-8000-000000000912', '00000000-0000-4000-8000-000000000902', '00000000-0000-4000-8000-000000000050', 'Esteira 01'),
  ('00000000-0000-4000-8000-000000000913', '00000000-0000-4000-8000-000000000903', '00000000-0000-4000-8000-000000000050', 'Esteira 01'),
  ('00000000-0000-4000-8000-000000000914', '00000000-0000-4000-8000-000000000904', '00000000-0000-4000-8000-000000000050', 'Esteira 01'),
  ('00000000-0000-4000-8000-000000000916', '00000000-0000-4000-8000-000000000906', '00000000-0000-4000-8000-000000000050', 'Esteira 01'),
  ('00000000-0000-4000-8000-000000000918', '00000000-0000-4000-8000-000000000908', '00000000-0000-4000-8000-000000000050', 'Esteira 01'),
  ('00000000-0000-4000-8000-000000000919', '00000000-0000-4000-8000-000000000909', '00000000-0000-4000-8000-000000000050', 'Esteira 01');

insert into public.itens_manutencao (id, manutencao_id, equipamento_matriz_id, nome_identificacao) values
  ('00000000-0000-4000-8000-00000000091a', '00000000-0000-4000-8000-00000000090a', '00000000-0000-4000-8000-000000000040', 'Esteira portátil');

select public.registrar_ok('00000000-0000-4000-8000-000000000911');
select public._exige(
  public.finalizar_manutencao('00000000-0000-4000-8000-000000000901') = 'realizada',
  'sem ocorrencia finaliza como realizada'
);
select public._exige(
  (
    select pdf_url is null and comprovante_liberado_em is null and numero_visita = 201
    from public.manutencoes
    where id = '00000000-0000-4000-8000-000000000901'
  ),
  'finalizar nao grava o arquivo nem a URL'
);

select public._teste_recusa(
  $$select public.registrar_comprovante(
    '00000000-0000-4000-8000-000000000901',
    'https://projeto.supabase.co/storage/v1/object/public/pdfs/comprovante.pdf',
    false
  )$$,
  'O comprovante não pode ter URL pública'
);
select public._teste_recusa(
  $$update public.manutencoes
    set pdf_url = lower(id::text) || '/comprovante.pdf',
        comprovante_liberado_em = clock_timestamp()
    where id = '00000000-0000-4000-8000-000000000901'$$,
  'O comprovante só é liberado pelo fluxo da manutenção'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', false);
select public._teste_recusa(
  $$select public.registrar_comprovante(
    '00000000-0000-4000-8000-000000000901',
    '00000000-0000-4000-8000-000000000901/comprovante.pdf',
    false
  )$$,
  'Visita não atribuída'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
select public._exige(
  public.registrar_comprovante(
    '00000000-0000-4000-8000-000000000901',
    '00000000-0000-4000-8000-000000000901/comprovante.pdf',
    false
  ) = '00000000-0000-4000-8000-000000000901/comprovante.pdf',
  'sem ocorrencia libera sem aprovacao do ADM'
);
select public._exige(
  (
    select status = 'realizada'
      and numero_visita = 201
      and pdf_url = '00000000-0000-4000-8000-000000000901/comprovante.pdf'
      and comprovante_liberado_em is not null
      and comprovante_autorizado_por is null
      and position('://' in pdf_url) = 0
    from public.manutencoes
    where id = '00000000-0000-4000-8000-000000000901'
  ),
  'comprovante automatico guarda so o caminho privado'
);
select public._teste_recusa(
  $$select public.registrar_comprovante(
    '00000000-0000-4000-8000-000000000901',
    '00000000-0000-4000-8000-000000000901/comprovante.pdf',
    false
  )$$,
  'O comprovante já foi liberado'
);

select public.registrar_ocorrencia(
  '00000000-0000-4000-8000-000000000912',
  true,
  'SEGREDO-DESCRICAO ajuste no local',
  'SEGREDO-FOTO/ajuste.jpg'
);
select public._exige(
  public.finalizar_manutencao('00000000-0000-4000-8000-000000000902') = 'realizada',
  'ocorrencia resolvida no local finaliza como realizada'
);
select public._exige(
  public.registrar_comprovante(
    '00000000-0000-4000-8000-000000000902',
    '00000000-0000-4000-8000-000000000902/comprovante.pdf',
    false
  ) = '00000000-0000-4000-8000-000000000902/comprovante.pdf',
  'resolvida no local nao impede a liberacao'
);
select public._exige(
  (
    select position('SEGREDO' in pdf_url) = 0
      and position('ajuste' in pdf_url) = 0
    from public.manutencoes
    where id = '00000000-0000-4000-8000-000000000902'
  ),
  'caminho do comprovante nao carrega a ocorrencia'
);
select public._exige(
  (
    select descricao_original = 'SEGREDO-DESCRICAO ajuste no local'
      and resolvida_no_local = true
      and necessita_orcamento = false
    from public.ocorrencias
    where item_manutencao_id = '00000000-0000-4000-8000-000000000912'
  ),
  'ocorrencia resolvida permanece so no registro interno'
);

select public.registrar_ocorrencia(
  '00000000-0000-4000-8000-000000000913',
  false,
  'Correia sem orcamento',
  'fotos/correia-903.jpg'
);
select public._exige(
  (
    select necessita_orcamento = false and orcamento_informado = false
    from public.ocorrencias
    where item_manutencao_id = '00000000-0000-4000-8000-000000000913'
  ),
  'prestador nao classifica orcamento'
);
select public._exige(
  public.finalizar_manutencao('00000000-0000-4000-8000-000000000903') = 'aguardando_administracao',
  'ocorrencia nao resolvida continua com o ADM'
);
select public._teste_recusa(
  $$select public.registrar_comprovante(
    '00000000-0000-4000-8000-000000000903',
    '00000000-0000-4000-8000-000000000903/comprovante.pdf',
    false
  )$$,
  'Informe se a ocorrência depende de orçamento'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
select public.registrar_tratamento_ocorrencia(
  (select id from public.ocorrencias where item_manutencao_id = '00000000-0000-4000-8000-000000000913'),
  'em_analise',
  'Troca simples, sem orçamento',
  false
);
select public._exige(
  (
    select m.status = 'aguardando_administracao'
      and m.numero_visita = 203
      and m.pdf_url is null
      and o.necessita_orcamento = false
      and o.orcamento_informado = true
      and o.status_ocorrencia = 'em_analise'
      and o.descricao_original = 'Correia sem orcamento'
    from public.manutencoes m
    join public.itens_manutencao i on i.manutencao_id = m.id
    join public.ocorrencias o on o.item_manutencao_id = i.id
    where m.id = '00000000-0000-4000-8000-000000000903'
  ),
  'resposta negativa nao muda a visita nem o registro do prestador'
);
select public._exige(
  public.registrar_comprovante(
    '00000000-0000-4000-8000-000000000903',
    '00000000-0000-4000-8000-000000000903/comprovante.pdf',
    false
  ) = '00000000-0000-4000-8000-000000000903/comprovante.pdf',
  'sem orcamento libera sem segunda autorizacao'
);
select public._exige(
  (
    select status = 'aguardando_administracao'
      and comprovante_autorizado_por is null
      and pdf_url = '00000000-0000-4000-8000-000000000903/comprovante.pdf'
    from public.manutencoes
    where id = '00000000-0000-4000-8000-000000000903'
  ),
  'liberacao sem orcamento nao exige nova autorizacao'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
select public.registrar_ocorrencia(
  '00000000-0000-4000-8000-000000000914',
  false,
  'Motor com custo',
  'fotos/motor-904.jpg'
);
select public._exige(
  public.finalizar_manutencao('00000000-0000-4000-8000-000000000904') = 'aguardando_administracao',
  'orcamento pendente deixa a visita com o ADM'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
select public.registrar_tratamento_ocorrencia(
  (select id from public.ocorrencias where item_manutencao_id = '00000000-0000-4000-8000-000000000914'),
  'aguardando_orcamento',
  'Peça depende de orçamento',
  true
);
select public._teste_recusa(
  $$select public.registrar_comprovante(
    '00000000-0000-4000-8000-000000000904',
    '00000000-0000-4000-8000-000000000904/comprovante.pdf',
    false
  )$$,
  'O comprovante aguarda autorização'
);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
select public._teste_recusa(
  $$select public.registrar_comprovante(
    '00000000-0000-4000-8000-000000000904',
    '00000000-0000-4000-8000-000000000904/comprovante.pdf',
    true
  )$$,
  'Somente o ADM autoriza a liberação do comprovante'
);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
select public._exige(
  public.registrar_comprovante(
    '00000000-0000-4000-8000-000000000904',
    '00000000-0000-4000-8000-000000000904/comprovante.pdf',
    true
  ) = '00000000-0000-4000-8000-000000000904/comprovante.pdf',
  'ADM autoriza com orcamento ainda pendente'
);
select public._exige(
  (
    select m.status = 'aguardando_administracao'
      and m.comprovante_autorizado_por = '00000000-0000-4000-8000-000000000001'
      and m.pdf_url = '00000000-0000-4000-8000-000000000904/comprovante.pdf'
      and position('://' in m.pdf_url) = 0
      and o.necessita_orcamento = true
      and o.status_ocorrencia = 'aguardando_orcamento'
      and o.descricao_original = 'Motor com custo'
    from public.manutencoes m
    join public.itens_manutencao i on i.manutencao_id = m.id
    join public.ocorrencias o on o.item_manutencao_id = i.id
    where m.id = '00000000-0000-4000-8000-000000000904'
  ),
  'autorizacao nao conclui o orcamento nem muda a visita'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
select public.registrar_ocorrencia(
  '00000000-0000-4000-8000-000000000918',
  false,
  'Situacao de orcamento',
  'fotos/situacao-908.jpg'
);
select public.finalizar_manutencao('00000000-0000-4000-8000-000000000908');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
select public.registrar_tratamento_ocorrencia(
  (select id from public.ocorrencias where item_manutencao_id = '00000000-0000-4000-8000-000000000918'),
  'aguardando_orcamento',
  'A situação já pede orçamento',
  false
);
select public._teste_recusa(
  $$select public.registrar_comprovante(
    '00000000-0000-4000-8000-000000000908',
    '00000000-0000-4000-8000-000000000908/comprovante.pdf',
    false
  )$$,
  'O comprovante aguarda autorização'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
select public.cancelar_manutencao('00000000-0000-4000-8000-000000000905');
select public._teste_recusa(
  $$select public.registrar_comprovante(
    '00000000-0000-4000-8000-000000000905',
    '00000000-0000-4000-8000-000000000905/comprovante.pdf',
    false
  )$$,
  'Manutenção cancelada não gera comprovante'
);

select set_config('app.registro_anterior', 'on', true);
update public.manutencoes
  set registro_anterior = true,
      status = 'realizada',
      data_realizada = date '2026-01-15'
  where id = '00000000-0000-4000-8000-000000000906';
select set_config('app.registro_anterior', 'off', true);
select public._teste_recusa(
  $$select public.registrar_comprovante(
    '00000000-0000-4000-8000-000000000906',
    '00000000-0000-4000-8000-000000000906/comprovante.pdf',
    false
  )$$,
  'Registro anterior não gera comprovante'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
select public.registrar_ok('00000000-0000-4000-8000-000000000919');
select public._exige(
  public.finalizar_manutencao('00000000-0000-4000-8000-000000000909') = 'realizada',
  'corretiva sem ocorrencia finaliza'
);
select public.registrar_comprovante(
  '00000000-0000-4000-8000-000000000909',
  '00000000-0000-4000-8000-000000000909/comprovante.pdf',
  false
);
select public.registrar_ok('00000000-0000-4000-8000-00000000091a');
select public._exige(
  public.finalizar_manutencao('00000000-0000-4000-8000-00000000090a') = 'realizada',
  'avulsa sem ocorrencia finaliza'
);
select public.registrar_comprovante(
  '00000000-0000-4000-8000-00000000090a',
  '00000000-0000-4000-8000-00000000090a/comprovante.pdf',
  false
);
select public._exige(
  (
    select bool_and(numero_visita is null)
      and bool_or(tipo = 'corretiva')
      and bool_or(tipo = 'avulsa')
    from public.manutencoes
    where id in (
      '00000000-0000-4000-8000-000000000909',
      '00000000-0000-4000-8000-00000000090a'
    )
  ),
  'corretiva e avulsa nao ganham numeracao contratual'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
select public._exige(
  public.programar_retorno_ocorrencia(
    (select id from public.ocorrencias where item_manutencao_id = '00000000-0000-4000-8000-000000000914'),
    date '2027-04-02',
    '00000000-0000-4000-8000-000000000030'
  ) is not null,
  'retorno tecnico continua sem numeracao de visita'
);
select public._exige(
  (
    select tipo = 'corretiva_complementar' and numero_visita is null and pdf_url is null
    from public.manutencoes
    where ocorrencia_origem_id = (
      select id from public.ocorrencias where item_manutencao_id = '00000000-0000-4000-8000-000000000914'
    )
  ),
  'retorno nasce sem comprovante e sem fracao'
);

select set_config('teste.comprovante_pdfs', (select count(*)::text from storage.objects where bucket_id = 'pdfs'), false);
select public._exige(
  (select count(*)::text from storage.objects where bucket_id = 'pdfs') = current_setting('teste.comprovante_pdfs'),
  'liberar o comprovante nao cria objeto de storage nem URL'
);

rollback;
