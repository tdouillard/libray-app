# Contributing

## Development Setup

See [docs/setup.md](setup.md) for initial setup instructions.

## Branch Naming

- `feature/feature-name` - New features
- `bugfix/bug-name` - Bug fixes
- `docs/doc-name` - Documentation updates
- `refactor/refactor-name` - Code refactoring

## Commit Messages

Follow conventional commits:

```
feat: Add new feature
fix: Fix bug
docs: Update documentation
refactor: Refactor code
test: Add tests
chore: Maintenance tasks
```

## Pull Request Process

1. Create a feature branch from `dev`
2. Make your changes
3. Test thoroughly
4. Submit PR with clear description
5. Ensure CI passes
6. Get code review approval
7. Merge to `dev`

## Code Style

### TypeScript

- Use strict mode
- No `any` types
- Prefer interfaces over types for objects
- Document complex logic with comments

### React

- Functional components only
- Use hooks for state management
- Prop types from shared package
- Keep components under 200 lines

### Backend

- Use async/await
- Keep functions focused and under 50 lines
- Use dependency injection
- Repository pattern for data access

## Testing

- Write tests for new features
- Maintain >80% coverage
- Test edge cases
- Use descriptive test names

```bash
npm run test --workspaces
```

## Documentation

- Update README.md for user-facing changes
- Update docs/ for architectural changes
- Add JSDoc comments for public APIs
- Keep CHANGELOG.md updated

## Database Changes

When modifying the database schema:

1. Update `backend/src/db/schema.ts`
2. Generate migration: `npm run db:generate -w backend`
3. Review generated migration file
4. Test migration locally
5. Commit migration with schema changes

## Release Process

1. Update version in root package.json
2. Update CHANGELOG.md
3. Create release branch
4. Update documentation
5. Tag release on GitHub
6. Deploy to production

## Questions?

Open an issue or contact the maintainers.

## Code of Conduct

Be respectful and inclusive. Harassment will not be tolerated.
