

# P1 — ROUTING & IDENTITY REGRESSION SHIELD (EXECUÇÃO)

## RESUMO EXECUTIVO

| Métrica | Valor |
|---------|-------|
| Arquivos a CRIAR | 2 |
| Arquivos a MODIFICAR | 1 |
| Alterações em P0 | ZERO |
| Testes E2E novos | 6 |
| Ajustes de robustez | 3 aplicados |

---

## ARQUIVOS A CRIAR

### 1. e2e/routing/p0-regression.spec.ts

Suite E2E de regressão com ajuste para evitar acúmulo de listeners:

```typescript
/**
 * 🔐 P1 — P0 ROUTING REGRESSION TESTS
 * 
 * Validates that critical routes from P0 never regress:
 * - No 404 on revenue-critical paths
 * - No improper redirects to /identity/wizard
 * - Public routes remain public
 * 
 * RUN: npx playwright test p0-regression
 */

import { test, expect, Page } from '@playwright/test';

const TEST_TENANT = process.env.E2E_TEST_TENANT_SLUG || 'federacao-demo';

// ===== HELPERS =====

/**
 * Assert: URL does NOT contain /identity/wizard
 * (improper redirect detection)
 */
async function expectNoWizardRedirect(page: Page, context: string) {
  const url = page.url();
  expect(
    url.includes('/identity/wizard'),
    `${context}: Improper redirect to /identity/wizard detected. URL: ${url}`
  ).toBe(false);
}

/**
 * Assert: Page does NOT show 404/NotFound content
 */
async function expectNotFoundAbsent(page: Page, context: string) {
  const notFoundIndicators = [
    page.locator('text=404'),
    page.locator('text=Page not found'),
    page.locator('text=Página não encontrada'),
    page.locator('[data-testid="not-found"]'),
  ];
  
  for (const indicator of notFoundIndicators) {
    const isVisible = await indicator.isVisible({ timeout: 1000 }).catch(() => false);
    expect(isVisible, `${context}: 404 indicator visible`).toBe(false);
  }
}

/**
 * Assert: No critical console errors
 * 
 * ALLOWLIST CRITERIA (P1 Robustez Ajuste 1):
 * - ResizeObserver: Browser timing noise
 * - net::ERR_BLOCKED_BY_CLIENT: Ad blockers
 * - chunk-: Vite HMR artifacts
 * - 426 Upgrade Required: WebSocket fallback (benign)
 * - favicon: Missing favicon is not critical
 * 
 * NOTE: Supabase errors are NOT filtered to catch real auth/RLS issues
 */
const BENIGN_ERROR_PATTERNS = [
  /ResizeObserver/i,
  /net::ERR_BLOCKED_BY_CLIENT/i,
  /chunk-.*\.js/i,
  /426.*Upgrade Required/i,
  /Failed to fetch.*favicon/i,
];

function expectNoConsoleErrors(errors: string[], context: string) {
  const criticalErrors = errors.filter(e => 
    !BENIGN_ERROR_PATTERNS.some(pattern => pattern.test(e))
  );
  
  expect(
    criticalErrors.length,
    `${context}: Critical JS errors found: ${criticalErrors.join(', ')}`
  ).toBe(0);
}

// ===== TESTS =====
// NOTA: Cada teste cria seu próprio listener de pageerror para evitar acúmulo

test.describe('🛡️ P0 Routing Regression Shield', () => {
  
  test('T1: Landing page opens without error or wizard redirect', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', error => consoleErrors.push(error.message));
    
    await page.context().clearCookies();
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    
    const heroContent = page.locator('text=/gerencie|organização|federation|martial/i');
    await expect(heroContent.first()).toBeVisible({ timeout: 10000 });
    
    await expectNoWizardRedirect(page, 'T1');
    await expectNotFoundAbsent(page, 'T1');
    expectNoConsoleErrors(consoleErrors, 'T1');
  });

  test('T2: Login page opens and does not redirect to wizard', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', error => consoleErrors.push(error.message));
    
    await page.context().clearCookies();
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');
    
    const loginElement = page.locator('input[type="email"], input[type="password"], button:has-text(/entrar|login|sign in/i)');
    await expect(loginElement.first()).toBeVisible({ timeout: 10000 });
    
    await expectNoWizardRedirect(page, 'T2');
    await expectNotFoundAbsent(page, 'T2');
    expectNoConsoleErrors(consoleErrors, 'T2');
  });

  test('T3: Tenant landing opens (public)', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', error => consoleErrors.push(error.message));
    
    await page.context().clearCookies();
    await page.goto(`/${TEST_TENANT}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    
    await expectNoWizardRedirect(page, 'T3');
    await expectNotFoundAbsent(page, 'T3');
    expectNoConsoleErrors(consoleErrors, 'T3');
    
    const url = page.url();
    expect(url).toMatch(new RegExp(`/${TEST_TENANT}|/login`));
  });

  test('T4: Membership renew is public and opens (REVENUE-CRITICAL)', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', error => consoleErrors.push(error.message));
    
    await page.context().clearCookies();
    await page.goto(`/${TEST_TENANT}/membership/renew`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    
    await expectNoWizardRedirect(page, 'T4');
    await expectNotFoundAbsent(page, 'T4');
    expectNoConsoleErrors(consoleErrors, 'T4');
    
    const hasContent = await page.locator('body').textContent();
    expect(hasContent?.length).toBeGreaterThan(100);
  });

  test('T5: Verify routes are public', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', error => consoleErrors.push(error.message));
    
    await page.context().clearCookies();
    
    const verifyRoutes = [
      `/${TEST_TENANT}/verify/card`,
      `/${TEST_TENANT}/verify/diploma`,
    ];
    
    for (const route of verifyRoutes) {
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1000);
      
      await expectNoWizardRedirect(page, `T5 (${route})`);
      await expectNotFoundAbsent(page, `T5 (${route})`);
      
      const url = page.url();
      expect(url).not.toContain('/login');
    }
    
    expectNoConsoleErrors(consoleErrors, 'T5');
  });

  // P1 Robustez Ajuste 2: Teste explicitamente restritivo contra /identity/wizard
  test('T6: Admin AppRouter protected route MUST redirect to /login, NEVER to /identity/wizard', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', error => consoleErrors.push(error.message));
    
    await page.context().clearCookies();
    await page.goto(`/${TEST_TENANT}/app`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    
    const url = page.url();
    
    // CRITICAL: Explicit anti-wizard assertion FIRST
    expect(
      url.includes('/identity/wizard'),
      'CRITICAL: Unauthenticated admin route redirected to /identity/wizard instead of /login'
    ).toBe(false);
    
    // THEN assert correct behavior
    expect(url).toContain('/login');
    
    await expectNotFoundAbsent(page, 'T6');
    expectNoConsoleErrors(consoleErrors, 'T6');
  });
});

