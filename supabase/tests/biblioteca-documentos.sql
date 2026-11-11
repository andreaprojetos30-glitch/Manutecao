-- Bloco 3C, Etapa 1. A leitura não grava e o marco permanece desligado.
-- Os dados deste arquivo são desfeitos no final.

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

select public._exige(
  not has_function_privilege('anon', 'public.biblioteca_documentos_condominio(uuid, uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.biblioteca_documentos_condominio(uuid, uuid)', 'execute')
    and has_function_privilege('service_role', 'public.biblioteca_documentos_condominio(uuid, uuid)', 'execute')
    and position('insert ' in lower(pg_get_functiondef('public.biblioteca_documentos_condominio(uuid, uuid)'::regprocedure))) = 0
    and position('update ' in lower(pg_get_functiondef('public.biblioteca_documentos_condominio(uuid, uuid)'::regprocedure))) = 0
    and position('delete ' in lower(pg_get_functiondef('public.biblioteca_documentos_condominio(uuid, uuid)'::regprocedure))) = 0
    and position('marco_acompanhamento' in pg_get_functiondef('public.biblioteca_documentos_condominio(uuid, uuid)'::regprocedure)) = 0
    and (select ativado_em is null from public.marco_acompanhamento where chave = 'unico'),
  'a biblioteca e somente leitura e o acompanhamento continua desligado'
);

insert into public.condominios (id, nome, endereco, bairro, cidade, estado) values
  ('c3c00000-0000-4000-8000-000000000010', 'Condomínio Biblioteca', 'Rua B', 'Centro', 'Campinas', 'SP'),
  ('c3c00000-0000-4000-8000-000000000020', 'Condomínio Biblioteca Vizinho', 'Rua V', 'Centro', 'Campinas', 'SP');

insert into public.sindicos (id, condominio_id, nome, whatsapp, data_inicio, ativo) values
  ('c3c00000-0000-4000-8000-000000000051', 'c3c00000-0000-4000-8000-000000000010', 'Síndico Biblioteca', '(19) 97777-1313', date '2026-01-01', true),
  ('c3c00000-0000-4000-8000-000000000052', 'c3c00000-0000-4000-8000-000000000020', 'Síndico Vizinho', '(19) 97777-1414', date '2026-01-01', true);

insert into public.manutencoes (
  id, condominio_id, data_programada_original, data_programada_atual, prestador_id, tipo, origem
) values
  ('c3c00000-0000-4000-8000-0000000000a1', 'c3c00000-0000-4000-8000-000000000010', date '2026-09-01', date '2026-09-01', '00000000-0000-4000-8000-000000000030', 'avulsa', 'manual'),
  ('c3c00000-0000-4000-8000-0000000000a2', 'c3c00000-0000-4000-8000-000000000010', date '2026-12-01', date '2026-12-01', '00000000-0000-4000-8000-000000000030', 'avulsa', 'manual'),
  ('c3c00000-0000-4000-8000-0000000000a3', 'c3c00000-0000-4000-8000-000000000020', date '2026-09-02', date '2026-09-02', '00000000-0000-4000-8000-000000000030', 'avulsa', 'manual');

insert into public.itens_manutencao (id, manutencao_id, equipamento_matriz_id, nome_identificacao) values
  ('c3c00000-0000-4000-8000-000000000071', 'c3c00000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000040', 'Equipamento'),
  ('c3c00000-0000-4000-8000-000000000073', 'c3c00000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-000000000040', 'Equipamento');

select public.registrar_ok('c3c00000-0000-4000-8000-000000000071');
select public.finalizar_manutencao('c3c00000-0000-4000-8000-0000000000a1');
select public.registrar_comprovante('c3c00000-0000-4000-8000-0000000000a1', 'c3c00000-0000-4000-8000-0000000000a1/comprovante.pdf', false);
select public.registrar_ok('c3c00000-0000-4000-8000-000000000073');
select public.finalizar_manutencao('c3c00000-0000-4000-8000-0000000000a3');
select public.registrar_comprovante('c3c00000-0000-4000-8000-0000000000a3', 'c3c00000-0000-4000-8000-0000000000a3/comprovante.pdf', false);

