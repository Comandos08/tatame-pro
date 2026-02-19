

# PI-AUTH-CLIENT-SPLIT-001 — Separate Auth Client from Service Role

## Summary

Pure mechanical refactor of `supabase/functions/approve-membership/index.ts`. No logic changes, no new files, no schema/RLS changes.

## Confirmations (Pre-implementation Audit)

| Check | Status | Detail |
|-------|--------|--------|
| `authHeader.replace("Bearer ", "")` usage | CONFIRMED: exists at line 183 | Will be removed entirely |
| `supabaseAuth.auth.getUser()` called with no params | CONFIRMED | Reads JWT from Authorization header on client |
| `supabaseAuth` used ONLY for `auth.getUser()` | CONFIRMED | No other usage in the refactored code |
| All `.from()` use `supabaseAdmin` | CONFIRMED | ~25 occurrences |
| All `.rpc()` use `supabaseAdmin` | CONFIRMED | 2 occurrences (grant_user_role, change_membership_state) |
| All `.storage` use `supabaseAdmin` | CONFIRMED | 2 occurrences (copy, remove) |
| All `.functions.invoke()` use `supabaseAdmin` | CONFIRMED | 1 occurrence (generate-digital-card) |
| All helper functions use `supabaseAdmin` | CONFIRMED | logPermissionDenied, logDecision, logRateLimitBlock, logImpersonationBlock, logBillingRestricted, logMembershipApproved, requireBillingStatus, requireImpersonationIfSuperadmin, rateLimiter.check |
| `SUPABASE_ANON_KEY` available | CONFIRMED | Auto-provided by Lovable Cloud for all edge functions |

## Changes (single file)

**File: `supabase/functions/approve-membership/index.ts`**

### Change 1: Replace single client with two clients (lines 159-161)

**Before:**
```typescript
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(supabaseUrl, supabaseServiceKey);
```

**After:**
```typescript
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

const supabaseAuth = createClient(
  supabaseUrl,
  Deno.env.get("SUPABASE_ANON_KEY") ?? "",
  {
    global: {
      headers: {
        Authorization: req.headers.get("authorization") ?? "",
      },
    },
  },
);
```

### Change 2: Auth validation uses `supabaseAuth` with no params (lines 180-183)

**Before:**
```typescript
const {
  data: { user },
  error: userError,
} = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
```

**After:**
```typescript
const {
  data: { user },
  error: userError,
} = await supabaseAuth.auth.getUser();
```

No manual Bearer stripping. No parameters. Header propagated automatically via client config.

### Change 3: Rename all `supabase` to `supabaseAdmin` (~40 occurrences)

Every remaining reference to the old `supabase` variable becomes `supabaseAdmin`. These cover:

- **DB reads** (`.from().select()`): memberships, user_roles, tenants
- **DB writes** (`.from().insert()`, `.from().update()`): guardians, athletes, guardian_links, user_roles, audit_logs, memberships, documents
- **RPC calls** (`.rpc()`): grant_user_role, change_membership_state
- **Storage** (`.storage.from()`): documents copy, documents remove
- **Functions** (`.functions.invoke()`): generate-digital-card
- **Helpers receiving client**: logPermissionDenied, logDecision, logRateLimitBlock, logImpersonationBlock, logBillingRestricted, logMembershipApproved, requireBillingStatus, requireImpersonationIfSuperadmin, rateLimiter.check

### Change 4: Update JSDoc header

Add PI-AUTH-CLIENT-SPLIT-001 reference documenting the two-client architecture.

## What does NOT change

- Response envelopes: identical
- Business logic: identical
- Rate limiting: identical
- Billing checks: identical
- Impersonation: identical
- Email sending: identical
- Audit logs: identical
- Error handling: identical
- CORS headers: identical

## Verification Checklist

After implementation, the following must be true:

1. Zero occurrences of `authHeader.replace("Bearer ", "")` in the file
2. Zero occurrences of the variable name `supabase` (only `supabaseAdmin` and `supabaseAuth`)
3. Exactly ONE call to `supabaseAuth` -- `supabaseAuth.auth.getUser()` with zero parameters
4. All other Supabase operations use `supabaseAdmin`
5. `SUPABASE_ANON_KEY` is read from environment (auto-provided by Lovable Cloud)

## Risk: GREEN

Pure rename refactor. No logic paths change. No new dependencies. `SUPABASE_ANON_KEY` is a default env var in all edge functions.

