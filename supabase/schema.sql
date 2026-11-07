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
