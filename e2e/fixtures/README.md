# 🔐 E2E Authentication Fixtures

This directory contains authentication fixtures for Playwright E2E tests.

## Overview

The authentication system uses **real Supabase sessions** injected into the browser, eliminating the need for UI-based login and ensuring tests run with actual authenticated users.

## Key Principles

1. **No UI Login**: Sessions are created via `signInWithPassword` and injected as cookies
2. **Single Decision Point**: All auth routing goes through `/portal`
3. **Real Validation**: Each fixture validates the user reached their expected destination
4. **No `test.skip()`**: Tests run with actual authenticated users

## Required Test Users

Before running tests, ensure these users exist in your test database:

| Role | Email | Expected Destination |
|------|-------|---------------------|
| `SUPERADMIN` | superadmin@test.local | /admin |
| `TENANT_ADMIN` | admin@test.local | /{tenant}/app |
| `TENANT_ADMIN_BLOCKED` | admin_blocked@test.local | /{tenant}/app (blocked UI) |
| `ATHLETE_APPROVED` | athlete@test.local | /{tenant}/portal |
| `ATHLETE_PENDING` | athlete_pending@test.local | /{tenant}/membership/status |
| `NO_CONTEXT` | nocontext@test.local | /portal (no context UI) |

**Default password for all test users**: `Test123!`

## Usage

```typescript
import { 
  loginAsSuperAdmin,
  loginAsTenantAdmin,
  loginAsApprovedAthlete,
  logout 
} from './fixtures/auth.fixture';

test('admin can access dashboard', async ({ page }) => {
  await loginAsTenantAdmin(page);
  
  // Now authenticated - test your feature
  expect(page.url()).toContain('/app');
});
```

## Environment Variables

You can override test user credentials via environment variables:

```bash
E2E_TEST_TENANT_SLUG=my-tenant
E2E_SUPERADMIN_EMAIL=custom@email.com
E2E_SUPERADMIN_PASSWORD=MyPassword123
# ... etc
```

## Validation Script

Run before tests to verify all users exist:

```bash
npx ts-node e2e/setup/validateTestUsers.ts
```

## Files

- `fixtures/auth.fixture.ts` - Main auth fixtures
- `fixtures/users.seed.ts` - User configuration
- `fixtures/supabaseTestClient.ts` - Supabase client for tests
- `helpers/authSession.ts` - Session injection utilities
- `setup/validateTestUsers.ts` - Pre-test validation script

## Security Notes

- Test users should only exist in test/staging environments
- Never commit real credentials to the repository
- Use environment variables for sensitive data
- Test database should be isolated from production
