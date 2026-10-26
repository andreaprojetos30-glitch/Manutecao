-- ELEVA Manutenção — Fase 6, envio do comprovante pelo WhatsApp.
-- O link continua guardando só o hash. O token cifrado fica em outra tabela.
-- Abrir o WhatsApp não grava envio. O histórico não se apaga nem se reescreve.
-- Esta migration não altera manutenções nem confirmações.

create table public.links_confirmacao_cifrado (
  link_id uuid primary key references public.links_confirmacao_sindico (id) on delete restrict,
  token_hash text not null,
  cifrado text not null,
  criado_em timestamptz not null default clock_timestamp(),
  constraint links_confirmacao_cifrado_hash_check check (token_hash ~ '^sha256[$][A-Za-z0-9_-]{43}$'),
  constraint links_confirmacao_cifrado_bloco_check check (cifrado ~ '^v1[.][A-Za-z0-9_-]{60,200}$'),
  constraint links_confirmacao_cifrado_sem_url_check check (position('://' in cifrado) = 0)
);

comment on table public.links_confirmacao_cifrado is
  'Bloco AES-256-GCM do token, recuperável só pelo servidor. O token original não fica aqui.';

create table public.comunicacoes_comprovante (
  id uuid primary key default gen_random_uuid(),
  manutencao_id uuid not null references public.manutencoes (id) on delete restrict,
  link_id uuid not null references public.links_confirmacao_sindico (id) on delete restrict,
  tipo text not null default 'whatsapp',
  classe text not null,
  referencia_id uuid references public.comunicacoes_comprovante (id) on delete restrict,
  registrado_em timestamptz not null default clock_timestamp(),
  registrado_por uuid not null references public.usuarios (id) on delete restrict,
  destinatario_nome text not null,
  destinatario_papel text not null,
  whatsapp text not null,
  constraint comunicacoes_comprovante_tipo_check check (tipo = 'whatsapp'),
  constraint comunicacoes_comprovante_classe_check check (classe in ('envio', 'lembrete', 'correcao')),
  constraint comunicacoes_comprovante_referencia_check check (
    (classe = 'correcao' and referencia_id is not null)
    or (classe in ('envio', 'lembrete') and referencia_id is null)
  ),
  constraint comunicacoes_comprovante_nome_check check (length(trim(destinatario_nome)) > 0),
  constraint comunicacoes_comprovante_papel_check check (
    destinatario_papel in ('sindico', 'gerente', 'conselheiro', 'administradora', 'outro')
  ),
  constraint comunicacoes_comprovante_whatsapp_check check (whatsapp ~ '^[0-9]{12,13}$')
);

create unique index comunicacoes_comprovante_uma_correcao
  on public.comunicacoes_comprovante (referencia_id)
  where classe = 'correcao';

create index comunicacoes_comprovante_manutencao_idx
  on public.comunicacoes_comprovante (manutencao_id, registrado_em);

comment on table public.comunicacoes_comprovante is
  'Histórico de envios, lembretes e correções do WhatsApp. A correção não apaga o registro anterior.';

