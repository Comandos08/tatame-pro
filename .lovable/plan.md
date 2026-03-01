

## Adopt `assertTenantAccess` in `complete-tenant-onboarding` (with SETUP compatibility)

### Overview

Add Zero-Trust Tenant Boundary enforcement (A04) to `complete-tenant-onboarding` as an additive security layer. Includes three mandatory adjustments: SETUP tenant compatibility, standardized impersonation extraction, and proper positioning after input validation.

### Changes

#### File 1: `supabase/functions/_shared/tenant-boundary.ts`

**Add options interface and modify `assertTenantAccess` signature** to support SETUP tenants without breaking existing callers.

- Add an `AssertTenantAccessOptions` interface with optional `allowLifecycleSetup: boolean`
- Modify the `assertTenantAccess` function to accept this as a 5th optional parameter (backward-compatible)
- When `allowLifecycleSetup === true`, fetch `lifecycle_status` alongside `is_active` and skip the `TENANT_INACTIVE` check if `lifecycle_status === 'SETUP'`
- All existing callers (without the options param) behave identically -- fail-closed on inactive tenants

Key logic change in step 2 (tenant existence check):

```text
Current query:  .select("id, is_active")
New query:      .select("id, is_active, lifecycle_status")

Current check:  if (!tenant.is_active) -> throw TENANT_INACTIVE
New check:      if (!tenant.is_active) {
                  if (options?.allowLifecycleSetup && tenant.lifecycle_status === 'SETUP') {
                    // Allow — onboarding in progress
                  } else {
                    throw TENANT_INACTIVE
                  }
                }
```

#### File 2: `supabase/functions/complete-tenant-onboarding/index.ts`

**Three surgical additions** (no existing code removed or modified):

1. **Add import** (after line 35):
   ```typescript
   import { assertTenantAccess, TenantBoundaryError } from "../_shared/tenant-boundary.ts";
   ```

2. **Add tenant boundary check block** (between PARSE INPUT at line 135 and IMPERSONATION CHECK at line 137):
   - Uses `extractImpersonationId(req, body)` (already imported, consistent with line 140)
   - Passes `{ allowLifecycleSetup: true }` to permit SETUP tenants
   - Catches `TenantBoundaryError` and returns 403 with structured code
   - Re-throws unknown errors

   ```typescript
   // TENANT BOUNDARY CHECK (A04)
   try {
     const impersonationIdForBoundary = extractImpersonationId(req, body);
     await assertTenantAccess(supabase, user.id, tenantId, impersonationIdForBoundary, {
       allowLifecycleSetup: true,
     });
     log.info("Tenant boundary check passed");
   } catch (boundaryError) {
     if (boundaryError instanceof TenantBoundaryError) {
       log.warn("Tenant boundary violation", { code: boundaryError.code, message: boundaryError.message });
       return new Response(
         JSON.stringify({ ok: false, code: boundaryError.code, error: "Access denied" }),
         { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
     throw boundaryError;
   }
   ```

3. **No removals** -- `requireTenantRole` and `requireImpersonationIfSuperadmin` remain as secondary layers.

### Execution Order (after change)

```text
AUTH VALIDATION -> RATE LIMITING -> PARSE INPUT -> TENANT BOUNDARY CHECK -> IMPERSONATION CHECK -> ROLE CHECK -> Business Logic
```

### Technical Details

- `tenantId` is guaranteed to be a non-empty string at the boundary check point (validated by PARSE INPUT block at lines 130-135)
- `extractImpersonationId` is already imported at line 38 and used at line 140 -- reusing it maintains institutional consistency
- The `allowLifecycleSetup` option is scoped specifically for the onboarding use case; all other future adopters of `assertTenantAccess` default to strict mode
- Adding `lifecycle_status` to the select query in `assertTenantAccess` adds negligible overhead (same row, same index hit)

