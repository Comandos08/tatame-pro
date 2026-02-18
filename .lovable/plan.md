

# HARD FIX SUPERADMIN + SECURITY AUDIT

## Pre-Execution Validation (All Passed)

| Check | Result |
|---|---|
| `is_superadmin()` is SECURITY DEFINER | YES |
| `is_superadmin()` validates `auth.uid()` internally | YES (`WHERE user_id = auth.uid()`) |
| `is_superadmin()` has explicit `SET search_path = public` | YES |
| `is_member_of_tenant()` exists | YES |
| `is_member_of_tenant()` is SECURITY DEFINER with `auth.uid()` | YES |
| No USING(true) in proposed policies | CONFIRMED |

**Important finding**: The user's fallback subquery references `m.user_id` on the `memberships` table, but that column does not exist. Since `is_member_of_tenant()` exists and is properly secured, we use the function-based version as originally proposed.

## Migration: Single SQL Migration with 3 Policy Changes

### 1. INSERT policy on `tenants` for SUPERADMIN

```sql
CREATE POLICY "Superadmin can insert tenants"
ON public.tenants
FOR INSERT
TO authenticated
WITH CHECK (public.is_superadmin());
```

### 2. SELECT policy on `tenants` for SUPERADMIN (global visibility)

```sql
CREATE POLICY "Superadmin can view all tenants"
ON public.tenants
FOR SELECT
TO authenticated
USING (public.is_superadmin());
```

Coexists with existing "Public can view active tenants" policy (no removal).

### 3. Hardened INSERT policy on `membership_analytics`

```sql
DROP POLICY IF EXISTS "Authenticated users can insert analytics"
ON public.membership_analytics;

CREATE POLICY "Users can insert own tenant analytics"
ON public.membership_analytics
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_superadmin()
  OR public.is_tenant_admin(tenant_id)
  OR public.is_member_of_tenant(tenant_id)
);
```

## What Will NOT Be Changed

- No enums, columns, routes, UI, contracts, function signatures
- No Stripe, Membership Flow, Digital Cards, BillingGate, IdentityGate
- No folder structure changes
- No existing policies removed (except the insecure `membership_analytics` one being replaced)
- No new functions created
- No new abstractions

## Post-Implementation Validation

After the migration, the following will be confirmed via SQL queries:
1. SUPERADMIN can INSERT into tenants
2. SUPERADMIN can SELECT all tenants (including inactive)
3. SUPERADMIN can UPDATE tenants (existing policy already works)
4. No `USING(true)` or `WITH CHECK(true)` policies remain for `authenticated` role on sensitive tables
5. `membership_analytics` is now tenant-scoped

