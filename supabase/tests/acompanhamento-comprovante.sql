-- Acompanhamento dos comprovantes. Os dados deste arquivo são desfeitos no final.

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

create or replace function public._liberar_teste(p_visita uuid, p_item uuid)
returns void
language plpgsql
as $$
begin
  perform public.registrar_ok(p_item);
  if public.finalizar_manutencao(p_visita) is null then
    raise exception 'finalizacao de teste falhou';
  end if;
  perform public.registrar_comprovante(
    p_visita,
    lower(p_visita::text) || '/comprovante.pdf',
    false
  );
end;
$$;

create or replace function public._enviar_teste(p_visita uuid, p_token text)
returns void
language plpgsql
as $$
begin
  if length(p_token) <> 43 then
    raise exception 'token de acompanhamento tem tamanho inesperado';
  end if;
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
  not has_table_privilege('anon', 'public.marco_acompanhamento', 'select')
  and not has_table_privilege('authenticated', 'public.acompanhamento_inclusoes', 'select')
  and not has_table_privilege('service_role', 'public.marco_acompanhamento', 'select')
  and not has_function_privilege('anon', 'public.fatos_acompanhamento_comprovantes(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.ativar_acompanhamento_comprovantes(uuid, text)', 'execute')
  and has_function_privilege('service_role', 'public.fatos_acompanhamento_comprovantes(uuid)', 'execute')
  and has_function_privilege('service_role', 'public.incluir_comprovante_no_acompanhamento(uuid, uuid, text)', 'execute')
  and not has_function_privilege('service_role', 'public.alerta_whatsapp_acompanhamento(uuid)', 'execute')
  and position('token_hash' in pg_get_functiondef('public.fatos_acompanhamento_comprovantes(uuid)'::regprocedure)) = 0
  and position('token_hash' in pg_get_functiondef('public.ficha_acompanhamento_comprovante(uuid, uuid)'::regprocedure)) = 0,
  'o acompanhamento nao abre tabela nem token para o navegador'
);

select public._exige(
  (select ativado_em is null from public.marco_acompanhamento where chave = 'unico')
  and (public.fatos_acompanhamento_comprovantes('00000000-0000-4000-8000-000000000001')->>'ativado') = 'false'
  and not (public.fatos_acompanhamento_comprovantes('00000000-0000-4000-8000-000000000001') ? 'itens'),
  'sem ativacao o acompanhamento nao devolve indicadores'
);

do $$
begin
  perform public.fatos_acompanhamento_comprovantes('00000000-0000-4000-8000-000000000099');
  raise exception 'acompanhamento aceitou outro perfil';
exception
  when others then
    if sqlerrm not like '%Somente o ADM acompanha os comprovantes%' then
      raise;
    end if;
end $$;

insert into public.condominios (id, nome, endereco, bairro, cidade, estado) values
  ('a3111111-1111-4111-8111-111111111111', 'Condomínio Acompanhamento', 'Rua I', 'Centro', 'Campinas', 'SP'),
  ('a3211111-1111-4111-8111-111111111111', 'Condomínio Sem Número', 'Rua J', 'Centro', 'Campinas', 'SP'),
  ('a3311111-1111-4111-8111-111111111111', 'Condomínio Troca', 'Rua K', 'Centro', 'Campinas', 'SP'),
  ('a3411111-1111-4111-8111-111111111111', 'Condomínio Confirmado', 'Rua L', 'Centro', 'Campinas', 'SP');

insert into public.sindicos (id, condominio_id, nome, whatsapp, data_inicio, ativo) values
  ('a3511111-1111-4111-8111-111111111111', 'a3111111-1111-4111-8111-111111111111', 'Síndico Acompanhamento', '(19) 97777-6666', date '2026-01-01', true),
  ('a3611111-1111-4111-8111-111111111111', 'a3211111-1111-4111-8111-111111111111', 'Síndico Sem Número', '(19) 96666-5555', date '2026-01-01', true),
  ('a3711111-1111-4111-8111-111111111111', 'a3311111-1111-4111-8111-111111111111', 'Síndico Troca', '(19) 95555-4444', date '2026-01-01', true),
  ('a3811111-1111-4111-8111-111111111111', 'a3411111-1111-4111-8111-111111111111', 'Síndico Confirmado', '(19) 94444-3333', date '2026-01-01', true);

