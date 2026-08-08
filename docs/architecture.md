# Architecture

## Overview

This project follows a strict layered architecture with clear separation of concerns:

```
Frontend (React/Vite)
        ↓
    API Contract (DTOs/Schemas)
        ↓
Backend (Express/Node.js)
        ↓
Domain Layer (Services)
        ↓
Repository Interfaces
        ↓
Database Adapter (Drizzle ORM)
        ↓
PostgreSQL Database
```

## Frontend Architecture

- **UI Components**: Reusable React components with Tailwind CSS
- **Pages**: Full-page components managing routes
- **Services**: API communication layer
- **Hooks**: Custom React hooks for business logic
- **Features**: Feature-specific modules
- **Store**: Local state management (IndexedDB for offline support)

### Key Libraries

- **React Router**: Client-side routing
- **TanStack Query**: Server state management and caching
- **Axios**: HTTP client
- **Dexie.js**: IndexedDB wrapper for offline storage
- **Tailwind CSS**: Utility-first CSS framework

## Backend Architecture

### Layers

1. **API Layer** (`src/api/`)
   - Express routes
   - Request/response handling
   - Error middleware

2. **Domain Layer** (`src/domain/`)
   - Business logic services
   - Domain models
   - Use cases

3. **Data Layer** (`src/db/`)
   - Repository interfaces
   - Database schema
   - Migrations
   - Database adapters

### Key Principles

- **Repository Pattern**: Database access abstracted behind interfaces
- **Dependency Injection**: Services receive dependencies
- **Type Safety**: Full TypeScript coverage
- **Validation**: Zod schemas at API boundaries

### External Integrations

External APIs and services are isolated:

- **MetadataProvider Interface**
  - OpenLibraryProvider (default)
  - GoogleBooksProvider (fallback)
  - Custom providers can be added

- **RetailerImporter Interface**
  - Individual retailer implementations
  - Easy to add new retailers without changing core

## Shared Layer

Located in `shared/` package:

- **Types**: TypeScript interfaces (Book, Collection)
- **Schemas**: Zod validation schemas
- **Constants**: Shared constants

**Important**: No implementation code, only contracts.

## Database Design

### Why Drizzle ORM?

- Type-safe queries with TypeScript inference
- Lightweight with minimal boilerplate
- Zero-runtime overhead
- Excellent migration support
- Works seamlessly with both PostgreSQL and SQLite

### Repository Pattern

```typescript
interface IBookRepository {
  create(book: CreateBook): Promise<Book>;
  findById(id: string): Promise<Book | null>;
  findAll(): Promise<Book[]>;
  update(id: string, book: UpdateBook): Promise<Book>;
  delete(id: string): Promise<void>;
}
```

This allows:
- Easy database switching (PostgreSQL ↔ SQLite)
- Testability with mock repositories
- Clear contracts

## API Contract

The frontend and backend communicate through well-defined DTOs:

```typescript
// Request
POST /api/books
{
  isbn: "978-0-123456-78-9",
  title: "Example Book",
  author: "Author Name"
}

// Response
{
  id: "uuid",
  isbn: "978-0-123456-78-9",
  title: "Example Book",
  author: "Author Name",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z"
}
```

## Deployment Architecture

### Docker Compose (Local/Development)

```yaml
- Database: PostgreSQL container
- Backend: Node.js container with hot-reload
- Frontend: Nginx container serving React app
```

### Production Considerations

- **Frontend**: Static build served by Nginx/CDN
- **Backend**: Node.js service (cloud-ready)
- **Database**: Managed PostgreSQL or self-hosted

The architecture supports:
- Horizontal scaling of backends
- Database read replicas
- Caching layers
- CDN for frontend assets

## Code Organization

### Frontend Structure
```
frontend/src/
├── components/    # Reusable React components
├── pages/         # Full-page components
├── features/      # Feature-specific modules
├── hooks/         # Custom React hooks
├── services/      # API communication
├── domain/        # Domain models
├── config/        # Configuration
└── store/         # State management
```

### Backend Structure
```
backend/src/
├── api/           # Routes and middleware
├── domain/        # Services and business logic
├── db/            # Schema and migrations
├── config/        # Configuration
└── providers/     # External service adapters
```

## Key Architectural Decisions

1. **No Monolithic API**: Services are modular and replaceable
2. **No Frontend Database Access**: All data flows through backend
3. **Type Safety First**: TypeScript throughout
4. **Open Source Preference**: Avoid vendor lock-in
5. **Clear Boundaries**: Frontend/Backend/Database strictly separated
6. **Repository Pattern**: Abstract database implementation

## Security Considerations

- API credentials stored server-side only
- No sensitive data exposed to frontend
- Validation at API boundaries
- CORS configured appropriately
- Database migration versioning

## Testing Strategy

- **Unit Tests**: Individual services and components
- **Integration Tests**: API endpoints
- **E2E Tests**: User workflows (future)

## Future Extensibility

- Add authentication (JWT/OAuth)
- Add WebSocket support for real-time updates
- Implement caching layers (Redis)
- Add API rate limiting
- Support multiple databases (PostgreSQL/SQLite switching)
- Deploy to Kubernetes
