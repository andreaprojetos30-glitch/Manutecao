-- Bloco 3B. Os dados deste arquivo são desfeitos no final.

begin;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);

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

create or replace function public._liberar_manual(p_visita uuid, p_item uuid)
returns void
language plpgsql
as $$
begin
  perform public.registrar_ok(p_item);
  if public.finalizar_manutencao(p_visita) is null then
    raise exception 'finalizacao de teste falhou';
  end if;
  perform public.registrar_comprovante(p_visita, lower(p_visita::text) || '/comprovante.pdf', false);
end;
$$;

create or replace function public._enviar_manual(p_visita uuid, p_token text)
returns void
language plpgsql
as $$
begin
  perform public.emitir_link_confirmacao_cifrado(
    p_visita,
    public.hash_token_confirmacao(p_token),
    'v1.' || repeat('C', 96),
    '00000000-0000-4000-8000-000000000001'
  );
  perform public.registrar_comunicacao_comprovante(
    p_visita,
    '00000000-0000-4000-8000-000000000001',
    'confirmar',
    null
  );
end;
$$;

select public._exige(
  not has_table_privilege('anon', 'public.confirmacoes_manuais', 'select')
    and not has_table_privilege('authenticated', 'public.documentos_confirmacao', 'insert')
    and not has_table_privilege('service_role', 'public.confirmacoes_manuais', 'select')
    and not has_function_privilege('anon', 'public.registrar_confirmacao_manual(uuid, uuid, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.corrigir_confirmacao_manual(uuid, uuid, uuid, text)', 'execute')
    and not has_function_privilege('service_role', 'public.confirmacao_manual_vigente(uuid)', 'execute')
    and has_function_privilege('service_role', 'public.registrar_confirmacao_manual(uuid, uuid, text)', 'execute')
    and has_function_privilege('service_role', 'public.garantir_documento_confirmacao(uuid, uuid, text, uuid)', 'execute')
    and has_function_privilege('service_role', 'public.ler_documento_confirmacao(uuid, uuid, text)', 'execute')
    and position('for update' in pg_get_functiondef('public.registrar_confirmacao_manual(uuid, uuid, text)'::regprocedure)) > 0
    and position('for update' in pg_get_functiondef('public.registrar_confirmacao_sindico(text)'::regprocedure)) > 0
    and position('for update' in pg_get_functiondef('public.corrigir_confirmacao_manual(uuid, uuid, uuid, text)'::regprocedure)) > 0,
  'confirmacao manual fica fechada e serializa a manutencao'
);

select public._exige(
  (select ativado_em is null from public.marco_acompanhamento where chave = 'unico'),
  'a migration do bloco 3b nao ativa o acompanhamento'
);

insert into public.condominios (id, nome, endereco, bairro, cidade, estado) values
  ('b3111111-1111-4111-8111-111111111111', 'Condomínio Confirmação Manual', 'Rua M', 'Centro', 'Campinas', 'SP');

insert into public.sindicos (id, condominio_id, nome, whatsapp, data_inicio, ativo) values
  ('b3511111-1111-4111-8111-111111111111', 'b3111111-1111-4111-8111-111111111111', 'Síndico Manual', '(19) 97777-1212', date '2026-01-01', true);

insert into public.manutencoes (
  id, condominio_id, data_programada_original, data_programada_atual, prestador_id, tipo, origem
) values
  ('b3011111-1111-4111-8111-111111111111', 'b3111111-1111-4111-8111-111111111111', date '2026-09-01', date '2026-09-01', '00000000-0000-4000-8000-000000000030', 'avulsa', 'manual'),
  ('b3021111-1111-4111-8111-111111111111', 'b3111111-1111-4111-8111-111111111111', date '2026-09-02', date '2026-09-02', '00000000-0000-4000-8000-000000000030', 'avulsa', 'manual'),
  ('b3031111-1111-4111-8111-111111111111', 'b3111111-1111-4111-8111-111111111111', date '2026-09-03', date '2026-09-03', '00000000-0000-4000-8000-000000000030', 'avulsa', 'manual');