test.describe('🔒 Anti-Wizard Regression Shield', () => {
  test('Unauthenticated user never goes to /identity/wizard from public routes', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', error => consoleErrors.push(error.message));
    
    await page.context().clearCookies();
    
    const publicRoutes = [
      '/',
      '/login',
      '/help',
      '/forgot-password',
      `/${TEST_TENANT}`,
      `/${TEST_TENANT}/login`,
      `/${TEST_TENANT}/membership/new`,
      `/${TEST_TENANT}/membership/adult`,
      `/${TEST_TENANT}/membership/renew`,
      `/${TEST_TENANT}/verify/card`,
      `/${TEST_TENANT}/academies`,
      `/${TEST_TENANT}/rankings`,
      `/${TEST_TENANT}/events`,
    ];
    
    for (const route of publicRoutes) {
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(500);
      
      await expectNoWizardRedirect(page, route);
    }
    
    expectNoConsoleErrors(consoleErrors, 'Anti-Wizard Shield');
  });
});
```

---

### 2. docs/routing-lock.md

```markdown
# 🔒 ROUTING LOCK — Contrato de Estabilidade

> **STATUS: LOCKED** após P0.3
> 
> Este documento define as regras imutáveis de roteamento do sistema.
> Qualquer alteração deve passar por revisão formal.

## Árvore de Rotas (Resumo)

```text
App.tsx (ORQUESTRADOR)
├── / ─────────────────► Landing (PUBLIC)
├── /login ────────────► Login (PUBLIC)
├── /help ─────────────► Help (PUBLIC)
├── /forgot-password ──► ForgotPassword (PUBLIC)
├── /reset-password ───► ResetPassword (PUBLIC)
├── /auth/callback ────► AuthCallback (PUBLIC)
├── /identity/wizard ──► IdentityWizard (AUTH ONLY)
├── /portal/* ─────────► PortalRouter (AUTH ONLY)
├── /admin ────────────► AdminDashboard (SUPERADMIN)
│
└── /:tenantSlug ──────► TenantLayout
    ├── index ─────────► TenantLanding (PUBLIC)
    ├── login ─────────► AthleteLogin (PUBLIC)
    ├── membership/* ──► MembershipRouter (PUBLIC)
    ├── verify/* ──────► VerifyRouter (PUBLIC)
    ├── portal/* ──────► Athlete Portal (AUTH)
    ├── app/* ─────────► AppRouter (TENANT_ADMIN)
    ├── academies ─────► PublicAcademies (PUBLIC)
    ├── rankings ──────► PublicRankings (PUBLIC)
    └── events/* ──────► PublicEvents (PUBLIC)
```

## Regras de Rotas Públicas

O `IdentityGate.isPublicPath()` define as seguintes regras:

### Rotas Globais Públicas
- `/`, `/login`, `/forgot-password`, `/reset-password`, `/help`, `/auth/callback`
- `/identity/wizard`, `/identity/error`

