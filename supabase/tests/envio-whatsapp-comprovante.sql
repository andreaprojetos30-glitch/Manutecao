-- Envio do comprovante pelo WhatsApp. Os dados deste arquivo são desfeitos no final.

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

select public._exige(length('whatsEnvioTokenabcdefghijklmnopqrstuvwxyzAB') = 43, 'token de envio tem 43');
select public._exige(length('whatsAntigoTokenabcdefghijklmnopqrstuvwxyzA') = 43, 'token antigo tem 43');

select public._exige(
  position('cifrado' in pg_get_functiondef('public.ler_link_confirmacao_sindico(text)'::regprocedure)) = 0
  and position('wa.me' in lower(pg_get_functiondef('public.ler_link_confirmacao_sindico(text)'::regprocedure))) = 0
  and position('whatsapp' in lower(pg_get_functiondef('public.resumo_link_confirmacao_sindico(uuid)'::regprocedure))) = 0
  and position('cifrado' in pg_get_functiondef('public.resumo_link_confirmacao_sindico(uuid)'::regprocedure)) = 0
  and to_regprocedure('public.emitir_link_confirmacao_sindico(uuid, text, uuid)') is not null
  and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'links_confirmacao_sindico'
      and column_name in ('token', 'cifrado', 'token_cifrado')
  ),
  'a regra 13 continua sem token, sem cifra e sem whatsapp'
);

select public._exige(
  not has_table_privilege('anon', 'public.links_confirmacao_cifrado', 'select')
  and not has_table_privilege('anon', 'public.links_confirmacao_cifrado', 'insert')
  and not has_table_privilege('authenticated', 'public.links_confirmacao_cifrado', 'select')
  and not has_table_privilege('authenticated', 'public.comunicacoes_comprovante', 'select')
  and not has_table_privilege('service_role', 'public.links_confirmacao_cifrado', 'select')
  and not has_table_privilege('service_role', 'public.comunicacoes_comprovante', 'select')
  and not has_function_privilege('anon', 'public.ler_cifrado_para_envio(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.ler_cifrado_para_envio(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.situacao_envio_whatsapp(uuid)', 'execute')
  and not has_function_privilege('service_role', 'public.situacao_envio_whatsapp(uuid)', 'execute')
  and has_function_privilege('service_role', 'public.ler_cifrado_para_envio(uuid, uuid)', 'execute')
  and has_function_privilege('service_role', 'public.registrar_comunicacao_comprovante(uuid, uuid, text, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.registrar_comunicacao_comprovante(uuid, uuid, text, uuid)', 'execute'),
  'o bloco cifrado e o historico nao sao publicos'
);

insert into public.condominios (id, nome, endereco, bairro, cidade, estado) values
  ('e1111111-1111-4111-8111-111111111111', 'Condomínio WhatsApp', 'Rua G', 'Centro', 'Campinas', 'SP'),
  ('e2111111-1111-4111-8111-111111111111', 'Condomínio Sem WhatsApp', 'Rua H', 'Centro', 'Campinas', 'SP');

insert into public.sindicos (id, condominio_id, nome, whatsapp, data_inicio, ativo) values
  ('e3111111-1111-4111-8111-111111111111', 'e1111111-1111-4111-8111-111111111111', 'Síndico WhatsApp', '(19) 98888-7777', date '2026-01-01', true),
  ('e4111111-1111-4111-8111-111111111111', 'e2111111-1111-4111-8111-111111111111', 'Síndico Sem Número', null, date '2026-01-01', true);

insert into public.manutencoes (
  id, condominio_id, data_programada_original, data_programada_atual, prestador_id, tipo, origem
) values
  ('e6111111-1111-4111-8111-111111111111', 'e1111111-1111-4111-8111-111111111111', date '2026-10-26', date '2026-10-26', '00000000-0000-4000-8000-000000000030', 'avulsa', 'manual'),
  ('e7111111-1111-4111-8111-111111111111', 'e1111111-1111-4111-8111-111111111111', date '2026-10-27', date '2026-10-27', '00000000-0000-4000-8000-000000000030', 'avulsa', 'manual'),
  ('e8111111-1111-4111-8111-111111111111', 'e2111111-1111-4111-8111-111111111111', date '2026-10-26', date '2026-10-26', '00000000-0000-4000-8000-000000000030', 'avulsa', 'manual');

insert into public.itens_manutencao (id, manutencao_id, equipamento_matriz_id, nome_identificacao) values
  ('e6111111-1111-4111-8111-111111111171', 'e6111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000040', 'Equipamento'),
  ('e7111111-1111-4111-8111-111111111171', 'e7111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000040', 'Equipamento'),
  ('e8111111-1111-4111-8111-111111111171', 'e8111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000040', 'Equipamento');

