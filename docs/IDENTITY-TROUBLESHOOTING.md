# 🔧 IDENTITY TROUBLESHOOTING GUIDE

> **Audience:** Operators, Support Team  
> **Version:** 1.0.0  
> **Last Updated:** 2025-01-30

## Purpose

Operational guide for diagnosing and resolving identity-related issues reported by users.

---

## Quick Reference: Error Codes

| Error Code | User Sees | Likely Cause | Resolution |
|------------|-----------|--------------|------------|
| `IDENTITY_TIMEOUT` | "Slow loading" | Network/server slow | Retry; check server status |
| `PROFILE_NOT_FOUND` | "Profile being created" | Auth succeeded, profile trigger failed | Check profiles table |
| `NO_ROLES_ASSIGNED` | "No permissions" | Wizard complete, no roles granted | Admin must assign roles |
| `TENANT_NOT_FOUND` | "Organization not found" | Invalid tenant slug | Verify slug in URL |
| `BILLING_BLOCKED` | "Access suspended" | Tenant billing issue | Check tenant_billing table |
| `PERMISSION_DENIED` | "Access denied" | Missing required role | Admin must grant role |
| `IMPERSONATION_INVALID` | "Session expired" | Impersonation timeout | Start new impersonation |

---

## Common Scenarios

### Scenario 1: User Reports "Infinite Loading"

**Symptoms:**
- User sees spinner for > 10 seconds
- Eventually sees "Slow loading" warning

**Diagnostic Steps:**

1. **Check user's profile exists:**
   ```sql
   SELECT id, email, wizard_completed, tenant_id, created_at
   FROM profiles
   WHERE email = 'user@example.com';
   ```

2. **Check user's roles:**
   ```sql
   SELECT ur.role, ur.tenant_id, t.slug as tenant_slug
   FROM user_roles ur
   JOIN tenants t ON t.id = ur.tenant_id
   WHERE ur.profile_id = '<profile_id>';
   ```

3. **Check recent decision logs:**
   ```sql
   SELECT decision_type, reason_code, operation, created_at
   FROM decision_logs
   WHERE user_id = '<profile_id>'
   ORDER BY created_at DESC
   LIMIT 10;
   ```

**Resolution:**
- If profile missing → Check auth trigger
- If roles missing → Admin must assign via Manage Admins
- If tenant inactive → Check billing status

---

### Scenario 2: User Reports "Access Denied"

**Symptoms:**
- User sees "Access denied" screen
- User claims they should have access

**Diagnostic Steps:**

1. **Verify user's current roles:**
   ```sql
   SELECT role, tenant_id, created_at
   FROM user_roles
   WHERE profile_id = '<profile_id>'
     AND (revoked_at IS NULL);
   ```

2. **Check required roles for the route:**
   - `/admin/*` → Requires `SUPERADMIN`
   - `/:slug/app/*` → Requires `ADMIN_TENANT` or `STAFF_ORGANIZACAO`
   - `/:slug/portal` → Requires `ATLETA_FILIADO`

3. **Check if tenant is active:**
   ```sql
   SELECT id, slug, is_active
   FROM tenants
   WHERE slug = '<tenant_slug>';
   ```

**Resolution:**
- Missing role → Admin grants role via UI
- Tenant inactive → Resolve billing issue
- Wrong tenant → User is on wrong organization URL

---

### Scenario 3: User Stuck on Identity Wizard

**Symptoms:**
- User keeps being redirected to `/identity/wizard`
- User claims they completed the wizard

**Diagnostic Steps:**

1. **Check wizard_completed flag:**
   ```sql
   SELECT id, email, wizard_completed, tenant_id
   FROM profiles
   WHERE email = 'user@example.com';
   ```

2. **Check if user has any active roles:**
   ```sql
   SELECT role, tenant_id
   FROM user_roles
   WHERE profile_id = '<profile_id>'
     AND revoked_at IS NULL;
   ```

**Resolution:**
- If `wizard_completed = false` → User hasn't finished wizard
- If `wizard_completed = true` but no roles → Admin must assign role
- If `wizard_completed = true` AND has roles → Check identity state machine logs

---

### Scenario 4: Impersonation Not Working

**Symptoms:**
- Superadmin can't access tenant
- "Impersonation session invalid" error

**Diagnostic Steps:**

1. **Check active impersonation sessions:**
   ```sql
   SELECT id, real_user_id, impersonated_user_id, tenant_id, created_at, expires_at
   FROM impersonation_sessions
   WHERE real_user_id = '<superadmin_profile_id>'
     AND expires_at > NOW();
   ```

2. **Check if superadmin has correct role:**
   ```sql
   SELECT role FROM user_roles
   WHERE profile_id = '<profile_id>' AND role = 'SUPERADMIN';
   ```

**Resolution:**
- Session expired → Start new impersonation from /admin
- No SUPERADMIN role → Cannot impersonate (security feature)

---

## Diagnostics Pages

### Superadmin Diagnostics

**URL:** `/admin/diagnostics`

Shows:
- Platform-wide tenant health
- Recent decision logs (sanitized)
- Active/inactive tenant counts

**Filter by tenant:** Add `?tenantId=<uuid>`

### Tenant Diagnostics

**URL:** `/:tenantSlug/app/diagnostics`

Shows:
- Current billing state
- Recent decisions for this tenant
- Security events

**Access:** Requires `ADMIN_TENANT` or `STAFF_ORGANIZACAO` role

---

## SQL Examples

### Find Users Without Roles

```sql
SELECT p.id, p.email, p.wizard_completed, p.created_at
FROM profiles p
LEFT JOIN user_roles ur ON ur.profile_id = p.id AND ur.revoked_at IS NULL
WHERE ur.id IS NULL
  AND p.wizard_completed = true
ORDER BY p.created_at DESC;
```

### Find Blocked Tenants

```sql
SELECT t.id, t.slug, t.name, t.is_active, tb.billing_status
FROM tenants t
LEFT JOIN tenant_billing tb ON tb.tenant_id = t.id
WHERE t.is_active = false
   OR tb.billing_status IN ('TRIAL_EXPIRED', 'PENDING_DELETE', 'UNPAID');
```

### Audit Recent Identity Decisions

```sql
SELECT 
  dl.decision_type,
  dl.reason_code,
  dl.severity,
  dl.created_at,
  p.email as user_email,
  t.slug as tenant_slug
FROM decision_logs dl
LEFT JOIN profiles p ON p.id = dl.user_id
LEFT JOIN tenants t ON t.id = dl.tenant_id
WHERE dl.created_at > NOW() - INTERVAL '24 hours'
ORDER BY dl.created_at DESC
LIMIT 50;
```

---

## Escalation Path

1. **Level 1:** Check diagnostics page, verify user data
2. **Level 2:** Run SQL queries, check decision logs
3. **Level 3:** Check Edge Function logs in Cloud View
4. **Level 4:** Escalate to development team with:
   - User ID
   - Tenant slug
   - Error code
   - Timestamp
   - Screenshot if available

---

## Related Documents

- `docs/PRODUCT-SAFETY.md` — Safety invariants
- `docs/IDENTITY-CONTRACT.md` — Identity state machine rules
- `docs/SSF-CONSTITUTION.md` — Primary system authority