insert into public.itens_manutencao (id, manutencao_id, equipamento_matriz_id, nome_identificacao) values
  ('b3011111-1111-4111-8111-111111111171', 'b3011111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000040', 'Equipamento'),
  ('b3021111-1111-4111-8111-111111111171', 'b3021111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000040', 'Equipamento'),
  ('b3031111-1111-4111-8111-111111111171', 'b3031111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000040', 'Equipamento');

select public._teste_recusa(
  $$select public.registrar_confirmacao_manual('00000000-0000-4000-8000-000000000001', 'b3011111-1111-4111-8111-111111111111', 'Recebeu por telefone.')$$,
  'O comprovante ainda não foi liberado'
);

select public._teste_recusa(
  $$select public.registrar_confirmacao_manual('00000000-0000-4000-8000-000000000002', 'b3011111-1111-4111-8111-111111111111', 'Recebeu por telefone.')$$,
  'Somente o ADM registra a confirmação manual'
);

select public.ativar_acompanhamento_comprovantes(
  '00000000-0000-4000-8000-000000000001',
  'iniciar acompanhamento'
);

select public._liberar_manual('b3011111-1111-4111-8111-111111111111', 'b3011111-1111-4111-8111-111111111171');
select public._liberar_manual('b3021111-1111-4111-8111-111111111111', 'b3021111-1111-4111-8111-111111111171');
select public._liberar_manual('b3031111-1111-4111-8111-111111111111', 'b3031111-1111-4111-8111-111111111171');

select public._teste_recusa(
  $$select public.registrar_confirmacao_manual('00000000-0000-4000-8000-000000000001', 'b3011111-1111-4111-8111-111111111111', '   ')$$,
  'Informe a justificativa da confirmação'
);

select public._teste_recusa(
  $$select public.registrar_confirmacao_manual('00000000-0000-4000-8000-000000000001', 'b3011111-1111-4111-8111-111111111111', repeat('a', 401))$$,
  'A justificativa da confirmação precisa caber em 400 caracteres'
);

select public._enviar_manual('b3011111-1111-4111-8111-111111111111', repeat('M', 43));

select set_config(
  'test.envio_manual',
  (
    select item->>'primeiro_envio_em'
    from jsonb_array_elements(public.fatos_acompanhamento_comprovantes('00000000-0000-4000-8000-000000000001')->'itens') item
    where item->>'manutencao_id' = 'b3011111-1111-4111-8111-111111111111'
  ),
  true
);

select public.registrar_confirmacao_manual(
  '00000000-0000-4000-8000-000000000001',
  'b3011111-1111-4111-8111-111111111111',
  'O síndico informou o recebimento por telefone e não conseguiu abrir o link.'
);

select public._exige(
  (select count(*) = 1
    from public.confirmacoes_manuais
    where manutencao_id = 'b3011111-1111-4111-8111-111111111111'
      and responsavel_nome = 'Ana ADM'
      and destinatario_nome = 'Síndico Manual'
      and classe = 'registro')
  and public.confirmacao_destinatario_valida('b3011111-1111-4111-8111-111111111111') is not null
  and (public.resumo_confirmacao_comprovante('00000000-0000-4000-8000-000000000001', 'b3011111-1111-4111-8111-111111111111')->>'origem_vigente') = 'manual'
  and (public.resumo_confirmacao_comprovante('00000000-0000-4000-8000-000000000001', 'b3011111-1111-4111-8111-111111111111')->>'pode_registrar') = 'false'
  and (
    select item->>'confirmado_em' is not null
      and item->>'primeiro_envio_em' = current_setting('test.envio_manual')
    from jsonb_array_elements(public.fatos_acompanhamento_comprovantes('00000000-0000-4000-8000-000000000001')->'itens') item
    where item->>'manutencao_id' = 'b3011111-1111-4111-8111-111111111111'
  ),
  'confirmacao manual valida entra nos confirmados e preserva o primeiro envio'
);

select public._teste_recusa(
  $$select public.registrar_confirmacao_manual('00000000-0000-4000-8000-000000000001', 'b3011111-1111-4111-8111-111111111111', 'Outra tentativa.')$$,
  'Esta manutenção já tem confirmação'
);

select public._teste_recusa(
  $$select public.registrar_confirmacao_sindico(repeat('M', 43))$$,
  'Esta manutenção já tem confirmação'
);