### Rotas de Tenant Públicas (Regex)
```typescript
/^\/[^/]+\/?$/                    // /:tenantSlug
/^\/[^/]+\/login\/?$/             // /:tenantSlug/login
/^\/[^/]+\/verify\/?.*$/          // /:tenantSlug/verify/* (ALL)
/^\/[^/]+\/academies\/?$/         // /:tenantSlug/academies
/^\/[^/]+\/rankings\/?$/          // /:tenantSlug/rankings
/^\/[^/]+\/events\/?$/            // /:tenantSlug/events
/^\/[^/]+\/events\/[^/]+\/?$/     // /:tenantSlug/events/:id
/^\/[^/]+\/membership\/?.*$/      // /:tenantSlug/membership/* (ALL - REVENUE CRITICAL)
```

## 🚫 Anti-Regressões (O QUE NÃO FAZER)

| ❌ Proibido | 📌 Motivo |
|-------------|-----------|
| Remover regras de `isPublicPath()` | Quebra fluxo de receita |
| Adicionar auth requirement a `/membership/*` | Bloqueia renovação |
| Modificar ordem de providers | Crash de runtime |
| Redirecionar `/login` para `/identity/wizard` | Loop infinito |
| Alterar App.tsx sem validar E2E | Risco de 404 em massa |
| Criar redirects automáticos em guards | Comportamento imprevisível |
| Modificar DEV guardrail para alterar comportamento | Viola contrato de observabilidade |

## ✅ Smoke Check (5 Itens)

Antes de qualquer merge que toque em roteamento, valide:

1. **Landing** (`/`) renderiza sem loader infinito
2. **Login** (`/login`) não redireciona para wizard
3. **Tenant landing** (`/federacao-demo`) é acessível
4. **Membership renew** (`/federacao-demo/membership/renew`) não dá 404
5. **Admin app** (`/federacao-demo/app`) redireciona para login (não wizard)

### Comando de Validação
```bash
npx playwright test p0-regression --project=chromium
```

## 📊 Histórico de Bloqueio

| Data | Versão | Motivo |
|------|--------|--------|
| 2026-01-30 | P0.3 | Correção definitiva de ~40 rotas |
| 2026-01-30 | P1 | Adição de testes de regressão e guardrail DEV |

---

> **ATENÇÃO**: Este documento é contratual. Alterações requerem:
> 1. Aprovação formal
> 2. Execução de suite E2E completa
> 3. Atualização deste documento
```

---

## ARQUIVO A MODIFICAR

### 3. src/components/identity/IdentityGate.tsx

**Linhas 135-138 — Adicionar guardrail DEV após o bypass de rotas públicas:**

```typescript
  // ✅ HARD BYPASS: public routes must NEVER be blocked by auth/identity loaders
  if (isPublicPath(pathname)) {
    return <>{children}</>;
  }

  // ===== DEV GUARDRAIL: OBSERVABILITY ONLY =====
  // 🚨 WARNING: This block is for DIAGNOSTICS ONLY.
  // DO NOT add navigation logic, redirects, or any behavior changes here.
  // Its sole purpose is to detect and log improper wizard redirects during development.
  // Any modification to this block that affects runtime behavior is STRICTLY PROHIBITED.
  // See: docs/routing-lock.md
  if (import.meta.env.DEV) {
    if (!isAuthenticated && pathname === '/identity/wizard') {
      console.warn('[IdentityGate] 🚨 DEV GUARDRAIL: Unauthenticated user landed on /identity/wizard', {
        pathname,
        isAuthenticated,
        referrer: document.referrer,
        timestamp: new Date().toISOString(),
        hint: 'This should NEVER happen. Check isPublicPath() rules.',
      });
    }
  }
```

---

## AJUSTES DE ROBUSTEZ APLICADOS

| # | Ajuste | Implementação |
|---|--------|---------------|
| 1 | Filtragem específica de erros | `BENIGN_ERROR_PATTERNS` regex array, Supabase NÃO filtrado |
| 2 | T6 anti-wizard explícito | Asserção contra wizard ANTES de validar /login |
| 3 | Comentário observabilidade | Bloco DEV com 5 linhas de WARNING |
| 4 | Evitar acúmulo de listeners | Cada teste cria seu próprio array local de `consoleErrors` |

---

## COMANDOS DE EXECUÇÃO

```bash
# Rodar suite de regressão P0
npx playwright test p0-regression --project=chromium

# Rodar todos os testes de routing
npx playwright test routing --project=chromium

# Ver relatório
npx playwright show-report
```

---

## CHECKLIST FINAL

### Entregas
- [x] e2e/routing/p0-regression.spec.ts (6 testes + anti-wizard shield)
- [x] docs/routing-lock.md (documentação contratual)
- [x] IdentityGate.tsx (guardrail DEV-only)

### Garantias
- [x] ZERO alterações em P0
- [x] ZERO alterações em RLS
- [x] ZERO alterações em AuthContext
- [x] ZERO redirects automáticos novos
- [x] Guardrail é DEV-only e não afeta comportamento
- [x] Listeners de pageerror são locais a cada teste (sem acúmulo)

