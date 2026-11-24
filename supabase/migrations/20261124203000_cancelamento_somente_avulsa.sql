-- ELEVA Manutenção — cancelamento somente de manutenção avulsa.
-- Visita preventiva do contrato não cancela: a data muda pelo reagendamento.
-- O reagendamento preserva numeração, saldo e histórico.
-- A retirada de visitas intactas anteriores à implantação não é cancelamento.
-- Esta migration não reescreve manutenções já gravadas e não publica em produção.

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

create or replace function public.cancelar_manutencao(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  visita public.manutencoes%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Somente o ADM pode cancelar uma visita';
  end if;

  select * into visita
  from public.manutencoes
  where id = p_id
  for update;

  if not found then
    raise exception 'Visita não encontrada';
  end if;

  if visita.tipo = 'preventiva' then
    raise exception 'Visita preventiva do contrato não pode ser cancelada';
  end if;

  if visita.tipo is distinct from 'avulsa'
     or visita.contrato_id is not null
     or visita.numero_visita is not null then
    raise exception 'Somente manutenção avulsa pode ser cancelada';
  end if;

  if visita.status in ('realizada', 'aguardando_administracao', 'cancelada') then
    raise exception 'Visita já encerrada';
  end if;

  perform set_config('app.cancelando', 'on', true);

  update public.manutencoes
    set status = 'cancelada'
    where id = p_id;
end;
$$;

create or replace function public.reagendar_visita(p_id uuid, p_data date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  visita public.manutencoes%rowtype;
  gravada public.manutencoes%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Somente o ADM pode reagendar';
  end if;

  select * into visita
  from public.manutencoes
  where id = p_id
  for update;

  if not found then
    raise exception 'Visita não encontrada';
  end if;

  if visita.status <> 'programada' then
    raise exception 'Só é possível reagendar uma visita programada';
  end if;

  if p_data is null then
    raise exception 'Informe a data';
  end if;

  if p_data = visita.data_programada_atual then
    raise exception 'Informe uma data diferente da atual';
  end if;

  update public.manutencoes
    set data_programada_atual = p_data
    where id = p_id;

  select * into gravada
  from public.manutencoes
  where id = p_id;

  if gravada.numero_visita is distinct from visita.numero_visita
     or gravada.contrato_id is distinct from visita.contrato_id
     or gravada.tipo is distinct from visita.tipo
     or gravada.status is distinct from visita.status
     or gravada.registro_anterior is distinct from visita.registro_anterior
     or gravada.data_programada_original is distinct from visita.data_programada_original
     or gravada.condominio_id is distinct from visita.condominio_id
     or gravada.data_programada_atual is distinct from p_data then
    raise exception 'O reagendamento preserva a numeração, o saldo e o histórico da visita';
  end if;
end;
$$;
