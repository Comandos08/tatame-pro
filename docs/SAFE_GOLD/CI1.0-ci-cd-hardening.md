# CI1.0 — CI/CD HARDENING SAFE GOLD v1.0

## Status

🔒 **FROZEN**
✅ **BLOQUEANTE**
✅ **DETERMINÍSTICO**
🚫 **SEM BYPASS**

---

## Classification

- **Type**: INFRASTRUCTURE / QUALITY
- **Mode**: EXECUTION
- **Risk**: ZERO (passive enforcement only)
- **Behavioral Impact**: NONE
- **Determinism**: MANDATORY

---

## Objective

Establish a **mandatory, deterministic, and blocking** CI/CD pipeline ensuring no changes are integrated or deployed if any SAFE GOLD contract is violated.

**This PI does not alter functional behavior.**
**It institutionalizes the quality already achieved.**

---

## Inviolable Principles

❌ No merge with broken tests
❌ No deploy with broken lint
❌ No manual bypass
❌ No conditional steps by environment

✅ Same pipeline for all PRs
✅ Fail fast
✅ Clear and auditable logs

---

## Pipeline Architecture

```
PR / PUSH
   ↓
Install
   ↓
Lint
   ↓
Typecheck
   ↓
Unit Tests (Vitest)
   ↓
E2E Tests (Playwright)
   ↓
Build
   ↓
DEPLOY (only if all passed)
```

---

## Files

### GitHub Actions — Main CI

**File**: `.github/workflows/ci.yml`

| Step | Command | Blocking |
|------|---------|----------|
| Install | `npm ci` | ✅ |
| Lint | `npm run lint` | ✅ |
| Typecheck | `npx tsc --noEmit` | ✅ |
| Unit Tests | `npx vitest run` | ✅ |
| E2E Tests | `npx playwright test` | ✅ |
| Build | `npm run build` | ✅ |

### GitHub Actions — Supabase Governance

**File**: `.github/workflows/supabase-check.yml`

| Check | Pattern | Blocking |
|-------|---------|----------|
| No DROP TABLE | `grep DROP TABLE` | ✅ |
| No TRUNCATE | `grep TRUNCATE` | ✅ |
| No Date.now() | `grep Date.now()` | ✅ |
| Config exists | `config.toml` | ✅ |

---

## Branch Protection Rules (Manual Configuration)

**Branch**: `main`

### Required Rules

| Rule | Status |
|------|--------|
| Require status checks to pass | ✅ REQUIRED |
| CI — SAFE GOLD must pass | ✅ REQUIRED |
| Supabase — Governance Check must pass | ✅ REQUIRED |
| Require branches to be up to date | ✅ REQUIRED |

### Forbidden

| Rule | Status |
|------|--------|
| Allow force push | ❌ FORBIDDEN |
| Merge without PR | ❌ FORBIDDEN |
| Merge with pending checks | ❌ FORBIDDEN |
| Bypass by admins | ❌ FORBIDDEN |

---

## Script Requirements

The following npm scripts MUST exist in `package.json`:

```json
{
  "scripts": {
    "lint": "eslint . --max-warnings=0",
    "build": "vite build"
  }
}
```

**Notes:**
- `--max-warnings=0` is MANDATORY for lint
- `vitest run` (not watch mode)
- Playwright runs all specs

---

## Acceptance Criteria

| Criterion | Required |
|-----------|----------|
| CI fails → merge blocked | ✅ |
| CI fails → deploy blocked | ✅ |
| E2E tests mandatory | ✅ |
| Resilience tests executed | ✅ |
| No manual bypass | ✅ |
| Deterministic pipeline | ✅ |

---

## Absolute Prohibitions

🚫 `continue-on-error`
🚫 `allow_failure`
🚫 `|| true`
🚫 Conditional steps by branch
🚫 Different pipelines for PR vs main

---

## Environment Variables

Required secrets in GitHub:

| Secret | Purpose |
|--------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |

---

## Governance

**DO NOT MODIFY WITHOUT NEW PI**

Any changes to CI/CD require a new PI with explicit justification and approval.

---

## Strategic Result

After CI1.0:

🔐 Quality becomes **systemic**, not cultural
🔐 Regression becomes **impossible** to go unnoticed
🔐 Team grows without loss of control
🔐 Product becomes **auditable and defensible**

---

**CI1.0 — SAFE GOLD v1.0**
✅ BLOQUEANTE
✅ DETERMINÍSTICO
🚫 SEM BYPASS
📈 PRONTO PARA ESCALA
