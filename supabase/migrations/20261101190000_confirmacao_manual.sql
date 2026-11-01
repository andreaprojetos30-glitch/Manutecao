-- ELEVA Manutenção — Fase 6, Bloco 3B.
-- Confirmação manual do ADM, correção auditada e documento em PDF.
-- A confirmação pelo link permanece imutável.
-- Esta migration não ativa o acompanhamento e não altera comprovantes já gravados.

create table public.confirmacoes_manuais (
  id uuid primary key default gen_random_uuid(),
  manutencao_id uuid not null references public.manutencoes (id) on delete restrict,
  classe text not null,
  referencia_id uuid references public.confirmacoes_manuais (id) on delete restrict,
  justificativa text not null,
  registrado_em timestamptz not null default clock_timestamp(),
  registrado_por uuid not null references public.usuarios (id) on delete restrict,
  responsavel_nome text not null,
  destinatario_papel text,
  destinatario_id uuid references public.destinatarios_comprovante (id) on delete restrict,
  sindico_id uuid references public.sindicos (id) on delete restrict,
  destinatario_nome text,
  constraint confirmacoes_manuais_classe_check check (classe in ('registro', 'correcao')),
  constraint confirmacoes_manuais_justificativa_check check (
    char_length(justificativa) between 1 and 400
    and justificativa = btrim(justificativa)
  ),
  constraint confirmacoes_manuais_responsavel_check check (
    char_length(responsavel_nome) > 0
    and responsavel_nome = btrim(responsavel_nome)
  ),
  constraint confirmacoes_manuais_forma_check check (
    (
      classe = 'registro'
      and referencia_id is null
      and (
        (
          destinatario_papel = 'sindico'
          and sindico_id is not null
          and destinatario_id is null
          and nullif(btrim(destinatario_nome), '') is not null
        )
        or (
          destinatario_papel in ('gerente', 'conselheiro', 'administradora', 'outro')
          and sindico_id is null
          and destinatario_id is not null
          and nullif(btrim(destinatario_nome), '') is not null
        )
      )
    )
    or (
      classe = 'correcao'
      and referencia_id is not null
      and destinatario_papel is null
      and destinatario_id is null
      and sindico_id is null
      and destinatario_nome is null
    )
  )
);

create unique index confirmacoes_manuais_uma_correcao
  on public.confirmacoes_manuais (referencia_id)
  where classe = 'correcao';

create index confirmacoes_manuais_manutencao_idx
  on public.confirmacoes_manuais (manutencao_id, registrado_em);

comment on table public.confirmacoes_manuais is
  'Registro manual do ADM e correção posterior. A correção não apaga o registro. A confirmação pelo link fica na outra tabela.';

create sequence public.documentos_confirmacao_seq as integer;

create table public.documentos_confirmacao (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  manutencao_id uuid not null references public.manutencoes (id) on delete restrict,
  classe text not null,
  confirmacao_link_id uuid references public.confirmacoes_sindico (id) on delete restrict,
  confirmacao_manual_id uuid references public.confirmacoes_manuais (id) on delete restrict,
  documento_origem_id uuid references public.documentos_confirmacao (id) on delete restrict,
  caminho text not null,
  emitido_em timestamptz not null default clock_timestamp(),
  emitido_por uuid not null references public.usuarios (id) on delete restrict,
  constraint documentos_confirmacao_codigo_unico unique (codigo),
  constraint documentos_confirmacao_caminho_unico unique (caminho),
  constraint documentos_confirmacao_classe_check check (classe in ('confirmacao', 'declaracao')),
  constraint documentos_confirmacao_codigo_check check (codigo ~ '^CM-[0-9]{4}-[0-9]{6}(-D)?$'),
  constraint documentos_confirmacao_caminho_check check (
    caminho = lower(manutencao_id::text) || '/confirmacoes/' || codigo || '.pdf'
    and position('comprovante.pdf' in caminho) = 0
    and position('://' in caminho) = 0
  ),
  constraint documentos_confirmacao_forma_check check (
    (
      classe = 'confirmacao'
      and codigo !~ '-D$'
      and documento_origem_id is null
      and (
        (confirmacao_link_id is not null and confirmacao_manual_id is null)
        or (confirmacao_link_id is null and confirmacao_manual_id is not null)
      )
    )
    or (
      classe = 'declaracao'
      and codigo ~ '-D$'
      and documento_origem_id is not null
      and confirmacao_link_id is null
      and confirmacao_manual_id is not null
    )
  )
);

create unique index documentos_confirmacao_link_unico
  on public.documentos_confirmacao (confirmacao_link_id)
  where confirmacao_link_id is not null;

create unique index documentos_confirmacao_manual_unico
  on public.documentos_confirmacao (confirmacao_manual_id)
  where confirmacao_manual_id is not null;

comment on table public.documentos_confirmacao is
  'PDF de confirmação e declaração de correção. O arquivo de execução continua em comprovante.pdf.';