select public._teste_recusa(
  $$select public.registrar_comunicacao_comprovante('b3011111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000001', 'confirmar', null)$$,
  'Esta manutenção já tem confirmação'
);

select public._exige(
  (public.situacao_envio_whatsapp('b3011111-1111-4111-8111-111111111111')->>'erro') = 'confirmada'
  and (select count(*) = 1 from public.comunicacoes_comprovante where manutencao_id = 'b3011111-1111-4111-8111-111111111111'),
  'whatsapp novo fica bloqueado no servidor depois da confirmacao manual'
);

select public.corrigir_confirmacao_manual(
  '00000000-0000-4000-8000-000000000001',
  'b3011111-1111-4111-8111-111111111111',
  (select id from public.confirmacoes_manuais where manutencao_id = 'b3011111-1111-4111-8111-111111111111' and classe = 'registro'),
  'O telefonema foi registrado na manutenção errada.'
);

select public._exige(
  (select count(*) = 1 from public.confirmacoes_manuais where manutencao_id = 'b3011111-1111-4111-8111-111111111111' and classe = 'registro' and justificativa = 'O síndico informou o recebimento por telefone e não conseguiu abrir o link.')
  and (select count(*) = 1 from public.confirmacoes_manuais where manutencao_id = 'b3011111-1111-4111-8111-111111111111' and classe = 'correcao' and responsavel_nome = 'Ana ADM')
  and public.confirmacao_manual_vigente('b3011111-1111-4111-8111-111111111111') is null
  and public.confirmacao_destinatario_valida('b3011111-1111-4111-8111-111111111111') is null
  and (
    select item->>'confirmado_em' is null
      and item->>'primeiro_envio_em' = current_setting('test.envio_manual')
    from jsonb_array_elements(public.fatos_acompanhamento_comprovantes('00000000-0000-4000-8000-000000000001')->'itens') item
    where item->>'manutencao_id' = 'b3011111-1111-4111-8111-111111111111'
  ),
  'a correcao preserva o registro, o envio e tira a manutencao dos confirmados'
);

select public.registrar_confirmacao_sindico(repeat('M', 43));

select public._exige(
  (select count(*) = 1 from public.confirmacoes_sindico where manutencao_id = 'b3011111-1111-4111-8111-111111111111' and meio = 'link')
  and (public.resumo_confirmacao_comprovante('00000000-0000-4000-8000-000000000001', 'b3011111-1111-4111-8111-111111111111')->>'origem_vigente') = 'link',
  'depois da correcao o link ainda pode confirmar'
);

select public._teste_recusa(
  $$select public.corrigir_confirmacao_manual('00000000-0000-4000-8000-000000000001', 'b3011111-1111-4111-8111-111111111111', (select id from public.confirmacoes_sindico where manutencao_id = 'b3011111-1111-4111-8111-111111111111'), 'Tentativa indevida.')$$,
  'A confirmação pelo link não pode ser corrigida por aqui'
);

select public._enviar_manual('b3021111-1111-4111-8111-111111111111', repeat('L', 43));
select public.registrar_confirmacao_sindico(repeat('L', 43));

select public._teste_recusa(
  $$select public.registrar_confirmacao_manual('00000000-0000-4000-8000-000000000001', 'b3021111-1111-4111-8111-111111111111', 'Não deve gravar por cima do link.')$$,
  'Esta manutenção já tem confirmação'
);

select set_config('test.hash_link', (select token_hash from public.confirmacoes_sindico where manutencao_id = 'b3021111-1111-4111-8111-111111111111'), true);

select public._exige(
  (select pdf_url = lower(id::text) || '/comprovante.pdf' from public.manutencoes where id = 'b3021111-1111-4111-8111-111111111111')
  and (select token_hash = current_setting('test.hash_link') and meio = 'link' from public.confirmacoes_sindico where manutencao_id = 'b3021111-1111-4111-8111-111111111111'),
  'a confirmacao pelo link e o comprovante de execucao permanecem'
);

select public.garantir_documento_confirmacao(
  '00000000-0000-4000-8000-000000000001',
  'b3021111-1111-4111-8111-111111111111',
  'link',
  null
);

