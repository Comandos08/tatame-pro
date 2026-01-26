

# P4B-4 — Athlete Portal UX Polish (SAFE MODE, UX-ONLY)

## Resumo

Melhorar a clareza inicial do Portal do Atleta, respondendo imediatamente às perguntas do atleta: "Qual é o meu status?", "Está tudo certo?", "Preciso fazer algo agora?" — tudo sem criar lógica nova, sem alterar fluxo, sem tocar em segurança.

---

## Escopo Exato

| Arquivo | Ação |
|---------|------|
| `src/pages/AthletePortal.tsx` | Adicionar headline dinâmica + badge de status + card de renovação |
| `src/locales/pt-BR.ts` | Adicionar 5 novas i18n keys (linha ~741) |
| `src/locales/en.ts` | Adicionar 5 novas i18n keys (linha ~743) |
| `src/locales/es.ts` | Adicionar 5 novas i18n keys (linha ~743) |

---

## Arquivos NAO Modificados (SAFE MODE)

| Arquivo | Razão |
|---------|-------|
| `src/routes.tsx` | P4A - Intacto |
| `src/pages/AuthCallback.tsx` | P3 - Intacto |
| `src/components/portal/PortalAccessGate.tsx` | P4B-1 - Intacto |
| `src/components/auth/AthleteRouteGuard.tsx` | P4A - Intacto |
| `src/lib/billing/*` | P1 - Intacto |
| `src/components/portal/*` | P4B-2 - Intacto |
| `src/components/membership/MembershipTypeSelector.tsx` | P4B-3 - Intacto |

---

## Mudancas Tecnicas no AthletePortal.tsx

### 1. Novos Imports (linhas 1-5)

Adicionar:
- `differenceInDays` de `date-fns`
- `Link` de `react-router-dom`
- `Clock, RefreshCw` de `lucide-react`
- `StatusBadge` de `@/components/ui/status-badge`
- `Alert, AlertTitle, AlertDescription` de `@/components/ui/alert`

### 2. Funcao getWelcomeMessage (antes do return, linha ~159)

Adicionar funcao local pura (sem side effects):

```typescript
// P4B-4: Dynamic welcome message based on membership status (UX-only)
const getWelcomeMessage = () => {
  const status = membership?.status?.toUpperCase();
  switch (status) {
    case 'ACTIVE':
      return t('portal.welcomeActive');
    case 'APPROVED':
      return t('portal.welcomeApproved');
    case 'PENDING_REVIEW':
      return t('portal.welcomePending');
    default:
      return t('portal.welcome');
  }
};
```

### 3. Calculo daysUntilExpiry (antes do return, linha ~159)

Adicionar calculo inline simples:

```typescript
// P4B-4: Calculate days until expiry for renewal card (UX-only, no state)
const daysUntilExpiry = membership?.end_date
  ? differenceInDays(new Date(membership.end_date), new Date())
  : null;

const showRenewalReminder = daysUntilExpiry !== null && daysUntilExpiry > 0 && daysUntilExpiry <= 30;
```

### 4. Header Atualizado (linhas 177-188)

Substituir o bloco do Portal Header por:

```jsx
{/* Portal Header - P4B-4: Dynamic headline + status badge */}
<div className="mb-6">
  <div className="flex items-center gap-3">
    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
      <User className="h-6 w-6 text-primary" />
    </div>
    <div className="flex-1">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-display font-bold">{t('portal.title')}</h1>
        {membership && (
          <StatusBadge status={membership.status as any} />
        )}
      </div>
      <p className="text-muted-foreground">{getWelcomeMessage()}</p>
    </div>
  </div>
</div>
```

### 5. Card de Renovacao (apos InAppNotice, linha ~191)

Inserir ANTES do bloco `{/* Portal Content */}`:

