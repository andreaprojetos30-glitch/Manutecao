-- ELEVA Manutenção — retirada da liberação e troca do prestador da visita.
-- Enquanto a visita está programada, o ADM pode retirar a liberação
-- ou trocar só o prestador dela. A troca de uma visita liberada apaga
-- a autorização anterior. O prestador padrão do contrato não muda.
-- Cada liberação, retirada e troca fica no histórico, com responsável
-- e momento. Os registros anteriores permanecem.
-- Esta migration não publica em produção.

create table public.historico_execucao (
  id uuid primary key default gen_random_uuid(),
  manutencao_id uuid not null,
  acao text not null check (acao in ('liberacao', 'retirada', 'troca_prestador')),
  prestador_anterior_id uuid,
  prestador_novo_id uuid,
  responsavel_id uuid,
  created_at timestamptz not null default now(),
  constraint historico_execucao_manutencao_fk
    foreign key (manutencao_id) references public.manutencoes (id),
  constraint historico_execucao_anterior_fk
    foreign key (prestador_anterior_id) references public.prestadores (id),
  constraint historico_execucao_novo_fk
    foreign key (prestador_novo_id) references public.prestadores (id),
  constraint historico_execucao_responsavel_fk
    foreign key (responsavel_id) references public.usuarios (id)
);

create index historico_execucao_manutencao_idx
  on public.historico_execucao (manutencao_id, created_at);

comment on table public.historico_execucao is
  'Liberações, retiradas e trocas de prestador da visita. Cada linha permanece.';

create or replace function public.bloquear_historico_execucao()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE'
     and current_setting('app.limpando_historico_execucao', true) = 'on' then
    return old;
  end if;

  raise exception 'O histórico da execução não pode ser apagado';
end;
$$;

create trigger historico_execucao_bloquear
  before update or delete on public.historico_execucao
  for each row
  execute function public.bloquear_historico_execucao();

create or replace function public.limpar_historico_execucao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.limpando_historico_execucao', 'on', true);
  delete from public.historico_execucao where manutencao_id = old.id;
  return old;
end;
$$;

create trigger manutencoes_limpar_historico_execucao
  before delete on public.manutencoes
  for each row
  execute function public.limpar_historico_execucao();

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

  if new.numero_visita is distinct from old.numero_visita
     or new.tipo is distinct from old.tipo
     or new.contrato_id is distinct from old.contrato_id then
    raise exception 'A numeração e o vínculo contratual da visita permanecem';
  end if;

  if new.execucao_liberada_em is distinct from old.execucao_liberada_em
     or new.execucao_liberada_por is distinct from old.execucao_liberada_por then
    if current_setting('app.liberando_execucao', true) is distinct from 'on'
       or not public.is_admin() then
      raise exception 'A liberação da execução só ocorre pelo botão da ficha';
    end if;
  end if;

  if new.prestador_id is distinct from old.prestador_id then
    if current_setting('app.trocando_prestador', true) is distinct from 'on'
       or not public.is_admin() then
      raise exception 'A troca de prestador só ocorre pelo botão da ficha';
    end if;
  end if;

  if new.registro_anterior is not true
     and new.execucao_liberada_em is null
     and old.status is distinct from new.status
     and new.status in ('em_execucao', 'realizada', 'aguardando_administracao') then
    raise exception 'A execução ainda não foi liberada';
  end if;

  if new.data_programada_atual is distinct from old.data_programada_atual then
    if new.status is distinct from old.status
       or new.registro_anterior is distinct from old.registro_anterior
       or new.data_programada_original is distinct from old.data_programada_original
       or new.condominio_id is distinct from old.condominio_id then
      raise exception 'O reagendamento preserva a numeração, o saldo e o histórico da visita';
    end if;

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
    if new.status = 'cancelada' and old.status is distinct from 'cancelada' then
      if not public.is_admin() then
        raise exception 'Somente o ADM pode cancelar uma visita';
      end if;

      if old.tipo = 'preventiva' or new.tipo = 'preventiva' then
        raise exception 'Visita preventiva do contrato não pode ser cancelada';
      end if;

      if old.tipo is distinct from 'avulsa' or new.tipo is distinct from 'avulsa' then
        raise exception 'Somente manutenção avulsa pode ser cancelada';
      end if;

      if current_setting('app.cancelando', true) is distinct from 'on' then
        raise exception 'Somente o ADM pode cancelar uma visita';
      end if;
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

