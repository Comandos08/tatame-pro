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

O `IdentityGuard.shouldBypass` define as seguintes regras:

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
| Remover regras de `BYPASS_ROUTES` ou `PUBLIC_TENANT_PATTERNS` | Quebra fluxo de receita |
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