insert into public.manutencoes (
  id, condominio_id, data_programada_original, data_programada_atual, prestador_id, tipo, origem
) values
  ('a3011111-1111-4111-8111-111111111111', 'a3111111-1111-4111-8111-111111111111', date '2026-08-01', date '2026-08-01', '00000000-0000-4000-8000-000000000030', 'avulsa', 'manual'),
  ('a3021111-1111-4111-8111-111111111111', 'a3111111-1111-4111-8111-111111111111', date '2026-08-02', date '2026-08-02', '00000000-0000-4000-8000-000000000030', 'avulsa', 'manual'),
  ('a3031111-1111-4111-8111-111111111111', 'a3111111-1111-4111-8111-111111111111', date '2026-08-03', date '2026-08-03', '00000000-0000-4000-8000-000000000030', 'avulsa', 'manual'),
  ('a3041111-1111-4111-8111-111111111111', 'a3111111-1111-4111-8111-111111111111', date '2026-08-04', date '2026-08-04', '00000000-0000-4000-8000-000000000030', 'avulsa', 'manual'),
  ('a3051111-1111-4111-8111-111111111111', 'a3111111-1111-4111-8111-111111111111', date '2020-01-15', date '2020-01-15', '00000000-0000-4000-8000-000000000030', 'avulsa', 'manual'),
  ('a3061111-1111-4111-8111-111111111111', 'a3211111-1111-4111-8111-111111111111', date '2026-08-06', date '2026-08-06', '00000000-0000-4000-8000-000000000030', 'avulsa', 'manual'),
  ('a3071111-1111-4111-8111-111111111111', 'a3211111-1111-4111-8111-111111111111', date '2026-08-07', date '2026-08-07', '00000000-0000-4000-8000-000000000030', 'avulsa', 'manual'),
  ('a3081111-1111-4111-8111-111111111111', 'a3311111-1111-4111-8111-111111111111', date '2026-08-08', date '2026-08-08', '00000000-0000-4000-8000-000000000030', 'avulsa', 'manual'),
  ('a3091111-1111-4111-8111-111111111111', 'a3411111-1111-4111-8111-111111111111', date '2026-08-09', date '2026-08-09', '00000000-0000-4000-8000-000000000030', 'avulsa', 'manual');

insert into public.itens_manutencao (id, manutencao_id, equipamento_matriz_id, nome_identificacao) values
  ('a3011111-1111-4111-8111-111111111171', 'a3011111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000040', 'Equipamento'),
  ('a3031111-1111-4111-8111-111111111171', 'a3031111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000040', 'Equipamento'),
  ('a3041111-1111-4111-8111-111111111171', 'a3041111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000040', 'Equipamento'),
  ('a3051111-1111-4111-8111-111111111171', 'a3051111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000040', 'Equipamento'),
  ('a3061111-1111-4111-8111-111111111171', 'a3061111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000040', 'Equipamento'),
  ('a3071111-1111-4111-8111-111111111171', 'a3071111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000040', 'Equipamento'),
  ('a3081111-1111-4111-8111-111111111171', 'a3081111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000040', 'Equipamento'),
  ('a3091111-1111-4111-8111-111111111171', 'a3091111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000040', 'Equipamento');

select public._liberar_teste('a3011111-1111-4111-8111-111111111111', 'a3011111-1111-4111-8111-111111111171');

do $$
begin
  perform public.incluir_comprovante_no_acompanhamento(
    '00000000-0000-4000-8000-000000000001',
    'a3011111-1111-4111-8111-111111111111',
    'incluir no acompanhamento'
  );
  raise exception 'inclusao aceitou marco vazio';
