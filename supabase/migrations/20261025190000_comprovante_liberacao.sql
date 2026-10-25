-- ELEVA Manutenção — Fase 6, liberação do comprovante.
-- O arquivo permanece no bucket privado. Aqui só fica o caminho interno.
-- Esta migration não altera o status das manutenções já existentes
-- e não gera comprovante para elas.
-- Pendência encaminhada ao ADM exige ressalva escrita pelo ADM.
-- Manutenção concluída normalmente não recebe essa observação.

alter table public.ocorrencias
  add column if not exists orcamento_informado boolean not null default false;

alter table public.manutencoes
  add column if not exists comprovante_liberado_em timestamptz,
  add column if not exists comprovante_autorizado_por uuid references public.usuarios (id),
  add column if not exists observacao_administracao text;

alter table public.manutencoes
  drop constraint if exists manutencoes_comprovante_privado_check;

alter table public.manutencoes
  add constraint manutencoes_comprovante_privado_check
  check (
    (
      pdf_url is null
      and comprovante_liberado_em is null
      and comprovante_autorizado_por is null
      and observacao_administracao is null
    )
    or (
      pdf_url = lower(id::text) || '/comprovante.pdf'
      and position('://' in pdf_url) = 0
      and comprovante_liberado_em is not null
      and comprovante_autorizado_por is null
      and observacao_administracao is null
    )
    or (
      pdf_url = lower(id::text) || '/comprovante.pdf'
      and position('://' in pdf_url) = 0
      and comprovante_liberado_em is not null
      and comprovante_autorizado_por is not null
      and observacao_administracao is not null
      and char_length(observacao_administracao) between 1 and 400
      and observacao_administracao = btrim(observacao_administracao)
    )
  ) not valid;

comment on column public.ocorrencias.orcamento_informado is
  'O ADM já respondeu se a ocorrência não resolvida depende de orçamento.';

comment on column public.manutencoes.pdf_url is
  'Caminho privado do comprovante, no formato {id}/comprovante.pdf. Não é URL pública.';

comment on column public.manutencoes.comprovante_liberado_em is
  'Momento em que o comprovante foi liberado. Não muda o status da visita.';

comment on column public.manutencoes.comprovante_autorizado_por is
  'ADM que liberou o comprovante de uma visita com pendência encaminhada. Fica vazio na liberação automática.';

comment on column public.manutencoes.observacao_administracao is
  'Ressalva escrita pelo ADM no comprovante quando há pendência encaminhada. Não copia descrição, foto, providência ou solução. Fica vazia na conclusão normal.';

create or replace function public.antes_de_gravar_ocorrencia()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.resolvida_no_local is null
     or nullif(trim(new.descricao_original), '') is null
     or nullif(trim(new.foto_url), '') is null then
    raise exception 'Ocorrência exige resolução, descrição e foto';
  end if;

  new.descricao_original := trim(new.descricao_original);
  new.foto_url := trim(new.foto_url);

  if not public.is_admin() then
    if tg_op = 'INSERT' then
      new.necessita_orcamento := false;
      new.orcamento_informado := false;
      new.necessita_retorno := false;
      new.classificacao_interna := null;
      new.descricao_padronizada := null;
      new.texto_para_sindico := null;
      new.enviar_para_sindico := false;
      new.observacoes_administrativas := null;
      new.providencia := null;
      new.solucao := null;
      new.status_ocorrencia := case
        when new.resolvida_no_local then 'resolvida'
        else 'aberta'
      end;
    else
      new.necessita_orcamento := old.necessita_orcamento;
      new.orcamento_informado := old.orcamento_informado;
      new.necessita_retorno := old.necessita_retorno;
      new.classificacao_interna := old.classificacao_interna;
      new.descricao_padronizada := old.descricao_padronizada;
      new.texto_para_sindico := old.texto_para_sindico;
      new.enviar_para_sindico := old.enviar_para_sindico;
      new.observacoes_administrativas := old.observacoes_administrativas;
      new.providencia := old.providencia;
      new.solucao := old.solucao;
      if new.resolvida_no_local is distinct from old.resolvida_no_local
         and old.status_ocorrencia in ('aberta', 'resolvida') then
        new.status_ocorrencia := case
          when new.resolvida_no_local then 'resolvida'
          else 'aberta'
        end;
      else
        new.status_ocorrencia := old.status_ocorrencia;
      end if;
    end if;
  end if;

  if new.resolvida_no_local then
    new.necessita_orcamento := false;
    new.orcamento_informado := false;
  end if;

  return new;
