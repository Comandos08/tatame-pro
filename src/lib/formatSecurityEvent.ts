/**
 * 🔐 Security Event Formatter
 * 
 * Provides human-readable explanations for security decisions and events.
 * Used by the Security Timeline UI to display understandable information.
 */

export type SecuritySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface SecurityTimelineEntry {
  id: string;
  source: 'DECISION' | 'EVENT';
  event_type: string;
  severity: SecuritySeverity;
  operation: string | null;
  user_id: string | null;
  tenant_id: string | null;
  reason_code: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface FormattedSecurityEvent {
  title: string;
  description: string;
  icon: 'shield' | 'alert' | 'ban' | 'clock' | 'user' | 'lock';
  severityColor: string;
  details: string[];
}

/**
 * Get human-readable title for a decision/event type
 */
function getEventTitle(eventType: string): string {
  const titles: Record<string, string> = {
    // Decision types
    RATE_LIMIT_BLOCK: 'Rate Limit Exceeded',
    PERMISSION_DENIED: 'Permission Denied',
    IMPERSONATION_BLOCK: 'Impersonation Blocked',
    CROSS_TENANT_BLOCK: 'Cross-Tenant Access Blocked',
    ONBOARDING_BLOCK: 'Onboarding Incomplete',
    AUTH_FAILURE: 'Authentication Failed',
    VALIDATION_FAILURE: 'Validation Failed',
    
    // Security event types
    RATE_LIMIT_EXCEEDED: 'Rate Limit Warning',
    RATE_LIMIT_WARNING: 'Rate Limit Approaching',
    REPEATED_AUTH_FAILURES: 'Repeated Auth Failures',
    SUSPICIOUS_LOGIN_PATTERN: 'Suspicious Login',
    CROSS_TENANT_ATTEMPT: 'Cross-Tenant Attempt',
    INSUFFICIENT_PERMISSIONS: 'Insufficient Permissions',
    IMPERSONATION_INVALID: 'Invalid Impersonation',
    BURST_ACTIVITY: 'Burst Activity Detected',
    UNUSUAL_PATTERN: 'Unusual Pattern',
  };

  return titles[eventType] || eventType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * Get human-readable description for a decision/event
 */
function getEventDescription(eventType: string, _metadata: Record<string, unknown> | null): string {
  const descriptions: Record<string, string> = {
    RATE_LIMIT_BLOCK: 'Request was blocked due to too many attempts in a short period.',
    PERMISSION_DENIED: 'User attempted an operation without required permissions.',
    IMPERSONATION_BLOCK: 'Superadmin tried to act without valid impersonation session.',
    CROSS_TENANT_BLOCK: 'Attempted access to resources from another organization.',
    ONBOARDING_BLOCK: 'Tenant setup is incomplete. Required steps must be finished first.',
    AUTH_FAILURE: 'Failed to authenticate - invalid credentials or expired session.',
    VALIDATION_FAILURE: 'Request contained invalid or missing required data.',
    RATE_LIMIT_EXCEEDED: 'Request rate exceeded configured limits.',
    REPEATED_AUTH_FAILURES: 'Multiple failed authentication attempts detected.',
    SUSPICIOUS_LOGIN_PATTERN: 'Login pattern flagged as potentially suspicious.',
    CROSS_TENANT_ATTEMPT: 'Attempted to access another organization\'s data.',
    INSUFFICIENT_PERMISSIONS: 'Operation requires higher permission level.',
    IMPERSONATION_INVALID: 'Impersonation session is invalid or expired.',
    BURST_ACTIVITY: 'Unusually high activity detected in short timeframe.',
    UNUSUAL_PATTERN: 'Activity pattern differs from normal behavior.',
  };

  return descriptions[eventType] || 'Security event recorded for audit purposes.';
}

/**
 * Get icon type based on event type
 */
function getEventIcon(eventType: string): FormattedSecurityEvent['icon'] {
  if (eventType.includes('RATE_LIMIT')) return 'clock';
  if (eventType.includes('PERMISSION') || eventType.includes('AUTH')) return 'lock';
  if (eventType.includes('IMPERSONATION')) return 'user';
  if (eventType.includes('CROSS_TENANT') || eventType.includes('BLOCK')) return 'ban';
  if (eventType.includes('SUSPICIOUS') || eventType.includes('UNUSUAL')) return 'alert';
  return 'shield';
}

/**
 * Get severity color class
 */
function getSeverityColor(severity: SecuritySeverity): string {
  switch (severity) {
    case 'CRITICAL': return 'text-red-500 bg-red-500/10 border-red-500/20';
    case 'HIGH': return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
    case 'MEDIUM': return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
    case 'LOW': return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
    default: return 'text-muted-foreground bg-muted border-border';
  }
}

/**
 * Extract relevant details from metadata
 */
function extractDetails(entry: SecurityTimelineEntry): string[] {
  const details: string[] = [];
  const metadata = entry.metadata || {};

  if (entry.operation) {
    details.push(`Operation: ${entry.operation}`);
  }

  if (entry.reason_code) {
    details.push(`Reason: ${entry.reason_code.replace(/_/g, ' ')}`);
  }

  if (entry.ip_address && entry.ip_address !== 'unknown') {
    details.push(`IP: ${entry.ip_address}`);
  }

  if (metadata.request_count) {
    details.push(`Requests: ${metadata.request_count}`);
  }

  if (metadata.required_roles && Array.isArray(metadata.required_roles)) {
    details.push(`Required: ${(metadata.required_roles as string[]).join(', ')}`);
  }

  if (metadata.impersonation_id) {
    details.push(`Session: ${String(metadata.impersonation_id).slice(0, 8)}...`);
  }

  return details;
}

/**
 * Format a security timeline entry for display
 */
export function formatSecurityEvent(entry: SecurityTimelineEntry): FormattedSecurityEvent {
  return {
    title: getEventTitle(entry.event_type),
    description: getEventDescription(entry.event_type, entry.metadata),
    icon: getEventIcon(entry.event_type),
    severityColor: getSeverityColor(entry.severity as SecuritySeverity),
    details: extractDetails(entry),
  };
}

/**
 * Get severity badge variant
 */
export function getSeverityVariant(severity: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (severity) {
    case 'CRITICAL':
    case 'HIGH':
      return 'destructive';
    case 'MEDIUM':
      return 'default';
    case 'LOW':
      return 'secondary';
    default:
      return 'outline';
  }
}
