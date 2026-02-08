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
