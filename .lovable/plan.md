

# PRODUCT SAFETY & OPERATIONAL MATURITY — EXECUTION PLAN

## CONFIRMED RULES COMPLIANCE

| Rule | Approach |
|------|----------|
| 1. identity-error-escape returns KEY-BASED i18n | Return `userMessageKey`, `suggestionKey`, etc. Translation happens ONLY in UI components |
| 2. IdentityContext has 12s hard timeout with explicit ERROR | Already exists (IDENTITY_TIMEOUT_MS = 12_000). Will add distinct error code `IDENTITY_TIMEOUT` |
| 3. Diagnostics distinguishes "no data" vs "RLS denied" | Explicit query status tracking with `status: 'success' | 'no_data' | 'no_permission'` |
| 4. AdminDiagnostics does NOT depend on TenantContext | Uses optional `?tenantId=` query param for tenant-specific data |

---

## PHASE 1: P0 — PRODUCT SAFETY LAYER

### 1.1 MODIFY: `src/contexts/IdentityContext.tsx`

**Add new error codes to IdentityError type (line 19-27):**

```typescript
export interface IdentityError {
  code:
    | "TENANT_NOT_FOUND"
    | "INVITE_INVALID"
    | "PERMISSION_DENIED"
    | "IMPERSONATION_INVALID"
    | "SLUG_TAKEN"
    | "VALIDATION_ERROR"
    | "PROFILE_NOT_FOUND"      // NEW: Auth success but no profile row
    | "NO_ROLES_ASSIGNED"      // NEW: Profile exists, wizard done, no roles
    | "BILLING_BLOCKED"        // NEW: Tenant inactive due to billing
    | "IDENTITY_TIMEOUT"       // NEW: Distinct timeout error (12s)
    | "UNKNOWN";
  message: string;
}
```

**Modify timeout handling (lines 209-216, 241-248) to use distinct error code:**

```typescript
// Instead of code: "UNKNOWN", message: "timeout"
// Use: code: "IDENTITY_TIMEOUT", message: "..."
```

---

### 1.2 MODIFY: `src/lib/identity/identity-error-escape.ts`

**Refactor to KEY-BASED i18n (pure function, no t() calls):**

