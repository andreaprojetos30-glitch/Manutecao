-- Buckets privados. No Supabase o schema storage já existe.
-- Fotos: ADM vê tudo; prestador lê e envia só na pasta da visita atribuída e ainda aberta.
-- PDFs: somente ADM.

insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', false), ('pdfs', 'pdfs', false)
on conflict (id) do nothing;

alter table storage.objects enable row level security;

create policy fotos_admin on storage.objects
  for all to authenticated
  using (bucket_id = 'fotos' and public.is_admin())
  with check (bucket_id = 'fotos' and public.is_admin());

create policy pdfs_admin on storage.objects
  for all to authenticated
  using (bucket_id = 'pdfs' and public.is_admin())
  with check (bucket_id = 'pdfs' and public.is_admin());

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

grant usage on schema storage to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;