end;
$$;

create or replace function public.antes_de_atualizar_visita()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.registro_anterior is distinct from old.registro_anterior
     and current_setting('app.registro_anterior', true) is distinct from 'on' then
    raise exception 'Visita anterior exige confirmação do ADM';
  end if;

  if new.data_programada_atual is distinct from old.data_programada_atual then
    if not public.is_admin() then
      raise exception 'Somente o ADM pode reagendar';
    end if;

    if old.status <> 'programada' then
      raise exception 'Só é possível reagendar uma visita programada';
    end if;

    insert into public.historico_reagendamentos (
      manutencao_id, data_anterior, nova_data, alterado_por
    ) values (
      old.id, old.data_programada_atual, new.data_programada_atual, auth.uid()
    );
  end if;

  if new.status is distinct from old.status then
    if new.status = 'cancelada'
       and current_setting('app.cancelando', true) is distinct from 'on' then
      raise exception 'Somente o ADM pode cancelar uma visita';
    end if;

    if new.status in ('realizada', 'aguardando_administracao')
       and current_setting('app.finalizando', true) is distinct from 'on'
       and not (
         new.registro_anterior
         and current_setting('app.registro_anterior', true) = 'on'
       ) then
      raise exception 'Finalização inválida';
    end if;

    if new.registro_anterior and old.registro_anterior is not true then
      if old.status is distinct from 'programada' then
        raise exception 'Não é possível alterar visita já iniciada';
      end if;

      if new.status is distinct from 'realizada'
         or new.numero_visita is distinct from old.numero_visita
         or new.data_programada_original is distinct from old.data_programada_original
         or new.data_programada_atual is distinct from old.data_programada_atual
         or new.contrato_id is distinct from old.contrato_id
         or new.tipo is distinct from 'preventiva'
         or new.data_realizada is null then
        raise exception 'A numeração e as datas programadas permanecem';
      end if;

      if exists (
        select 1
        from public.itens_manutencao
        where manutencao_id = old.id
          and resultado <> 'pendente'
      ) or exists (
        select 1
        from public.itens_manutencao i
        join public.ocorrencias o on o.item_manutencao_id = i.id
        where i.manutencao_id = old.id
      ) then
        raise exception 'Não é possível alterar visita já iniciada';
      end if;
    end if;

    if new.status = 'em_execucao' then
      if old.status is distinct from 'programada'
         or current_setting('app.executando', true) is distinct from 'on' then
        raise exception 'A execução começa no primeiro registro de equipamento';
      end if;
    end if;

    if old.status in ('realizada', 'aguardando_administracao', 'cancelada')
       and not public.is_admin() then
      raise exception 'Visita encerrada para edição do prestador';
    end if;

    insert into public.auditoria (tabela, registro_id, acao, ator_id, detalhe)
    values (
      'manutencoes',
      new.id,
      'status',
      auth.uid(),
      jsonb_build_object('de', old.status, 'para', new.status)
    );
  end if;

  if new.pdf_url is distinct from old.pdf_url
     or new.comprovante_liberado_em is distinct from old.comprovante_liberado_em
     or new.comprovante_autorizado_por is distinct from old.comprovante_autorizado_por
     or new.observacao_administracao is distinct from old.observacao_administracao then
    if current_setting('app.comprovante', true) is distinct from 'on' then
      raise exception 'O comprovante só é liberado pelo fluxo da manutenção';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.situacao_liberacao_comprovante(p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  visita public.manutencoes%rowtype;
  caminho text;
begin
  if auth.uid() is null or not (public.is_admin() or public.is_prestador()) then
    raise exception 'Sem acesso operacional';
  end if;

  select * into visita from public.manutencoes where id = p_id;
  if not found then
    raise exception 'Visita não encontrada';
  end if;

  if public.is_prestador()
     and not public.is_admin()
     and visita.prestador_id is distinct from public.prestador_id_atual() then
    raise exception 'Visita não atribuída';
  end if;

  if visita.registro_anterior then
    return 'recusada';
  end if;

  if visita.status = 'cancelada' then
    return 'recusada';
  end if;

  if visita.status not in ('realizada', 'aguardando_administracao') then
    return 'recusada';
  end if;

  caminho := lower(visita.id::text) || '/comprovante.pdf';
  if visita.pdf_url is not null then
    if visita.pdf_url = caminho and position('://' in visita.pdf_url) = 0 then
      return 'liberada';
    end if;
    return 'recusada';
  end if;

  if exists (
    select 1
    from public.itens_manutencao i
    join public.ocorrencias o on o.item_manutencao_id = i.id
    where i.manutencao_id = visita.id
      and o.resolvida_no_local = false
  ) then
    return 'autorizar';
  end if;

  return 'liberar';
end;
$$;

drop function if exists public.registrar_comprovante(uuid, text, boolean);

create or replace function public.registrar_comprovante(
  p_id uuid,
  p_caminho text,
  p_autorizar boolean,
  p_observacao text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  visita public.manutencoes%rowtype;
  situacao text;
  caminho text;
  condominio_nome text;
  prestador_nome text;
  texto_observacao text;
begin
  if auth.uid() is null or not (public.is_admin() or public.is_prestador()) then
    raise exception 'Sem acesso operacional';
  end if;

  if p_autorizar is not true and p_autorizar is not false then
    raise exception 'Esta manutenção não gera comprovante';
  end if;

  select * into visita from public.manutencoes where id = p_id for update;
  if not found then
    raise exception 'Visita não encontrada';
  end if;

  if public.is_prestador() and not public.is_admin() then
    if p_autorizar then
      raise exception 'Somente o ADM autoriza a liberação do comprovante';
    end if;
    if visita.prestador_id is distinct from public.prestador_id_atual() then
      raise exception 'Visita não atribuída';
    end if;
  end if;

  if p_autorizar and not public.is_admin() then
    raise exception 'Somente o ADM autoriza a liberação do comprovante';
  end if;

  if visita.registro_anterior then
    raise exception 'Registro anterior não gera comprovante';
  end if;

  if visita.status = 'cancelada' then
    raise exception 'Manutenção cancelada não gera comprovante';
  end if;

  caminho := lower(visita.id::text) || '/comprovante.pdf';
  if p_caminho is distinct from caminho
     or position('://' in coalesce(p_caminho, '')) > 0
     or position('public' in lower(coalesce(p_caminho, ''))) > 0
     or position('..' in coalesce(p_caminho, '')) > 0 then
    raise exception 'O comprovante não pode ter URL pública';
  end if;

  texto_observacao := nullif(regexp_replace(trim(coalesce(p_observacao, '')), '\s+', ' ', 'g'), '');

  situacao := public.situacao_liberacao_comprovante(visita.id);
  if situacao = 'liberada' then
    raise exception 'O comprovante já foi liberado';
  end if;
  if situacao = 'recusada' then
    raise exception 'Esta manutenção não gera comprovante';
  end if;
  if situacao = 'autorizar' then
    if not p_autorizar then
      raise exception 'O comprovante aguarda autorização';
    end if;
    if texto_observacao is null then
      raise exception 'Informe a observação da administração';
    end if;
    if char_length(texto_observacao) > 400 then
      raise exception 'A observação da administração precisa caber em 400 caracteres';
    end if;
  elsif situacao = 'liberar' then
    if p_autorizar then
      raise exception 'Esta manutenção não aguarda autorização do comprovante';
    end if;
    if texto_observacao is not null then
      raise exception 'Manutenção concluída normalmente não recebe observação';
    end if;
  else
    raise exception 'Esta manutenção não gera comprovante';
  end if;

  if visita.data_realizada is null then
    raise exception 'Informe a data efetiva';
  end if;

  select nome into condominio_nome
  from public.condominios
  where id = visita.condominio_id;

  if nullif(trim(coalesce(condominio_nome, '')), '') is null then
    raise exception 'Informe o condomínio';
  end if;

  select nome into prestador_nome
  from public.prestadores
  where id = visita.prestador_id;

  if nullif(trim(coalesce(prestador_nome, '')), '') is null then
    raise exception 'Informe o prestador';
  end if;

  if not exists (
    select 1
    from public.itens_manutencao
    where manutencao_id = visita.id
      and length(trim(nome_identificacao)) > 0
  ) then
    raise exception 'Informe os equipamentos atendidos';
  end if;

  perform set_config('app.comprovante', 'on', true);

  update public.manutencoes
    set pdf_url = caminho,
        comprovante_liberado_em = clock_timestamp(),
        comprovante_autorizado_por = case when p_autorizar then auth.uid() else null end,
        observacao_administracao = texto_observacao
    where id = visita.id;

  perform set_config('app.comprovante', 'off', true);

  insert into public.auditoria (tabela, registro_id, acao, ator_id, detalhe)
  values (
    'manutencoes',
    visita.id,
    'comprovante',
    auth.uid(),
    jsonb_build_object(
      'autorizado', p_autorizar,
      'caminho', caminho,
      'observacao_administracao', texto_observacao
    )
  );

  return caminho;
end;
$$;

create or replace function public.registrar_tratamento_ocorrencia(
  p_ocorrencia uuid,
  p_situacao text,
  p_observacao text,
  p_depende_orcamento boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  atual public.ocorrencias%rowtype;
  texto text;
  situacao text;
begin
  if not public.is_admin() then
    raise exception 'Somente o ADM trata a ocorrência';
  end if;

  select * into atual from public.ocorrencias where id = p_ocorrencia;
  if not found then
    raise exception 'Ocorrência não encontrada';
  end if;

  situacao := trim(coalesce(p_situacao, ''));
  if situacao not in (
    'aberta',
    'em_analise',
    'aguardando_orcamento',
    'aguardando_aprovacao',
    'aguardando_execucao',
    'retorno_programado',
    'resolvida'
  ) then
    raise exception 'Escolha a situação da ocorrência';
  end if;

  texto := nullif(trim(coalesce(p_observacao, '')), '');
  if texto is null then
    if situacao = 'resolvida' then
      raise exception 'Informe a solução adotada';
    end if;
    raise exception 'Informe a observação ou a providência';
  end if;

  if p_depende_orcamento is not null and atual.resolvida_no_local then
    raise exception 'Ocorrência resolvida no local não depende de orçamento';
  end if;

  update public.ocorrencias
    set status_ocorrencia = situacao,
        observacoes_administrativas = texto,
        providencia = case when situacao = 'resolvida' then providencia else texto end,
        solucao = case when situacao = 'resolvida' then texto else solucao end,
        necessita_orcamento = case
          when atual.resolvida_no_local then false
          when p_depende_orcamento is null then necessita_orcamento
          else p_depende_orcamento
        end,
        orcamento_informado = case
          when atual.resolvida_no_local then false
          when p_depende_orcamento is null then orcamento_informado
          else true
        end
    where id = atual.id;

  insert into public.historico_ocorrencias (
    ocorrencia_id,
    situacao_anterior,
    situacao_nova,
    observacao,
    registrado_por
  ) values (
    atual.id,
    case when atual.status_ocorrencia is distinct from situacao then atual.status_ocorrencia else null end,
    case when atual.status_ocorrencia is distinct from situacao then situacao else null end,
    texto,
    auth.uid()
  );
end;
$$;

create or replace function public.registrar_tratamento_ocorrencia(
  p_ocorrencia uuid,
  p_situacao text,
  p_observacao text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.registrar_tratamento_ocorrencia(p_ocorrencia, p_situacao, p_observacao, null);
end;
$$;

revoke all on function public.situacao_liberacao_comprovante(uuid) from public, anon;
revoke all on function public.registrar_comprovante(uuid, text, boolean, text) from public, anon;
revoke all on function public.registrar_tratamento_ocorrencia(uuid, text, text, boolean) from public, anon;

grant execute on function public.situacao_liberacao_comprovante(uuid) to authenticated;
grant execute on function public.registrar_comprovante(uuid, text, boolean, text) to authenticated;
grant execute on function public.registrar_tratamento_ocorrencia(uuid, text, text, boolean) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    revoke all on function public.situacao_liberacao_comprovante(uuid) from service_role;
    revoke all on function public.registrar_comprovante(uuid, text, boolean, text) from service_role;
    revoke all on function public.registrar_tratamento_ocorrencia(uuid, text, text, boolean) from service_role;
  end if;
end $$;
