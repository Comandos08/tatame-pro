# E2E Test Governance — P4.3.1

## Directory Structure & Policies

```
e2e/
├── contract/       → NEVER REMOVE - Architectural invariants
├── resilience/     → NEVER WEAKEN - Failure mode validation  
├── behavior/       → Can evolve - Feature behavior tests
├── smoke/          → CI fast path - Critical path validation
├── security/       → NEVER WEAKEN - Security boundary tests
├── billing/        → Can evolve - Billing flow tests
├── observability/  → Can evolve - Monitoring UI tests
├── routing/        → NEVER WEAKEN - Navigation guards
└── ui/             → Can evolve - UI component tests
```

## Policy Definitions

### 🔒 NEVER REMOVE (`contract/`)
- Architectural invariants
- State machine contracts
- Type system validations
- Deleting these tests requires architectural review

### 🛡️ NEVER WEAKEN (`resilience/`, `security/`, `routing/`)
- Tests can be extended but never made more permissive
- Failure scenarios must remain covered
- Security boundaries must remain enforced

### 📝 CAN EVOLVE (`behavior/`, `smoke/`, `billing/`, `observability/`, `ui/`)
- Tests can be modified as features evolve
- New tests can be added
- Existing tests can be updated to match new behavior

## Test Naming Convention

```
{category}/{domain}-{aspect}.spec.ts

Examples:
- contract/connection-state-invariants.spec.ts
- resilience/realtime-failure.spec.ts
- behavior/membership-flow.spec.ts
```

## CI Integration

```bash
# Full suite
npx playwright test

# By project
npx playwright test --project=contract
npx playwright test --project=resilience
npx playwright test --project=observability

# Fast smoke
npx playwright test --project=smoke
```

## P4.3.1 Specific Invariants

### ConnectionState Contract
- Exactly ONE element with `[data-conn-state]` per render
- Value MUST be: `'live' | 'syncing' | 'polling' | 'offline'`
- Source of truth: `src/types/connection-state.ts`

### Dismiss Persistence Contract
- `localStorage('tatame_dismissed_alerts')` is primary source
- Server-side table is read-only preparation (not active)
- No automatic writes to `observability_dismissed_alerts`
