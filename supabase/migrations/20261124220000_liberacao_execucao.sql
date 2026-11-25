-- ELEVA Manutenção — a programação não libera a execução.
-- Preventiva, avulsa, corretiva e retorno nascem sem liberação.
-- O ADM continua vendo toda a agenda. O celular só recebe a visita liberada.
-- Visita já iniciada ou encerrada permanece no histórico do prestador.
-- Esta migration não reescreve dados de manutenção já gravados e não publica em produção.

alter table public.manutencoes
  add column if not exists execucao_liberada_em timestamptz,
  add column if not exists execucao_liberada_por uuid references public.usuarios (id);

comment on column public.manutencoes.execucao_liberada_em is
  'Momento em que o ADM liberou a execução para o prestador. Nulo enquanto a visita está só na programação.';

update public.manutencoes
  set execucao_liberada_em = coalesce(finalizada_em, updated_at, created_at)
  where status <> 'programada'
    and execucao_liberada_em is null;

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

create or replace function public.exigir_execucao(p_visita public.manutencoes)
returns void
language plpgsql
stable
as $$
begin
  if auth.uid() is null or not (public.is_admin() or public.is_prestador()) then
    raise exception 'Sem acesso operacional';
  end if;

  if p_visita.execucao_liberada_em is null then
    raise exception 'A execução ainda não foi liberada';
  end if;

  if p_visita.status not in ('programada', 'em_execucao') then
    raise exception 'Visita encerrada para edição do prestador';
  end if;

  if public.is_prestador()
     and p_visita.prestador_id is distinct from public.prestador_id_atual() then
    raise exception 'Visita não atribuída';
  end if;
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
end;
$$;

revoke all on function public.liberar_execucao(uuid) from public, anon;
grant execute on function public.liberar_execucao(uuid) to authenticated;

drop policy if exists prestador_le_visita on public.manutencoes;
create policy prestador_le_visita on public.manutencoes
  for select to authenticated
  using (
    public.is_prestador()
    and prestador_id = public.prestador_id_atual()
    and registro_anterior is not true
    and execucao_liberada_em is not null
  );