create or replace function public.antes_de_gravar_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  visita public.manutencoes%rowtype;
  contrato_do_equipamento uuid;
begin
  select * into visita
  from public.manutencoes
  where id = new.manutencao_id
  for update;

  if not found then
    raise exception 'Item sem manutenção';
  end if;

  if tg_op = 'UPDATE'
     and public.is_prestador()
     and visita.prestador_id is distinct from public.prestador_id_atual() then
    raise exception 'Visita não atribuída';
  end if;

  if tg_op = 'UPDATE'
     and old.resultado = 'pendente'
     and new.resultado in ('ok', 'ocorrencia')
     and visita.registro_anterior is not true
     and visita.execucao_liberada_em is null then
    raise exception 'A execução ainda não foi liberada';
  end if;

  if visita.status in ('realizada', 'aguardando_administracao', 'cancelada')
     and not public.is_admin() then
    raise exception 'Visita encerrada para edição do prestador';
  end if;

  if visita.tipo = 'avulsa' then
    if new.equipamento_contrato_id is not null or new.equipamento_matriz_id is null then
      raise exception 'Avulsa usa equipamento da matriz';
    end if;
  elsif visita.tipo = 'corretiva_complementar' then
    if (new.equipamento_contrato_id is null and new.equipamento_matriz_id is null)
       or (new.equipamento_contrato_id is not null and new.equipamento_matriz_id is not null) then
      raise exception 'O retorno deve usar o equipamento da ocorrência';
    end if;

    if new.equipamento_contrato_id is not null then
      select contrato_id into contrato_do_equipamento
      from public.equipamentos_contrato
      where id = new.equipamento_contrato_id;

      if contrato_do_equipamento is distinct from visita.contrato_id then
        raise exception 'Equipamento de outro contrato';
      end if;
    end if;
  else
    if new.equipamento_contrato_id is null or new.equipamento_matriz_id is not null then
      raise exception 'Visita de contrato usa equipamento do contrato';
    end if;

    select contrato_id into contrato_do_equipamento
    from public.equipamentos_contrato
    where id = new.equipamento_contrato_id;

    if contrato_do_equipamento is distinct from visita.contrato_id then
      raise exception 'Equipamento de outro contrato';
    end if;
  end if;

  if tg_op = 'UPDATE'
     and old.resultado = 'pendente'
     and new.resultado in ('ok', 'ocorrencia') then
    new.registrado_por := coalesce(new.registrado_por, auth.uid());
    new.registrado_em := coalesce(new.registrado_em, now());
  end if;

  if new.resultado in ('ok', 'ocorrencia') and visita.status = 'programada' then
    perform set_config('app.executando', 'on', true);
    update public.manutencoes
      set status = 'em_execucao'
      where id = visita.id
        and status = 'programada';
  end if;

  return new;
end;
$$;