```typescript
/**
 * 🔐 ERROR ESCAPE HATCH — i18n KEY-BASED (Pure Function)
 * 
 * Returns i18n KEYS, not translated strings.
 * Translation happens ONLY in UI components.
 * This keeps the function PURE and TESTABLE.
 */

export interface ErrorEscapeOptions {
  canRetry: boolean;
  retryLabelKey: string;

  canLogout: boolean;
  logoutLabelKey: string;

  userMessageKey: string;
  suggestionKey: string;
  
  // Fallback message if key not found (for error.message passthrough)
  fallbackMessage?: string;
}

export function resolveErrorEscapeHatch(error: IdentityError | null): ErrorEscapeOptions {
  const code = error?.code ?? 'UNKNOWN';

  switch (code) {
    case 'PERMISSION_DENIED':
      return {
        canRetry: false,
        retryLabelKey: '',
        canLogout: true,
        logoutLabelKey: 'identityError.permissionDenied.logout',
        userMessageKey: 'identityError.permissionDenied.message',
        suggestionKey: 'identityError.permissionDenied.suggestion',
        fallbackMessage: error?.message,
      };

    case 'TENANT_NOT_FOUND':
      return {
        canRetry: true,
        retryLabelKey: 'identityError.tenantNotFound.retry',
        canLogout: true,
        logoutLabelKey: 'identityError.tenantNotFound.logout',
        userMessageKey: 'identityError.tenantNotFound.message',
        suggestionKey: 'identityError.tenantNotFound.suggestion',
        fallbackMessage: error?.message,
      };

    case 'IMPERSONATION_INVALID':
      return {
        canRetry: true,
        retryLabelKey: 'identityError.impersonationInvalid.retry',
        canLogout: true,
        logoutLabelKey: 'identityError.impersonationInvalid.logout',
        userMessageKey: 'identityError.impersonationInvalid.message',
        suggestionKey: 'identityError.impersonationInvalid.suggestion',
        fallbackMessage: error?.message,
      };

    case 'PROFILE_NOT_FOUND':
      return {
        canRetry: true,
        retryLabelKey: 'identityError.profileNotFound.retry',
        canLogout: true,
        logoutLabelKey: 'identityError.profileNotFound.logout',
        userMessageKey: 'identityError.profileNotFound.message',
        suggestionKey: 'identityError.profileNotFound.suggestion',
        fallbackMessage: error?.message,
      };

    case 'NO_ROLES_ASSIGNED':
      return {
        canRetry: true,
        retryLabelKey: 'identityError.noRolesAssigned.retry',
        canLogout: true,
        logoutLabelKey: 'identityError.noRolesAssigned.logout',
        userMessageKey: 'identityError.noRolesAssigned.message',
        suggestionKey: 'identityError.noRolesAssigned.suggestion',
        fallbackMessage: error?.message,
      };

    case 'BILLING_BLOCKED':
      return {
        canRetry: false,
        retryLabelKey: '',
        canLogout: true,
        logoutLabelKey: 'identityError.billingBlocked.logout',
        userMessageKey: 'identityError.billingBlocked.message',
        suggestionKey: 'identityError.billingBlocked.suggestion',
        fallbackMessage: error?.message,
      };

    case 'IDENTITY_TIMEOUT':
      return {
        canRetry: true,
        retryLabelKey: 'identityError.timeout.retry',
        canLogout: true,
        logoutLabelKey: 'identityError.timeout.logout',
        userMessageKey: 'identityError.timeout.message',
        suggestionKey: 'identityError.timeout.suggestion',
        fallbackMessage: error?.message,
      };

    case 'UNKNOWN':
    default:
      return {
        canRetry: true,
        retryLabelKey: 'identityError.unknown.retry',
        canLogout: true,
        logoutLabelKey: 'identityError.unknown.logout',
        userMessageKey: 'identityError.unknown.message',
        suggestionKey: 'identityError.unknown.suggestion',
        fallbackMessage: error?.message,
      };
  }
}
```

---

### 1.3 CREATE: `src/components/identity/IdentityLoadingScreen.tsx`

**Dedicated component for LOADING state with UX-only timeout:**

```typescript
/**
 * IDENTITY LOADING SCREEN — UX-Only Timeout Indicator
 * 
 * CRITICAL CONSTRAINTS (SSF Constitution compliant):
 * 1. This timeout is EXCLUSIVELY for user feedback
 * 2. It does NOT trigger navigation
 * 3. It does NOT alter identity state
 * 4. It does NOT cause implicit redirects
 * 5. The actual timeout is handled by IdentityContext (12s abort)
 */

import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/contexts/I18nContext';

interface IdentityLoadingScreenProps {
  onRetry: () => void;
  onLogout: () => void;
}

/**
 * UX_TIMEOUT_MS is for UI feedback ONLY.
 * The actual hard timeout (12s) is in IdentityContext.
 * This UI feedback appears after 8 seconds to inform users.
 */
const UX_TIMEOUT_MS = 8000;

export function IdentityLoadingScreen({ onRetry, onLogout }: IdentityLoadingScreenProps) {
  const { t } = useI18n();
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);

  useEffect(() => {
    /**
     * UX-ONLY TIMEOUT: Show warning after 8 seconds.
     * 
     * CONSTRAINT: This ONLY shows UI feedback.
     * - Does NOT navigate
     * - Does NOT change identity state
     * - Does NOT cause redirects
     * The real timeout (12s) is in IdentityContext which transitions to ERROR state.
     */
    const timer = setTimeout(() => {
      setShowTimeoutWarning(true);
    }, UX_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, []);

  if (showTimeoutWarning) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-warning/10 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-warning" />
            </div>
            <CardTitle>{t('identityLoading.timeout.title')}</CardTitle>
            <CardDescription>
              {t('identityLoading.timeout.message')}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground text-center">
              {t('identityLoading.timeout.suggestion')}
            </p>
            <Button onClick={onRetry} className="w-full">
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('identityLoading.timeout.retry')}
            </Button>
            <Button variant="outline" onClick={onLogout} className="w-full">
              {t('identityLoading.timeout.logout')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Normal loading state
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    </div>
  );
}
```

