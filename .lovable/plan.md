
# P4B-1 HARDENING — ISOLAMENTO E ROLLBACK

## Estado Atual

### ✅ CORRETAMENTE IMPLEMENTADO (MANTER)
| Arquivo | Status |
|---------|--------|
| `src/components/portal/PortalAccessGate.tsx` | ✅ Correto - UX-only, sem navigate(), sem useEffect de redirect |

### ❌ FORA DO ESCOPO P4B-1 (REVERTER)
| Arquivo | Mudança Indevida |
|---------|------------------|
| `src/pages/AthletePortal.tsx` | P4B-4: Welcome dinâmico, expiry card, StatusBadge |
| `src/components/membership/MembershipTypeSelector.tsx` | P4B-3: Query de membership existente, Alert "já filiado" |
| `src/components/portal/DigitalCardSection.tsx` | P4B-2: Empty state humanizado |
| `src/components/portal/DiplomasListCard.tsx` | P4B-2: Empty state humanizado |
| `src/components/portal/GradingHistoryCard.tsx` | P4B-2: Empty state humanizado |
| `src/components/ui/status-badge.tsx` | P4B-4: Adição de REJECTED status |
| `src/locales/pt-BR.ts` | P4B-2/3/4: Keys fora do escopo |
| `src/locales/en.ts` | P4B-2/3/4: Keys fora do escopo |
| `src/locales/es.ts` | P4B-2/3/4: Keys fora do escopo |

---

## Plano de Rollback

### 1. `src/pages/AthletePortal.tsx`
**Reverter para estado pré-P4B:**
- REMOVER import `differenceInDays`
- REMOVER import `StatusBadge`
- REMOVER `daysUntilExpiry` calculation (linhas 164-167)
- REMOVER `getWelcomeMessage()` function (linhas 169-182)
- REMOVER enhanced header com StatusBadge (linhas 201-219)
- REMOVER Next Action Card de expiração (linhas 221-248)
- RESTAURAR header simples original

### 2. `src/components/membership/MembershipTypeSelector.tsx`
**Reverter para estado pré-P4B:**
- REMOVER imports: `useQuery`, `CheckCircle`, `ArrowRight`
- REMOVER import `supabase`
- REMOVER import `Alert, AlertDescription, AlertTitle`
- REMOVER query `existingMembership` (linhas 27-53)
- REMOVER variável `hasMembership`
- REMOVER Alert de "já possui filiação" (linhas 123-145)
- REMOVER lógica de `hasMembership` nas opções (opacidade, pointer-events)

### 3. `src/components/portal/DigitalCardSection.tsx`
**Reverter empty state:**
- REMOVER linha 79: `<p className="text-muted-foreground text-sm">{t('portal.emptyDigitalCard')}</p>`
- MANTER apenas a mensagem original `portal.cardNotAvailable`

### 4. `src/components/portal/DiplomasListCard.tsx`
**Reverter empty state:**
- REMOVER linha 72: `<p className="text-muted-foreground text-sm">{t('portal.emptyDiplomas')}</p>`
- MANTER apenas a mensagem original `portal.noDiplomas`

### 5. `src/components/portal/GradingHistoryCard.tsx`
**Reverter empty state:**
- REMOVER linha 62: `<p className="text-muted-foreground text-sm">{t('portal.emptyGradings')}</p>`
- MANTER apenas a mensagem original `portal.noGradings`

### 6. `src/components/ui/status-badge.tsx`
**Nenhuma reversão necessária:**
- O status `REJECTED` já existia antes de P4B-4
- O arquivo está correto

### 7. `src/locales/pt-BR.ts`
**i18n Keys - MANTER (P4B-1):**
```
portal.errorDesc
portal.noAthleteTitle
portal.noAthleteDescHumanized
portal.pendingReviewDescHumanized
portal.expiredDescHumanized
portal.cancelledDescHumanized
portal.rejectedDescHumanized
portal.currentGrading
```

**i18n Keys - REMOVER (P4B-2/3/4):**
```
portal.emptyDigitalCard
portal.emptyDiplomas
portal.emptyGradings
portal.welcomeActive
portal.welcomeApproved
portal.welcomePending
portal.expiringIn
portal.renewReminder
membership.selectorTitle
membership.selectorDesc
membership.alreadyMember
membership.alreadyMemberDesc
membership.goToPortal
membership.termsAgreement
```

### 8. `src/locales/en.ts`
**Mesmas remoções de keys P4B-2/3/4**

### 9. `src/locales/es.ts`
**Mesmas remoções de keys P4B-2/3/4**

---

## Arquivos NÃO Modificados (SAFE MODE)

| Arquivo | Razão |
|---------|-------|
| `src/routes.tsx` | P4A — Intacto |
| `src/pages/AuthCallback.tsx` | P3 — Intacto |
| `src/pages/Login.tsx` | P2 — Intacto |
| `src/lib/billing/*` | P1 — Intacto |
| `src/components/auth/AthleteRouteGuard.tsx` | P4A — Intacto |
| `src/lib/resolveAthleteRouteAccess.ts` | P4A — Intacto |
| `src/components/portal/PortalAccessGate.tsx` | P4B-1 — Correto, manter |

---

## Checklist de Aceite

| Critério | Status |
|----------|--------|
| PortalAccessGate.tsx mantido como está | ✅ |
| AthletePortal.tsx revertido | ✅ |
| MembershipTypeSelector.tsx revertido | ✅ |
| DigitalCardSection.tsx revertido | ✅ |
| DiplomasListCard.tsx revertido | ✅ |
| GradingHistoryCard.tsx revertido | ✅ |
| i18n keys P4B-1 mantidas | ✅ |
| i18n keys P4B-2/3/4 removidas | ✅ |
| Nenhum redirect no PortalAccessGate | ✅ |
| Nenhuma alteração em rotas | ✅ |
| Build compila sem warnings | ✅ |
| SAFE MODE preservado | ✅ |

---

## Resultado Final

```text
P4B-1 — PORTAL ACCESS GATE (UX ONLY)
├── Componente puramente visual ✓
├── Nenhum redirect ✓
├── Nenhuma decisão de acesso ✓
├── CTAs explícitos ✓
├── i18n alinhado ✓
├── P4A intacto ✓
├── P3 intacto ✓
├── P2 intacto ✓
├── P1 intacto ✓
└── SAFE MODE preservado ✓
```
