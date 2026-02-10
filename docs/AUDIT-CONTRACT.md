# PI B3 — Audit Contract (Canonical)

> **Version**: 1.0.0  
> **Status**: FROZEN  
> **Dependencies**: A3 (Access), B1/B1.1 (AsyncState), B2 (Flags)

---

## 1. Principle

**No relevant action happens without leaving minimal evidence.**

Audit is best-effort: failures never block the main action.

---

## 2. Mandatory Audited Actions

| Category       | Event Types                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| **Identity**   | `LOGIN_SUCCESS`, `LOGIN_FAILED`, `PASSWORD_RESET_REQUESTED`, `PASSWORD_RESET_COMPLETED`               |
| **Admin**      | `TENANT_CREATED`, `TENANT_STATUS_CHANGED`, `TENANT_SETTINGS_UPDATED`                                 |
| **Roles**      | `ROLES_GRANTED`, `ROLES_REVOKED`                                                                      |
| **Badges**     | `BADGE_GRANTED`, `BADGE_REVOKED`, `BADGE_METADATA_UPDATED`, `BADGE_TOGGLED`                           |
| **Billing**    | `BILLING_STATUS_CHANGED`, `TENANT_BILLING_UPDATED`, billing overrides                                 |
| **Security**   | `IMPERSONATION_STARTED`, `IMPERSONATION_ENDED`, `IMPERSONATION_EXPIRED`, `HEALTH_ACCESS_DENIED`       |
| **Documents**  | `DOCUMENT_ISSUED`, `DOCUMENT_REVOKED`, `DOCUMENT_VERIFIED_PUBLIC`                                     |
| **Membership** | `MEMBERSHIP_APPROVED`, `MEMBERSHIP_REJECTED`, `MEMBERSHIP_CANCELLED`, `MEMBERSHIP_MANUAL_REACTIVATED` |
| **Federation** | `FEDERATION_CREATED`, `TENANT_JOINED_FEDERATION`, `TENANT_LEFT_FEDERATION`, council events            |

**Read-only actions are NOT audited in this PI.**

---

## 3. Minimum Payload Contract

Every audit event MUST contain:

```typescript
{
  event_type: string;           // e.g. BADGE_GRANTED
  tenant_id: string | null;     // Tenant context (null for global ops)
  profile_id: string | null;    // Authenticated actor
  metadata: {
    category: AuditCategory;    // Auto-detected from event_type prefix
    occurred_at: string;        // ISO 8601 timestamp
    // B3-specific fields:
    effective_role?: AppRole;   // Effective role (considering impersonation)
    impersonated?: boolean;     // true if during impersonation session
    impersonation_id?: string;  // Session ID if impersonated
    target_type?: string;       // ATHLETE | BADGE | EVENT | BILLING | MEMBERSHIP | TENANT
    target_id?: string;         // ID of the affected entity
  }
}
```

---

## 4. Impersonation Rules

During impersonation:
- `profile_id` = **real actor** (the superadmin)
- `metadata.impersonated` = `true`
- `metadata.impersonation_id` = session ID
- `metadata.effective_role` = role being exercised (e.g. `ADMIN_TENANT`)

This ensures forensic traceability: who actually did what, under which assumed role.

---

## 5. Canonical Helpers

### Backend (Edge Functions)
- `supabase/functions/_shared/audit-logger.ts` → `createAuditLog()`
- Already exists; enhanced with impersonation-aware metadata.

### Frontend
- `src/lib/audit/auditEvent.ts` → `auditEvent()`
- Wraps `supabase.from('audit_logs').insert()`
- Resolves impersonation context automatically
- Best-effort (catches all errors)

---

## 6. Prohibitions

| Rule                                    | Rationale                      |
| --------------------------------------- | ------------------------------ |
| ❌ No PII in metadata                   | LGPD/GDPR compliance          |
| ❌ No passwords, tokens, or secrets     | Security baseline              |
| ❌ No direct `.insert()` outside helper | Consistency enforcement         |
| ❌ No audit blocking main action        | Best-effort guarantee           |
| ❌ No read-only audit in this PI        | Scope boundary                  |

---

## 7. Categories (auto-detected)

`MEMBERSHIP` | `BILLING` | `JOB` | `GRADING` | `SECURITY` | `AUTH` | `ROLES` | `STORAGE` | `FEDERATION` | `COUNCIL` | `OBSERVABILITY` | `OTHER`

Detection is by event_type prefix. See `_shared/audit-logger.ts` → `detectCategory()`.

---

## 8. Compatibility

- ✅ Zero migration (uses existing `audit_logs` table)
- ✅ Zero RLS changes
- ✅ Backward-compatible with existing audit entries
- ✅ Gates (A3/B2) untouched