---

### 1.4 MODIFY: `src/components/identity/IdentityGate.tsx`

**Use IdentityLoadingScreen and translate escape hatch keys:**

Replace LOADING case (lines 231-239) with:
```typescript
case 'LOADING':
  return (
    <IdentityLoadingScreen 
      onRetry={refreshIdentity} 
      onLogout={() => signOut()} 
    />
  );
```

Modify ERROR case (lines 309-341) to translate keys:
```typescript
case 'ERROR': {
  const escapeOptions = resolveErrorEscapeHatch(error);
  
  // Translate keys to strings (translation happens HERE, not in escape hatch)
  const userMessage = t(escapeOptions.userMessageKey) || escapeOptions.fallbackMessage || t('identity.error');
  const suggestion = t(escapeOptions.suggestionKey);
  const retryLabel = escapeOptions.canRetry ? t(escapeOptions.retryLabelKey) : '';
  const logoutLabel = t(escapeOptions.logoutLabelKey);
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
          <CardTitle className="text-center">{t("identity.error")}</CardTitle>
          <CardDescription className="text-center">
            {userMessage}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground text-center">
            {suggestion}
          </p>
          {escapeOptions.canRetry && (
            <Button onClick={refreshIdentity} className="w-full">
              <RefreshCw className="h-4 w-4 mr-2" />
              {retryLabel}
            </Button>
          )}
          {escapeOptions.canLogout && (
            <Button variant="outline" onClick={() => signOut()} className="w-full">
              {logoutLabel}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## PHASE 2: P0 — OBSERVABILITY (READ-ONLY)

### 2.1 CREATE: `src/hooks/useTenantDiagnostics.ts`

**Hook with explicit RLS-denied state handling:**

```typescript
/**
 * TENANT DIAGNOSTICS HOOK — Read-Only System State
 * 
 * CONSTRAINTS:
 * 1. Strictly READ-ONLY — no mutations
 * 2. No PII exposure
 * 3. Explicit distinction between "no data" vs "no permission"
 */

export type DiagnosticsStatus = 'loading' | 'success' | 'no_data' | 'no_permission' | 'error';

export interface DiagnosticsData {
  status: DiagnosticsStatus;
  // ... data fields
}

// Query with explicit error handling for RLS
const { data, error } = await supabase.from('decision_logs')...;

// Distinguish RLS denied from no data
if (error) {
  if (error.code === 'PGRST116' || error.message.includes('permission')) {
    return { status: 'no_permission', ... };
  }
  return { status: 'error', ... };
}

if (!data || data.length === 0) {
  return { status: 'no_data', ... };
}

return { status: 'success', ... };
```

---

### 2.2 CREATE: `src/pages/AdminDiagnostics.tsx`

**Superadmin diagnostics — NO TenantContext dependency:**

```typescript
/**
 * SUPERADMIN DIAGNOSTICS — Platform-Level View
 * 
 * CONSTRAINTS:
 * 1. Does NOT use TenantContext
 * 2. Uses ?tenantId= query param for tenant-specific data
 * 3. Strictly READ-ONLY
 * 4. No PII exposure
 */

export default function AdminDiagnostics() {
  const [searchParams] = useSearchParams();
  const tenantId = searchParams.get('tenantId'); // Optional filter
  
  // Query directly without TenantContext
  const { data: tenants } = useQuery({
    queryKey: ['admin-diagnostics-tenants'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, slug, name, is_active');
      // ...
    }
  });
}
```

---

### 2.3 CREATE: `src/pages/TenantDiagnostics.tsx`

**Tenant-level diagnostics for admin/staff:**

```typescript
/**
 * TENANT DIAGNOSTICS — Tenant-Scoped View
 * 
 * Uses TenantContext for current tenant.
 * Shows diagnostics for the specific tenant.
 */

