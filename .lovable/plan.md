
# P2.H1 — Hardening i18n & Legacy UX Cleanup (SAFE GOLD)

## Auditoria Realizada

### Estado Atual — Achados Confirmados

| Arquivo | Linha(s) | Tipo | Descrição |
|---------|----------|------|-----------|
| `ForgotPassword.tsx` | 22-48, 69, 76-77, 85, 92, 113-115, 122, 142, 145, 153 | VIOLAÇÃO | Toasts e textos hardcoded PT |
| `GradingSchemesList.tsx` | 165, 169 | VIOLAÇÃO | Empty state hardcoded |
| `AthleteGradingsPage.tsx` | 325-330 | VIOLAÇÃO | Empty state hardcoded |
| `MembershipDetails.tsx` | 421 | VIOLAÇÃO | Empty state hardcoded |
| `ManageAdminsDialog.tsx` | 286 | VIOLAÇÃO | Empty admin state hardcoded |
| `MembershipList.tsx` | 250-257 | VIOLAÇÃO | Empty memberships hardcoded |
| `PublicAcademies.tsx` | 134, 143 | VIOLAÇÃO | Empty academies e contador |
| `InternalRankings.tsx` | 249, 332-333 | CABELINHO | Hint e empty state parcial |
| `TrialStatusBanner.tsx` | 80, 88 | CABELINHO | `.replace()` manual |
| `TenantBlockedScreen.tsx` | 86, 114 | CABELINHO | `.replace()` manual |
| `ExportCsvButton.tsx` | 40 | CABELINHO | `.replace()` manual |
| `BracketMatchCard.tsx` | 180 | CABELINHO | `.replace()` manual |
| `TenantDashboard.tsx` | 198, 206 | CABELINHO | `.replace()` manual |
| `TenantContext.tsx` | 61, 75, 168 | CABELINHO | `console.log` sem guard DEV |
| `PortalRouter.tsx` | ~26 | CABELINHO | Loader2 genérico (não LoadingState) |
| `AdminDashboard.tsx` | 247 | CABELINHO | Loader2 genérico (não LoadingState) |

---

## Arquivos a Modificar

### P2.H1.1 — Migração de Strings Hardcoded → i18n

#### 1. `src/pages/ForgotPassword.tsx`
**Ação**: Migrar ~15 strings PT hardcoded para i18n
**Keys a criar**:
```
auth.forgot.title
auth.forgot.description
auth.forgot.email.label
auth.forgot.email.placeholder
auth.forgot.submit
auth.forgot.sending
auth.forgot.backToLogin
auth.forgot.emailRequired
auth.forgot.emailRequiredDesc
auth.forgot.error
auth.forgot.errorDesc
auth.forgot.successTitle
auth.forgot.successDesc
auth.forgot.linkExpiry
auth.forgot.linkWarning
auth.forgot.tryAgain
```

#### 2. `src/pages/GradingSchemesList.tsx`
**Ação**: Migrar empty state (linhas 164-170)
**Keys a criar**:
```
empty.gradingSchemes.title
empty.gradingSchemes.createFirst
```

#### 3. `src/pages/AthleteGradingsPage.tsx`
**Ação**: Migrar empty state (linhas 325-330)
**Keys a criar**:
```
empty.gradings.title
empty.gradings.registerFirst
```

#### 4. `src/pages/MembershipDetails.tsx`
**Ação**: Migrar empty gradings state (linha 421)
**Key a criar**:
```
empty.athleteGradings.desc
```

#### 5. `src/components/admin/ManageAdminsDialog.tsx`
**Ação**: Migrar empty admins state (linha 286)
**Keys a criar**:
```
empty.admins.title
```

#### 6. `src/pages/MembershipList.tsx`
**Ação**: Migrar empty memberships state (linhas 250-257)
**Keys a criar**:
```
empty.memberships.title
empty.memberships.desc
empty.memberships.cta
```

#### 7. `src/pages/PublicAcademies.tsx`
**Ação**: Migrar empty academies e contador (linhas 134, 143)
**Keys a criar**:
```
empty.publicAcademies.title
empty.publicAcademies.countSingular
empty.publicAcademies.countPlural
```

