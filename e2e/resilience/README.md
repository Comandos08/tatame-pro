# Resilience Tests — NEVER WEAKEN

This directory contains **failure mode validation tests** that ensure
the system degrades gracefully under adverse conditions.

## Policy: 🛡️ NEVER WEAKEN

These tests can be extended but never made more permissive:
- New failure scenarios can be added
- Existing failure coverage must be maintained
- Recovery assertions must remain strict

## Current Scenarios

### `realtime-failure.spec.ts`
- WebSocket blocked → polling continues
- WebSocket disconnect mid-session → graceful degradation
- No duplicate alerts from realtime + polling

### `polling-failure.spec.ts`
- Query failure → error logged, UI stable
- Network timeout → graceful handling
- React Query retry respects policy

### `mixed-failure.spec.ts`
- Both realtime and polling fail → recovery
- AlertContext remains consistent across failures
- State transitions are deterministic