exception
  when others then
    if sqlerrm not like '%ainda não foi iniciado%' then
      raise;
    end if;
end $$;

do $$
begin
  perform public.ativar_acompanhamento_comprovantes(
    '00000000-0000-4000-8000-000000000001',
    'sim'
  );
  raise exception 'ativacao aceitou sem confirmacao';
exception
  when others then
    if sqlerrm not like '%Confirme o início do acompanhamento%' then
      raise;
    end if;
end $$;

select public.ativar_acompanhamento_comprovantes(
  '00000000-0000-4000-8000-000000000001',
  'iniciar acompanhamento'
);

select public._exige(
  (select ativado_em is not null and ativado_por = '00000000-0000-4000-8000-000000000001' from public.marco_acompanhamento)
  and not exists (
    select 1
    from jsonb_array_elements(public.fatos_acompanhamento_comprovantes('00000000-0000-4000-8000-000000000001')->'itens') item
    where item->>'manutencao_id' = 'a3011111-1111-4111-8111-111111111111'
  ),
  'comprovante anterior ao marco nao entra sozinho'
);

do $$
begin
  perform public.ativar_acompanhamento_comprovantes(
    '00000000-0000-4000-8000-000000000001',
    'iniciar acompanhamento'
  );
  raise exception 'ativacao repetida foi aceita';
exception
  when others then
    if sqlerrm not like '%já foi iniciado%' then
      raise;
    end if;
end $$;

select set_config(
  'test.liberado_h',
  (select comprovante_liberado_em::text from public.manutencoes where id = 'a3011111-1111-4111-8111-111111111111'),
  true
);

select set_config(
  'test.data_h',
  (select data_realizada::text from public.manutencoes where id = 'a3011111-1111-4111-8111-111111111111'),
  true
);

select public.incluir_comprovante_no_acompanhamento(
  '00000000-0000-4000-8000-000000000001',
  'a3011111-1111-4111-8111-111111111111',
  'incluir no acompanhamento'
);

select public._exige(
  (
    select item->>'primeiro_envio_em' is null
      and item->>'confirmado_em' is null
    from jsonb_array_elements(public.fatos_acompanhamento_comprovantes('00000000-0000-4000-8000-000000000001')->'itens') item
    where item->>'manutencao_id' = 'a3011111-1111-4111-8111-111111111111'
  ),
  'a inclusao individual nao cria envio'
);

select public._exige(
  (
    select item->>'data_manutencao'
    from jsonb_array_elements(public.fatos_acompanhamento_comprovantes('00000000-0000-4000-8000-000000000001')->'itens') item
    where item->>'manutencao_id' = 'a3011111-1111-4111-8111-111111111111'
  ) = current_setting('test.data_h'),
  'a inclusao preserva a data da manutencao'
);

select public._exige(
  (
    select count(*) from public.comunicacoes_comprovante
    where manutencao_id = 'a3011111-1111-4111-8111-111111111111'
  ) = 0
  and (
    select comprovante_liberado_em::text
    from public.manutencoes
    where id = 'a3011111-1111-4111-8111-111111111111'
  ) = current_setting('test.liberado_h'),
  'a inclusao nao altera a liberacao'
);

select public._liberar_teste('a3031111-1111-4111-8111-111111111111', 'a3031111-1111-4111-8111-111111111171');
select public._liberar_teste('a3041111-1111-4111-8111-111111111111', 'a3041111-1111-4111-8111-111111111171');
select public._liberar_teste('a3051111-1111-4111-8111-111111111111', 'a3051111-1111-4111-8111-111111111171');
select public._liberar_teste('a3061111-1111-4111-8111-111111111111', 'a3061111-1111-4111-8111-111111111171');
select public._liberar_teste('a3081111-1111-4111-8111-111111111111', 'a3081111-1111-4111-8111-111111111171');
select public._liberar_teste('a3091111-1111-4111-8111-111111111111', 'a3091111-1111-4111-8111-111111111171');