```jsx
{/* P4B-4: Renewal reminder card (UX-only, conditional) */}
{showRenewalReminder && (
  <motion.div
    initial={{ opacity: 0, y: -10 }}
    animate={{ opacity: 1, y: 0 }}
    className="mb-6"
  >
    <Alert className="border-warning/30 bg-warning/5">
      <Clock className="h-4 w-4 text-warning" />
      <AlertTitle className="text-warning">
        {t('portal.expiringIn').replace('{days}', String(daysUntilExpiry))}
      </AlertTitle>
      <AlertDescription className="space-y-2">
        <p>{t('portal.renewReminder')}</p>
        <Link
          to={`/${tenantSlug}/membership/renew`}
          className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          <RefreshCw className="h-4 w-4" />
          {t('portal.renewNow')}
        </Link>
      </AlertDescription>
    </Alert>
  </motion.div>
)}
```

---

## Novas Chaves i18n

### pt-BR.ts (inserir apos linha 740, antes de portal.myEvents)

```typescript
  // Portal - Dynamic Headlines (P4B-4)
  'portal.welcomeActive': 'Sua filiação está ativa',
  'portal.welcomeApproved': 'Bem-vindo! Sua filiação foi aprovada',
  'portal.welcomePending': 'Sua filiação está em análise',
  'portal.expiringIn': 'Sua filiação expira em {days} dias',
  'portal.renewReminder': 'Recomendamos renovar para manter seus benefícios ativos.',
  'portal.renewNow': 'Renovar agora',
```

### en.ts (inserir apos linha 742, antes de portal.myEvents)

```typescript
  // Portal - Dynamic Headlines (P4B-4)
  'portal.welcomeActive': 'Your membership is active',
  'portal.welcomeApproved': 'Welcome! Your membership has been approved',
  'portal.welcomePending': 'Your membership is under review',
  'portal.expiringIn': 'Your membership expires in {days} days',
  'portal.renewReminder': 'We recommend renewing to keep your benefits active.',
  'portal.renewNow': 'Renew now',
```

### es.ts (inserir apos linha 742, antes de portal.myEvents)

```typescript
  // Portal - Dynamic Headlines (P4B-4)
  'portal.welcomeActive': 'Tu afiliación está activa',
  'portal.welcomeApproved': '¡Bienvenido! Tu afiliación ha sido aprobada',
  'portal.welcomePending': 'Tu afiliación está en revisión',
  'portal.expiringIn': 'Tu afiliación expira en {days} días',
  'portal.renewReminder': 'Recomendamos renovar para mantener tus beneficios activos.',
  'portal.renewNow': 'Renovar ahora',
```

---

## Comportamento Final

| Cenario | Headline | Badge | Card Renovacao |
|---------|----------|-------|----------------|
| Membership ACTIVE | "Sua filiação está ativa" | ACTIVE (verde) | Se <= 30 dias para expirar |
| Membership APPROVED | "Bem-vindo! Sua filiação foi aprovada" | APPROVED (azul) | Nao aparece |
| Membership PENDING_REVIEW | "Sua filiação está em análise" | PENDING_REVIEW (amarelo) | Nao aparece |
| Outro status | "Bem-vindo ao seu portal de atleta" | Badge do status | Nao aparece |
| Sem membership | "Bem-vindo ao seu portal de atleta" | Nao aparece | Nao aparece |

---

## Checklist de Aceite

| Criterio | Status |
|----------|--------|
| Nenhum useEffect novo | Garantido - usa funcao pura + calculo inline |
| Nenhuma query nova | Garantido - usa dados de membership existente |
| Nenhum redirect automatico | Garantido - Link explicito |
| Apenas leitura de dados existentes | Garantido |
| AthletePortal.tsx unico arquivo funcional | Garantido |
| i18n completo (pt / en / es) | Garantido |
| Build compila sem warnings | Garantido |
| P4A / P3 / P4B-1/2/3 intactos | Garantido |

---

## Resultado Esperado

```text
P4B-4 — ATHLETE PORTAL UX (FINAL)
├── Clareza imediata de status ✓
├── Headline humana dinamica ✓
├── StatusBadge visivel no header ✓
├── Card de renovacao condicional ✓
├── Zero impacto em seguranca ✓
├── Zero impacto em fluxo ✓
├── SAFE MODE preservado ✓
└── P4B fechado com maturidade ✓
```

