# Environment Variables

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
