# Environment Variables

## Supabase (auth + database)

libray-app has its own Supabase project (separate from `expense-split`): users sign in with
email/password and the library tables live in that project's Postgres database.

1. `cp .env.example .env` at the repo root and fill it in: `SUPABASE_URL`, the publishable key,
   `SUPABASE_DB_PASSWORD`, and for the pooler `SUPABASE_DB_HOST` / `SUPABASE_DB_USER`
   (`postgres.<project-ref>`; the host may carry its port, otherwise use `SUPABASE_DB_PORT`).
   The frontend build only picks up the URL and publishable key, never the DB password.
   For GitHub Pages, set the repository variables `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`.
2. Create the tables: `npm run db:setup -w backend`. This applies `supabase/schema.sql`
   (books, collections, collection_books, owner-only Row Level Security). The `db` GitHub workflow
   (environment `db-production`) does the same on merges to `dev`.
3. Create your account in the Supabase dashboard (Authentication > Users > Add user). The app only
   offers sign-in, no sign-up.

4. Password reset and email-change links redirect back to the app. In Supabase, go to Authentication >
   URL Configuration and add the app URLs to **Redirect URLs** (e.g. `https://<user>.github.io/libray-app/`
   and `http://localhost:5173/`); links to a URL that is not listed fall back to the Site URL.

The Express backend and local Docker Postgres described below are no longer used by the frontend.

## Backend

Create a `.env` file in the backend directory:

```bash
cp backend/.env.example backend/.env
```

### Required Variables

- `DATABASE_URL` - PostgreSQL connection string
  - Local: `postgresql://postgres:postgres@localhost:5432/libray_db`
  - Docker Compose: `postgresql://postgres:postgres@db:5432/libray_db`

### Optional Variables

- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)

## Frontend

No environment variables required for development. 

For deployment, the frontend automatically proxies API calls to `/api` through Vite's proxy configuration.
