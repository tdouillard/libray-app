# Technology Decisions

## Overview

This document outlines the major technology choices for the libray-app project and the rationale behind them.

---

## Frontend

**Framework**: React with TypeScript
- Modern, widely-adopted component-based framework
- Excellent TypeScript support
- Large ecosystem for UI components and libraries
- Good mobile web support with progressive web app capabilities

**Build Tool**: Vite
- Fast, modern build tool with excellent developer experience
- TypeScript support out-of-the-box
- Hot module replacement for rapid development
- Smaller bundle sizes compared to Create React App

**UI Library**: shadcn/ui (built on Radix UI)
- Open-source component library
- Accessible components
- Highly customizable
- No dependency lock-in

**State Management**: TanStack Query (React Query)
- Open-source server state management
- Built-in caching and synchronization
- Great for API-driven applications
- Reduces frontend complexity

**Local Storage**: IndexedDB via dexie.js
- Open-source wrapper around IndexedDB
- Supports offline-first scenarios
- Simple API for complex queries
- Good TypeScript support

**Barcode Scanning**: @zxing/library
- Open-source, actively maintained
- Browser-based barcode detection
- Supports multiple barcode formats
- No external service dependency

---

## Backend

**Framework**: Express.js with TypeScript
- Lightweight, flexible Node.js framework
- Excellent TypeScript support
- Mature ecosystem
- Simple to understand and maintain

**Runtime**: Node.js (LTS)
- Widely adopted for backend services
- Good performance
- Excellent tooling ecosystem

**Validation**: Zod
- Open-source TypeScript-first schema validation
- Type inference from schemas
- Used for API boundary validation

---

## Database

**Primary DB**: PostgreSQL
- Open-source, mature, reliable
- Excellent for complex queries
- Good TypeScript ORM support
- Self-hostable
- Great for production workloads

**ORM**: Drizzle ORM
- Lightweight TypeScript ORM
- Type-safe queries
- Zero-runtime overhead approach
- Good migration support
- Repository pattern friendly

**Alternative for Self-Hosting**: SQLite via Turso
- Open-source SQLite with Turso SDK
- Lightweight for small deployments
- Edge-friendly
- Repository pattern allows easy switching

**Migrations**: Drizzle Kit
- Type-safe migrations
- Version controlled schema changes
- Works with both PostgreSQL and SQLite

---

## External Integrations

**Book Metadata**: Open Library API
- Open-source, free public API
- Good coverage of ISBN/book data
- No authentication required
- No rate-limiting concerns for moderate use
- Fallback to Google Books API if needed

**Authentication**: JWT (if needed)
- Open standard
- No third-party service dependency
- Simple to implement
- Works well with stateless backends

---

## Testing

**Unit/Integration Tests**: Vitest
- Fast, TypeScript-native test runner
- Drop-in replacement for Jest
- Great developer experience
- Open-source

**API Testing**: Supertest
- Open-source library for testing HTTP assertions
- Works well with Express
- Simple, readable API

---

## DevOps & Deployment

**Containerization**: Docker
- Open-source container platform
- Industry standard
- Reproducible deployments
- Works everywhere

**Composition**: Docker Compose
- Orchestrate frontend, backend, database locally
- Simple deployment definition
- Good for development and small production setups

**CI/CD**: GitHub Actions
- Free tier
- Native GitHub integration
- YAML-based workflow definition

---

## Shared Infrastructure

**Package Management**: npm Workspaces
- Built-in to npm
- No additional tooling required
- Lightweight monorepo setup
- Easy for developers to understand

**Shared Types**: TypeScript interfaces in shared/ package
- Single source of truth for API contracts
- Reduces duplication
- Type-safe frontend-backend communication

---

## Open-Source Justifications

- **All major dependencies are open-source or have viable open-source alternatives**
- No proprietary SaaS lock-in
- The entire stack can be self-hosted
- Good community support and long-term viability
- Lightweight, no unnecessary bloat