create or replace function public.telefone_whatsapp(p_valor text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when regexp_replace(coalesce(p_valor, ''), '\D', '', 'g') ~ '^55[0-9]{10,11}$'
      then regexp_replace(p_valor, '\D', '', 'g')
    when regexp_replace(coalesce(p_valor, ''), '\D', '', 'g') ~ '^[0-9]{10,11}$'
      then '55' || regexp_replace(p_valor, '\D', '', 'g')
    else null
  end;
$$;

create or replace function public.impedir_alteracao_cifrado_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if not exists (
      select 1
      from public.links_confirmacao_sindico link
      where link.id = new.link_id
        and link.token_hash = new.token_hash
    ) then
      raise exception 'O bloco cifrado não corresponde ao link';
    end if;
    return new;
  end if;
  raise exception 'O bloco cifrado não pode ser alterado';
end;
$$;

create trigger links_confirmacao_cifrado_imutavel
  before insert or update or delete on public.links_confirmacao_cifrado
  for each row execute function public.impedir_alteracao_cifrado_link();

create or replace function public.impedir_alteracao_comunicacao_comprovante()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'O histórico de envio não pode ser alterado';
  end if;

  if new.classe = 'correcao' then
    if not exists (
      select 1
      from public.comunicacoes_comprovante origem
      where origem.id = new.referencia_id
        and origem.manutencao_id = new.manutencao_id
        and origem.link_id = new.link_id
        and origem.classe in ('envio', 'lembrete')
    ) then
      raise exception 'Não há envio para corrigir';
    end if;
    return new;
  end if;

  if new.classe = 'envio' and exists (
    select 1
    from public.comunicacoes_comprovante envio
    where envio.link_id = new.link_id
      and envio.classe = 'envio'
      and not exists (
        select 1
        from public.comunicacoes_comprovante correcao
        where correcao.referencia_id = envio.id
          and correcao.classe = 'correcao'
      )
  ) then
    raise exception 'Este link já tem um envio registrado';
  end if;

  if new.classe = 'lembrete' and not exists (
    select 1
    from public.comunicacoes_comprovante envio
    where envio.link_id = new.link_id
      and envio.classe = 'envio'
      and not exists (
        select 1
        from public.comunicacoes_comprovante correcao
        where correcao.referencia_id = envio.id
          and correcao.classe = 'correcao'
      )
  ) then
    raise exception 'O lembrete exige um envio registrado';
  end if;

  return new;
end;
$$;

create trigger comunicacoes_comprovante_imutavel
  before insert or update or delete on public.comunicacoes_comprovante
  for each row execute function public.impedir_alteracao_comunicacao_comprovante();

create or replace function public.situacao_envio_whatsapp(p_manutencao_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  visita public.manutencoes%rowtype;
  link public.links_confirmacao_sindico%rowtype;
  atual jsonb;
  bruto text;
  numero text;
  nome_condominio text;
begin
  select * into visita
  from public.manutencoes
  where id = p_manutencao_id;

  if not found
     or visita.status = 'cancelada'
     or visita.registro_anterior
     or visita.status not in ('realizada', 'aguardando_administracao')
     or not public.comprovante_privado_liberado(visita) then
    return jsonb_build_object('erro', 'sem_link');
  end if;

  if exists (
    select 1 from public.confirmacoes_sindico where manutencao_id = visita.id
  ) then
    return jsonb_build_object('erro', 'encerrado');
  end if;

  select * into link
  from public.links_confirmacao_sindico
  where manutencao_id = visita.id
    and revogado_em is null;

  if not found then
    return jsonb_build_object('erro', 'sem_link');
  end if;

  atual := public.resolver_destinatario_confirmacao(visita.condominio_id);
  if not public.vinculo_confirma_destinatario(
    link.destinatario_papel,
    link.destinatario_id,
    link.sindico_destinatario_id,
    atual
  ) then
    return jsonb_build_object('erro', 'destinatario');
  end if;

  if link.destinatario_papel = 'sindico' then
    select sindico.whatsapp into bruto
    from public.sindicos sindico
    where sindico.id = link.sindico_destinatario_id
      and sindico.condominio_id = visita.condominio_id
      and sindico.ativo;
  else
    select indicado.whatsapp into bruto
    from public.destinatarios_comprovante indicado
    where indicado.id = link.destinatario_id
      and indicado.condominio_id = visita.condominio_id
      and indicado.ativo;
  end if;

  numero := public.telefone_whatsapp(bruto);
  if numero is null then
    return jsonb_build_object('erro', 'sem_whatsapp');
  end if;

  if not exists (
    select 1
    from public.links_confirmacao_cifrado cifrado
    where cifrado.link_id = link.id
      and cifrado.token_hash = link.token_hash
  ) then
    return jsonb_build_object('erro', 'sem_cifrado');
  end if;

  select nome into nome_condominio
  from public.condominios
  where id = visita.condominio_id;

  if nullif(trim(coalesce(nome_condominio, '')), '') is null then
    return jsonb_build_object('erro', 'sem_link');
  end if;

  return jsonb_build_object(
    'link_id', link.id,
    'token_hash', link.token_hash,
    'condominio', trim(nome_condominio),
    'whatsapp', numero,
    'destinatario_nome', link.destinatario_nome,
    'destinatario_papel', link.destinatario_papel
  );
end;
$$;

create or replace function public.emitir_link_confirmacao_cifrado(
  p_manutencao_id uuid,
  p_token_hash text,
  p_cifrado text,
  p_emitido_por uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  visita public.manutencoes%rowtype;
  novo_id uuid;
  atual jsonb;
begin
  perform public.exigir_adm_do_link(p_emitido_por, 'Somente o ADM emite o link');

  if p_token_hash is null or p_token_hash !~ '^sha256[$][A-Za-z0-9_-]{43}$' then
    raise exception 'A confirmação guarda somente o hash do token';
  end if;
  if p_cifrado is null or p_cifrado !~ '^v1[.][A-Za-z0-9_-]{60,200}$' or position('://' in p_cifrado) > 0 then
    raise exception 'O bloco cifrado do link é inválido';
  end if;
  if position(p_token_hash in p_cifrado) > 0 then
    raise exception 'O bloco cifrado do link é inválido';
  end if;

  select * into visita
  from public.manutencoes
  where id = p_manutencao_id
  for update;

  if not found then
    raise exception 'Manutenção não encontrada';
  end if;
  if visita.status = 'cancelada' then
    raise exception 'Manutenção cancelada não recebe link';
  end if;
  if visita.registro_anterior then
    raise exception 'Registro anterior não recebe link';
  end if;
  if visita.status not in ('realizada', 'aguardando_administracao')
     or not public.comprovante_privado_liberado(visita) then
    raise exception 'O comprovante ainda não foi liberado';
  end if;
  if exists (
    select 1 from public.confirmacoes_sindico where manutencao_id = visita.id
  ) then
    raise exception 'Esta manutenção já tem confirmação';
  end if;

  atual := public.resolver_destinatario_confirmacao(visita.condominio_id);
  if atual is null then
    raise exception 'Não há responsável autorizado para receber o comprovante';
  end if;

  update public.links_confirmacao_sindico
    set revogado_em = clock_timestamp(),
        revogado_por = p_emitido_por
    where manutencao_id = visita.id
      and revogado_em is null;

  insert into public.links_confirmacao_sindico (
    manutencao_id,
    token_hash,
    emitido_por,
    destinatario_id,
    sindico_destinatario_id,
    destinatario_papel,
    destinatario_nome
  ) values (
    visita.id,
    p_token_hash,
    p_emitido_por,
    case when atual->>'papel' = 'sindico' then null else (atual->>'destinatario_id')::uuid end,
    case when atual->>'papel' = 'sindico' then (atual->>'sindico_id')::uuid else null end,
    atual->>'papel',
    atual->>'nome'
  )
  returning id into novo_id;

  insert into public.links_confirmacao_cifrado (link_id, token_hash, cifrado)
  values (novo_id, p_token_hash, p_cifrado);

  return novo_id;
exception
  when unique_violation then
    raise exception 'Este link já foi emitido';
end;
$$;

create or replace function public.ler_cifrado_para_envio(p_manutencao_id uuid, p_admin uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  situacao jsonb;
  bloco text;
begin
  perform public.exigir_adm_do_link(p_admin, 'Somente o ADM envia o comprovante');
  situacao := public.situacao_envio_whatsapp(p_manutencao_id);
  if situacao ? 'erro' then
    return jsonb_build_object('erro', situacao->>'erro');
  end if;

  select cifrado.cifrado into bloco
  from public.links_confirmacao_cifrado cifrado
  where cifrado.link_id = (situacao->>'link_id')::uuid
    and cifrado.token_hash = situacao->>'token_hash';

  if bloco is null then
    return jsonb_build_object('erro', 'sem_cifrado');
  end if;

  return jsonb_build_object(
    'cifrado', bloco,
    'token_hash', situacao->>'token_hash',
    'condominio', situacao->>'condominio',
    'whatsapp', situacao->>'whatsapp'
  );
end;
$$;

create or replace function public.resumo_envio_whatsapp(p_manutencao_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  situacao jsonb;
  historico jsonb;
begin
  if not exists (select 1 from public.manutencoes where id = p_manutencao_id) then
    return null;
  end if;

  situacao := public.situacao_envio_whatsapp(p_manutencao_id);
  select coalesce(jsonb_agg(item.linha order by item.registrado_em), '[]'::jsonb)
    into historico
  from (
    select jsonb_build_object(
      'id', comunicacao.id,
      'classe', comunicacao.classe,
      'registrado_em', comunicacao.registrado_em,
      'responsavel', usuario.nome,
      'correcao_em', (
        select correcao.registrado_em
        from public.comunicacoes_comprovante correcao
        where correcao.referencia_id = comunicacao.id
          and correcao.classe = 'correcao'
      )
    ) as linha,
    comunicacao.registrado_em
    from public.comunicacoes_comprovante comunicacao
    join public.usuarios usuario on usuario.id = comunicacao.registrado_por
    where comunicacao.manutencao_id = p_manutencao_id
  ) item;

  return jsonb_build_object(
    'pode_preparar', not (situacao ? 'erro'),
    'motivo', situacao->>'erro',
    'historico', historico
  );
end;
$$;

create or replace function public.registrar_comunicacao_comprovante(
  p_manutencao_id uuid,
  p_admin uuid,
  p_acao text,
  p_referencia uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  situacao jsonb;
  nova_classe text;
  novo_id uuid;
  origem public.comunicacoes_comprovante%rowtype;
begin
  perform public.exigir_adm_do_link(p_admin, 'Somente o ADM envia o comprovante');

  if p_acao = 'correcao' then
    select * into origem
    from public.comunicacoes_comprovante
    where id = p_referencia
      and manutencao_id = p_manutencao_id
      and classe in ('envio', 'lembrete');

    if not found then
      raise exception 'Não há envio para corrigir';
    end if;

    insert into public.comunicacoes_comprovante (
      manutencao_id, link_id, tipo, classe, referencia_id, registrado_por,
      destinatario_nome, destinatario_papel, whatsapp
    ) values (
      origem.manutencao_id, origem.link_id, 'whatsapp', 'correcao', origem.id, p_admin,
      origem.destinatario_nome, origem.destinatario_papel, origem.whatsapp
    )
    returning id into novo_id;

    return jsonb_build_object('id', novo_id, 'classe', 'correcao');
  end if;

  if p_acao is distinct from 'confirmar' then
    raise exception 'Não foi possível registrar o envio';
  end if;

  situacao := public.situacao_envio_whatsapp(p_manutencao_id);
  if situacao->>'erro' = 'encerrado' then
    raise exception 'O link desta manutenção já foi encerrado';
  end if;
  if situacao->>'erro' = 'destinatario' then
    raise exception 'Este link não pertence mais ao responsável autorizado';
  end if;
  if situacao->>'erro' = 'sem_whatsapp' then
    raise exception 'Informe o WhatsApp de quem recebe os comprovantes';
  end if;
  if situacao->>'erro' = 'sem_cifrado' then
    raise exception 'Este link foi emitido antes do envio por WhatsApp';
  end if;
  if situacao ? 'erro' then
    raise exception 'Não há link vigente para este comprovante';
  end if;

  if exists (
    select 1
    from public.comunicacoes_comprovante envio
    where envio.link_id = (situacao->>'link_id')::uuid
      and envio.classe = 'envio'
      and not exists (
        select 1
        from public.comunicacoes_comprovante correcao
        where correcao.referencia_id = envio.id
          and correcao.classe = 'correcao'
      )
  ) then
    nova_classe := 'lembrete';
  else
    nova_classe := 'envio';
  end if;

  insert into public.comunicacoes_comprovante (
    manutencao_id, link_id, tipo, classe, registrado_por,
    destinatario_nome, destinatario_papel, whatsapp
  ) values (
    p_manutencao_id,
    (situacao->>'link_id')::uuid,
    'whatsapp',
    nova_classe,
    p_admin,
    situacao->>'destinatario_nome',
    situacao->>'destinatario_papel',
    situacao->>'whatsapp'
  )
  returning id into novo_id;

  return jsonb_build_object('id', novo_id, 'classe', nova_classe);
exception
  when unique_violation then
    raise exception 'Este envio já foi corrigido';
end;
$$;

revoke all on function public.telefone_whatsapp(text) from public, anon, authenticated;
revoke all on function public.impedir_alteracao_cifrado_link() from public, anon, authenticated;
revoke all on function public.impedir_alteracao_comunicacao_comprovante() from public, anon, authenticated;
revoke all on function public.situacao_envio_whatsapp(uuid) from public, anon, authenticated;
revoke all on function public.emitir_link_confirmacao_cifrado(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.ler_cifrado_para_envio(uuid, uuid) from public, anon, authenticated;
revoke all on function public.resumo_envio_whatsapp(uuid) from public, anon, authenticated;
revoke all on function public.registrar_comunicacao_comprovante(uuid, uuid, text, uuid) from public, anon, authenticated;

alter table public.links_confirmacao_cifrado enable row level security;
alter table public.links_confirmacao_cifrado force row level security;
alter table public.comunicacoes_comprovante enable row level security;
alter table public.comunicacoes_comprovante force row level security;

revoke all on table public.links_confirmacao_cifrado from public, anon, authenticated;
revoke all on table public.comunicacoes_comprovante from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    revoke all on table public.links_confirmacao_cifrado from service_role;
    revoke all on table public.comunicacoes_comprovante from service_role;
    revoke all on function public.telefone_whatsapp(text) from service_role;
    revoke all on function public.situacao_envio_whatsapp(uuid) from service_role;
    revoke all on function public.impedir_alteracao_cifrado_link() from service_role;
    revoke all on function public.impedir_alteracao_comunicacao_comprovante() from service_role;
    revoke all on function public.emitir_link_confirmacao_cifrado(uuid, text, text, uuid) from service_role;
    revoke all on function public.ler_cifrado_para_envio(uuid, uuid) from service_role;
    revoke all on function public.resumo_envio_whatsapp(uuid) from service_role;
    revoke all on function public.registrar_comunicacao_comprovante(uuid, uuid, text, uuid) from service_role;
    grant execute on function public.emitir_link_confirmacao_cifrado(uuid, text, text, uuid) to service_role;
    grant execute on function public.ler_cifrado_para_envio(uuid, uuid) to service_role;
    grant execute on function public.resumo_envio_whatsapp(uuid) to service_role;
    grant execute on function public.registrar_comunicacao_comprovante(uuid, uuid, text, uuid) to service_role;
  end if;
end $$;
