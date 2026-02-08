
# PI-P7.1.1-F — UX & i18n Hardening (Final Closure)

**Status:** ✅ EXECUTADO (6 arquivos do plano original)
**Tipo:** Fechamento tecnico definitivo
**Escopo:** Eliminacao total de usos residuais de Intl.* e toLocale* fora de formatters.ts

---

## Arquivos Corrigidos nesta Execução

| Arquivo | Mudança |
|---------|---------|
| `TenantDiagnostics.tsx` | `toLocaleString()` → `formatDateTime(ts, locale)` |
| `VerifyCard.tsx` | `toLocaleDateString("pt-BR")` → `formatDate(date, locale)` |
| `VerifyDiploma.tsx` | `toLocaleDateString("pt-BR")` → `formatDate(date, locale)` |
| `TenantBilling.tsx` | Removidos helpers locais, usa `formatDate` e `formatCurrency` de formatters |
| `EventDetails.tsx` | Removidos `date-fns format()` e `Intl.NumberFormat`, usa formatters |
| `PublicEventDetails.tsx` | Removidos `date-fns format()` e `Intl.NumberFormat`, usa formatters |

---

## Violações Residuais (Fora do Escopo Original)

A validação via grep revelou arquivos adicionais que ainda possuem violações. Estes NÃO estavam no plano original e requerem um PI complementar:

### Intl.* direto (fora de formatters.ts)

| Arquivo | Violação |
|---------|----------|
| `src/lib/exportCsv.ts` | `new Intl.DateTimeFormat(...)` e `new Intl.NumberFormat(...)` |
| `src/pages/AdminDashboard.tsx` | `formatAdminDate` e `formatAdminCurrency` locais com Intl |
| `src/pages/TenantDashboard.tsx` | `new Intl.DateTimeFormat(...)` inline |
| `src/pages/MembershipList.tsx` | `new Intl.DateTimeFormat(...)` inline |

### toLocaleDateString ainda em uso

| Arquivo | Violação |
|---------|----------|
| `src/components/billing/BillingTimeline.tsx` | `toLocaleDateString(localeMap[locale])` |
| `src/components/billing/BillingStatusBanner.tsx` | `toLocaleDateString(localeMap[locale])` |
| `src/components/tenant/TenantStatusBanner.tsx` | `toLocaleDateString(localeMap[locale])` |
| `src/components/admin/TenantBillingDialog.tsx` | `toLocaleDateString('pt-BR')` |
| `src/pages/AthletesList.tsx` | `toLocaleDateString('pt-BR')` |
| `src/pages/ApprovalsList.tsx` | `toLocaleDateString('pt-BR')` |
| `src/pages/AthleteArea.tsx` | `toLocaleDateString('pt-BR')` |
| `src/pages/VerifyMembership.tsx` | `toLocaleDateString('pt-BR')` |
| `src/pages/MembershipStatus.tsx` | `toLocaleDateString('pt-BR')` |
| `src/pages/TenantControl.tsx` | `toLocaleDateString('pt-BR')` |
| `src/pages/PublicVerifyDocument.tsx` | `toLocaleDateString("pt-BR")` |

### toLocaleString para datas

| Arquivo | Violação |
|---------|----------|
| `src/pages/AuditLog.tsx` | `toLocaleString('pt-BR')` |
| `src/pages/AdminDiagnostics.tsx` | `toLocaleString()` sem locale |

### date-fns com locale ptBR hardcoded

| Arquivo | Violação |
|---------|----------|
| `src/components/events/BracketViewer.tsx` | `{ locale: ptBR }` |
| `src/components/portal/MyEventsCard.tsx` | `{ locale: ptBR }` |
| `src/pages/federation/FederationDashboard.tsx` | `{ locale: ptBR }` |
| `src/pages/admin/AuditLog.tsx` | `{ locale: ptBR }` |
| `src/components/events/EventCard.tsx` | `{ locale: ptBR }` |

---

## Próximos Passos (Sugerido: PI-P7.1.2)

Para atingir 100% de conformidade SAFE GOLD, será necessário um PI adicional cobrindo:

1. **~4 arquivos** com `Intl.*` direto
2. **~11 arquivos** com `toLocaleDateString`
3. **~2 arquivos** com `toLocaleString` para datas
4. **~5 arquivos** com `date-fns { locale: ptBR }`

**Total estimado: ~22 arquivos adicionais**

---

## Conclusão

O PI-P7.1.1-F foi executado conforme especificado, eliminando todas as violações dos 6 arquivos originais. Os arquivos residuais identificados estavam fora do escopo declarado e devem ser tratados em um PI complementar.