select public._exige(
  not exists (
    select 1
    from jsonb_array_elements(public.fatos_acompanhamento_comprovantes('00000000-0000-4000-8000-000000000001')->'itens') item
    where item->>'manutencao_id' = 'a3021111-1111-4111-8111-111111111111'
  )
  and (
    select item->>'primeiro_envio_em' is null
    from jsonb_array_elements(public.fatos_acompanhamento_comprovantes('00000000-0000-4000-8000-000000000001')->'itens') item
    where item->>'manutencao_id' = 'a3031111-1111-4111-8111-111111111111'
  )
  and exists (
    select 1
    from jsonb_array_elements(public.fatos_acompanhamento_comprovantes('00000000-0000-4000-8000-000000000001')->'itens') item
    where item->>'manutencao_id' = 'a3051111-1111-4111-8111-111111111111'
  )
  and (
    select data_programada_atual = date '2020-01-15'
    from public.manutencoes
    where id = 'a3051111-1111-4111-8111-111111111111'
  ),
  'sem comprovante fica de fora, liberado sem envio entra, e o mes antigo continua'
);

select public._enviar_teste('a3031111-1111-4111-8111-111111111111', 'acompLemb0TokenabcdefghijklmnopqrstuvwxyzAB');

select public._exige(
  (
    select item->>'primeiro_envio_em' is not null
    from jsonb_array_elements(public.fatos_acompanhamento_comprovantes('00000000-0000-4000-8000-000000000001')->'itens') item
    where item->>'manutencao_id' = 'a3031111-1111-4111-8111-111111111111'
  ),
  'o envio confirmado pelo ADM inicia o prazo'
);

select public.registrar_comunicacao_comprovante(
  'a3031111-1111-4111-8111-111111111111',
  '00000000-0000-4000-8000-000000000001',
  'confirmar',
  null
);

select public._exige(
  (
    select (item->>'primeiro_envio_em')::timestamptz = (
        select min(registrado_em)
        from public.comunicacoes_comprovante
        where manutencao_id = 'a3031111-1111-4111-8111-111111111111'
          and classe = 'envio'
      )
      and item->>'ultimo_lembrete_em' is not null
    from jsonb_array_elements(public.fatos_acompanhamento_comprovantes('00000000-0000-4000-8000-000000000001')->'itens') item
    where item->>'manutencao_id' = 'a3031111-1111-4111-8111-111111111111'
  ),
  'o lembrete nao reinicia o primeiro envio'
);

select public.registrar_comunicacao_comprovante(
  'a3031111-1111-4111-8111-111111111111',
  '00000000-0000-4000-8000-000000000001',
  'correcao',
  (
    select id
    from public.comunicacoes_comprovante
    where manutencao_id = 'a3031111-1111-4111-8111-111111111111'
      and classe = 'lembrete'
  )
);

select public._exige(
  (
    select item->>'ultimo_lembrete_em' is null
      and item->>'primeiro_envio_em' is not null
    from jsonb_array_elements(public.fatos_acompanhamento_comprovantes('00000000-0000-4000-8000-000000000001')->'itens') item
    where item->>'manutencao_id' = 'a3031111-1111-4111-8111-111111111111'
  ),
  'corrigir o lembrete preserva o envio inicial'
);

select public._enviar_teste('a3041111-1111-4111-8111-111111111111', 'acompCorr0TokenabcdefghijklmnopqrstuvwxyzAB');

select public.registrar_comunicacao_comprovante(
  'a3041111-1111-4111-8111-111111111111',
  '00000000-0000-4000-8000-000000000001',
  'correcao',
  (
    select id
    from public.comunicacoes_comprovante
    where manutencao_id = 'a3041111-1111-4111-8111-111111111111'
      and classe = 'envio'
  )
);

