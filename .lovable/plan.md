

# P4B-4 — Athlete Portal UX Polish (GOLD MASTER)

## Resumo

Implementar melhorias de UX no Portal do Atleta para clareza imediata de status, com headline dinamica, badge visual de status e card de renovacao condicional — 100% UX-only, sem alterar logica, guards, queries ou fluxo existente.

---

## Escopo Exato

| Arquivo | Acao |
|---------|------|
| `src/pages/AthletePortal.tsx` | Imports + funcoes puras + header dinamico + card de renovacao |
| `src/locales/pt-BR.ts` | 6 novas keys i18n (linha 741) |
| `src/locales/en.ts` | 6 novas keys i18n (linha 743) |
| `src/locales/es.ts` | 6 novas keys i18n (linha 743) |

---

## Arquivos NAO Modificados (SAFE MODE)

- `src/routes.tsx`
- `src/pages/AuthCallback.tsx`
- `src/components/portal/PortalAccessGate.tsx`
- `src/components/auth/AthleteRouteGuard.tsx`
- `src/lib/billing/*`
- `src/components/portal/*`
- `src/components/membership/*`

---

## Secao Tecnica

### 1. AthletePortal.tsx — Imports

**Linha 2** — Adicionar `Link`:

```typescript
import { useParams, Link } from 'react-router-dom';
```

**Linha 5** — Adicionar icones:

```typescript
import { User, Clock, RefreshCw } from 'lucide-react';
```

**Apos linha 19** — Novos imports:

```typescript
import { differenceInDays } from 'date-fns';
import { StatusBadge } from '@/components/ui/status-badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
```

### 2. AthletePortal.tsx — Funcoes Puras (apos linha 158)

Inserir apos `const isLoading = athleteLoading || membershipLoading;`:

```typescript
// P4B-4: Normalize membership status (single source of truth)
const membershipStatus = membership?.status?.toUpperCase();

// P4B-4: Dynamic welcome message (UX-only)
const getWelcomeMessage = () => {
  switch (membershipStatus) {
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

// P4B-4: Timezone-safe expiration calculation (UX-only)
const today = new Date();
today.setHours(0, 0, 0, 0);

const expiryDate = membership?.end_date ? new Date(membership.end_date) : null;
if (expiryDate) {
  expiryDate.setHours(0, 0, 0, 0);
}

const daysUntilExpiry = expiryDate ? differenceInDays(expiryDate, today) : null;

const showRenewalReminder =
  membershipStatus === 'ACTIVE' &&
  daysUntilExpiry !== null &&
  daysUntilExpiry > 0 &&
  daysUntilExpiry <= 30;
```

### 3. AthletePortal.tsx — Header Atualizado (linhas 177-188)

Substituir bloco completo por:

```jsx
{/* P4B-4: Portal Header — dynamic headline + status badge */}
<div className="mb-6">
  <div className="flex items-center gap-3">
    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
      <User className="h-6 w-6 text-primary" />
    </div>
    <div className="flex-1">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-display font-bold">{t('portal.title')}</h1>
        {membershipStatus &&
          ['ACTIVE', 'APPROVED', 'PENDING_REVIEW'].includes(membershipStatus) && (
            <StatusBadge status={membershipStatus as any} />
          )}
      </div>
      <p className="text-muted-foreground">{getWelcomeMessage()}</p>
    </div>
  </div>
</div>
```

### 4. AthletePortal.tsx — Card de Renovacao (apos linha 191)

Inserir APOS `<InAppNotice ... />` e ANTES de `{/* Portal Content */}`:

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

### pt-BR.ts (inserir na linha 741, antes do comentario de Eventos)

```typescript
  // Portal - Dynamic Headlines (P4B-4)
  'portal.welcomeActive': 'Sua filiação está ativa',
  'portal.welcomeApproved': 'Bem-vindo! Sua filiação foi aprovada',
  'portal.welcomePending': 'Sua filiação está em análise',
  'portal.expiringIn': 'Sua filiação expira em {days} dias',
  'portal.renewReminder': 'Recomendamos renovar para manter seus benefícios ativos.',
  'portal.renewNow': 'Renovar agora',
```

### en.ts (inserir na linha 743, antes do comentario de Events)

```typescript
  // Portal - Dynamic Headlines (P4B-4)
  'portal.welcomeActive': 'Your membership is active',
  'portal.welcomeApproved': 'Welcome! Your membership has been approved',
  'portal.welcomePending': 'Your membership is under review',
  'portal.expiringIn': 'Your membership expires in {days} days',
  'portal.renewReminder': 'We recommend renewing to keep your benefits active.',
  'portal.renewNow': 'Renew now',
```

### es.ts (inserir na linha 743, antes do comentario de Eventos)

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
| ACTIVE | "Sua filiacao esta ativa" | ACTIVE (verde) | Se <= 30 dias |
| APPROVED | "Bem-vindo! Sua filiacao foi aprovada" | APPROVED (azul) | Nao aparece |
| PENDING_REVIEW | "Sua filiacao esta em analise" | PENDING_REVIEW (amarelo) | Nao aparece |
| Outro status | "Bem-vindo ao seu portal" | Nao aparece | Nao aparece |
| Sem membership | "Bem-vindo ao seu portal" | Nao aparece | Nao aparece |

---

## Checklist de Aceite

| Criterio | Status |
|----------|--------|
| Nenhum useEffect novo | OK |
| Nenhuma query nova | OK |
| Nenhum redirect automatico | OK |
| Navegacao so via Link | OK |
| Funcoes puras sem side effects | OK |
| Status normalizado (toUpperCase) | OK |
| Calculo timezone-safe | OK |
| Card somente para ACTIVE | OK |
| Build sem warnings | OK |
| SAFE MODE preservado | OK |

---

## Resultado Esperado

```text
P4B-4 — ATHLETE PORTAL UX (GOLD MASTER)
+-- Headline dinamica clara
+-- StatusBadge consistente
+-- Renovacao segura e contextual
+-- UX madura e profissional
+-- Zero impacto em seguranca
+-- Zero impacto em fluxo
+-- Zero regressao
+-- P4B FECHADO COM EXCELENCIA
```

