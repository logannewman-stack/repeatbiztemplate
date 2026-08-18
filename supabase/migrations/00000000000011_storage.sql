-- ============================================================================
-- 0011 — STORAGE BUCKETS
-- ============================================================================
-- Three buckets, split by who is allowed to see what:
--
--   brand   public   logos, hero images. Served straight from a CDN URL and
--                    embedded in emails, so it must be readable anonymously.
--   media   public   service and product photography for the booking page.
--   client  private  before/after photos, signed consent forms, documents.
--                    Reachable only through a signed URL.
--
-- Buckets are created idempotently so `db push` can be re-run safely.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('brand',  'brand',  true,  5242880,
   array['image/png','image/jpeg','image/webp','image/svg+xml','image/avif']),
  ('media',  'media',  true,  10485760,
   array['image/png','image/jpeg','image/webp','image/avif']),
  ('client', 'client', false, 20971520,
   array['image/png','image/jpeg','image/webp','image/heic','application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
-- Uploads all go through server routes holding the service-role key, which
-- bypasses these. They exist to make direct-from-browser reads safe, and to
-- ensure that a leaked anon key still cannot write to a bucket or read a
-- client's consent form.

drop policy if exists "public read brand" on storage.objects;
create policy "public read brand" on storage.objects
  for select using (bucket_id = 'brand');

drop policy if exists "public read media" on storage.objects;
create policy "public read media" on storage.objects
  for select using (bucket_id = 'media');

-- Managers may replace brand assets from the browser.
drop policy if exists "managers write brand" on storage.objects;
create policy "managers write brand" on storage.objects
  for all
  using (bucket_id in ('brand', 'media') and auth_is_manager())
  with check (bucket_id in ('brand', 'media') and auth_is_manager());

-- Client files: staff of the business see everything; a client sees only
-- their own, and only files flagged visible in `client_files`.
drop policy if exists "staff read client files" on storage.objects;
create policy "staff read client files" on storage.objects
  for select using (bucket_id = 'client' and auth_is_staff());

drop policy if exists "staff write client files" on storage.objects;
create policy "staff write client files" on storage.objects
  for all
  using (bucket_id = 'client' and auth_is_staff())
  with check (bucket_id = 'client' and auth_is_staff());

drop policy if exists "clients read own files" on storage.objects;
create policy "clients read own files" on storage.objects
  for select using (
    bucket_id = 'client'
    and exists (
      select 1 from client_files cf
      where cf.storage_path = storage.objects.name
        and cf.client_visible
        and cf.client_id in (select auth_client_ids())
    )
  );
