# Explicit States & Golden Rule — Implementation Guide

## Overview

This document defines the explicit state model for institutional documents and the Golden Rule for validity.

## 1. Tenant Lifecycle States

| State | Description | Documents Valid? |
|-------|-------------|------------------|
| `SETUP` | Onboarding in progress | ❌ No |
| `ACTIVE` | Operational | ✅ Yes (if billing valid) |
| `BLOCKED` | Suspended/restricted | ❌ No |

**Database column**: `tenants.lifecycle_status` (enum: `tenant_lifecycle_status`)

## 2. Digital Card States

| State | Description | Valid? |
|-------|-------------|--------|
| `DRAFT` | Not yet issued | ❌ No |
| `ACTIVE` | Valid and active | ✅ Yes |
| `SUSPENDED` | Temporarily held | ❌ No |
| `EXPIRED` | Past validity date | ❌ No |
| `REVOKED` | Permanently invalidated | ❌ No |

**Database column**: `digital_cards.status` (enum: `digital_card_status`)

## 3. Diploma States

| State | Description | Valid? |
|-------|-------------|--------|
| `DRAFT` | Not yet issued | ❌ No |
| `ISSUED` | Valid and issued | ✅ Yes |
| `REVOKED` | Permanently invalidated | ❌ No |

**Database column**: `diplomas.status` (enum: `diploma_status`)

## 4. The Golden Rule

A document is **VALID** if and only if **ALL** conditions are true:

```
1. Tenant status = 'ACTIVE'
2. Billing status IN ('ACTIVE', 'TRIALING')
3. Document status IN ('ACTIVE', 'ISSUED')
4. revoked_at IS NULL
```

### Implementation

**Frontend (TypeScript)**:
```typescript
import { isInstitutionalDocumentValid } from '@/lib/institutional';

const result = isInstitutionalDocumentValid({
  tenantStatus: 'ACTIVE',
  billingStatus: 'TRIALING',
  documentStatus: 'ACTIVE',
  revokedAt: null,
});
// { isValid: true, reason: null }
```

**Edge Functions (Deno)**:
```typescript
import { isInstitutionalDocumentValid } from "../_shared/isDocumentValid.ts";

const result = isInstitutionalDocumentValid({
  tenantStatus,
  billingStatus,
  documentStatus,
  revokedAt: card.revoked_at,
});
```

**Database (SQL)**:
```sql
SELECT public.is_institutional_document_valid(
  p_tenant_status := 'ACTIVE',
  p_billing_status := 'TRIALING',
  p_document_status := 'ACTIVE',
  p_revoked_at := NULL
);
-- Returns: true
```

## 5. Revocation

Revocation is a **first-class operation**:

- Sets `revoked_at` timestamp (immutable once set)
- Sets `revoked_reason` (required for audit)
- Updates `status` to 'REVOKED'
- **Never deletes** the record

```sql
UPDATE digital_cards
SET 
  status = 'REVOKED',
  revoked_at = NOW(),
  revoked_reason = 'Membership cancelled by athlete request'
WHERE id = $1;
```

## 6. Validity Reasons

When a document is invalid, the reason is one of:

| Reason | Description |
|--------|-------------|
| `TENANT_NOT_ACTIVE` | Tenant is not in ACTIVE state |
| `BILLING_INVALID` | Billing not ACTIVE or TRIALING |
| `DOCUMENT_NOT_ACTIVE` | Document not ACTIVE or ISSUED |
| `DOCUMENT_REVOKED` | Document has been revoked |

## 7. Public Verification

The `verify-digital-card` Edge Function uses the Golden Rule to determine validity:

```
POST /functions/v1/verify-digital-card
{
  "cardId": "uuid"
}

Response:
{
  "found": true,
  "isValid": true/false,
  "validityReason": null | "TENANT_NOT_ACTIVE" | ...
}
```

## 8. Migration Summary

The following database changes were made:

1. Added `digital_cards.status` (enum: DRAFT, ACTIVE, SUSPENDED, EXPIRED, REVOKED)
2. Added `digital_cards.revoked_at` (timestamp)
3. Added `digital_cards.revoked_reason` (text)
4. Added `tenants.lifecycle_status` (enum: SETUP, ACTIVE, BLOCKED)
5. Created `is_institutional_document_valid()` database function

## 9. Files Changed

- `src/lib/institutional/isDocumentValid.ts` — Golden Rule (frontend)
- `supabase/functions/_shared/isDocumentValid.ts` — Golden Rule (edge functions)
- `supabase/functions/verify-digital-card/index.ts` — Uses Golden Rule
- `src/types/digital-card.ts` — Digital card types
- `src/types/tenant-lifecycle-state.ts` — Tenant lifecycle types

---

**SAFE GOLD**: Estados explícitos aplicados e Regra de Ouro ativa.