select public.garantir_documento_confirmacao(
  '00000000-0000-4000-8000-000000000001',
  'b3021111-1111-4111-8111-111111111111',
  'link',
  null
);

select public._exige(
  (select count(*) = 1
    from public.documentos_confirmacao
    where manutencao_id = 'b3021111-1111-4111-8111-111111111111'
      and codigo ~ '^CM-[0-9]{4}-[0-9]{6}$'
      and caminho = lower(manutencao_id::text) || '/confirmacoes/' || codigo || '.pdf'
      and position('comprovante.pdf' in caminho) = 0)
  and (public.ler_documento_confirmacao('00000000-0000-4000-8000-000000000001', 'b3021111-1111-4111-8111-111111111111', (select codigo from public.documentos_confirmacao where manutencao_id = 'b3021111-1111-4111-8111-111111111111'))->>'origem') = 'link',
  'o pdf do link ja existente nasce uma vez e nao reescreve o comprovante'
);

select public._teste_recusa(
  $$update public.documentos_confirmacao set codigo = 'CM-2026-999999' where manutencao_id = 'b3021111-1111-4111-8111-111111111111'$$,
  'O documento de confirmação não pode ser alterado'
);

select public.registrar_confirmacao_manual(
  '00000000-0000-4000-8000-000000000001',
  'b3031111-1111-4111-8111-111111111111',
  'Sem envio previo, o sindico confirmou por telefone.'
);

select public.corrigir_confirmacao_manual(
  '00000000-0000-4000-8000-000000000001',
  'b3031111-1111-4111-8111-111111111111',
  (select id from public.confirmacoes_manuais where manutencao_id = 'b3031111-1111-4111-8111-111111111111' and classe = 'registro'),
  'A justificativa original estava incompleta.'
);

select public.garantir_documento_confirmacao(
  '00000000-0000-4000-8000-000000000001',
  'b3031111-1111-4111-8111-111111111111',
  'registro',
  (select id from public.confirmacoes_manuais where manutencao_id = 'b3031111-1111-4111-8111-111111111111' and classe = 'registro')
);

select public._exige(
  (
    select item->>'confirmado_em' is null and item->>'primeiro_envio_em' is null
    from jsonb_array_elements(public.fatos_acompanhamento_comprovantes('00000000-0000-4000-8000-000000000001')->'itens') item
    where item->>'manutencao_id' = 'b3031111-1111-4111-8111-111111111111'
  )
  and (
    select count(*) = 2
      and bool_or(classe = 'confirmacao' and codigo !~ '-D$')
      and bool_or(classe = 'declaracao' and codigo ~ '-D$' and caminho = lower(manutencao_id::text) || '/confirmacoes/' || codigo || '.pdf')
    from public.documentos_confirmacao
    where manutencao_id = 'b3031111-1111-4111-8111-111111111111'
  )
  and (
    select declaracao.codigo = origem.codigo || '-D'
    from public.documentos_confirmacao declaracao
    join public.documentos_confirmacao origem on origem.id = declaracao.documento_origem_id
    where declaracao.manutencao_id = 'b3031111-1111-4111-8111-111111111111'
      and declaracao.classe = 'declaracao'
  ),
  'sem envio a correcao volta para aguardando envio e a declaracao fica ligada ao codigo original'
);

select public._teste_recusa(
  $$update public.confirmacoes_manuais set justificativa = 'apagada' where manutencao_id = 'b3031111-1111-4111-8111-111111111111'$$,
  'A confirmação manual não pode ser alterada'
);

select public.registrar_confirmacao_manual(
  '00000000-0000-4000-8000-000000000001',
  'b3031111-1111-4111-8111-111111111111',
  'Novo registro depois da correcao.'
);

select public._exige(
  (select count(*) = 2 from public.confirmacoes_manuais where manutencao_id = 'b3031111-1111-4111-8111-111111111111' and classe = 'registro')
  and public.confirmacao_manual_vigente('b3031111-1111-4111-8111-111111111111') is not null
  and (select pdf_url = lower(id::text) || '/comprovante.pdf' from public.manutencoes where id = 'b3031111-1111-4111-8111-111111111111'),
  'uma nova confirmacao manual pode ser registrada depois da correcao'
);

rollback;
