# Contributing to Tatame Pro

## Setup

```bash
git clone https://github.com/Comandos08/tatame-pro.git
cd tatame-pro
npm ci
cp .env.example .env
# Fill in .env with your Supabase credentials
npm run dev
```

## Development Workflow

1. Create a feature branch from `main`: `git checkout -b feature/my-feature`
2. Make changes following the code standards below
3. Run checks: `npm run lint && npm run build && npm run test`
4. Commit with a descriptive message (see conventions below)
5. Push and create a Pull Request

## Code Standards

### TypeScript
- Strict mode enabled
- No `any` in domain code (governance G1)
- Use explicit return types for exported functions

### Components
- Use shadcn/ui components from `src/components/ui/`
- Follow existing patterns in `src/components/`
- All user-facing text must use i18n keys via `useI18n()`

### Edge Functions
- Use `createBackendLogger()` — never `console.log` (governance G7)
- Use institutional error envelope from `_shared/errors/envelope.ts`
- Import CORS from `_shared/cors.ts`
- Validate auth via Bearer token + Supabase `getUser()`

### Database
- All migrations are additive (no DROP unless absolutely necessary)
- Use `IF NOT EXISTS` / `IF EXISTS` for safety
- All tables must have RLS enabled
- Indexes on frequently queried columns

### Lovable Compatibility
- **Do NOT modify** files that Lovable actively edits (UI components, pages) without coordination
- New files are safe — Lovable doesn't touch files it didn't create
- Edge functions, migrations, docs, and `src/lib/` are always safe to modify

## Commit Conventions

Format: `type: description`

| Type | Usage |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `refactor` | Code restructuring (no behavior change) |
| `test` | Adding or updating tests |
| `chore` | Tooling, CI, dependencies |

Examples:
```
feat: add account lockout after 5 failed attempts
fix: CAPTCHA validation now fail-closed on API errors
docs: add data retention policy for LGPD compliance
```

## Pull Request Process

1. PR title should follow commit conventions
2. Include a description of what changed and why
3. CI must pass (lint, typecheck, tests, build)
4. Request review from maintainer

## Project Structure

See [README.md](README.md) for full architecture overview.
