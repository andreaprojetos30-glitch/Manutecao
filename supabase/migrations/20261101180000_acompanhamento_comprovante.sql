-- ELEVA Manutenção — Fase 6, Bloco 3A, acompanhamento dos comprovantes.
-- O marco nasce vazio. Nenhum comprovante antigo entra sozinho.
-- Esta migration não altera manutenções, envios, lembretes, correções nem confirmações.

create table public.marco_acompanhamento (
  chave text primary key,
  ativado_em timestamptz,
  ativado_por uuid references public.usuarios (id),
  constraint marco_acompanhamento_chave_check check (chave = 'unico'),
  constraint marco_acompanhamento_par_check check (
    (ativado_em is null and ativado_por is null)
    or (ativado_em is not null and ativado_por is not null)
  )
);

insert into public.marco_acompanhamento (chave) values ('unico');

comment on table public.marco_acompanhamento is
  'Marco operacional do acompanhamento. Não é a data da migration. Nasce vazio e só o ADM o preenche, uma vez.';

create table public.acompanhamento_inclusoes (
  manutencao_id uuid primary key references public.manutencoes (id) on delete restrict,
  incluido_em timestamptz not null,
  incluido_por uuid not null references public.usuarios (id)
);

comment on table public.acompanhamento_inclusoes is
  'Inclusão explícita de um comprovante anterior ao marco. Não cria envio nem altera datas.';

create or replace function public.impedir_alteracao_marco_acompanhamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'O marco do acompanhamento não pode ser apagado';
  end if;

  if tg_op = 'INSERT' then
    if new.ativado_em is not null or new.ativado_por is not null then
      raise exception 'O acompanhamento ainda não foi iniciado';
    end if;
    return new;
  end if;

  if old.ativado_em is not null then
    raise exception 'O acompanhamento já foi iniciado';
  end if;

  if new.chave is distinct from old.chave or new.ativado_por is null then
    raise exception 'O marco do acompanhamento não pode ser alterado';
  end if;

  if not exists (
    select 1
    from public.usuarios
    where id = new.ativado_por
      and perfil = 'admin'
      and ativo
  ) then
    raise exception 'Somente o ADM acompanha os comprovantes';
  end if;

  new.ativado_em := clock_timestamp();
  return new;
end;
$$;

create trigger marco_acompanhamento_imutavel
  before insert or update or delete on public.marco_acompanhamento
  for each row execute function public.impedir_alteracao_marco_acompanhamento();

create or replace function public.impedir_alteracao_inclusao_acompanhamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  visita public.manutencoes%rowtype;
  marco public.marco_acompanhamento%rowtype;
begin
  if tg_op <> 'INSERT' then
    raise exception 'A inclusão no acompanhamento não pode ser alterada';
  end if;

  select * into marco from public.marco_acompanhamento where chave = 'unico';
  if marco.ativado_em is null then
    raise exception 'O acompanhamento ainda não foi iniciado';
  end if;

  select * into visita from public.manutencoes where id = new.manutencao_id;
  if not found or not public.comprovante_privado_liberado(visita) then
    raise exception 'O comprovante ainda não foi liberado';
  end if;

  if visita.comprovante_liberado_em >= marco.ativado_em then
    raise exception 'Este comprovante já entra no acompanhamento';
  end if;

  if not exists (
    select 1
    from public.usuarios
    where id = new.incluido_por
      and perfil = 'admin'
      and ativo
  ) then
    raise exception 'Somente o ADM acompanha os comprovantes';
  end if;

  new.incluido_em := clock_timestamp();
  return new;
end;
$$;

create trigger acompanhamento_inclusoes_imutavel
  before insert or update or delete on public.acompanhamento_inclusoes
  for each row execute function public.impedir_alteracao_inclusao_acompanhamento();

