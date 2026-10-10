-- ELEVA Manutenção — Fase 4
-- Garante o bucket privado de fotos e as permissões do prestador.
-- A migration anterior pode já constar como aplicada sem estas políticas.

insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', false), ('pdfs', 'pdfs', false)
on conflict (id) do update set public = false;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'fotos_admin') then
    create policy fotos_admin on storage.objects
      for all to authenticated
      using (bucket_id = 'fotos' and public.is_admin())
      with check (bucket_id = 'fotos' and public.is_admin());
  end if;

  if not exists (select 1 from pg_policies where policyname = 'pdfs_admin') then
    create policy pdfs_admin on storage.objects
      for all to authenticated
      using (bucket_id = 'pdfs' and public.is_admin())
      with check (bucket_id = 'pdfs' and public.is_admin());
  end if;

  if not exists (select 1 from pg_policies where policyname = 'fotos_prestador_select') then
    create policy fotos_prestador_select on storage.objects
      for select to authenticated
      using (
        bucket_id = 'fotos'
        and public.is_prestador()
        and exists (
          select 1
          from public.manutencoes m
          where m.id::text = (storage.foldername(name))[1]
            and m.prestador_id = public.prestador_id_atual()
        )
      );
  end if;

  if not exists (select 1 from pg_policies where policyname = 'fotos_prestador_insert') then
    create policy fotos_prestador_insert on storage.objects
      for insert to authenticated
      with check (
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
  end if;
end $$;