create or replace function public.liberar_execucao(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  visita public.manutencoes%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Somente o ADM libera a execução';
  end if;

  select * into visita
  from public.manutencoes
  where id = p_id
  for update;

  if not found then
    raise exception 'Visita não encontrada';
  end if;

  if visita.registro_anterior then
    raise exception 'Visita anterior não tem execução';
  end if;

  if visita.status <> 'programada' then
    raise exception 'Só é possível liberar uma visita programada';
  end if;

  if visita.prestador_id is null then
    raise exception 'Selecione o prestador';
  end if;

  if visita.execucao_liberada_em is not null then
    return;
  end if;

  perform set_config('app.liberando_execucao', 'on', true);
  update public.manutencoes
    set execucao_liberada_em = now(),
        execucao_liberada_por = auth.uid()
    where id = p_id;

  insert into public.historico_execucao (
    manutencao_id, acao, prestador_novo_id, responsavel_id
  ) values (
    p_id, 'liberacao', visita.prestador_id, auth.uid()
  );
end;
$$;

create or replace function public.retirar_liberacao_execucao(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  visita public.manutencoes%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Somente o ADM retira a liberação';
  end if;

  select * into visita
  from public.manutencoes
  where id = p_id
  for update;

  if not found then
    raise exception 'Visita não encontrada';
  end if;

  if visita.registro_anterior then
    raise exception 'Visita anterior não tem execução';
  end if;

  if visita.status <> 'programada' then
    raise exception 'Só é possível retirar a liberação de uma visita programada';
  end if;

  if visita.execucao_liberada_em is null then
    raise exception 'Esta visita não está liberada';
  end if;

  perform set_config('app.liberando_execucao', 'on', true);
  update public.manutencoes
    set execucao_liberada_em = null,
        execucao_liberada_por = null
    where id = p_id;

  insert into public.historico_execucao (
    manutencao_id, acao, prestador_anterior_id, responsavel_id
  ) values (
    p_id, 'retirada', visita.prestador_id, auth.uid()
  );
end;
$$;

create or replace function public.trocar_prestador_visita(p_id uuid, p_prestador uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  visita public.manutencoes%rowtype;
  prestador_ativo boolean;
  liberada boolean;
begin
  if not public.is_admin() then
    raise exception 'Somente o ADM troca o prestador';
  end if;

  select * into visita
  from public.manutencoes
  where id = p_id
  for update;

  if not found then
    raise exception 'Visita não encontrada';
  end if;

  if visita.registro_anterior then
    raise exception 'Visita anterior não tem execução';
  end if;

  if visita.status <> 'programada' then
    raise exception 'Só é possível trocar o prestador de uma visita programada';
  end if;

  if p_prestador is null or p_prestador is not distinct from visita.prestador_id then
    raise exception 'Selecione outro prestador';
  end if;

  select ativo into prestador_ativo
  from public.prestadores
  where id = p_prestador;

  if not found or prestador_ativo is not true then
    raise exception 'Selecione o prestador';
  end if;

  liberada := visita.execucao_liberada_em is not null;

  perform set_config('app.trocando_prestador', 'on', true);
  if liberada then
    perform set_config('app.liberando_execucao', 'on', true);
  end if;

  update public.manutencoes
    set prestador_id = p_prestador,
        execucao_liberada_em = case when liberada then null else execucao_liberada_em end,
        execucao_liberada_por = case when liberada then null else execucao_liberada_por end
    where id = p_id;

  insert into public.historico_execucao (
    manutencao_id, acao, prestador_anterior_id, prestador_novo_id, responsavel_id
  ) values (
    p_id, 'troca_prestador', visita.prestador_id, p_prestador, auth.uid()
  );

  if liberada then
    insert into public.historico_execucao (
      manutencao_id, acao, prestador_anterior_id, responsavel_id
    ) values (
      p_id, 'retirada', visita.prestador_id, auth.uid()
    );
  end if;
end;
$$;

revoke all on function public.liberar_execucao(uuid) from public, anon;
revoke all on function public.retirar_liberacao_execucao(uuid) from public, anon;
revoke all on function public.trocar_prestador_visita(uuid, uuid) from public, anon;
grant execute on function public.liberar_execucao(uuid) to authenticated;
grant execute on function public.retirar_liberacao_execucao(uuid) to authenticated;
grant execute on function public.trocar_prestador_visita(uuid, uuid) to authenticated;

alter table public.historico_execucao enable row level security;

drop policy if exists admin_le_historico_execucao on public.historico_execucao;
create policy admin_le_historico_execucao on public.historico_execucao
  for select to authenticated
  using (public.is_admin());

revoke all on table public.historico_execucao from public, anon, authenticated;
grant select on table public.historico_execucao to authenticated;
