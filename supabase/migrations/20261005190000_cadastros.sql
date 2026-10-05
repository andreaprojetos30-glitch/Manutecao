-- ELEVA Manutenção — Fase 2
-- Troca de síndico encerra o atual e grava outro. Não altera nome,
-- WhatsApp nem e-mail de quem já estava no histórico.

create index if not exists sindicos_condominio_idx
  on public.sindicos (condominio_id);

create or replace function public.registrar_sindico(
  p_condominio_id uuid,
  p_nome text,
  p_whatsapp text,
  p_email text,
  p_data_inicio date
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  atual public.sindicos%rowtype;
  novo_id uuid;
  fim date;
  nome_limpo text;
begin
  if not public.is_admin() then
    raise exception 'Somente o ADM cadastra síndico';
  end if;

  if not exists (select 1 from public.condominios where id = p_condominio_id) then
    raise exception 'Condomínio não encontrado';
  end if;

  nome_limpo := nullif(trim(coalesce(p_nome, '')), '');
  if nome_limpo is null then
    raise exception 'Informe o nome do síndico';
  end if;

  if p_data_inicio is null then
    raise exception 'Informe a data de início';
  end if;

  select * into atual
  from public.sindicos
  where condominio_id = p_condominio_id
    and ativo
  for update;

  if found then
    if atual.data_inicio is not null and p_data_inicio < atual.data_inicio then
      raise exception 'A data de início precisa ser igual ou posterior à do síndico atual';
    end if;

    fim := p_data_inicio - 1;
    if atual.data_inicio is not null and fim < atual.data_inicio then
      fim := atual.data_inicio;
    end if;

    update public.sindicos
      set ativo = false,
          data_fim = fim
      where id = atual.id;
  end if;

  insert into public.sindicos (
    condominio_id, nome, whatsapp, email, data_inicio, ativo
  ) values (
    p_condominio_id,
    nome_limpo,
    nullif(trim(coalesce(p_whatsapp, '')), ''),
    nullif(trim(coalesce(p_email, '')), ''),
    p_data_inicio,
    true
  )
  returning id into novo_id;

  return novo_id;
end;
$$;

revoke all on function public.registrar_sindico(uuid, text, text, text, date) from public;
grant execute on function public.registrar_sindico(uuid, text, text, text, date) to authenticated;