export default function TenantDiagnostics() {
  const { tenant } = useTenant();
  const { diagnostics, status } = useTenantDiagnostics(tenant?.id);
  
  // Explicit UI for each status
  if (status === 'no_permission') {
    return <NoPermissionCard />;
  }
  
  if (status === 'no_data') {
    return <NoDataCard />;
  }
}
```

---

### 2.4 MODIFY: Routes

**AppRouter.tsx — Add tenant diagnostics route:**
```typescript
<Route path="diagnostics" element={<TenantDiagnostics />} />
```

**App.tsx — Add superadmin diagnostics route:**
```typescript
<Route path="/admin/diagnostics" element={<AdminDiagnostics />} />
```

---

## PHASE 3: P1 — BILLING STATE HARDENING (LOGGING ONLY)

### 3.1 MODIFY: `src/lib/billing/resolveTenantBillingState.ts`

**Add transition matrix — DIAGNOSTIC ONLY, NO ENFORCEMENT:**

```typescript
/**
 * BILLING TRANSITION MATRIX — DIAGNOSTIC ONLY
 * 
 * CRITICAL CONSTRAINT (per approval):
 * This matrix is ONLY for logging and diagnostics.
 * It does NOT enforce transitions.
 * It does NOT block execution.
 * Invalid transitions generate observable warning, never blocking.
 */
const VALID_BILLING_TRANSITIONS: Record<BillingStatus, readonly BillingStatus[]> = {
  TRIALING: ['ACTIVE', 'TRIAL_EXPIRED'],
  TRIAL_EXPIRED: ['ACTIVE', 'PENDING_DELETE'],
  PENDING_DELETE: ['ACTIVE'],
  ACTIVE: ['PAST_DUE', 'CANCELED', 'UNPAID'],
  PAST_DUE: ['ACTIVE', 'UNPAID', 'CANCELED'],
  UNPAID: ['ACTIVE', 'CANCELED'],
  CANCELED: ['ACTIVE'],
  INCOMPLETE: ['ACTIVE', 'TRIALING'],
} as const;

/**
 * Logs diagnostic warning for invalid status.
 * Does NOT block — this is for observability only.
 */
function logBillingDiagnostic(
  type: 'INVALID_STATUS' | 'UNEXPECTED_TRANSITION',
  details: Record<string, unknown>
): void {
  console.warn(`[BILLING DIAGNOSTIC] ${type}`, {
    ...details,
    timestamp: new Date().toISOString(),
    note: 'This is a diagnostic warning. No enforcement applied.',
  });
}
```

---

## PHASE 4: P1 — UX RECOVERY

### 4.1 CREATE: `src/components/ux/RecoveryGuide.tsx`

**Reusable recovery component.**

### 4.2 MODIFY: `src/components/auth/AccessDenied.tsx`

**Add contextual messaging based on route.**

---

## PHASE 5: P2 — DOCUMENTATION

### 5.1 CREATE: `docs/PRODUCT-SAFETY.md`
### 5.2 CREATE: `docs/IDENTITY-TROUBLESHOOTING.md`

---

## PHASE 6: I18N — MANDATORY UPDATES

### All new keys for pt-BR, en, es:

```typescript
// Identity Error - Key-based (escape hatch)
'identityError.permissionDenied.message': '...',
'identityError.permissionDenied.suggestion': '...',
'identityError.permissionDenied.logout': '...',

'identityError.tenantNotFound.message': '...',
'identityError.tenantNotFound.suggestion': '...',
'identityError.tenantNotFound.retry': '...',
'identityError.tenantNotFound.logout': '...',

// ... (all error codes)

'identityError.timeout.message': '...',
'identityError.timeout.suggestion': '...',
'identityError.timeout.retry': '...',
'identityError.timeout.logout': '...',

// Identity Loading (UX timeout)
'identityLoading.timeout.title': '...',
'identityLoading.timeout.message': '...',
'identityLoading.timeout.suggestion': '...',
'identityLoading.timeout.retry': '...',
'identityLoading.timeout.logout': '...',