#### 8. `src/pages/InternalRankings.tsx`
**Ação**: Migrar hint de metodologia e hint de empty (linhas 249, 332-333)
**Keys a criar**:
```
rankings.methodologyHint
rankings.adjustFilters
rankings.noActiveAcademies
```

---

### P2.H1.2 — Padronização de Interpolação i18n

#### Padrão: `.replace('{x}', val)` → `t(key, { x: val })`

| Arquivo | Linha | Antes | Depois |
|---------|-------|-------|--------|
| `TrialStatusBanner.tsx` | 80 | `t('trial.expiringSoon').replace('{days}', ...)` | `t('trial.expiringSoon', { days: String(daysRemaining) })` |
| `TrialStatusBanner.tsx` | 88 | `t('trial.daysRemaining').replace('{days}', ...)` | `t('trial.daysRemaining', { days: String(daysRemaining) })` |
| `TenantBlockedScreen.tsx` | 86 | `t('...').replace('{days}', ...)` | `t('billing.pendingDelete.title', { days: String(daysUntilDeletion ?? 0) })` |
| `ExportCsvButton.tsx` | 40 | `t('export.success').replace('{count}', ...)` | `t('export.success', { count: String(data.length) })` |
| `BracketMatchCard.tsx` | 180 | `t('events.brackets.match').replace('{match}', ...)` | `t('events.brackets.match', { match: String(match.position) })` |
| `TenantDashboard.tsx` | 198 | `.replace('{count}', ...)` | `t('dashboard.pendingCount', { count: String(...) })` |
| `TenantDashboard.tsx` | 206 | `.replace('{count}', ...)` | `t('dashboard.expiringCount', { count: String(...) })` |

---

### P2.H1.3 — Higiene DEV-only (Logs)

#### `src/contexts/TenantContext.tsx`

**Linhas afetadas**: 61, 75, 168

**Ação**: Envolver console.log em guard DEV

```typescript
// ❌ Antes
console.log('[TENANT] Fetch already in progress, skipping');

// ✅ Depois
if (import.meta.env.DEV) {
  console.log('[TENANT] Fetch already in progress, skipping');
}
```

---

### P2.H1.4 — UX Loading Consistency

#### 1. `src/pages/PortalRouter.tsx` (linha ~26)

**Ação**: Substituir `<Loader2>` por `<LoadingState>`

```tsx
// ❌ Antes
<div className="min-h-screen flex items-center justify-center">
  <Loader2 className="h-8 w-8 animate-spin" />
</div>

// ✅ Depois
<LoadingState titleKey="common.verifyingAccess" variant="fullscreen" />
```

**Import necessário**:
```tsx
import { LoadingState } from '@/components/ux';
```

#### 2. `src/pages/AdminDashboard.tsx` (linha 247)

**Ação**: Substituir loader genérico por `<LoadingState>`

```tsx
// ❌ Antes
<div className="min-h-screen flex items-center justify-center bg-background">
  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
</div>

// ✅ Depois
<LoadingState titleKey="common.loading" variant="fullscreen" />
```

---

## Chaves i18n a Adicionar

### pt-BR.ts, en.ts, es.ts

