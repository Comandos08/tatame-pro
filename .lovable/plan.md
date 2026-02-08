

# P4.3 — RESILIENCE & TESTS (SAFE GOLD)

## Diagn diagnostico do Codebase Atual

### Infraestrutura de Testes Existente

| Componente | Estado | Localização |
|------------|--------|-------------|
| **Playwright Config** | ✅ Configurado | `playwright.config.ts` (60s timeout, retry=2 in CI) |
| **Auth Fixtures** | ✅ Completo | `e2e/fixtures/auth.fixture.ts` (6 roles) |
| **Test Users Seed** | ✅ Configurado | `e2e/fixtures/users.seed.ts` |
| **Auth Helpers** | ✅ Completo | `e2e/helpers/authSession.ts` (session injection) |
| **Security Tests** | ✅ Extensivo | `e2e/security/` (16 specs) |
| **Billing Tests** | ⚠️ Skeleton | `e2e/billing/trial-lifecycle.spec.ts` (all skipped) |
| **Routing Tests** | ✅ Funcional | `e2e/routing/` (3 specs) |
| **UI Tests** | ✅ Funcional | `e2e/ui/` (7 specs) |
| **Observability Tests** | ⚠️ Parcial | `e2e/security/observability-tests.spec.ts` (RLS only) |
| **Resilience Tests** | ❌ Ausente | Nenhum teste de falha de realtime/polling |

### Gaps Identificados para P4.3

| Gap | Impacto | Prioridade |
|-----|---------|------------|
| Zero testes de falha de Realtime | Não validado se polling assume | P4.3.B |
| Zero testes de falha de Polling | Não validado comportamento de erro | P4.3.B |
| Billing tests todos skipped | Fluxos de billing não cobertos | P4.3.A |
| Sem testes de idempotência de alerts | Duplicatas podem passar | P4.3.C |
| Sem validação de cleanup de subscriptions | Memory leaks possíveis | P4.3.C |
| Sem testes de AlertsPanel/AlertBadge UI | P4.2 UX não validada | P4.3.A |

---

## Arquitetura P4.3

