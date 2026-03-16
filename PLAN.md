# Plano de Correção Completo — tatame.pro

Análise de 5 agentes paralelos cobrindo: Contextos React, Edge Functions, DB/Migrations, Hooks/Queries, Rotas/Auth.

---

## FASE 1 — CRÍTICO (Segurança + Bloqueadores)

### 1.1 Rota /app/onboarding desprotegida
- **Arquivo**: `src/routes/AppRouter.tsx:291`
- **Problema**: Rota sem `RequireRoles` — qualquer usuário autenticado acessa onboarding do tenant
- **Fix**: Envolver com `<RequireRoles allowed={["ADMIN_TENANT"]}>`

### 1.2 Bug de redirect pós-wizard (dead-end /portal)
- **Arquivo**: `src/pages/IdentityWizard.tsx:140-143`
- **Problema**: Se `result.redirectPath` é null e `result.tenant?.slug` está ausente, o usuário é redirecionado para `/portal` que mostra erro sem saída
- **Fix**: Garantir fallback para `/` ou re-check de identidade quando redirectPath é null

### 1.3 IdentityGate dead-end em /portal sem contexto
- **Arquivo**: `src/components/identity/IdentityGate.tsx:418-439`
- **Problema**: Usuário em RESOLVED sem redirectPath fica preso em tela de erro
- **Fix**: Adicionar botão de navegação para dashboard ou forçar re-check

### 1.4 Migration destrutiva commitada (DELETA TODOS USERS)
- **Arquivo**: `supabase/migrations/20260226000528_...sql`
- **Problema**: `DELETE FROM auth.users WHERE id <> ...` — migration de dev que apaga dados reais
- **Fix**: Remover ou marcar como dev-only (não deve existir em migrations de produção)

### 1.5 RLS: WITH CHECK(true) em tabelas sensíveis
- **Arquivo**: `supabase/migrations/20260115174642_...sql`
- **Problema**: INSERT público sem validação de tenant_id em: athletes, guardians, guardian_links, memberships, documents
- **Fix**: Adicionar `WITH CHECK (tenant_id IN (SELECT tenant_id FROM ...))` ou restringir a service_role

### 1.6 Digital Cards públicas para todos (USING(true))
- **Arquivo**: `supabase/migrations/20260116033233_...sql:83`
- **Problema**: Qualquer pessoa pode enumerar TODOS digital_cards de TODOS tenants
- **Fix**: Restringir SELECT a verificação por token/hash, não acesso direto

---

## FASE 2 — ALTA PRIORIDADE (Race Conditions + Estabilidade)

### 2.1 ImpersonationContext — race condition em validateSession
- **Arquivo**: `src/contexts/ImpersonationContext.tsx:147-194, 247`
- **Problema**: `validateSession` depende de `session` que muda frequentemente, causando re-execuções do heartbeat e chamadas concorrentes
- **Fix**: Extrair session properties estáveis (impersonationId, status) como deps; usar useRef para session

### 2.2 ImpersonationContext — expirationTimeout acumula timers
- **Arquivo**: `src/contexts/ImpersonationContext.tsx:233-238`
- **Problema**: Múltiplos setTimeout sem limpar o anterior quando o effect re-executa
- **Fix**: Limpar `expirationTimeout.current` ANTES de criar novo timeout

### 2.3 ImpersonationContext — validação silenciosa de erros
- **Arquivo**: `src/contexts/ImpersonationContext.tsx:191-193`
- **Problema**: Erros de rede na validação são logados mas não invalidam a sessão
- **Fix**: Após N falhas consecutivas, chamar `clearSession()`

### 2.4 ThemeContext — memory leak em setTimeout
- **Arquivo**: `src/contexts/ThemeContext.tsx:43-45`
- **Problema**: setTimeout sem cleanup no useEffect
- **Fix**: Usar useRef para armazenar timer ID e limpar no cleanup

### 2.5 TenantContext — isFetchingRef pode ficar travado
- **Arquivo**: `src/contexts/TenantContext.tsx:97-204`
- **Problema**: Se abort ocorre durante fetch, a flag pode não ser resetada
- **Fix**: Resetar `isFetchingRef.current = false` no cleanup do effect

### 2.6 IdentityContext — dependências incompletas em checkIdentity
- **Arquivo**: `src/contexts/IdentityContext.tsx:263`
- **Problema**: `session` usada no callback mas não nas deps do useCallback
- **Fix**: Adicionar `session` às dependências ou extrair valores necessários

### 2.7 Trigger sport_types NÃO ESTÁ ATIVO (CREATE TRIGGER ausente)
- **Arquivo**: `supabase/migrations/20260206193957_...sql`
- **Problema**: Define a função mas nunca cria o trigger com `CREATE TRIGGER`
- **Fix**: Adicionar nova migration com `CREATE TRIGGER trg_validate_tenant_sport_types BEFORE INSERT ON tenants ...`

### 2.8 Missing FK em applicant_profile_id
- **Arquivo**: `supabase/migrations/20260124224724_...sql:28-32`
- **Problema**: UUID sem foreign key — registros ficam órfãos quando user é deletado
- **Fix**: Adicionar `ALTER TABLE memberships ADD CONSTRAINT fk_applicant_profile FOREIGN KEY (applicant_profile_id) REFERENCES profiles(id) ON DELETE SET NULL`

