# Contract Tests — NEVER REMOVE

This directory contains **architectural invariant tests** that validate
core system contracts. These tests are protected by governance policy.

## Policy: 🔒 NEVER REMOVE

Deleting or weakening tests in this directory requires:
1. Architectural review
2. SSF Constitution compliance check
3. Documentation update

## Current Invariants

### `connection-state-invariants.spec.ts` (P4.3.1)
- Exactly ONE `[data-conn-state]` element per render
- Value must be valid enum member
- State transitions follow deterministic rules

### `alert-invariants.spec.ts`
- No duplicate alerts
- Dismissed alerts persist
- Severity ordering is deterministic

### `cleanup-invariants.spec.ts`
- No orphan intervals after navigation
- Realtime channels are properly unsubscribed
- No memory leaks from rapid navigation

### `safe-gold-invariants.spec.ts`
- Observability never mutates business data
- No navigate() calls in realtime handlers
- Read-only data access pattern

### `tenant-lifecycle-guard.spec.ts` (PI-D6.1)
- Edge Functions block for tenant SETUP/BLOCKED (I4)
- All errors return HTTP 200 (I6)
- No semantic leakage in error messages
- Tests: TG.C.1-7

### `federation-lifecycle.spec.ts` (PI-D6.1)
- Federation join/leave require proper roles (I2)
- Audit logs contain federation_id (I3)
- Soft history: left_at instead of DELETE (I2)
- RLS blocks direct DELETE on federation_tenants
- Tests: FG.C.1-9