```typescript
// === P2.H1.1 — ForgotPassword ===
'auth.forgot.title': 'Esqueceu sua senha?',
'auth.forgot.description': 'Digite seu e-mail e enviaremos um link para redefinir sua senha.',
'auth.forgot.email.label': 'E-mail',
'auth.forgot.email.placeholder': 'seu@email.com',
'auth.forgot.submit': 'Enviar link de recuperação',
'auth.forgot.sending': 'Enviando...',
'auth.forgot.backToLogin': 'Voltar para o login',
'auth.forgot.emailRequired': 'E-mail obrigatório',
'auth.forgot.emailRequiredDesc': 'Por favor, insira seu e-mail.',
'auth.forgot.error': 'Erro ao solicitar recuperação',
'auth.forgot.errorDesc': 'Tente novamente mais tarde.',
'auth.forgot.successTitle': 'Verifique seu e-mail',
'auth.forgot.successDesc': 'Se o e-mail {email} estiver cadastrado, você receberá um link para redefinir sua senha.',
'auth.forgot.linkExpiry': '📧 O link expira em 1 hora',
'auth.forgot.linkWarning': '🔒 Não compartilhe este link com ninguém',
'auth.forgot.tryAgain': 'Não recebeu? Tentar novamente',

// === P2.H1.1 — Empty States ===
'empty.gradingSchemes.title': 'Nenhum esquema de graduação configurado.',
'empty.gradingSchemes.createFirst': 'Criar primeiro esquema',
'empty.gradings.title': 'Nenhuma graduação registrada para este atleta.',
'empty.gradings.registerFirst': 'Registrar primeira graduação',
'empty.athleteGradings.desc': 'Nenhuma graduação registrada para este atleta ainda.',
'empty.admins.title': 'Nenhum admin cadastrado ainda.',
'empty.memberships.title': 'Nenhuma filiação encontrada',
'empty.memberships.desc': 'Você ainda não possui filiações registradas na {tenantName}. Comece agora mesmo e faça parte da nossa comunidade!',
'empty.memberships.cta': 'Fazer minha filiação',
'empty.publicAcademies.title': 'Nenhuma academia credenciada no momento.',
'empty.publicAcademies.countSingular': '{count} academia encontrada',
'empty.publicAcademies.countPlural': '{count} academias encontradas',

// === P2.H1.1 — Rankings ===
'rankings.methodologyHint': 'Academias são ranqueadas por filiações ativas. Atletas são ranqueados por número de graduações registradas.',
'rankings.adjustFilters': 'Tente ajustar os filtros para ver mais resultados.',
'rankings.noActiveAcademies': 'Nenhuma academia com atletas ativos ainda.',
```

---

## Resumo de Arquivos

| Operação | Arquivo |
|----------|---------|
| EDITAR | `src/pages/ForgotPassword.tsx` |
| EDITAR | `src/pages/GradingSchemesList.tsx` |
| EDITAR | `src/pages/AthleteGradingsPage.tsx` |
| EDITAR | `src/pages/MembershipDetails.tsx` |
| EDITAR | `src/components/admin/ManageAdminsDialog.tsx` |
| EDITAR | `src/pages/MembershipList.tsx` |
| EDITAR | `src/pages/PublicAcademies.tsx` |
| EDITAR | `src/pages/InternalRankings.tsx` |
| EDITAR | `src/components/billing/TrialStatusBanner.tsx` |
| EDITAR | `src/components/billing/TenantBlockedScreen.tsx` |
| EDITAR | `src/components/export/ExportCsvButton.tsx` |
| EDITAR | `src/components/events/BracketMatchCard.tsx` |
| EDITAR | `src/pages/TenantDashboard.tsx` |
| EDITAR | `src/contexts/TenantContext.tsx` |
| EDITAR | `src/pages/PortalRouter.tsx` |
| EDITAR | `src/pages/AdminDashboard.tsx` |
| EDITAR | `src/locales/pt-BR.ts` |
| EDITAR | `src/locales/en.ts` |
| EDITAR | `src/locales/es.ts` |

---

## Checklist SAFE GOLD

| Critério | Status |
|----------|--------|
| Zero impacto em lógica de domínio | ✅ |
| Zero fetch novo | ✅ |
| Zero estado novo | ✅ |
| Zero automação nova | ✅ |
| Todas as mudanças são mecânicas | ✅ |
| i18n completo nos 3 idiomas | ✅ |
| Build limpo esperado | ✅ |
| Totalmente reversível | ✅ |

---

## Declaração Final Esperada

```
P2.H1 — Hardening i18n & Legacy UX Cleanup concluído.

- Nenhuma feature alterada
- Nenhum comportamento modificado  
- i18n 100% consistente
- UX states padronizados
- Código legado alinhado ao padrão P2
- 16 violações/cabelinhos corrigidos
- 19 arquivos atualizados
- Build limpo
```
