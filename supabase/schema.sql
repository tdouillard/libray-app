-- Library data model, installed in libray-app's own Supabase project (auth.users holds its accounts).
-- Every row belongs to the user who created it; Row Level Security restricts access to the owner.
-- Safe to run several times.

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  isbn text not null default '',
  title text not null,
  author text not null default '',
  year integer not null default 0,
  status text not null default 'owned' check (status in ('owned', 'wishlist', 'reading', 'borrowed')),
  description text not null default '',
  tags text[] not null default '{}',
  cover text not null default '',
  rating numeric not null default 0,
  created_at timestamptz not null default now()
);
-- Added after the first release: Book / BD / Manga. Idempotent for existing databases.
alter table public.books add column if not exists kind text not null default 'Book';
alter table public.books drop constraint if exists books_kind_check;
alter table public.books add constraint books_kind_check check (kind in ('Book', 'BD', 'Manga'));
-- Detail fields: volume, editor, and the writer / artist split used for BD and Manga.
alter table public.books add column if not exists writer text not null default '';
alter table public.books add column if not exists artist text not null default '';
alter table public.books add column if not exists volume text not null default '';
alter table public.books add column if not exists publisher text not null default '';
alter table public.books add column if not exists editor_collection text not null default '';
alter table public.books add column if not exists original_title text not null default '';
create index if not exists books_user_idx on public.books (user_id);

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  description text not null default '',
  accent text not null default '',
  type text not null default 'Default' check (type in ('Default', 'Series', 'Author', 'Theme', 'Wishlist')),
  created_at timestamptz not null default now()
);
create index if not exists collections_user_idx on public.collections (user_id);

create table if not exists public.collection_books (
  collection_id uuid not null references public.collections (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (collection_id, book_id)
);
create index if not exists collection_books_book_idx on public.collection_books (book_id);

alter table public.books enable row level security;
alter table public.collections enable row level security;
alter table public.collection_books enable row level security;

drop policy if exists "books: owner" on public.books;
drop policy if exists "collections: owner" on public.collections;
drop policy if exists "collection_books: owner" on public.collection_books;

create policy "books: owner" on public.books for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "collections: owner" on public.collections for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- A link is only allowed between a collection and a book that both belong to the caller.
create policy "collection_books: owner" on public.collection_books for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.collections c where c.id = collection_id and c.user_id = (select auth.uid()))
    and exists (select 1 from public.books b where b.id = book_id and b.user_id = (select auth.uid()))
  );

revoke all on public.books, public.collections, public.collection_books from anon;
grant select, insert, update, delete on public.books, public.collections, public.collection_books to authenticated;

-- Profile photos: private bucket, JPEG only, 2 MB, one file per user at "<user id>/avatar.jpg".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('avatars', 'avatars', false, 2097152, array['image/jpeg'])
  on conflict (id) do update set public = false, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg'];

drop policy if exists "avatars: own read" on storage.objects;
drop policy if exists "avatars: own insert" on storage.objects;
drop policy if exists "avatars: own update" on storage.objects;
drop policy if exists "avatars: own delete" on storage.objects;

create policy "avatars: own read" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar.jpg');
create policy "avatars: own insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar.jpg');
create policy "avatars: own update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar.jpg')
  with check (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar.jpg');
create policy "avatars: own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar.jpg');

-- Deletes the signed-in account. Only allowed shortly after signing in (the session must be under 10 minutes old).
-- Books, collections and their links are removed by cascade.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  sid uuid := nullif((select auth.jwt()) ->> 'session_id', '')::uuid;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if not exists (select 1 from auth.sessions s where s.id = sid and s.created_at > now() - interval '10 minutes') then
    raise exception 'recent_login_required';
  end if;
  delete from auth.users where id = uid;
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- Administrators. Add one by hand (SQL editor), there is deliberately no way to become admin from the app:
--   insert into public.admins (user_id) select id from auth.users where email = 'you@example.com' on conflict do nothing;
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.admins enable row level security;
drop policy if exists "admins: read own" on public.admins;
create policy "admins: read own" on public.admins for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.admins from anon, authenticated;
grant select on public.admins to authenticated;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()))
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Why a scanned ISBN could not be identified. Any user writes their own failures, only admins read or purge them.
create table if not exists public.scan_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  user_email text not null default '',
  isbn text not null,
  kind text not null default 'Book',
  reason text not null check (reason in ('not-found', 'error', 'invalid')),
  trace jsonb not null default '[]'::jsonb,
  user_agent text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists scan_logs_created_idx on public.scan_logs (created_at desc);
alter table public.scan_logs enable row level security;

drop policy if exists "scan_logs: insert own" on public.scan_logs;
drop policy if exists "scan_logs: admin read" on public.scan_logs;
drop policy if exists "scan_logs: admin delete" on public.scan_logs;
create policy "scan_logs: insert own" on public.scan_logs for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "scan_logs: admin read" on public.scan_logs for select to authenticated using ((select public.is_admin()));
create policy "scan_logs: admin delete" on public.scan_logs for delete to authenticated using ((select public.is_admin()));

revoke all on public.scan_logs from anon;
grant select, insert, delete on public.scan_logs to authenticated;
