

# PI-ACTIVE-CONTEXT-SSOT-001 — UX Persona from Role SSoT

## Diagnosis

**Single root cause**: `resolveUXPersona(pathname)` in `src/lib/ux/resolveUXPersona.ts` derives persona from URL path. Only `/admin/*` returns `ADMIN`; everything else (including `/{slug}/app/*`) returns `ATHLETE`. This is consumed in `AppShell.tsx` line 148.

**SSoT available**: `IdentityContext` exposes `role: "ADMIN_TENANT" | "ATHLETE" | "SUPERADMIN_GLOBAL" | null` -- already resolved by ROLE_PRIORITY_V1.

**Only 2 files need changes**: `resolveUXPersona.ts` and `AppShell.tsx`.

---

## Changes

### File 1: `src/lib/ux/resolveUXPersona.ts`

Rewrite the function to accept only `role` (the SSoT from IdentityContext):

```text
Input:  role: "ADMIN_TENANT" | "ATHLETE" | "SUPERADMIN_GLOBAL" | null
Output: "ADMIN" | "ATHLETE"

Rules:
  - SUPERADMIN_GLOBAL --> ADMIN
  - ADMIN_TENANT      --> ADMIN
  - ATHLETE            --> ATHLETE
  - null (loading/unknown) --> ATHLETE (safe default)
```

- Remove `pathname` parameter entirely
- No route-based inference remains
- `STAFF_ORGANIZACAO` is NOT listed because the Identity Engine already normalizes it to `ADMIN_TENANT` before it reaches the frontend (per ROLE_PRIORITY_V1)
- Type signature: `resolveUXPersona(role: string | null): UXPersona`

### File 2: `src/layouts/AppShell.tsx`

- Import `useIdentity` from `@/contexts/IdentityContext`
- Get `role` from `useIdentity()`
- Change line 148 from `resolveUXPersona(pathname)` to `resolveUXPersona(role)`
- Update `useMemo` dependency from `[pathname]` to `[role]`

No other files consume `resolveUXPersona` (confirmed by search -- only `AppShell.tsx` and the build cache reference it).

---

## What does NOT change

- No RLS changes
- No schema changes
- No edge function changes
- No routing logic changes
- IdentityContext untouched
- `data-ux-persona` attribute stays (now reflects correct value)
- Header label rendering logic stays identical (just reads correct persona now)

---

## Acceptance Criteria

1. ADMIN_TENANT on `/{slug}/app/*` -- header shows "Contexto: Administracao"
2. SUPERADMIN_GLOBAL on `/admin` -- header shows "Contexto: Administracao"
3. ATLETA-only user on `/{slug}/portal` -- header shows "Contexto: Atleta"
4. During identity loading (role=null) -- shows "Contexto: Atleta" (safe default)
5. `data-ux-persona` attribute matches the resolved persona