---

## FASE 3 — MÉDIA PRIORIDADE (Performance + UX)

### 3.1 AlertContext — re-render explosion por dismissedIds
- **Arquivo**: `src/contexts/AlertContext.tsx:267`
- **Problema**: Set como dependência causa unsubscribe/resubscribe do realtime a cada dismiss
- **Fix**: Usar useRef para dismissedIds e memoizar o callback de merge

### 3.2 AlertContext — seenNewEventIds cresce sem limite
- **Arquivo**: `src/contexts/AlertContext.tsx:246-248`
- **Problema**: Set nunca é podado, crescendo indefinidamente
- **Fix**: Implementar limite (ex: últimos 1000 IDs) ou limpar ao desmontar

### 3.3 AlertContext — fire-and-forget em operações de DB
- **Arquivo**: `src/contexts/AlertContext.tsx:293, 299`
- **Problema**: Dismiss persiste no estado local mas falha silenciosamente no DB
- **Fix**: Adicionar retry ou feedback ao usuário em caso de falha

### 3.4 I18nContext — tenantSlug memoizado com deps vazias
- **Arquivo**: `src/contexts/I18nContext.tsx:70`
- **Problema**: `useMemo(() => getTenantSlugFromPath(), [])` nunca atualiza ao navegar
- **Fix**: Usar `useLocation()` como dependência ou recalcular em cada setLocale

### 3.5 Hooks sem staleTime (queries desnecessárias)
- **Arquivos**: `useAthleteBadges.ts`, `useAthleteBadgeTimeline.ts`, `useAthleteEvents.ts`, `useHasAthleteInTenant.ts`
- **Fix**: Adicionar `staleTime: 5 * 60 * 1000` em cada hook

### 3.6 useTenantRevenueMetrics — staleTime < refetchInterval
- **Arquivo**: `src/hooks/useTenantRevenueMetrics.ts:12-34`
- **Problema**: staleTime=15s mas refetchInterval=30s — refetch desnecessário
- **Fix**: Alinhar `staleTime: 30000` com o intervalo

### 3.7 Schema dual: tenants.status (TEXT) vs tenants.lifecycle_status (ENUM)
- **Arquivos**: migrations 20260206191232 e 20260208204123
- **Problema**: Duas colunas tracking status do tenant sem trigger de sincronização
- **Fix**: Criar trigger `BEFORE UPDATE` que sincroniza ambas ou deprecar uma

### 3.8 TenantDashboardCards — sem estado de erro
- **Arquivo**: `src/components/dashboard/TenantDashboardCards.tsx`
- **Problema**: Se RPC falha, nada renderiza
- **Fix**: Adicionar tratamento de `isError` com fallback UI

### 3.9 Race condition em usePendingApprovalsCount
- **Arquivo**: `src/hooks/usePendingApprovalsCount.ts:11-64`
- **Problema**: Fetch inicial pode completar depois que subscription já recebeu updates
- **Fix**: Garantir subscription ativa antes do fetch inicial

---

## FASE 4 — BAIXA PRIORIDADE (Qualidade de Código)

### 4.1 CORS preflight inconsistente em 57 edge functions
- **Problema**: Usam `corsHeaders` estático em vez de `corsPreflightResponse(req)` com origin dinâmico
- **Fix**: Script de busca e substituição em todos os handlers de OPTIONS

### 4.2 Queries diretas do Supabase em componentes
- **Arquivos**: YouthMembershipForm, AdultMembershipForm, CreateEventDialog, TenantDashboardCards, ApprovalDetails
- **Fix**: Extrair para hooks customizados em `/src/hooks/`

### 4.3 Cache invalidation muito ampla
- **Arquivos**: ApprovalsList.tsx, EventDetails.tsx
- **Problema**: `invalidateQueries({ queryKey: ['events'] })` invalida cache de todos os tenants
- **Fix**: Scoped: `queryKey: ['events', tenantId]`

### 4.4 TypeScript types potencialmente desatualizados
- **Arquivo**: `src/integrations/supabase/types.ts`
- **Fix**: Regenerar types com `supabase gen types typescript`

### 4.5 IdentityContext — AbortController listener sem cleanup
- **Arquivo**: `src/contexts/IdentityContext.tsx:229-231`
- **Fix**: Usar `{ once: true }` no addEventListener ou remover manualmente

### 4.6 TenantContext — boundary violation UX jank
- **Arquivo**: `src/contexts/TenantContext.tsx:90`
- **Problema**: Pisca "permission denied" enquanto currentUser carrega
- **Fix**: Não renderizar violation até currentUser estar loaded

---

## Resumo por Severidade

| Fase | Items | Tipo |
|------|-------|------|
| FASE 1 | 6 | Segurança crítica — RLS, rotas, migration destrutiva |
| FASE 2 | 8 | Race conditions, memory leaks, trigger ausente, FK |
| FASE 3 | 9 | Performance, UX, schema consistency |
| FASE 4 | 6 | Code quality, cache, types |
| **Total** | **29** | |
