
# P0.3 FIX: Tenant Routing Canonicalization

## Problem Identified

The `resolve-identity-wizard` Edge Function returns non-canonical redirect paths:

| Location | Current (WRONG) | Should Be (CANONICAL) |
|----------|-----------------|----------------------|
| Line 303 | `/${slug}/onboarding` | `/${slug}/app` |
| Line 431 | `/${slug}/onboarding` | `/${slug}/app` |

This causes 404 errors because **the route `/:tenantSlug/onboarding` does not exist** in the frontend router.

## Architectural Fact

```text
App.tsx Router Structure:
├── /:tenantSlug              → TenantLayout
│   ├── index                 → TenantLanding (PUBLIC)
│   ├── login                 → AthleteLogin (PUBLIC)
│   ├── app/*                 → AppRouter (PROTECTED)
│   │   ├── index             → TenantDashboard
│   │   ├── onboarding        → TenantOnboarding  ← VALID
│   │   └── ...
│   └── ...
```

- `/{slug}/onboarding` → **DOES NOT EXIST** (404)
- `/{slug}/app/onboarding` → **VALID** (rendered by AppRouter)
- `/{slug}/app` → **CANONICAL ENTRY** (TenantOnboardingGate decides internally)

## Fix (Surgical, Deterministic)

### File: `supabase/functions/resolve-identity-wizard/index.ts`

**Change 1 - Line 303 (Idempotent return):**
```typescript
// FROM:
redirectPath: `/${existingTenant[0].slug}/onboarding`,

// TO:
redirectPath: `/${existingTenant[0].slug}/app`,
```

**Change 2 - Line 431 (Success return):**
```typescript
// FROM:
redirectPath: `/${newTenant.slug}/onboarding`,

// TO:
redirectPath: `/${newTenant.slug}/app`,
```

## Why This Works

1. User completes wizard → redirected to `/{slug}/app`
2. `TenantLayout` loads tenant context
3. `TenantOnboardingGate` checks `onboarding_completed`:
   - If `false` → internal redirect to `/app/onboarding`
   - If `true` → allows access to `/app` (dashboard)
4. **No 404s, no external onboarding routes**

## Scope Compliance

| Constraint | Status |
|------------|--------|
| Only modify Edge Function | ✅ |
| No new routes | ✅ |
| No guard changes | ✅ |
| No business logic changes | ✅ |
| No database changes | ✅ |
| No RLS changes | ✅ |

## Acceptance Criteria

| Scenario | Expected Result |
|----------|-----------------|
| Create new tenant | Redirects to `/{slug}/app` |
| Tenant without onboarding complete | Gate sends to `/app/onboarding` |
| Tenant with onboarding complete | Gate sends to `/app` (dashboard) |
| Direct access `/{slug}/onboarding` | Should not happen anymore |
| Direct access `/{slug}/app` | Always works |
| Logout / login | Correct flow, no wizard duplication |
| Console | Zero errors |

## Files Modified

| File | Operation |
|------|-----------|
| `supabase/functions/resolve-identity-wizard/index.ts` | EDIT (2 lines) |

## Result

```
✅ IDENTITY FLOW: CLOSED
✅ TENANT ONBOARDING: CLOSED  
✅ READY FOR CONTROLLED ONBOARDING
```
