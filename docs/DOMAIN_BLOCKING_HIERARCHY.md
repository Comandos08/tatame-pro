# DOMAIN BLOCKING HIERARCHY — Institutional Contract

> **Status:** FROZEN  
> **PI:** U12 / U10  
> **SSoT:** `src/lib/ux/blockReason.ts`  
> **Last Formalized:** 2026-02-11

---

## 1. Principles

1. **Deterministic:** The system always returns exactly ONE block reason (the highest priority) or `null` (no block).
2. **Exclusive:** Multiple concurrent conditions are resolved by strict precedence — never combined.
3. **Structural over Financial:** Lifecycle blocks (tenant existence, tenant state) always prevail over billing blocks.
4. **Override Scoped:** Financial overrides (`billingOverride`) neutralize **only** billing blocks. They never bypass structural or identity blocks.
5. **Fail-Closed:** When in doubt (loading, error, missing data), the system blocks by default.

---

## 2. Official Precedence Hierarchy

Priority order (highest → lowest):

| Priority | Reason              | Trigger Condition                                      | Description                                                      |
|----------|---------------------|--------------------------------------------------------|------------------------------------------------------------------|
| 1        | `IDENTITY_LOADING`  | Identity state is `loading`                            | System not ready. User must wait for identity resolution.        |
| 2        | `WIZARD_REQUIRED`   | Identity state is `wizard_required`                    | User must complete institutional setup before proceeding.        |
| 3        | `TENANT_BLOCKED`    | Tenant lifecycle is `BLOCKED` or `DELETED`             | Structural block. Tenant is inoperative. No override can bypass. |
| 4        | `BILLING_BLOCKED`   | Billing is `PAST_DUE`, `UNPAID`, or `PENDING_DELETE`   | Financial block. **Neutralized** if `billingOverride === true`.  |
| 5        | `NO_PERMISSION`     | `canAccess === false`                                  | User lacks required role or feature permission.                  |
| 6        | _(none)_            | All checks pass                                        | System OK. No suggestion needed. Returns `null`.                 |

> **Note:** Priorities 1–2 are handled in `deriveNextBestAction`. Priorities 3–5 are delegated to `deriveBlockReason` (U12 SSoT).

---

## 3. Billing Override Governance

### What it does
- `billingOverride === true` **neutralizes** billing blocks (`PAST_DUE`, `UNPAID`, `PENDING_DELETE`).
- When active, the system treats billing as non-blocking, allowing the user to proceed.

### What it does NOT do
- **Does NOT bypass `TENANT_BLOCKED`** — a structurally blocked tenant remains blocked regardless of billing override.
- **Does NOT bypass `TENANT_DELETED`** — a deleted tenant remains blocked regardless of billing override.
- **Does NOT bypass `IDENTITY_LOADING`** — identity must always resolve first.
- **Does NOT bypass `NO_PERMISSION`** — access contract is independent of billing.

### Governance Rules
- Override must be **explicitly set** via `is_manual_override` in the billing table.
- Override must include an `override_reason` for auditability.
- Override is consumed by `useBillingOverride` hook and propagated through `NextBestActionInput`.

---

## 4. Decision Flowchart

```
┌─────────────────────────────┐
│ Identity state === loading? │
│            YES → IDENTITY_LOADING (INFO)
│            NO  ↓
├─────────────────────────────┤
│ Identity === wizard_required? │
│            YES → WIZARD_REQUIRED (CTA → /identity/wizard)
│            NO  ↓
├─────────────────────────────┤
│ Tenant lifecycle === BLOCKED │
│ or DELETED?                  │
│            YES → TENANT_BLOCKED (INFO)
│            NO  ↓
├─────────────────────────────┤
│ Billing blocked AND          │
│ !billingOverride?            │
│            YES → BILLING_BLOCKED (CTA → /app/billing)
│            NO  ↓
├─────────────────────────────┤
│ canAccess === false?         │
│            YES → NO_PERMISSION (INFO)
│            NO  ↓
├─────────────────────────────┤
│         → null (System OK)   │
└─────────────────────────────┘
```

### Pseudo-code (canonical)

```typescript
if (identity === 'loading')            → IDENTITY_LOADING
if (identity === 'wizard_required')    → WIZARD_REQUIRED
if (tenant === BLOCKED || DELETED)     → TENANT_BLOCKED
if (billing blocked && !override)      → BILLING_BLOCKED
if (!canAccess)                        → NO_PERMISSION
else                                   → null
```

---

## 5. Test Coverage

The hierarchy is blindagem-tested in `src/test/ux/nextBestAction.spec.ts`:

- **T7 — Priority order:** Validates that each level takes precedence over lower ones.
- **T9 — Hierarchy determinism:** Validates that combined conditions always resolve to the highest-priority reason.
- **PI-T02 — Billing Override:** Validates that override neutralizes billing but never tenant lifecycle.

---

## 6. Change Policy

Any modification to the blocking hierarchy requires:

1. Update this document first.
2. Update the canonical `BLOCKING_PRECEDENCE` export in `blockReason.ts`.
3. Add or update corresponding tests.
4. Constitutional review (SSF).

**This is a governance contract, not a suggestion.**