```text
┌───────────────────────────────────────────────────────────────┐
│                    P4.3 TEST SUITES                           │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  P4.3.A ─ E2E Critical Flows                                  │
│  ├── observability-ui.spec.ts     (AlertBadge, AlertsPanel)   │
│  ├── auth-identity.spec.ts        (augment existing)         │
│  └── billing-states.spec.ts       (implement skipped tests)   │
│                                                               │
│  P4.3.B ─ Resilience & Failure                                │
│  ├── resilience/realtime-failure.spec.ts                      │
│  ├── resilience/polling-failure.spec.ts                       │
│  └── resilience/mixed-failure.spec.ts                         │
│                                                               │
│  P4.3.C ─ Contract & Invariant                                │
│  ├── contract/alert-invariants.spec.ts                        │
│  └── contract/cleanup-invariants.spec.ts                      │
│                                                               │
│  P4.3.D ─ Test Observability                                  │
│  └── playwright.config.ts updates (traces, screenshots)       │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

---

## P4.3.A — E2E CRITICAL FLOWS

### Tarefa A.1: Observability UI Tests

**Arquivo:** `e2e/observability/observability-ui.spec.ts`

Casos a cobrir:

| Test Case | Descrição | Validação |
|-----------|-----------|-----------|
| A.1.1 | AlertBadge renders correctly | Badge visible, count displays |
| A.1.2 | AlertsPanel opens and closes | Sheet opens on click, closes on ESC |
| A.1.3 | Alert dismiss persists after reload | Dismissed ID in localStorage |
| A.1.4 | "Mark as seen" zera newEventsCount | Counter resets to 0 |
| A.1.5 | Realtime indicator shows connection state | Green=connected, pulse=syncing |
| A.1.6 | Alert sorting by severity | CRITICAL first, then HIGH |
| A.1.7 | Empty state displays correctly | "All clear" message when no alerts |

```typescript
// Structure
test.describe('Observability UI', () => {
  test.describe('AlertBadge', () => {
    test('renders with correct count', async ({ page }) => { ... });
    test('shows realtime connection indicator', async ({ page }) => { ... });
  });
  
  test.describe('AlertsPanel', () => {
    test('opens on badge click', async ({ page }) => { ... });
    test('dismiss persists after reload', async ({ page }) => { ... });
    test('mark as seen resets counter', async ({ page }) => { ... });
  });
});
```

### Tarefa A.2: Implement Billing State Tests

**Arquivo:** `e2e/billing/billing-states.spec.ts`

Implementar os testes que estão "skipped" em `trial-lifecycle.spec.ts`:

| Test Case | Estado | Validação |
|-----------|--------|-----------|
| A.2.1 | TRIALING banner | Info banner with days remaining |
| A.2.2 | TRIAL_EXPIRED blocked actions | ActionBlockedTooltip on sensitive buttons |
| A.2.3 | PENDING_DELETE full block | TenantBlockedScreen with countdown |
| A.2.4 | Read-only ops in TRIAL_EXPIRED | Dashboard, lists accessible |

**Estratégia:** Usar `page.route()` para interceptar e mockar respostas de billing status.

### Tarefa A.3: Auth & Identity Flow Augmentation

**Arquivo:** `e2e/security/auth-identity-flows.spec.ts`

Expandir cobertura existente:

| Test Case | Cenário | Validação |
|-----------|---------|-----------|
| A.3.1 | Login válido por role | Cada role atinge destino correto |
| A.3.2 | Login inválido | Mensagem de erro, não redireciona |
| A.3.3 | Sessão expirada redirect | Vai para /login sem loop |
| A.3.4 | IdentityWizard blocking | Usuário incompleto bloqueado |

---

## P4.3.B — RESILIENCE & FAILURE SCENARIOS

### Tarefa B.1: Realtime Failure Simulation

**Arquivo:** `e2e/resilience/realtime-failure.spec.ts`

```typescript
test.describe('Realtime Failure Resilience', () => {
  test('B.1.1: WebSocket blocked - polling continues', async ({ page }) => {
    // Block WebSocket connections
    await page.route('**/realtime/**', route => route.abort());
    
    // Navigate and verify polling still works
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    
    // isRealtimeConnected should be false (syncing indicator)
    const syncIndicator = page.locator('[class*="animate-pulse"]');
    await expect(syncIndicator).toBeVisible();
    
    // Polling should still load alerts
    await page.waitForTimeout(POLLING_INTERVAL_MS + 1000);
    // Alerts should still be visible
  });
  
  test('B.1.2: Realtime disconnects mid-session', async ({ page }) => {
    // Start with realtime connected
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    
    // Wait for realtime to connect
    await page.waitForSelector('[class*="bg-success"]');
    
    // Then block realtime
    await page.route('**/realtime/**', route => route.abort());
    
    // Force reconnection attempt
    await page.evaluate(() => {
      // Trigger any realtime event
    });
    
    // Should gracefully degrade to polling
    const syncIndicator = page.locator('[class*="animate-pulse"]');
    await expect(syncIndicator).toBeVisible({ timeout: 10000 });
    
    // No console errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    
    expect(errors.filter(e => e.includes('realtime'))).toHaveLength(0);
  });
  
  test('B.1.3: No duplicate alerts from realtime + polling', async ({ page }) => {
    // This test validates idempotency
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    
    // Wait for both realtime and polling to potentially deliver same event
    await page.waitForTimeout(6000);
    
    // Get all alert IDs
    const alertIds = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[data-alert-id]'))
        .map(el => el.getAttribute('data-alert-id'));
    });
    
    // Check for duplicates
    const uniqueIds = new Set(alertIds);
    expect(alertIds.length).toBe(uniqueIds.size);
  });
});
```

### Tarefa B.2: Polling Failure Simulation

**Arquivo:** `e2e/resilience/polling-failure.spec.ts`

```typescript
test.describe('Polling Failure Resilience', () => {
  test('B.2.1: Query failure - error logged, UI stable', async ({ page }) => {
    // Intercept and fail the polling query
    await page.route('**/rest/v1/observability_critical_events*', route => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Internal Server Error' }),
      });
    });
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    
    // UI should still render (not crash)
    await expect(page.locator('body')).toBeVisible();
    
    // Should not show error boundary
    const errorBoundary = page.locator('text=Algo deu errado');
    await expect(errorBoundary).not.toBeVisible();
    
    // Console should log the error
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    
    await page.waitForTimeout(2000);
    expect(consoleErrors.some(e => e.includes('AlertContext'))).toBe(true);
  });
  
  test('B.2.2: Network timeout - graceful handling', async ({ page }) => {
    // Delay response beyond timeout
    await page.route('**/rest/v1/observability_critical_events*', async route => {
      await new Promise(r => setTimeout(r, 15000)); // 15s delay
      route.continue();
    });
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    
    // Page should still be usable
    await expect(page.locator('body')).toBeVisible();
    
    // AlertsPanel should show loading or empty state, not crash
    const alertsBadge = page.locator('button:has(svg.lucide-bell)');
    if (await alertsBadge.isVisible()) {
      await alertsBadge.click();
      // Should show loading or empty, not error
    }
  });
  
  test('B.2.3: React Query retry respects policy', async ({ page }) => {
    let requestCount = 0;
    
    await page.route('**/rest/v1/observability_critical_events*', route => {
      requestCount++;
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Temporary failure' }),
      });
    });
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    
    // Wait for potential retries
    await page.waitForTimeout(10000);
    
    // Should not retry excessively (React Query default: 3 retries)
    expect(requestCount).toBeLessThanOrEqual(4);
  });
});
```

### Tarefa B.3: Mixed Failure Scenario

**Arquivo:** `e2e/resilience/mixed-failure.spec.ts`

```typescript
test.describe('Mixed Failure Resilience', () => {
  test('B.3.1: Both realtime and polling fail, then recover', async ({ page }) => {
    let pollingBlocked = true;
    
    // Block realtime
    await page.route('**/realtime/**', route => route.abort());
    
    // Block polling initially
    await page.route('**/rest/v1/observability_critical_events*', route => {
      if (pollingBlocked) {
        route.fulfill({ status: 503, body: 'Service Unavailable' });
      } else {
        route.continue();
      }
    });
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    
    // UI should still render
    await expect(page.locator('body')).toBeVisible();
    
    // Now "fix" polling
    pollingBlocked = false;
    
    // Trigger manual refresh
    const refreshButton = page.locator('button:has(svg.lucide-refresh-cw)');
    if (await refreshButton.isVisible()) {
      await refreshButton.click();
    }
    
    // System should recover
    await page.waitForTimeout(3000);
    
    // Should now be able to see alerts or empty state (not error)
    const alertsPanel = page.locator('text=/alertas|alerts/i');
    // Just verify no crash
  });
  
  test('B.3.2: AlertContext remains consistent across failures', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    
    // Get initial state
    const initialCount = await page.evaluate(() => {
      // Access AlertContext via React DevTools or localStorage
      const dismissed = JSON.parse(localStorage.getItem('tatame_dismissed_alerts') || '[]');
      return dismissed.length;
    });
    
    // Simulate failure
    await page.route('**/rest/v1/observability_critical_events*', route => {
      route.fulfill({ status: 500, body: 'Error' });
    });
    
    // Trigger refresh
    const refreshButton = page.locator('button:has(svg.lucide-refresh-cw)');
    if (await refreshButton.isVisible()) {
      await refreshButton.click();
    }
    
    await page.waitForTimeout(2000);
    
    // Dismissed state should be preserved
    const afterFailureCount = await page.evaluate(() => {
      const dismissed = JSON.parse(localStorage.getItem('tatame_dismissed_alerts') || '[]');
      return dismissed.length;
    });
    
    expect(afterFailureCount).toBe(initialCount);
  });
});
```

---

## P4.3.C — CONTRACT & INVARIANT TESTS

### Tarefa C.1: Alert Invariants

**Arquivo:** `e2e/contract/alert-invariants.spec.ts`

```typescript
test.describe('Alert Contract Invariants', () => {
  test('C.1.1: Same event never appears twice in alerts', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    
    // Open alerts panel
    const alertsBadge = page.locator('button:has(svg.lucide-bell)');
    await alertsBadge.click();
    
    // Get all alert IDs
    const alertIds = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[data-alert-id]'))
        .map(el => el.getAttribute('data-alert-id'));
    });
    
    // All IDs must be unique
    const uniqueIds = new Set(alertIds);
    expect(alertIds.length).toBe(uniqueIds.size);
  });
  
  test('C.1.2: Dismissed alert never reappears', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    
    // Open panel and dismiss first alert
    const alertsBadge = page.locator('button:has(svg.lucide-bell)');
    await alertsBadge.click();
    
    const firstAlert = page.locator('[data-alert-id]').first();
    const alertId = await firstAlert.getAttribute('data-alert-id');
    
    if (alertId) {
      const dismissButton = firstAlert.locator('button:has(svg.lucide-x)');
      await dismissButton.click();
      
      // Reload page
      await page.reload();
      await page.waitForLoadState('networkidle');
      
      // Re-open panel
      await alertsBadge.click();
      
      // Alert should not reappear
      const reappearedAlert = page.locator(`[data-alert-id="${alertId}"]`);
      await expect(reappearedAlert).not.toBeVisible();
    }
  });
  
  test('C.1.3: Severity ordering is deterministic', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    
    const alertsBadge = page.locator('button:has(svg.lucide-bell)');
    await alertsBadge.click();
    
    // Get severity order
    const severities = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[data-alert-severity]'))
        .map(el => el.getAttribute('data-alert-severity'));
    });
    
    // Verify CRITICAL/HIGH come before MEDIUM/LOW
    const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    let lastOrder = -1;
    
    for (const sev of severities) {
      if (sev) {
        const order = severityOrder[sev as keyof typeof severityOrder] ?? 4;
        expect(order).toBeGreaterThanOrEqual(lastOrder);
        lastOrder = order;
      }
    }
  });
});
```

### Tarefa C.2: Cleanup Invariants

**Arquivo:** `e2e/contract/cleanup-invariants.spec.ts`

```typescript
test.describe('Resource Cleanup Invariants', () => {
  test('C.2.1: No orphan intervals after navigation', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', err => jsErrors.push(err.message));
    
    await loginAsSuperAdmin(page);
    
    // Navigate to health dashboard
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    
    // Wait for realtime to connect
    await page.waitForTimeout(2000);
    
    // Navigate away
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    
    // Navigate back
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    
    // Wait for potential interval errors
    await page.waitForTimeout(5000);
    
    // No "cannot perform state update on unmounted" errors
    const mountErrors = jsErrors.filter(e => 
      e.includes('unmounted') || 
      e.includes('memory leak')
    );
    expect(mountErrors).toHaveLength(0);
  });
  
  test('C.2.2: Realtime channel is removed on unmount', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    
    // Wait for channel to be created
    await page.waitForTimeout(2000);
    
    // Check initial channel count
    const initialChannels = await page.evaluate(() => {
      // @ts-ignore - accessing internal state
      return (window as any).__supabaseChannelCount || 0;
    });
    
    // Navigate away
    await page.goto('/admin');
    await page.waitForTimeout(1000);
    
    // Navigate back
    await page.goto('/admin/health');
    await page.waitForTimeout(2000);
    
    // Channel count should not increase indefinitely
    const finalChannels = await page.evaluate(() => {
      // @ts-ignore
      return (window as any).__supabaseChannelCount || 0;
    });
    
    // Should not have leaked channels (allow 1 for current subscription)
    expect(finalChannels).toBeLessThanOrEqual(initialChannels + 1);
  });
  
  test('C.2.3: No duplicate listeners after rapid navigation', async ({ page }) => {
    await loginAsSuperAdmin(page);
    
    // Rapid navigation
    for (let i = 0; i < 5; i++) {
      await page.goto('/admin/health', { waitUntil: 'commit' });
      await page.goto('/admin', { waitUntil: 'commit' });
    }
    
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Verify only one subscription active by checking connection indicator
    const connectionIndicators = page.locator('[class*="bg-success"], [class*="animate-pulse"]');
    const indicatorCount = await connectionIndicators.count();
    
    // Should have exactly one indicator (not multiple stacked)
    expect(indicatorCount).toBeLessThanOrEqual(2); // Badge + Panel could both show
  });
});
```

### Tarefa C.3: SAFE GOLD Invariants

**Arquivo:** `e2e/contract/safe-gold-invariants.spec.ts`

```typescript
test.describe('SAFE GOLD Invariants', () => {
  test('C.3.1: Observability never mutates business data', async ({ page }) => {
    // Intercept all POST/PUT/DELETE to business tables
    const mutations: string[] = [];
    
    await page.route('**/rest/v1/**', (route, request) => {
      const method = request.method();
      const url = request.url();
      
      if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
        // Exclude observability-related tables
        if (!url.includes('decision_logs') && 
            !url.includes('audit_logs') && 
            !url.includes('security_events')) {
          mutations.push(`${method} ${url}`);
        }
      }
      route.continue();
    });
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    
    // Interact with observability UI
    const alertsBadge = page.locator('button:has(svg.lucide-bell)');
    if (await alertsBadge.isVisible()) {
      await alertsBadge.click();
      
      // Try to dismiss an alert
      const dismissButton = page.locator('button:has(svg.lucide-x)').first();
      if (await dismissButton.isVisible()) {
        await dismissButton.click();
      }
    }
    
    // Refresh
    const refreshButton = page.locator('button:has(svg.lucide-refresh-cw)');
    if (await refreshButton.isVisible()) {
      await refreshButton.click();
    }
    
    await page.waitForTimeout(2000);
    
    // No mutations to business tables should have occurred
    expect(mutations).toHaveLength(0);
  });
  
  test('C.3.2: No navigate() calls in realtime handlers', async ({ page }) => {
    const navigationEvents: string[] = [];
    
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) {
        navigationEvents.push(frame.url());
      }
    });
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    
    // Record URL after initial navigation
    const stableUrl = page.url();
    
    // Wait for potential realtime events
    await page.waitForTimeout(10000);
    
    // URL should not have changed due to realtime events
    expect(page.url()).toBe(stableUrl);
    
    // Navigation history should be minimal (initial nav only)
    const postLoadNavigations = navigationEvents.filter(
      url => !url.includes('/admin/health')
    );
    expect(postLoadNavigations).toHaveLength(0);
  });
});
```

---

## P4.3.D — TEST OBSERVABILITY

### Tarefa D.1: Playwright Config Updates

**Arquivo:** `playwright.config.ts`

```typescript
// Add to existing config
export default defineConfig({
  // ... existing config
  
  // Enhanced reporting for P4.3
  reporter: [
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  
  // Capture more on failure
  use: {
    // ... existing
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  
  // Add project for resilience tests
  projects: [
    // ... existing projects
    {
      name: 'resilience',
      testDir: './e2e/resilience',
      use: { ...devices['Desktop Chrome'] },
      retries: 0, // Resilience tests should not auto-retry
    },
    {
      name: 'contract',
      testDir: './e2e/contract',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
```

### Tarefa D.2: Test Logger Utility

**Arquivo:** `e2e/helpers/testLogger.ts`

```typescript
/**
 * Structured logging for E2E tests
 * Prefixes: [E2E], [RESILIENCE], [CONTRACT]
 */

export type TestCategory = 'E2E' | 'RESILIENCE' | 'CONTRACT';

export function logTestStep(category: TestCategory, message: string): void {
  console.log(`[${category}] ${message}`);
}

export function logTestError(category: TestCategory, error: Error): void {
  console.error(`[${category}] ERROR: ${error.message}`);
  if (error.stack) {
    console.error(`[${category}] Stack: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
  }
}

export function logTestAssertion(category: TestCategory, assertion: string, passed: boolean): void {
  const status = passed ? '✅' : '❌';
  console.log(`[${category}] ${status} ${assertion}`);
}
```

---

## Arquivos a Criar

| Arquivo | PI | Descrição |
|---------|-----|-----------|
| `e2e/observability/observability-ui.spec.ts` | A | AlertBadge, AlertsPanel UI tests |
| `e2e/billing/billing-states.spec.ts` | A | Billing state UI tests |
| `e2e/security/auth-identity-flows.spec.ts` | A | Augmented auth tests |
| `e2e/resilience/realtime-failure.spec.ts` | B | Realtime failure simulation |
| `e2e/resilience/polling-failure.spec.ts` | B | Polling failure simulation |
| `e2e/resilience/mixed-failure.spec.ts` | B | Combined failure scenarios |
| `e2e/contract/alert-invariants.spec.ts` | C | Alert dedup, dismiss, ordering |
| `e2e/contract/cleanup-invariants.spec.ts` | C | Memory leak, subscription cleanup |
| `e2e/contract/safe-gold-invariants.spec.ts` | C | No mutations, no nav in handlers |
| `e2e/helpers/testLogger.ts` | D | Structured test logging |

## Arquivos a Modificar

| Arquivo | PI | Mudança |
|---------|-----|---------|
| `playwright.config.ts` | D | Add resilience/contract projects, enhance reporting |
| `src/components/observability/AlertsPanel.tsx` | A | Add data-alert-id, data-alert-severity attributes |
| `e2e/fixtures/auth.fixture.ts` | A | Export quickLoginAsSuperAdmin for resilience tests |

---

## Critérios de Aceitação

### E2E Critical Flows (A)
- [ ] AlertBadge renderiza e mostra count
- [ ] AlertsPanel abre/fecha corretamente
- [ ] Dismiss persiste após reload
- [ ] "Mark as seen" zera contador
- [ ] Billing states mostram UI correta

### Resilience (B)
- [ ] Realtime bloqueado → polling continua
- [ ] Polling falha → UI não crasha
- [ ] Recuperação após falha mista
- [ ] Zero duplicatas em qualquer cenário

### Contract (C)
- [ ] Mesmo evento nunca aparece 2x
- [ ] Dismissed nunca reaparece
- [ ] Subscriptions são limpas no unmount
- [ ] Zero mutações em dados de negócio
- [ ] Zero navigate() em handlers realtime

### Test Observability (D)
- [ ] Reports HTML gerados
- [ ] Screenshots em falhas
- [ ] Traces em retries
- [ ] Logs estruturados com prefixos

---

## Ordem de Execução

```text
1. Modificar AlertsPanel para adicionar data attributes
    │
    ▼
2. P4.3.A — E2E Critical Flows
    │ observability-ui.spec.ts
    │ billing-states.spec.ts
    │ auth-identity-flows.spec.ts
    │
    ▼
3. P4.3.B — Resilience Tests
    │ realtime-failure.spec.ts
    │ polling-failure.spec.ts
    │ mixed-failure.spec.ts
    │
    ▼
4. P4.3.C — Contract Tests
    │ alert-invariants.spec.ts
    │ cleanup-invariants.spec.ts
    │ safe-gold-invariants.spec.ts
    │
    ▼
5. P4.3.D — Test Observability
    │ playwright.config.ts updates
    │ testLogger.ts
    │
    ▼
6. Run full test suite & validate
    │
    ▼
P4.3 CLOSED
```

---

## Garantias SAFE GOLD

Este PI **NÃO**:
- Altera regras de negócio
- Modifica fluxos de navegação
- Cria side-effects em produção
- Depende de realtime para funcionar
- Altera schemas ou dados reais

Este PI **APENAS**:
- Detecta regressões antes de produção
- Prova fallback realtime → polling
- Garante cleanup de recursos
- Valida ausência de memory leaks
- Torna falhas observáveis

---

## Notas Técnicas

### Dependências de Test Data

Os testes de observabilidade precisam de dados na `observability_critical_events` view. Se não houver dados:
- Testes de AlertBadge/AlertsPanel validarão empty state
- Testes de idempotência serão skipped

### Mocking Strategy

- **Realtime:** `page.route('**/realtime/**')` para bloquear WebSocket
- **Polling:** `page.route('**/rest/v1/observability_critical_events*')` para simular erros
- **Billing:** `page.route('**/rest/v1/tenant_billing*')` para mockar estados

### CI Considerations

- Resilience tests com `retries: 0` para detectar flakiness
- Contract tests podem ser mais lentos (navigation patterns)
- Timeout de 60s é suficiente para todos os cenários

