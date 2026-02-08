# E2E Behavior Tests

## Policy: NEVER REMOVE

This directory contains behavior tests that validate user-facing workflows.

## Guidelines

1. **Deterministic**: All tests must use mocked data and frozen time
2. **No Real Database**: Use `page.route()` for all API calls
3. **SAFE GOLD States**: Only use states from the SAFE GOLD subset
4. **Isolated**: Tests must not depend on other tests
5. **Fast**: Target < 30 seconds per test

## State Contracts

- **EventState**: DRAFT, PUBLISHED, ONGOING, FINISHED, CANCELED
- **RegistrationState**: PENDING, CONFIRMED, CANCELED

## Adding New Tests

1. Import helpers from `../helpers/`
2. Use `freezeTime()` before navigation
3. Mock all API endpoints
4. Assert using `data-testid` attributes only