// Diagnostics
'diagnostics.title': '...',
'diagnostics.noData': '...',
'diagnostics.noPermission': '...',
// ...

// Access Denied Context
'accessDenied.adminArea': '...',
'accessDenied.portalArea': '...',
// ...

// Recovery Guide
'recovery.pending.title': '...',
// ...
```

---

## FILES TO CREATE

| File | Purpose |
|------|---------|
| `src/components/identity/IdentityLoadingScreen.tsx` | UX-only loading timeout |
| `src/hooks/useTenantDiagnostics.ts` | Read-only diagnostics hook |
| `src/pages/AdminDiagnostics.tsx` | Superadmin diagnostics (no TenantContext) |
| `src/pages/TenantDiagnostics.tsx` | Tenant diagnostics |
| `src/components/ux/RecoveryGuide.tsx` | Reusable recovery component |
| `docs/PRODUCT-SAFETY.md` | Safety contract documentation |
| `docs/IDENTITY-TROUBLESHOOTING.md` | Operator troubleshooting guide |

## FILES TO MODIFY

| File | Changes |
|------|---------|
| `src/contexts/IdentityContext.tsx` | Add new error codes including IDENTITY_TIMEOUT |
| `src/lib/identity/identity-error-escape.ts` | KEY-BASED i18n (return keys, not strings) |
| `src/lib/identity/index.ts` | Export updated types |
| `src/components/identity/IdentityGate.tsx` | Use IdentityLoadingScreen, translate keys |
| `src/components/auth/AccessDenied.tsx` | Contextual messaging |
| `src/lib/billing/resolveTenantBillingState.ts` | Add diagnostic-only transition matrix |
| `src/routes/AppRouter.tsx` | Add diagnostics route |
| `src/App.tsx` | Add admin diagnostics route |
| `src/locales/pt-BR.ts` | All new i18n keys |
| `src/locales/en.ts` | All new i18n keys |
| `src/locales/es.ts` | All new i18n keys |

---

## EXPLICIT CONFIRMATIONS

| Constraint | Status |
|------------|--------|
| ZERO schema changes | ✅ CONFIRMED |
| ZERO RLS changes | ✅ CONFIRMED |
| ZERO guard additions | ✅ CONFIRMED |
| identity-error-escape returns KEYS not strings | ✅ CONFIRMED |
| IdentityContext has 12s hard timeout → IDENTITY_TIMEOUT error | ✅ CONFIRMED |
| Diagnostics distinguishes "no data" vs "no permission" | ✅ CONFIRMED |
| AdminDiagnostics does NOT use TenantContext | ✅ CONFIRMED |
| Loading timeout is UX-ONLY (no navigation/state change) | ✅ CONFIRMED |
| Billing matrix is LOGGING-ONLY (no enforcement) | ✅ CONFIRMED |

---

## REGRESSION CHECKLIST (Manual)

- [ ] Login flow works (email/password)
- [ ] Logout clears session and redirects to `/login`
- [ ] Superadmin can access `/admin`
- [ ] Impersonation shows banner in all layouts
- [ ] Tenant blocked screen shows for inactive tenant
- [ ] Portal access gate shows correct state for each membership status
- [ ] Identity error screen shows for each error code with translated strings
- [ ] Loading > 8s shows timeout warning UI (verify NO redirect, NO state change)
- [ ] Loading > 12s transitions to ERROR state with IDENTITY_TIMEOUT code
- [ ] Timeout warning has working Retry and Logout buttons
- [ ] Admin diagnostics page loads at `/admin/diagnostics` without TenantContext
- [ ] Admin diagnostics with `?tenantId=` shows tenant-specific data
- [ ] Tenant diagnostics page loads at `/:tenant/app/diagnostics`
- [ ] Diagnostics shows explicit "No permission" message when RLS blocks
- [ ] Diagnostics shows explicit "No data" message when empty
- [ ] AccessDenied shows contextual messaging based on route
- [ ] No console errors in auth flow
- [ ] No infinite loaders possible

