# Setup Steps

Follow these steps to get the project running:

## 1. Clone and Install

```bash
git clone https://github.com/tdouillard/libray-app.git
cd libray-app
npm install --workspaces
```

## 2. Configure Environment

```bash
cd backend
cp .env.example .env
# Edit .env if needed
cd ..
```

## 3. Database Setup

### Option A: Docker (Recommended for development)

```bash
docker-compose up db -d
npm run db:migrate -w backend
```

### Option B: Local PostgreSQL

```bash
# Create database
createdb libray_db

# Update DATABASE_URL in backend/.env
# Then run migrations
npm run db:migrate -w backend
```

## 4. Start Development Servers

In separate terminals:

```bash
# Terminal 1: Backend
npm run dev -w backend

# Terminal 2: Frontend
npm run dev -w frontend
```

## 5. Access Application

- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- API Documentation: See docs/api.md

## Full Stack with Docker

```bash
docker-compose up
```

Then access:
- Frontend: http://localhost
- API: http://localhost/api
- Database: localhost:5432

## Troubleshooting

### Database Connection Issues

1. Check DATABASE_URL in backend/.env
2. Ensure PostgreSQL is running
3. Verify database exists: `psql -U postgres -l | grep libray`

### Port Already in Use

- Frontend (5173): Change in `frontend/vite.config.ts`
- Backend (3000): Set PORT environment variable
- Database (5432): Change in `docker-compose.yml`

### Module Not Found Errors

```bash
npm install --workspaces
npm run build -w shared
```

## Next Steps

1. Read [docs/architecture.md](../docs/architecture.md) for architectural overview
2. Check [docs/technology-decisions.md](../docs/technology-decisions.md) for tech stack rationale
3. See [README.md](../README.md) for API documentation