create or replace function public.confirmacao_manual_vigente(p_manutencao_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select registro.registrado_em
  from public.confirmacoes_manuais registro
  where registro.manutencao_id = p_manutencao_id
    and registro.classe = 'registro'
    and not exists (
      select 1
      from public.confirmacoes_manuais correcao
      where correcao.referencia_id = registro.id
        and correcao.classe = 'correcao'
    )
  order by registro.registrado_em, registro.id
  limit 1;
$$;

create or replace function public.normalizar_justificativa_confirmacao(p_texto text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  texto text;
begin
  texto := btrim(coalesce(p_texto, ''));
  if texto = '' then
    raise exception 'Informe a justificativa da confirmação';
  end if;
  if char_length(texto) > 400 then
    raise exception 'A justificativa da confirmação precisa caber em 400 caracteres';
  end if;
  return texto;
end;
$$;

create or replace function public.validar_confirmacao_manual()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  visita public.manutencoes%rowtype;
  atual jsonb;
  nome text;
begin
  if tg_op <> 'INSERT' then
    raise exception 'A confirmação manual não pode ser alterada';
  end if;

  select usuarios.nome into nome
  from public.usuarios usuarios
  where usuarios.id = new.registrado_por
    and usuarios.perfil = 'admin'
    and usuarios.ativo;

  if nullif(btrim(coalesce(nome, '')), '') is null then
    raise exception 'Somente o ADM registra a confirmação manual';
  end if;

  select * into visita
  from public.manutencoes
  where id = new.manutencao_id;

  if not found then
    raise exception 'Manutenção não encontrada';
  end if;

  new.registrado_em := clock_timestamp();
  new.responsavel_nome := btrim(nome);
  new.justificativa := public.normalizar_justificativa_confirmacao(new.justificativa);

  if new.classe = 'correcao' then
    new.destinatario_papel := null;
    new.destinatario_id := null;
    new.sindico_id := null;
    new.destinatario_nome := null;
    if new.referencia_id is null or not exists (
      select 1
      from public.confirmacoes_manuais origem
      where origem.id = new.referencia_id
        and origem.manutencao_id = new.manutencao_id
        and origem.classe = 'registro'
    ) then
      raise exception 'Não há confirmação manual para corrigir';
    end if;
    if exists (
      select 1
      from public.confirmacoes_manuais correcao
      where correcao.referencia_id = new.referencia_id
        and correcao.classe = 'correcao'
    ) then
      raise exception 'Esta confirmação manual já foi corrigida';
    end if;
    return new;
  end if;

  if new.classe is distinct from 'registro' or new.referencia_id is not null then
    raise exception 'Não foi possível registrar a confirmação';
  end if;

  if visita.status = 'cancelada' then
    raise exception 'Manutenção cancelada não recebe confirmação';
  end if;
  if visita.registro_anterior then
    raise exception 'Registro anterior não recebe confirmação';
  end if;
  if visita.status not in ('realizada', 'aguardando_administracao')
     or not public.comprovante_privado_liberado(visita) then
    raise exception 'O comprovante ainda não foi liberado';
  end if;
  if exists (
    select 1 from public.confirmacoes_sindico where manutencao_id = visita.id
  ) or public.confirmacao_manual_vigente(visita.id) is not null then
    raise exception 'Esta manutenção já tem confirmação';
  end if;

  atual := public.resolver_destinatario_confirmacao(visita.condominio_id);
  if atual is null then
    raise exception 'Não há responsável autorizado para receber o comprovante';
  end if;

  new.destinatario_papel := atual->>'papel';
  new.destinatario_nome := atual->>'nome';
  if atual->>'papel' = 'sindico' then
    new.sindico_id := (atual->>'sindico_id')::uuid;
    new.destinatario_id := null;
  else
    new.sindico_id := null;
    new.destinatario_id := (atual->>'destinatario_id')::uuid;
  end if;
  return new;
end;
$$;

create trigger confirmacoes_manuais_imutavel
  before insert or update or delete on public.confirmacoes_manuais
  for each row execute function public.validar_confirmacao_manual();

create or replace function public.confirmacao_destinatario_valida(p_manutencao_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select confirmacao.confirmado_em
      from public.confirmacoes_sindico confirmacao
      where confirmacao.manutencao_id = p_manutencao_id
        and confirmacao.meio = 'link'
      limit 1
    ),
    public.confirmacao_manual_vigente(p_manutencao_id)
  );
$$;

comment on function public.confirmacao_destinatario_valida(uuid) is
  'Confirmação vigente: o link prevalece. O registro manual só vale enquanto não houver correção.';

create or replace function public.registrar_confirmacao_manual(
  p_admin uuid,
  p_manutencao_id uuid,
  p_justificativa text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  visita public.manutencoes%rowtype;
  just text;
  novo_id uuid;
begin
  perform public.exigir_adm_do_link(p_admin, 'Somente o ADM registra a confirmação manual');
  just := public.normalizar_justificativa_confirmacao(p_justificativa);

  select * into visita
  from public.manutencoes
  where id = p_manutencao_id
  for update;

  if not found then
    raise exception 'Manutenção não encontrada';
  end if;

  insert into public.confirmacoes_manuais (
    manutencao_id,
    classe,
    justificativa,
    registrado_por,
    responsavel_nome
  ) values (
    visita.id,
    'registro',
    just,
    p_admin,
    'ADM'
  )
  returning id into novo_id;

  return novo_id;
end;
$$;

create or replace function public.corrigir_confirmacao_manual(
  p_admin uuid,
  p_manutencao_id uuid,
  p_registro_id uuid,
  p_justificativa text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  visita public.manutencoes%rowtype;
  just text;
  novo_id uuid;
begin
  perform public.exigir_adm_do_link(p_admin, 'Somente o ADM registra a confirmação manual');
  just := public.normalizar_justificativa_confirmacao(p_justificativa);

  select * into visita
  from public.manutencoes
  where id = p_manutencao_id
  for update;

  if not found then
    raise exception 'Manutenção não encontrada';
  end if;

  if exists (
    select 1 from public.confirmacoes_sindico where id = p_registro_id
  ) then
    raise exception 'A confirmação pelo link não pode ser corrigida por aqui';
  end if;

  insert into public.confirmacoes_manuais (
    manutencao_id,
    classe,
    referencia_id,
    justificativa,
    registrado_por,
    responsavel_nome
  ) values (
    visita.id,
    'correcao',
    p_registro_id,
    just,
    p_admin,
    'ADM'
  )
  returning id into novo_id;

  return novo_id;
end;
$$;

create or replace function public.resumo_confirmacao_comprovante(p_admin uuid, p_manutencao_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  visita public.manutencoes%rowtype;
  link public.confirmacoes_sindico%rowtype;
  manual public.confirmacoes_manuais%rowtype;
  historico jsonb;
  codigo_link text;
  origem text;
begin
  perform public.exigir_adm_do_link(p_admin, 'Somente o ADM registra a confirmação manual');

  select * into visita from public.manutencoes where id = p_manutencao_id;
  if not found then
    return null;
  end if;

  select * into link
  from public.confirmacoes_sindico
  where manutencao_id = visita.id
    and meio = 'link';

  select * into manual
  from public.confirmacoes_manuais registro
  where registro.manutencao_id = visita.id
    and registro.classe = 'registro'
    and not exists (
      select 1
      from public.confirmacoes_manuais correcao
      where correcao.referencia_id = registro.id
        and correcao.classe = 'correcao'
    )
  order by registro.registrado_em, registro.id
  limit 1;

  if link.id is not null then
    origem := 'link';
  elsif manual.id is not null then
    origem := 'manual';
  else
    origem := null;
  end if;

  select documento.codigo into codigo_link
  from public.documentos_confirmacao documento
  where documento.confirmacao_link_id = link.id
    and documento.classe = 'confirmacao';

  select coalesce(jsonb_agg(item.linha order by item.registrado_em), '[]'::jsonb)
    into historico
  from (
    select jsonb_build_object(
      'registro_id', registro.id,
      'registrado_em', registro.registrado_em,
      'responsavel', registro.responsavel_nome,
      'justificativa', registro.justificativa,
      'destinatario_nome', registro.destinatario_nome,
      'destinatario_papel', registro.destinatario_papel,
      'codigo', documento.codigo,
      'correcao_em', correcao.registrado_em,
      'correcao_responsavel', correcao.responsavel_nome,
      'correcao_justificativa', correcao.justificativa,
      'declaracao_codigo', declaracao.codigo
    ) as linha,
    registro.registrado_em
    from public.confirmacoes_manuais registro
    left join public.confirmacoes_manuais correcao
      on correcao.referencia_id = registro.id
     and correcao.classe = 'correcao'
    left join public.documentos_confirmacao documento
      on documento.confirmacao_manual_id = registro.id
     and documento.classe = 'confirmacao'
    left join public.documentos_confirmacao declaracao
      on declaracao.confirmacao_manual_id = correcao.id
     and declaracao.classe = 'declaracao'
    where registro.manutencao_id = visita.id
      and registro.classe = 'registro'
  ) item;

  return jsonb_build_object(
    'pode_registrar', origem is null
      and visita.status in ('realizada', 'aguardando_administracao')
      and not visita.registro_anterior
      and public.comprovante_privado_liberado(visita)
      and public.resolver_destinatario_confirmacao(visita.condominio_id) is not null,
    'origem_vigente', origem,
    'vigente_em', case when origem = 'link' then link.confirmado_em else manual.registrado_em end,
    'vigente_responsavel', case
      when origem = 'link' then coalesce(link.destinatario_nome, link.sindico_nome)
      when origem = 'manual' then manual.responsavel_nome
      else null
    end,
    'vigente_papel', case
      when origem = 'link' then coalesce(link.destinatario_papel, 'sindico')
      else null
    end,
    'vigente_justificativa', case when origem = 'manual' then manual.justificativa else null end,
    'vigente_registro_id', case when origem = 'manual' then manual.id else null end,
    'vigente_destinatario', case when origem = 'manual' then manual.destinatario_nome else null end,
    'vigente_codigo', case when origem = 'link' then codigo_link when origem = 'manual' then (
      select documento.codigo
      from public.documentos_confirmacao documento
      where documento.confirmacao_manual_id = manual.id
        and documento.classe = 'confirmacao'
    ) else null end,
    'historico', historico
  );
end;
$$;

create or replace function public.impedir_alteracao_documento_confirmacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'O documento de confirmação não pode ser alterado';
  end if;

  if not exists (
    select 1
    from public.usuarios
    where id = new.emitido_por
      and perfil = 'admin'
      and ativo
  ) then
    raise exception 'Somente o ADM registra a confirmação manual';
  end if;

  new.emitido_em := clock_timestamp();
  new.caminho := lower(new.manutencao_id::text) || '/confirmacoes/' || new.codigo || '.pdf';

  if position('comprovante.pdf' in new.caminho) > 0 or position('://' in new.caminho) > 0 then
    raise exception 'O documento de confirmação não pode ocupar o comprovante de execução';
  end if;

  if new.classe = 'confirmacao' and new.codigo ~ '-D$' then
    raise exception 'O código do documento não confere';
  end if;

  if new.classe = 'declaracao' then
    if new.codigo !~ '-D$' or not exists (
      select 1
      from public.documentos_confirmacao origem
      where origem.id = new.documento_origem_id
        and origem.classe = 'confirmacao'
        and origem.manutencao_id = new.manutencao_id
        and origem.codigo || '-D' = new.codigo
    ) then
      raise exception 'A declaração precisa permanecer ligada ao código original';
    end if;
    if not exists (
      select 1
      from public.confirmacoes_manuais correcao
      where correcao.id = new.confirmacao_manual_id
        and correcao.manutencao_id = new.manutencao_id
        and correcao.classe = 'correcao'
    ) then
      raise exception 'Não há confirmação manual para corrigir';
    end if;
    return new;
  end if;

  if new.confirmacao_link_id is not null and not exists (
    select 1
    from public.confirmacoes_sindico confirmacao
    where confirmacao.id = new.confirmacao_link_id
      and confirmacao.manutencao_id = new.manutencao_id
      and confirmacao.meio = 'link'
  ) then
    raise exception 'Não há confirmação pelo link para este documento';
  end if;

  if new.confirmacao_manual_id is not null and not exists (
    select 1
    from public.confirmacoes_manuais registro
    where registro.id = new.confirmacao_manual_id
      and registro.manutencao_id = new.manutencao_id
      and registro.classe = 'registro'
  ) then
    raise exception 'Não há confirmação manual para este documento';
  end if;

  return new;
end;
$$;

create trigger documentos_confirmacao_imutavel
  before insert or update or delete on public.documentos_confirmacao
  for each row execute function public.impedir_alteracao_documento_confirmacao();

create or replace function public.novo_codigo_documento_confirmacao()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  return 'CM-'
    || to_char(timezone('America/Sao_Paulo', clock_timestamp()), 'YYYY')
    || '-'
    || lpad(nextval('public.documentos_confirmacao_seq')::text, 6, '0');
end;
$$;

create or replace function public.reservar_documento_interno(
  p_admin uuid,
  p_manutencao_id uuid,
  p_link_id uuid,
  p_manual_id uuid,
  p_correcao_id uuid,
  p_origem_id uuid,
  p_codigo_fixo text
)
returns public.documentos_confirmacao
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  documento public.documentos_confirmacao%rowtype;
  codigo text;
begin
  if p_link_id is not null then
    select * into documento
    from public.documentos_confirmacao
    where confirmacao_link_id = p_link_id
      and classe = 'confirmacao';
  elsif p_correcao_id is not null then
    select * into documento
    from public.documentos_confirmacao
    where confirmacao_manual_id = p_correcao_id
      and classe = 'declaracao';
  else
    select * into documento
    from public.documentos_confirmacao
    where confirmacao_manual_id = p_manual_id
      and classe = 'confirmacao';
  end if;

  if found then
    return documento;
  end if;

  codigo := coalesce(p_codigo_fixo, public.novo_codigo_documento_confirmacao());

  insert into public.documentos_confirmacao (
    codigo,
    manutencao_id,
    classe,
    confirmacao_link_id,
    confirmacao_manual_id,
    documento_origem_id,
    caminho,
    emitido_por
  ) values (
    codigo,
    p_manutencao_id,
    case when p_correcao_id is not null then 'declaracao' else 'confirmacao' end,
    p_link_id,
    coalesce(p_correcao_id, p_manual_id),
    p_origem_id,
    lower(p_manutencao_id::text) || '/confirmacoes/' || codigo || '.pdf',
    p_admin
  )
  returning * into documento;

  return documento;
exception
  when unique_violation then
    if p_link_id is not null then
      select * into documento from public.documentos_confirmacao where confirmacao_link_id = p_link_id;
    elsif p_correcao_id is not null then
      select * into documento from public.documentos_confirmacao where confirmacao_manual_id = p_correcao_id;
    else
      select * into documento from public.documentos_confirmacao where confirmacao_manual_id = p_manual_id and classe = 'confirmacao';
    end if;
    if not found then
      raise;
    end if;
    return documento;
end;
$$;

create or replace function public.garantir_documento_confirmacao(
  p_admin uuid,
  p_manutencao_id uuid,
  p_tipo text,
  p_alvo uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  visita public.manutencoes%rowtype;
  link public.confirmacoes_sindico%rowtype;
  registro public.confirmacoes_manuais%rowtype;
  correcao public.confirmacoes_manuais%rowtype;
  documento public.documentos_confirmacao%rowtype;
  declaracao public.documentos_confirmacao%rowtype;
begin
  perform public.exigir_adm_do_link(p_admin, 'Somente o ADM registra a confirmação manual');

  select * into visita
  from public.manutencoes
  where id = p_manutencao_id
  for update;

  if not found or not public.comprovante_privado_liberado(visita) then
    raise exception 'O comprovante ainda não foi liberado';
  end if;

  if p_tipo = 'link' then
    select * into link
    from public.confirmacoes_sindico
    where manutencao_id = visita.id
      and meio = 'link';
    if not found then
      raise exception 'Não há confirmação pelo link para este documento';
    end if;
    documento := public.reservar_documento_interno(p_admin, visita.id, link.id, null, null, null, null);
    return jsonb_build_object(
      'codigo', documento.codigo,
      'caminho', documento.caminho,
      'declaracao_codigo', null,
      'declaracao_caminho', null
    );
  end if;

  if p_tipo not in ('registro', 'declaracao') then
    raise exception 'Não há confirmação manual para este documento';
  end if;

  select * into registro
  from public.confirmacoes_manuais
  where id = p_alvo
    and manutencao_id = visita.id
    and classe = 'registro';

  if not found then
    raise exception 'Não há confirmação manual para este documento';
  end if;

  documento := public.reservar_documento_interno(p_admin, visita.id, null, registro.id, null, null, null);

  select * into correcao
  from public.confirmacoes_manuais
  where referencia_id = registro.id
    and classe = 'correcao';

  if found then
    declaracao := public.reservar_documento_interno(
      p_admin,
      visita.id,
      null,
      null,
      correcao.id,
      documento.id,
      documento.codigo || '-D'
    );
  end if;

  return jsonb_build_object(
    'codigo', documento.codigo,
    'caminho', documento.caminho,
    'declaracao_codigo', declaracao.codigo,
    'declaracao_caminho', declaracao.caminho
  );
end;
$$;

create or replace function public.ler_documento_confirmacao(
  p_admin uuid,
  p_manutencao_id uuid,
  p_codigo text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  visita public.manutencoes%rowtype;
  documento public.documentos_confirmacao%rowtype;
  quantidade integer;
  condominio_nome text;
  link public.confirmacoes_sindico%rowtype;
  manual public.confirmacoes_manuais%rowtype;
  origem_doc public.documentos_confirmacao%rowtype;
begin
  perform public.exigir_adm_do_link(p_admin, 'Somente o ADM registra a confirmação manual');
  if p_codigo is null or p_codigo !~ '^CM-[0-9]{4}-[0-9]{6}(-D)?$' then
    return null;
  end if;

  select * into visita from public.manutencoes where id = p_manutencao_id;
  if not found then
    return null;
  end if;

  select * into documento
  from public.documentos_confirmacao
  where manutencao_id = visita.id
    and codigo = p_codigo;

  if not found or position('comprovante.pdf' in documento.caminho) > 0 then
    return null;
  end if;

  select nome into condominio_nome from public.condominios where id = visita.condominio_id;
  select quantidade_visitas into quantidade from public.contratos where id = visita.contrato_id;

  if documento.classe = 'declaracao' then
    select * into manual
    from public.confirmacoes_manuais
    where id = documento.confirmacao_manual_id
      and classe = 'correcao';
    select * into origem_doc
    from public.documentos_confirmacao
    where id = documento.documento_origem_id;
    if manual.id is null or origem_doc.id is null then
      return null;
    end if;
    return jsonb_build_object(
      'codigo', documento.codigo,
      'caminho', documento.caminho,
      'classe', 'declaracao',
      'origem', null,
      'condominio', btrim(condominio_nome),
      'tipo', visita.tipo,
      'numero_visita', visita.numero_visita,
      'quantidade_visitas', quantidade,
      'data_manutencao', visita.data_realizada,
      'ocorrido_em', manual.registrado_em,
      'responsavel', manual.responsavel_nome,
      'papel', null,
      'destinatario_nome', null,
      'destinatario_papel', null,
      'justificativa', manual.justificativa,
      'codigo_origem', origem_doc.codigo
    );
  end if;

  if documento.confirmacao_link_id is not null then
    select * into link from public.confirmacoes_sindico where id = documento.confirmacao_link_id;
    if link.id is null then
      return null;
    end if;
    return jsonb_build_object(
      'codigo', documento.codigo,
      'caminho', documento.caminho,
      'classe', 'confirmacao',
      'origem', 'link',
      'condominio', btrim(condominio_nome),
      'tipo', visita.tipo,
      'numero_visita', visita.numero_visita,
      'quantidade_visitas', quantidade,
      'data_manutencao', visita.data_realizada,
      'ocorrido_em', link.confirmado_em,
      'responsavel', coalesce(link.destinatario_nome, link.sindico_nome),
      'papel', coalesce(link.destinatario_papel, 'sindico'),
      'destinatario_nome', coalesce(link.destinatario_nome, link.sindico_nome),
      'destinatario_papel', coalesce(link.destinatario_papel, 'sindico'),
      'justificativa', null,
      'codigo_origem', null
    );
  end if;

  select * into manual
  from public.confirmacoes_manuais
  where id = documento.confirmacao_manual_id
    and classe = 'registro';
  if manual.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'codigo', documento.codigo,
    'caminho', documento.caminho,
    'classe', 'confirmacao',
    'origem', 'manual',
    'condominio', btrim(condominio_nome),
    'tipo', visita.tipo,
    'numero_visita', visita.numero_visita,
    'quantidade_visitas', quantidade,
    'data_manutencao', visita.data_realizada,
    'ocorrido_em', manual.registrado_em,
    'responsavel', manual.responsavel_nome,
    'papel', null,
    'destinatario_nome', manual.destinatario_nome,
    'destinatario_papel', manual.destinatario_papel,
    'justificativa', manual.justificativa,
    'codigo_origem', null
  );
end;
$$;

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

  if public.confirmacao_manual_vigente(visita.id) is not null then
    return jsonb_build_object('erro', 'confirmada');
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

  if situacao->>'erro' = 'confirmada' then
    raise exception 'Esta manutenção já tem confirmação';
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

create or replace function public.emitir_link_confirmacao_sindico(
  p_manutencao_id uuid,
  p_token text,
  p_emitido_por uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  visita public.manutencoes%rowtype;
  hash text;
  novo_id uuid;
  atual jsonb;
begin
  perform public.exigir_adm_do_link(p_emitido_por, 'Somente o ADM emite o link');

  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'Informe o token do link';
  end if;

  hash := public.hash_token_confirmacao(p_token);
  if position(p_token in hash) > 0 or hash = p_token then
    raise exception 'A confirmação guarda somente o hash do token';
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
    select 1
    from public.confirmacoes_sindico
    where manutencao_id = visita.id
  ) then
    raise exception 'Esta manutenção já tem confirmação';
  end if;

  if public.confirmacao_manual_vigente(visita.id) is not null then
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
    hash,
    p_emitido_por,
    case when atual->>'papel' = 'sindico' then null else (atual->>'destinatario_id')::uuid end,
    case when atual->>'papel' = 'sindico' then (atual->>'sindico_id')::uuid else null end,
    atual->>'papel',
    atual->>'nome'
  )
  returning id into novo_id;

  return novo_id;
exception
  when unique_violation then
    raise exception 'Este link já foi emitido';
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

  if public.confirmacao_manual_vigente(visita.id) is not null then
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

create or replace function public.registrar_confirmacao_sindico(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  hash text;
  link public.links_confirmacao_sindico%rowtype;
  visita public.manutencoes%rowtype;
  atual jsonb;
  novo_id uuid;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'Informe o token do link';
  end if;

  hash := public.hash_token_confirmacao(p_token);
  if position(p_token in hash) > 0 or hash = p_token then
    raise exception 'A confirmação guarda somente o hash do token';
  end if;

  select * into link
  from public.links_confirmacao_sindico
  where token_hash = hash;

  if not found then
    raise exception 'Este link não foi emitido';
  end if;

  if link.revogado_em is not null then
    raise exception 'Este link foi revogado';
  end if;

  select * into visita
  from public.manutencoes
  where id = link.manutencao_id
  for update;

  if not found then
    raise exception 'Manutenção não encontrada';
  end if;

  select * into link
  from public.links_confirmacao_sindico
  where token_hash = hash
    and manutencao_id = visita.id
  for update;

  if not found then
    raise exception 'Este link não foi emitido';
  end if;

  if link.revogado_em is not null then
    raise exception 'Este link foi revogado';
  end if;

  if visita.status = 'cancelada' then
    raise exception 'Manutenção cancelada não recebe confirmação';
  end if;

  if visita.registro_anterior then
    raise exception 'Registro anterior não recebe confirmação';
  end if;

  if not public.comprovante_privado_liberado(visita) then
    raise exception 'O comprovante ainda não foi liberado';
  end if;

  if exists (
    select 1
    from public.confirmacoes_sindico
    where manutencao_id = visita.id
  ) then
    raise exception 'Esta manutenção já tem confirmação';
  end if;

  if public.confirmacao_manual_vigente(visita.id) is not null then
    raise exception 'Esta manutenção já tem confirmação';
  end if;


  if link.destinatario_papel is null then
    raise exception 'Este link precisa ser gerado de novo';
  end if;

  atual := public.resolver_destinatario_confirmacao(visita.condominio_id);
  if atual is null then
    raise exception 'Não há responsável autorizado para receber o comprovante';
  end if;

  if not public.vinculo_confirma_destinatario(
    link.destinatario_papel,
    link.destinatario_id,
    link.sindico_destinatario_id,
    atual
  ) then
    raise exception 'Este link não pertence mais ao responsável autorizado';
  end if;

  begin
    insert into public.confirmacoes_sindico (
      manutencao_id,
      token_hash,
      sindico_id,
      sindico_nome,
      destinatario_id,
      destinatario_papel,
      destinatario_nome
    ) values (
      visita.id,
      hash,
      case when atual->>'papel' = 'sindico' then (atual->>'sindico_id')::uuid else null end,
      atual->>'nome',
      case when atual->>'papel' = 'sindico' then null else (atual->>'destinatario_id')::uuid end,
      atual->>'papel',
      atual->>'nome'
    )
    returning id into novo_id;
  exception
    when unique_violation then
      raise exception 'Esta manutenção já tem confirmação';
  end;

  return novo_id;
end;
$$;

create or replace function public.validar_confirmacao_sindico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  visita public.manutencoes%rowtype;
  link public.links_confirmacao_sindico%rowtype;
  atual jsonb;
begin
  select * into visita
  from public.manutencoes
  where id = new.manutencao_id;

  if not found then
    raise exception 'Manutenção não encontrada';
  end if;

  if visita.status = 'cancelada' then
    raise exception 'Manutenção cancelada não recebe confirmação';
  end if;

  if visita.registro_anterior then
    raise exception 'Registro anterior não recebe confirmação';
  end if;

  if not public.comprovante_privado_liberado(visita) then
    raise exception 'O comprovante ainda não foi liberado';
  end if;

  if public.confirmacao_manual_vigente(visita.id) is not null then
    raise exception 'Esta manutenção já tem confirmação';
  end if;


  select * into link
  from public.links_confirmacao_sindico
  where manutencao_id = new.manutencao_id
    and token_hash = new.token_hash
    and revogado_em is null;

  if not found then
    if exists (
      select 1
      from public.links_confirmacao_sindico
      where manutencao_id = new.manutencao_id
        and token_hash = new.token_hash
        and revogado_em is not null
    ) then
      raise exception 'Este link foi revogado';
    end if;
    raise exception 'Este link não foi emitido';
  end if;

  if link.destinatario_papel is null then
    raise exception 'Este link precisa ser gerado de novo';
  end if;

  atual := public.resolver_destinatario_confirmacao(visita.condominio_id);
  if atual is null then
    raise exception 'Não há responsável autorizado para receber o comprovante';
  end if;

  if not public.vinculo_confirma_destinatario(
    link.destinatario_papel,
    link.destinatario_id,
    link.sindico_destinatario_id,
    atual
  ) then
    raise exception 'Este link não pertence mais ao responsável autorizado';
  end if;

  new.meio := 'link';
  new.confirmado_em := clock_timestamp();
  new.destinatario_papel := atual->>'papel';
  new.destinatario_nome := atual->>'nome';
  if atual->>'papel' = 'sindico' then
    new.sindico_id := (atual->>'sindico_id')::uuid;
    new.destinatario_id := null;
    new.sindico_nome := atual->>'nome';
  else
    new.sindico_id := null;
    new.destinatario_id := (atual->>'destinatario_id')::uuid;
    new.sindico_nome := atual->>'nome';
  end if;
  return new;
end;
$$;

create or replace function public.ler_link_confirmacao_sindico(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  hash text;
  link public.links_confirmacao_sindico%rowtype;
  visita public.manutencoes%rowtype;
  condominio_nome text;
  quantidade integer;
  confirmacao public.confirmacoes_sindico%rowtype;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    return null;
  end if;

  hash := public.hash_token_confirmacao(p_token);

  select * into link
  from public.links_confirmacao_sindico
  where token_hash = hash
    and revogado_em is null;

  if not found then
    return null;
  end if;

  select * into visita
  from public.manutencoes
  where id = link.manutencao_id;

  if not found
     or visita.status = 'cancelada'
     or visita.registro_anterior
     or visita.status not in ('realizada', 'aguardando_administracao')
     or not public.comprovante_privado_liberado(visita) then
    return null;
  end if;

  select nome into condominio_nome
  from public.condominios
  where id = visita.condominio_id;

  if nullif(trim(coalesce(condominio_nome, '')), '') is null then
    return null;
  end if;

  select quantidade_visitas into quantidade
  from public.contratos
  where id = visita.contrato_id;

  select * into confirmacao
  from public.confirmacoes_sindico
  where manutencao_id = visita.id;

  if found then
    if confirmacao.token_hash is distinct from link.token_hash then
      return null;
    end if;
    return jsonb_build_object(
      'situacao', 'encerrada',
      'manutencao_id', link.manutencao_id
    );
  end if;

  if public.confirmacao_manual_vigente(visita.id) is not null then
    return jsonb_build_object(
      'situacao', 'encerrada',
      'manutencao_id', link.manutencao_id
    );
  end if;

  if not public.vinculo_confirma_destinatario(
    link.destinatario_papel,
    link.destinatario_id,
    link.sindico_destinatario_id,
    public.resolver_destinatario_confirmacao(visita.condominio_id)
  ) then
    return null;
  end if;

  return jsonb_build_object(
    'manutencao_id', visita.id,
    'condominio', trim(condominio_nome),
    'tipo', visita.tipo,
    'numero_visita', visita.numero_visita,
    'quantidade_visitas', quantidade,
    'data_efetiva', visita.data_realizada,
    'caminho_pdf', visita.pdf_url,
    'confirmado_em', confirmacao.confirmado_em,
    'sindico_id', confirmacao.sindico_id,
    'sindico_nome', confirmacao.sindico_nome,
    'meio', confirmacao.meio
  );
end;
$$;


revoke all on function public.confirmacao_manual_vigente(uuid) from public, anon, authenticated;
revoke all on function public.normalizar_justificativa_confirmacao(text) from public, anon, authenticated;
revoke all on function public.validar_confirmacao_manual() from public, anon, authenticated;
revoke all on function public.registrar_confirmacao_manual(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.corrigir_confirmacao_manual(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.resumo_confirmacao_comprovante(uuid, uuid) from public, anon, authenticated;
revoke all on function public.impedir_alteracao_documento_confirmacao() from public, anon, authenticated;
revoke all on function public.novo_codigo_documento_confirmacao() from public, anon, authenticated;
revoke all on function public.reservar_documento_interno(uuid, uuid, uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.garantir_documento_confirmacao(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.ler_documento_confirmacao(uuid, uuid, text) from public, anon, authenticated;
revoke all on sequence public.documentos_confirmacao_seq from public, anon, authenticated;

alter table public.confirmacoes_manuais enable row level security;
alter table public.confirmacoes_manuais force row level security;
alter table public.documentos_confirmacao enable row level security;
alter table public.documentos_confirmacao force row level security;

revoke all on table public.confirmacoes_manuais from public, anon, authenticated;
revoke all on table public.documentos_confirmacao from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    revoke all on table public.confirmacoes_manuais from service_role;
    revoke all on table public.documentos_confirmacao from service_role;
    revoke all on sequence public.documentos_confirmacao_seq from service_role;
    revoke all on function public.confirmacao_manual_vigente(uuid) from service_role;
    revoke all on function public.normalizar_justificativa_confirmacao(text) from service_role;
    revoke all on function public.validar_confirmacao_manual() from service_role;
    revoke all on function public.impedir_alteracao_documento_confirmacao() from service_role;
    revoke all on function public.novo_codigo_documento_confirmacao() from service_role;
    revoke all on function public.reservar_documento_interno(uuid, uuid, uuid, uuid, uuid, uuid, text) from service_role;
    revoke all on function public.registrar_confirmacao_manual(uuid, uuid, text) from service_role;
    revoke all on function public.corrigir_confirmacao_manual(uuid, uuid, uuid, text) from service_role;
    revoke all on function public.resumo_confirmacao_comprovante(uuid, uuid) from service_role;
    revoke all on function public.garantir_documento_confirmacao(uuid, uuid, text, uuid) from service_role;
    revoke all on function public.ler_documento_confirmacao(uuid, uuid, text) from service_role;
    grant execute on function public.registrar_confirmacao_manual(uuid, uuid, text) to service_role;
    grant execute on function public.corrigir_confirmacao_manual(uuid, uuid, uuid, text) to service_role;
    grant execute on function public.resumo_confirmacao_comprovante(uuid, uuid) to service_role;
    grant execute on function public.garantir_documento_confirmacao(uuid, uuid, text, uuid) to service_role;
    grant execute on function public.ler_documento_confirmacao(uuid, uuid, text) to service_role;
  end if;
end $$;