select public._liberar_teste('e6111111-1111-4111-8111-111111111111', 'e6111111-1111-4111-8111-111111111171');
select public._liberar_teste('e7111111-1111-4111-8111-111111111111', 'e7111111-1111-4111-8111-111111111171');
select public._liberar_teste('e8111111-1111-4111-8111-111111111111', 'e8111111-1111-4111-8111-111111111171');

select public.emitir_link_confirmacao_sindico(
  'e7111111-1111-4111-8111-111111111111',
  'whatsAntigoTokenabcdefghijklmnopqrstuvwxyzA',
  '00000000-0000-4000-8000-000000000001'
);

select public._exige(
  (public.resumo_envio_whatsapp('e7111111-1111-4111-8111-111111111111')->>'motivo') = 'sem_cifrado'
  and (public.resumo_envio_whatsapp('e7111111-1111-4111-8111-111111111111')->>'pode_preparar') = 'false'
  and (public.ler_cifrado_para_envio(
    'e7111111-1111-4111-8111-111111111111',
    '00000000-0000-4000-8000-000000000001'
  )->>'erro') = 'sem_cifrado',
  'link antigo nao recupera token'
);

select public.emitir_link_confirmacao_cifrado(
  'e6111111-1111-4111-8111-111111111111',
  public.hash_token_confirmacao('whatsEnvioTokenabcdefghijklmnopqrstuvwxyzAB'),
  'v1.' || repeat('A', 96),
  '00000000-0000-4000-8000-000000000001'
);

select public._exige(length('whatsSemNumeroTokenabcdefghijklmnopqrstuvwx') = 43, 'token sem numero tem 43');

select public.emitir_link_confirmacao_cifrado(
  'e8111111-1111-4111-8111-111111111111',
  public.hash_token_confirmacao('whatsSemNumeroTokenabcdefghijklmnopqrstuvwx'),
  'v1.' || repeat('B', 96),
  '00000000-0000-4000-8000-000000000001'
);

select public._exige(
  position('whatsEnvioTokenabcdefghijklmnopqrstuvwxyzAB' in (
    select token_hash from public.links_confirmacao_sindico
    where manutencao_id = 'e6111111-1111-4111-8111-111111111111' and revogado_em is null
  )) = 0
  and position('whatsEnvioTokenabcdefghijklmnopqrstuvwxyzAB' in (
    select cifrado.cifrado
    from public.links_confirmacao_cifrado cifrado
    join public.links_confirmacao_sindico link on link.id = cifrado.link_id
    where link.manutencao_id = 'e6111111-1111-4111-8111-111111111111'
  )) = 0
  and (
    select cifrado.token_hash = public.hash_token_confirmacao('whatsEnvioTokenabcdefghijklmnopqrstuvwxyzAB')
    from public.links_confirmacao_cifrado cifrado
    join public.links_confirmacao_sindico link on link.id = cifrado.link_id
    where link.manutencao_id = 'e6111111-1111-4111-8111-111111111111'
      and link.revogado_em is null
  ),
  'o banco guarda o hash e o bloco, nao o token'
);

select public._exige(
  (public.ler_cifrado_para_envio(
    'e6111111-1111-4111-8111-111111111111',
    '00000000-0000-4000-8000-000000000001'
  )->>'whatsapp') = '5519988887777'
  and (public.ler_cifrado_para_envio(
    'e6111111-1111-4111-8111-111111111111',
    '00000000-0000-4000-8000-000000000001'
  )->>'condominio') = 'Condomínio WhatsApp'
  and (public.ler_cifrado_para_envio(
    'e8111111-1111-4111-8111-111111111111',
    '00000000-0000-4000-8000-000000000001'
  )->>'erro') = 'sem_whatsapp'
  and (public.resumo_envio_whatsapp('e6111111-1111-4111-8111-111111111111')->>'pode_preparar') = 'true'
  and not (public.resumo_envio_whatsapp('e6111111-1111-4111-8111-111111111111') ? 'cifrado')
  and not (public.resumo_envio_whatsapp('e6111111-1111-4111-8111-111111111111') ? 'whatsapp')
  and not (public.resumo_envio_whatsapp('e6111111-1111-4111-8111-111111111111') ? 'token_hash'),
  'o preparo usa o whatsapp do sindico ativo e o resumo nao leva segredo'
);

select public.registrar_comunicacao_comprovante(
  'e6111111-1111-4111-8111-111111111111',
  '00000000-0000-4000-8000-000000000001',
  'confirmar',
  null
);

select public._exige(
  (public.registrar_comunicacao_comprovante(
    'e6111111-1111-4111-8111-111111111111',
    '00000000-0000-4000-8000-000000000001',
    'confirmar',
    null
  )->>'classe') = 'lembrete',
  'o segundo registro do mesmo link e um lembrete'
);

