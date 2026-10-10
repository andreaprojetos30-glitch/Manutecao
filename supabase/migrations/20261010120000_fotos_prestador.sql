-- ELEVA Manutenção — Fase 4
-- O prestador substitui a foto da ocorrência enquanto a visita atribuída
-- ainda está programada ou em execução. O bucket continua privado.

create policy fotos_prestador_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'fotos'
    and public.is_prestador()
    and exists (
      select 1
      from public.manutencoes m
      where m.id::text = (storage.foldername(name))[1]
        and m.prestador_id = public.prestador_id_atual()
        and m.status in ('programada', 'em_execucao')
    )
  );
