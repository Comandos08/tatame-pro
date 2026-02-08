/**
 * 🔌 ConnectionState — P4.3.1
 * 
 * Canonical enum for real-time connection status.
 * Single source of truth for UI and E2E tests.
 * 
 * INVARIANT: Exactly ONE element with data-conn-state per render.
 * 
 * State Mapping (DETERMINISTIC):
 * - 'live': WebSocket connected and subscribed
 * - 'syncing': WebSocket attempting connection
 * - 'polling': WebSocket failed, polling fallback active
 * - 'offline': Both WebSocket and polling unavailable
 */

export type ConnectionState = 
  | 'live'     // WebSocket connected
  | 'syncing'  // WebSocket attempting connection
  | 'polling'  // WebSocket failed, polling active
  | 'offline'; // No connection available

/**
 * Resolve connection state based on realtime and polling status
 */
export function resolveConnectionState(
  isRealtimeConnected: boolean,
  isPollingActive: boolean = true
): ConnectionState {
  if (isRealtimeConnected) {
    return 'live';
  }
  if (isPollingActive) {
    return 'polling';
  }
  return 'offline';
}

/**
 * Valid connection states (for test validation)
 */
export const VALID_CONNECTION_STATES: readonly ConnectionState[] = [
  'live',
  'syncing', 
  'polling',
  'offline',
] as const;
