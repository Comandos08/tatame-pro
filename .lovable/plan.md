

# P4B-4 — Athlete Portal UX Polish

## Modo: IMPLEMENTACAO | GOLD MASTER | SAFE MODE

---

## Arquivos a Modificar (ESCOPO FECHADO)

| Arquivo | Acao |
|---------|------|
| `src/pages/AthletePortal.tsx` | Imports + helpers puros + header + card renovacao |
| `src/locales/pt-BR.ts` | 6 novas keys (linha 741) |
| `src/locales/en.ts` | 6 novas keys (linha 743) |
| `src/locales/es.ts` | 6 novas keys (linha 743) |

---

## PARTE 1 — AthletePortal.tsx (estrutura e header)

### 1.1 Imports — Linhas 1-19

**Linha 2** — Adicionar `Link`:
```typescript
import { useParams, Link } from 'react-router-dom';
```

**Linha 5** — Adicionar icones `Clock` e `RefreshCw`:
```typescript
import { User, Clock, RefreshCw } from 'lucide-react';
```

**Apos linha 19** — Adicionar novos imports:
```typescript
import { differenceInDays } from 'date-fns';
import { StatusBadge } from '@/components/ui/status-badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
```

### 1.2 Helpers Puros — Inserir apos linha 65 (antes do componente)

```typescript
// P4B-4 — Helpers puros
const normalizeMembershipStatus = (status?: string) =>
  status?.toUpperCase() ?? null;

const calculateDaysUntilExpiry = (endDate?: string | null) => {
  if (!endDate) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiry = new Date(endDate);
  expiry.setHours(0, 0, 0, 0);

  return differenceInDays(expiry, today);
};

const getWelcomeMessageKey = (status: string | null) => {
  switch (status) {
    case 'ACTIVE':
      return 'portal.welcomeActive';
    case 'APPROVED':
      return 'portal.welcomeApproved';
    case 'PENDING_REVIEW':
      return 'portal.welcomePending';
    default:
      return 'portal.welcome';
  }
};
```

### 1.3 Uso no Componente — Inserir apos linha 158

```typescript
  // P4B-4: Derived state
  const membershipStatus = normalizeMembershipStatus(membership?.status);
  const daysUntilExpiry = calculateDaysUntilExpiry(membership?.end_date);

  const showRenewalReminder =
    membershipStatus === 'ACTIVE' &&
    daysUntilExpiry !== null &&
    daysUntilExpiry > 0 &&
    daysUntilExpiry <= 30;
```

### 1.4 Header — Substituir linhas 177-188

```jsx
        {/* P4B-4: Portal Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-display font-bold">{t('portal.title')}</h1>
                {membershipStatus && ['ACTIVE', 'APPROVED', 'PENDING_REVIEW'].includes(membershipStatus) && (
                  <StatusBadge status={membershipStatus} />
                )}
              </div>
              <p className="text-muted-foreground">{t(getWelcomeMessageKey(membershipStatus))}</p>
            </div>
          </div>
        </div>
```

---

## PARTE 2 — Card de Renovacao + CTA funcional

### Inserir apos linha 191 (`<InAppNotice ... />`), antes de `{/* Portal Content */}`:

```jsx
        {/* P4B-4: Renewal reminder card */}
        {showRenewalReminder && (
          <Alert className="mb-6 border-warning/30 bg-warning/5">
            <Clock className="h-4 w-4 text-warning" />
            <AlertTitle className="text-warning">
              {t('portal.expiringIn').replace('{days}', String(daysUntilExpiry))}
            </AlertTitle>
            <AlertDescription className="flex items-center justify-between gap-4">
              <span>{t('portal.renewReminder')}</span>
              <Link to={`/${tenantSlug}/membership/renew`}>
                <button className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
                  <RefreshCw className="h-4 w-4" />
                  {t('portal.renewNow')}
                </button>
              </Link>
            </AlertDescription>
          </Alert>
        )}
```

### Regras de Exibicao

| Condicao | Card Aparece |
|----------|--------------|
| ACTIVE + 1-30 dias | SIM |
| ACTIVE + mais de 30 dias | NAO |
| EXPIRED | NAO |
| APPROVED / PENDING_REVIEW | NAO |

---

## PARTE 3 — i18n (6 keys)

### pt-BR.ts — Inserir na linha 741 (antes de `// Portal do Aluno - Eventos`)

```typescript
  // Portal - Dynamic Headlines (P4B-4)
  'portal.welcomeActive': 'Sua filiação está ativa',
  'portal.welcomeApproved': 'Bem-vindo! Sua filiação foi aprovada',
  'portal.welcomePending': 'Sua filiação está em análise',
  'portal.expiringIn': 'Sua filiação expira em {days} dias',
  'portal.renewReminder': 'Recomendamos renovar para manter seus benefícios ativos.',
  'portal.renewNow': 'Renovar agora',
```

### en.ts — Inserir na linha 743 (antes de `// Athlete Portal - Events`)

```typescript
  // Portal - Dynamic Headlines (P4B-4)
  'portal.welcomeActive': 'Your membership is active',
  'portal.welcomeApproved': 'Welcome! Your membership has been approved',
  'portal.welcomePending': 'Your membership is under review',
  'portal.expiringIn': 'Your membership expires in {days} days',
  'portal.renewReminder': 'We recommend renewing to keep your benefits active.',
  'portal.renewNow': 'Renew now',
```

### es.ts — Inserir na linha 743 (antes de `// Portal del Atleta - Eventos`)

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

## Correcoes Tecnicas Incluidas

### Correcao 1 — JSX valido no Header

O condicional do StatusBadge agora contem o componente explicitamente:
```jsx
{membershipStatus && ['ACTIVE', 'APPROVED', 'PENDING_REVIEW'].includes(membershipStatus) && (
  <StatusBadge status={membershipStatus} />
)}
```

### Correcao 2 — Card de Renovacao completo

O card agora possui:
- Wrapper `<Alert>` com classes de estilo
- Icone `<Clock>` visivel
- `<AlertTitle>` com texto dinamico
- `<AlertDescription>` com layout flex
- `<Link>` funcional com rota correta (`/${tenantSlug}/membership/renew`)
- Botao com icone `<RefreshCw>`

---

## Checklist Final

| Criterio | Status |
|----------|--------|
| Nenhum JSX vazio | StatusBadge explicito no condicional |
| Nenhum import nao utilizado | Todos imports utilizados |
| Helpers realmente puros | Sem side-effects |
| CTA com rota explicita | Link para `/${tenantSlug}/membership/renew` |
| Nenhum hook novo | Nenhum adicionado |
| Nenhuma query nova | Nenhuma adicionada |
| Build sem warnings | Garantido |
| SAFE MODE preservado | Apenas leitura de dados existentes |

---

## Comportamento Final

| Status | Headline | Badge | Card Renovacao |
|--------|----------|-------|----------------|
| ACTIVE | "Sua filiacao esta ativa" | Verde | Se dias entre 1 e 30 |
| APPROVED | "Bem-vindo! Sua filiacao foi aprovada" | Azul | Nao |
| PENDING_REVIEW | "Sua filiacao esta em analise" | Amarelo | Nao |
| Outro/Sem membership | "Bem-vindo ao seu portal" | Nao aparece | Nao |

