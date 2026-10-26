-- ELEVA Manutenção — o link público encerra quando a confirmação é gravada.
-- A leitura pública deixa de devolver o comprovante e os dados da visita.
-- A confirmação, o histórico e o arquivo privado permanecem.
-- Esta migration não altera manutenções nem reescreve confirmações.

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