select public.registrar_confirmacao_manual(
  '00000000-0000-4000-8000-000000000001',
  'c3c00000-0000-4000-8000-0000000000a1',
  'O síndico confirmou por telefone.'
);

select public.garantir_documento_confirmacao(
  '00000000-0000-4000-8000-000000000001',
  'c3c00000-0000-4000-8000-0000000000a1',
  'registro',
  (select id from public.confirmacoes_manuais where manutencao_id = 'c3c00000-0000-4000-8000-0000000000a1' and classe = 'registro')
);

create temporary table _antes as
select
  (select count(*) from public.manutencoes) as manutencoes,
  (select count(*) from public.documentos_confirmacao) as documentos,
  (select count(*) from public.confirmacoes_manuais) as manuais,
  (select count(*) from public.confirmacoes_sindico) as links,
  (select count(*) from public.comunicacoes_comprovante) as envios,
  (select ativado_em is null from public.marco_acompanhamento where chave = 'unico') as marco_desligado;

select public.biblioteca_documentos_condominio(
  '00000000-0000-4000-8000-000000000001',
  'c3c00000-0000-4000-8000-000000000010'
);

select public.biblioteca_documentos_condominio(
  '00000000-0000-4000-8000-000000000001',
  'c3c00000-0000-4000-8000-000000000020'
);

select public._exige(
  (select count(*) from public.manutencoes) = (select manutencoes from _antes)
    and (select count(*) from public.documentos_confirmacao) = (select documentos from _antes)
    and (select count(*) from public.confirmacoes_manuais) = (select manuais from _antes)
    and (select count(*) from public.confirmacoes_sindico) = (select links from _antes)
    and (select count(*) from public.comunicacoes_comprovante) = (select envios from _antes)
    and (select ativado_em is null from public.marco_acompanhamento where chave = 'unico')
    and (select marco_desligado from _antes),
  'abrir a biblioteca nao grava e nao liga o acompanhamento'
);

select public._exige(
  (
    select
      (biblioteca->'visitas') @> jsonb_build_array(jsonb_build_object('id', 'c3c00000-0000-4000-8000-0000000000a1'))
      and (biblioteca->'visitas') @> jsonb_build_array(jsonb_build_object('id', 'c3c00000-0000-4000-8000-0000000000a2', 'data_efetiva', null))
      and not ((biblioteca->'documentos')::text like '%c3c00000-0000-4000-8000-0000000000a2%')
      and not ((biblioteca->'documentos')::text like '%c3c00000-0000-4000-8000-0000000000a3%')
      and (biblioteca->'documentos') @> jsonb_build_array(jsonb_build_object(
        'manutencao_id', 'c3c00000-0000-4000-8000-0000000000a1',
        'classe', 'comprovante',
        'caminho', 'c3c00000-0000-4000-8000-0000000000a1/comprovante.pdf'
      ))
      and exists (
        select 1
        from jsonb_array_elements(biblioteca->'documentos') item
        where item->>'classe' = 'confirmacao'
          and item->>'codigo' ~ '^CM-[0-9]{4}-[0-9]{6}$'
          and item->>'caminho' = 'c3c00000-0000-4000-8000-0000000000a1/confirmacoes/' || (item->>'codigo') || '.pdf'
      )
      and (
        select visita->>'data_efetiva' = (select data_realizada::text from public.manutencoes where id = 'c3c00000-0000-4000-8000-0000000000a1')
        from jsonb_array_elements(biblioteca->'visitas') visita
        where visita->>'id' = 'c3c00000-0000-4000-8000-0000000000a1'
      )
    from (
      select public.biblioteca_documentos_condominio(
        '00000000-0000-4000-8000-000000000001',
        'c3c00000-0000-4000-8000-000000000010'
      ) as biblioteca
    ) leitura
  ),
  'a biblioteca devolve os arquivos existentes pela data efetiva'
);

select public._teste_recusa(
  $$select public.biblioteca_documentos_condominio('00000000-0000-4000-8000-000000000002', 'c3c00000-0000-4000-8000-000000000010')$$,
  'Somente o ADM consulta os documentos do condomínio'
);

rollback;