select public._exige(
  (
    select item->>'primeiro_envio_em' is null
    from jsonb_array_elements(public.fatos_acompanhamento_comprovantes('00000000-0000-4000-8000-000000000001')->'itens') item
    where item->>'manutencao_id' = 'a3041111-1111-4111-8111-111111111111'
  ),
  'corrigir o envio inicial recalcula a situacao'
);

select public._enviar_teste('a3081111-1111-4111-8111-111111111111', 'acompDest0TokenabcdefghijklmnopqrstuvwxyzAB');

select public.definir_destinatario_comprovante(
  'a3311111-1111-4111-8111-111111111111',
  'gerente',
  'Gerente Troca',
  '(19) 93333-2222',
  null,
  null,
  date '2026-11-01'
);

select public._exige(
  (
    select item->>'primeiro_envio_em' is null
      and item->>'confirmado_em' is null
    from jsonb_array_elements(public.fatos_acompanhamento_comprovantes('00000000-0000-4000-8000-000000000001')->'itens') item
    where item->>'manutencao_id' = 'a3081111-1111-4111-8111-111111111111'
  )
  and (
    select revogado_em is not null
    from public.links_confirmacao_sindico
    where manutencao_id = 'a3081111-1111-4111-8111-111111111111'
  ),
  'link revogado deixa de sustentar o envio'
);

select public._enviar_teste('a3091111-1111-4111-8111-111111111111', 'acompConf0TokenabcdefghijklmnopqrstuvwxyzAB');
select public.registrar_confirmacao_sindico('acompConf0TokenabcdefghijklmnopqrstuvwxyzAB');

select public.definir_destinatario_comprovante(
  'a3411111-1111-4111-8111-111111111111',
  'gerente',
  'Gerente Confirmado',
  '(19) 92222-1111',
  null,
  null,
  date '2026-11-01'
);

select public._exige(
  (
    select item->>'confirmado_em' is not null
    from jsonb_array_elements(public.fatos_acompanhamento_comprovantes('00000000-0000-4000-8000-000000000001')->'itens') item
    where item->>'manutencao_id' = 'a3091111-1111-4111-8111-111111111111'
  )
  and (
    select revogado_em is null
    from public.links_confirmacao_sindico
    where manutencao_id = 'a3091111-1111-4111-8111-111111111111'
  ),
  'a confirmacao permanece depois da troca de destinatario'
);

select public._enviar_teste('a3061111-1111-4111-8111-111111111111', 'acompFone0TokenabcdefghijklmnopqrstuvwxyzAB');

update public.sindicos
  set whatsapp = '123'
  where id = 'a3611111-1111-4111-8111-111111111111';

select public._liberar_teste('a3071111-1111-4111-8111-111111111111', 'a3071111-1111-4111-8111-111111111171');

select public._exige(
  (
    select item->>'primeiro_envio_em' is not null
      and (item->>'alerta_whatsapp')::boolean
    from jsonb_array_elements(public.fatos_acompanhamento_comprovantes('00000000-0000-4000-8000-000000000001')->'itens') item
    where item->>'manutencao_id' = 'a3061111-1111-4111-8111-111111111111'
  )
  and (
    select item->>'primeiro_envio_em' is null
      and (item->>'alerta_whatsapp')::boolean
    from jsonb_array_elements(public.fatos_acompanhamento_comprovantes('00000000-0000-4000-8000-000000000001')->'itens') item
    where item->>'manutencao_id' = 'a3071111-1111-4111-8111-111111111111'
  )
  and position('5519977776666' in public.fatos_acompanhamento_comprovantes('00000000-0000-4000-8000-000000000001')::text) = 0
  and position('5519966665555' in public.fatos_acompanhamento_comprovantes('00000000-0000-4000-8000-000000000001')::text) = 0
  and position('token' in public.fatos_acompanhamento_comprovantes('00000000-0000-4000-8000-000000000001')::text) = 0,
  'telefone invalido gera alerta sem apagar o prazo e sem sair no resultado'
);

rollback;
