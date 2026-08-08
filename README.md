# libray-app

A book and BD (comic) collection management application with a modern web stack.

## Technology Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Express.js + TypeScript + Node.js
- **Database**: PostgreSQL with Drizzle ORM
- **Package Management**: npm workspaces
- **Containerization**: Docker & Docker Compose

For detailed technology choices, see [docs/technology-decisions.md](docs/technology-decisions.md).

## Project Structure

```
project-root/
├── frontend/          # React app (Vite)
├── backend/           # Express.js API
├── shared/            # Shared types and schemas
├── database/          # Database migrations
├── docker-compose.yml # Local development setup
└── docs/              # Documentation
```

## Prerequisites

- Node.js 20+ (LTS)
- npm 10+
- Docker & Docker Compose (optional, for containerized setup)

## Quick Start

### Local Development

1. **Install dependencies**:
   ```bash
   npm install --workspaces
   ```

2. **Set up environment variables**:
   ```bash
   cp backend/.env.example backend/.env
   ```

3. **Start the database** (requires Docker):
   ```bash
   docker-compose up db -d
   ```

4. **Run migrations**:
   ```bash
   npm run db:migrate -w backend
   ```

5. **Start frontend and backend**:
   ```bash
   # Terminal 1: Backend
   npm run dev -w backend

   # Terminal 2: Frontend
   npm run dev -w frontend
   ```

Frontend: http://localhost:5173
Backend: http://localhost:3000

### Docker Compose (Full Stack)

```bash
docker-compose up
```

Access:
- Frontend: http://localhost
- Backend API: http://localhost/api
- Database: localhost:5432

## Scripts

### Available Commands

**Root level** (run all workspaces):
```bash
npm install --workspaces   # Install all dependencies
npm run build --workspaces # Build all packages
npm run test --workspaces  # Run all tests
npm run lint --workspaces  # Run linters
```

**Backend**:
```bash
npm run dev -w backend           # Development with watch mode
npm run build -w backend         # Build backend
npm run start -w backend         # Start production build
npm run test -w backend          # Run tests
npm run db:migrate -w backend    # Run database migrations
npm run db:generate -w backend   # Generate migration files
```

**Frontend**:
```bash
npm run dev -w frontend      # Development server
npm run build -w frontend    # Production build
npm run preview -w frontend  # Preview production build
npm run lint -w frontend     # Run linter
```

**Shared**:
```bash
npm run build -w shared # Build shared types package
npm run dev -w shared   # Watch mode development
```

## API Endpoints

### Books
- `GET /api/books` - Get all books
- `POST /api/books` - Create a new book
- `GET /api/books/:id` - Get a specific book
- `PUT /api/books/:id` - Update a book
- `DELETE /api/books/:id` - Delete a book

### Collections
- `GET /api/collections` - Get all collections
- `POST /api/collections` - Create a new collection
- `GET /api/collections/:id` - Get a specific collection
- `PUT /api/collections/:id` - Update a collection
- `DELETE /api/collections/:id` - Delete a collection
- `POST /api/collections/:id/books` - Add book to collection
- `DELETE /api/collections/:id/books/:bookId` - Remove book from collection

## Database Schema

### Books Table
- `id` (UUID, primary key)
- `isbn` (string, unique)
- `title` (string)
- `author` (string)
- `publisher` (string, optional)
- `publishedDate` (string, optional)
- `description` (text, optional)
- `imageUrl` (text, optional)
- `pageCount` (integer, optional)
- `categories` (string, optional)
- `createdAt` (timestamp)
- `updatedAt` (timestamp)

### Collections Table
- `id` (UUID, primary key)
- `name` (string)
- `description` (text, optional)
- `createdAt` (timestamp)
- `updatedAt` (timestamp)

### Collection Books Table
- `id` (UUID, primary key)
- `collectionId` (UUID, foreign key)
- `bookId` (UUID, foreign key)
- `createdAt` (timestamp)

## Development Workflow

1. Make changes in `frontend/`, `backend/`, or `shared/`
2. Frontend changes reload via Vite HMR
3. Backend changes trigger tsx watch
4. For database changes:
   - Modify schema in `backend/src/db/schema.ts`
   - Generate migration: `npm run db:generate -w backend`
   - Apply migration: `npm run db:migrate -w backend`

## Testing

```bash
npm run test --workspaces
```

## Building for Production

```bash
npm run build --workspaces
docker-compose -f docker-compose.prod.yml up
```

## Contributing

See CONTRIBUTING.md for guidelines.

## License

MIT