select public._exige(
  (
    select count(*) from public.comunicacoes_comprovante
    where manutencao_id = 'e6111111-1111-4111-8111-111111111111'
  ) = 2,
  'o lembrete nao apaga o envio anterior'
);

select public._exige(
  (
    select whatsapp from public.comunicacoes_comprovante
    where manutencao_id = 'e6111111-1111-4111-8111-111111111111' and classe = 'envio'
  ) = '5519988887777',
  'o envio guarda o whatsapp normalizado'
);

select public._exige(
  (
    select item->>'responsavel' = 'Ana ADM'
      and item->>'registrado_em' is not null
    from public.resumo_envio_whatsapp('e6111111-1111-4111-8111-111111111111') resumo
    cross join lateral jsonb_array_elements(resumo->'historico') item
    where item->>'classe' = 'envio'
  ),
  'o historico guarda responsavel e horario'
);

select public.registrar_comunicacao_comprovante(
  'e6111111-1111-4111-8111-111111111111',
  '00000000-0000-4000-8000-000000000001',
  'correcao',
  (
    select id from public.comunicacoes_comprovante
    where manutencao_id = 'e6111111-1111-4111-8111-111111111111' and classe = 'envio'
  )
);

select public._exige(
  (
    select count(*) from public.comunicacoes_comprovante
    where manutencao_id = 'e6111111-1111-4111-8111-111111111111' and classe = 'envio'
  ) = 1
  and (
    select count(*) from public.comunicacoes_comprovante
    where manutencao_id = 'e6111111-1111-4111-8111-111111111111' and classe = 'correcao'
  ) = 1
  and (
    select item->>'correcao_em' is not null
    from public.resumo_envio_whatsapp('e6111111-1111-4111-8111-111111111111') resumo
    cross join lateral jsonb_array_elements(resumo->'historico') item
    where item->>'classe' = 'envio'
  ),
  'a correcao preserva o envio anterior'
);

select public._exige(
  (public.registrar_comunicacao_comprovante(
    'e6111111-1111-4111-8111-111111111111',
    '00000000-0000-4000-8000-000000000001',
    'confirmar',
    null
  )->>'classe') = 'envio',
  'depois da correcao um novo envio pode ser registrado'
);

do $$
begin
  update public.comunicacoes_comprovante set whatsapp = '5500000000000';
  raise exception 'historico aceitou alteracao';
exception
  when others then
    if sqlerrm not like '%não pode ser alterado%' then
      raise;
    end if;
end $$;

do $$
begin
  delete from public.links_confirmacao_cifrado;
  raise exception 'cifrado aceitou exclusao';
exception
  when others then
    if sqlerrm not like '%não pode ser alterado%' then
      raise;
    end if;
end $$;

select public.registrar_confirmacao_sindico('whatsEnvioTokenabcdefghijklmnopqrstuvwxyzAB');

select public._exige(
  (public.ler_link_confirmacao_sindico('whatsEnvioTokenabcdefghijklmnopqrstuvwxyzAB')->>'situacao') = 'encerrada'
  and (public.ler_cifrado_para_envio(
    'e6111111-1111-4111-8111-111111111111',
    '00000000-0000-4000-8000-000000000001'
  )->>'erro') = 'encerrado',
  'link encerrado nao prepara novo envio'
);

select public.revogar_link_confirmacao_sindico(
  'e7111111-1111-4111-8111-111111111111',
  '00000000-0000-4000-8000-000000000001'
);

select public._exige(
  (public.ler_cifrado_para_envio(
    'e7111111-1111-4111-8111-111111111111',
    '00000000-0000-4000-8000-000000000001'
  )->>'erro') = 'sem_link',
  'link revogado nao e reutilizado'
);

insert into public.destinatarios_comprovante (
  id, condominio_id, papel, nome, whatsapp, data_inicio, ativo
) values (
  'e9111111-1111-4111-8111-111111111111',
  'e2111111-1111-4111-8111-111111111111',
  'gerente',
  'Gerente Posterior',
  '19977776666',
  date '2026-10-26',
  true
);

select public._exige(
  (public.ler_cifrado_para_envio(
    'e8111111-1111-4111-8111-111111111111',
    '00000000-0000-4000-8000-000000000001'
  )->>'erro') = 'destinatario'
  and (
    select revogado_em is null
    from public.links_confirmacao_sindico
    where manutencao_id = 'e8111111-1111-4111-8111-111111111111'
  ),
  'link do destinatario anterior nao e reenviado'
);

do $$
begin
  perform public.registrar_comunicacao_comprovante(
    'e8111111-1111-4111-8111-111111111111',
    '00000000-0000-4000-8000-000000000001',
    'confirmar',
    null
  );
  raise exception 'envio aceitou destinatario anterior';
exception
  when others then
    if sqlerrm not like '%responsável autorizado%' then
      raise;
    end if;
end $$;

rollback;