create or replace function public.confirmacao_destinatario_valida(p_manutencao_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select confirmacao.confirmado_em
  from public.confirmacoes_sindico confirmacao
  where confirmacao.manutencao_id = p_manutencao_id
    and confirmacao.meio = 'link'
  limit 1;
$$;

comment on function public.confirmacao_destinatario_valida(uuid) is
  'Confirmação válida do destinatário. O Bloco 3B pode acrescentar outro meio aqui, sem gravar confirmação manual nesta etapa.';

create or replace function public.alerta_whatsapp_acompanhamento(p_condominio_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  atual jsonb;
  bruto text;
begin
  atual := public.resolver_destinatario_confirmacao(p_condominio_id);
  if atual is null then
    return true;
  end if;

  if atual->>'origem' = 'sindico' then
    select sindico.whatsapp into bruto
    from public.sindicos sindico
    where sindico.id = (atual->>'sindico_id')::uuid;
  else
    select indicado.whatsapp into bruto
    from public.destinatarios_comprovante indicado
    where indicado.id = (atual->>'destinatario_id')::uuid;
  end if;

  return public.telefone_whatsapp(bruto) is null;
end;
$$;

create or replace function public.fato_acompanhamento_comprovante(p_visita public.manutencoes)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  marco public.marco_acompanhamento%rowtype;
  nome text;
  envio_em timestamptz;
  envio_link uuid;
  lembrete timestamptz;
begin
  select * into marco from public.marco_acompanhamento where chave = 'unico';
  if marco.ativado_em is null or not public.comprovante_privado_liberado(p_visita) then
    return null;
  end if;

  if p_visita.comprovante_liberado_em < marco.ativado_em
     and not exists (
       select 1
       from public.acompanhamento_inclusoes inclusao
       where inclusao.manutencao_id = p_visita.id
     ) then
    return null;
  end if;

  select trim(condominio.nome) into nome
  from public.condominios condominio
  where condominio.id = p_visita.condominio_id;

  if nullif(nome, '') is null then
    return null;
  end if;

  select comunicacao.registrado_em, comunicacao.link_id
    into envio_em, envio_link
  from public.comunicacoes_comprovante comunicacao
  join public.links_confirmacao_sindico link on link.id = comunicacao.link_id
  where comunicacao.manutencao_id = p_visita.id
    and comunicacao.classe = 'envio'
    and link.revogado_em is null
    and not exists (
      select 1
      from public.comunicacoes_comprovante correcao
      where correcao.referencia_id = comunicacao.id
        and correcao.classe = 'correcao'
    )
    and public.vinculo_confirma_destinatario(
      link.destinatario_papel,
      link.destinatario_id,
      link.sindico_destinatario_id,
      public.resolver_destinatario_confirmacao(p_visita.condominio_id)
    )
  order by comunicacao.registrado_em, comunicacao.id
  limit 1;

  if envio_link is not null then
    select max(comunicacao.registrado_em) into lembrete
    from public.comunicacoes_comprovante comunicacao
    where comunicacao.link_id = envio_link
      and comunicacao.classe = 'lembrete'
      and not exists (
        select 1
        from public.comunicacoes_comprovante correcao
        where correcao.referencia_id = comunicacao.id
          and correcao.classe = 'correcao'
      );
  end if;

  return jsonb_build_object(
    'manutencao_id', p_visita.id,
    'condominio_id', p_visita.condominio_id,
    'condominio_nome', nome,
    'data_manutencao', p_visita.data_realizada,
    'liberado_em', p_visita.comprovante_liberado_em,
    'confirmado_em', public.confirmacao_destinatario_valida(p_visita.id),
    'primeiro_envio_em', envio_em,
    'ultimo_lembrete_em', lembrete,
    'alerta_whatsapp', public.alerta_whatsapp_acompanhamento(p_visita.condominio_id)
  );
end;
$$;

create or replace function public.fatos_acompanhamento_comprovantes(p_admin uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  marco public.marco_acompanhamento%rowtype;
  itens jsonb;
begin
  perform public.exigir_adm_do_link(p_admin, 'Somente o ADM acompanha os comprovantes');
  select * into marco from public.marco_acompanhamento where chave = 'unico';
  if marco.ativado_em is null then
    return jsonb_build_object('ativado', false);
  end if;

  select coalesce(jsonb_agg(fato.linha order by fato.liberado_em), '[]'::jsonb)
    into itens
  from (
    select public.fato_acompanhamento_comprovante(visita) as linha,
           visita.comprovante_liberado_em as liberado_em
    from public.manutencoes visita
    where public.fato_acompanhamento_comprovante(visita) is not null
  ) fato;

  return jsonb_build_object('ativado', true, 'itens', itens);
end;
$$;

create or replace function public.ficha_acompanhamento_comprovante(p_admin uuid, p_manutencao_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  marco public.marco_acompanhamento%rowtype;
  visita public.manutencoes%rowtype;
  fato jsonb;
  pode_incluir boolean;
begin
  perform public.exigir_adm_do_link(p_admin, 'Somente o ADM acompanha os comprovantes');
  select * into marco from public.marco_acompanhamento where chave = 'unico';
  if marco.ativado_em is null then
    return jsonb_build_object('ativado', false);
  end if;

  select * into visita from public.manutencoes where id = p_manutencao_id;
  if not found or not public.comprovante_privado_liberado(visita) then
    return jsonb_build_object('ativado', true, 'incluida', false, 'pode_incluir', false);
  end if;

  fato := public.fato_acompanhamento_comprovante(visita);
  pode_incluir := visita.comprovante_liberado_em < marco.ativado_em
    and not exists (
      select 1
      from public.acompanhamento_inclusoes inclusao
      where inclusao.manutencao_id = visita.id
    );

  if fato is null then
    return jsonb_build_object('ativado', true, 'incluida', false, 'pode_incluir', pode_incluir);
  end if;

  return fato || jsonb_build_object('ativado', true, 'incluida', true, 'pode_incluir', false);
end;
$$;

create or replace function public.ativar_acompanhamento_comprovantes(p_admin uuid, p_confirmacao text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_adm_do_link(p_admin, 'Somente o ADM acompanha os comprovantes');
  if nullif(trim(coalesce(p_confirmacao, '')), '') is distinct from 'iniciar acompanhamento' then
    raise exception 'Confirme o início do acompanhamento';
  end if;

  update public.marco_acompanhamento
    set ativado_em = clock_timestamp(),
        ativado_por = p_admin
    where chave = 'unico'
      and ativado_em is null;

  if not found then
    raise exception 'O acompanhamento já foi iniciado';
  end if;
end;
$$;

create or replace function public.incluir_comprovante_no_acompanhamento(
  p_admin uuid,
  p_manutencao_id uuid,
  p_confirmacao text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  antes integer;
begin
  perform public.exigir_adm_do_link(p_admin, 'Somente o ADM acompanha os comprovantes');
  if nullif(trim(coalesce(p_confirmacao, '')), '') is distinct from 'incluir no acompanhamento' then
    raise exception 'Confirme a inclusão deste comprovante';
  end if;

  select count(*) into antes
  from public.comunicacoes_comprovante
  where manutencao_id = p_manutencao_id;

  insert into public.acompanhamento_inclusoes (manutencao_id, incluido_em, incluido_por)
  values (p_manutencao_id, clock_timestamp(), p_admin);

  if (
    select count(*)
    from public.comunicacoes_comprovante
    where manutencao_id = p_manutencao_id
  ) is distinct from antes then
    raise exception 'A inclusão não pode criar envio';
  end if;
end;
$$;

revoke all on function public.impedir_alteracao_marco_acompanhamento() from public, anon, authenticated;
revoke all on function public.impedir_alteracao_inclusao_acompanhamento() from public, anon, authenticated;
revoke all on function public.confirmacao_destinatario_valida(uuid) from public, anon, authenticated;
revoke all on function public.alerta_whatsapp_acompanhamento(uuid) from public, anon, authenticated;
revoke all on function public.fato_acompanhamento_comprovante(public.manutencoes) from public, anon, authenticated;
revoke all on function public.fatos_acompanhamento_comprovantes(uuid) from public, anon, authenticated;
revoke all on function public.ficha_acompanhamento_comprovante(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ativar_acompanhamento_comprovantes(uuid, text) from public, anon, authenticated;
revoke all on function public.incluir_comprovante_no_acompanhamento(uuid, uuid, text) from public, anon, authenticated;

alter table public.marco_acompanhamento enable row level security;
alter table public.marco_acompanhamento force row level security;
alter table public.acompanhamento_inclusoes enable row level security;
alter table public.acompanhamento_inclusoes force row level security;

revoke all on table public.marco_acompanhamento from public, anon, authenticated;
revoke all on table public.acompanhamento_inclusoes from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    revoke all on table public.marco_acompanhamento from service_role;
    revoke all on table public.acompanhamento_inclusoes from service_role;
    revoke all on function public.confirmacao_destinatario_valida(uuid) from service_role;
    revoke all on function public.alerta_whatsapp_acompanhamento(uuid) from service_role;
    revoke all on function public.fato_acompanhamento_comprovante(public.manutencoes) from service_role;
    revoke all on function public.fatos_acompanhamento_comprovantes(uuid) from service_role;
    revoke all on function public.ficha_acompanhamento_comprovante(uuid, uuid) from service_role;
    revoke all on function public.ativar_acompanhamento_comprovantes(uuid, text) from service_role;
    revoke all on function public.incluir_comprovante_no_acompanhamento(uuid, uuid, text) from service_role;
    grant execute on function public.fatos_acompanhamento_comprovantes(uuid) to service_role;
    grant execute on function public.ficha_acompanhamento_comprovante(uuid, uuid) to service_role;
    grant execute on function public.ativar_acompanhamento_comprovantes(uuid, text) to service_role;
    grant execute on function public.incluir_comprovante_no_acompanhamento(uuid, uuid, text) to service_role;
  end if;
end $$;
