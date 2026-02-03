
# PLANO DE BLINDAGEM — TATAME PRO
## SAFE MODE · GOLD STANDARD · AJUSTES A1, A2, A3 APLICADOS

---

## CONFIRMAÇÃO DOS AJUSTES OBRIGATÓRIOS

| Ajuste | Requisito | Como Será Implementado |
|--------|-----------|------------------------|
| **A1** | Hook reativo via Context (não sessionStorage) | `useImpersonationClient()` dependerá de `session?.impersonationId` do `ImpersonationContext` |
| **A2** | Limpar cache ao encerrar impersonation | `clearImpersonationClientCache()` será chamado dentro de `clearSession()` |
| **A3** | Keys devem existir antes de usar | Todas as keys serão adicionadas aos locales ANTES de usar nos componentes |

---

## ARQUIVOS A CRIAR

| Arquivo | Descrição |
|---------|-----------|
| `src/integrations/supabase/impersonation-client.ts` | Client wrapper reativo via Context |

---

## ARQUIVOS A MODIFICAR

| Arquivo | Mudanças |
|---------|----------|
| `src/contexts/ImpersonationContext.tsx` | 1) Corrigir deps useCallback (linha 133); 2) Chamar `clearImpersonationClientCache()` em `clearSession()` |
| `src/components/auth/RequireRoles.tsx` | 1) Adicionar log diagnóstico; 2) Internacionalizar "Verificando permissões..." |
| `src/layouts/TenantLayout.tsx` | Internacionalizar 3 strings hardcoded |
| `src/components/events/EventImageUpload.tsx` | Eliminar 8x `as any` e usar keys corretas |
| `src/components/admin/CreateTenantDialog.tsx` | Internacionalizar ~15 strings |
| `src/components/admin/PlatformHealthCard.tsx` | Internacionalizar ~40 strings |
| `src/locales/pt-BR.ts` | Adicionar ~60 novas keys |
| `src/locales/en.ts` | Adicionar ~60 novas keys |
| `src/locales/es.ts` | Adicionar ~60 novas keys |

---

## FASE 1 — IMPERSONATION CLIENT COM REATIVIDADE CORRETA (A1, A2)

### 1.1. Criar `src/integrations/supabase/impersonation-client.ts`

```typescript
/**
 * 🔐 Impersonation-Aware Supabase Client
 * 
 * Cria clients Supabase com header x-impersonation-id injetado
 * automaticamente quando há sessão de impersonation ativa.
 * 
 * AJUSTE A1: Depende do state do ImpersonationContext (reativo)
 * AJUSTE A2: Cache limpo via clearImpersonationClientCache()
 */

import { useMemo } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Cache de clients por impersonationId
const clientCache = new Map<string, SupabaseClient<Database>>();

/**
 * Cria um client Supabase com header x-impersonation-id opcional.
 * Memoizado por impersonationId para evitar recriação desnecessária.
 */
export function createImpersonationAwareClient(
  impersonationId: string | null
): SupabaseClient<Database> {
  const cacheKey = impersonationId || 'default';
  
  // Retorna do cache se existir
  const cached = clientCache.get(cacheKey);
  if (cached) return cached;
  
  // Configuração base
  const options: Parameters<typeof createClient>[2] = {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  };
  
  // Injeta header se houver impersonation ativa
  if (impersonationId) {
    options.global = {
      headers: { 'x-impersonation-id': impersonationId },
    };
  }
  
  const client = createClient<Database>(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    options
  );
  
  // Limita tamanho do cache para evitar memory leak
  if (clientCache.size > 10) {
    const defaultClient = clientCache.get('default');
    clientCache.clear();
    if (defaultClient) clientCache.set('default', defaultClient);
  }
  
  clientCache.set(cacheKey, client);
  return client;
}

/**
 * Hook para uso em componentes React.
 * AJUSTE A1: Recebe impersonationId do Context (fonte reativa).
 */
export function useImpersonationClient(
  impersonationId: string | null | undefined
): SupabaseClient<Database> {
  return useMemo(
    () => createImpersonationAwareClient(impersonationId ?? null),
    [impersonationId]
  );
}

/**
 * Limpa o cache de clients (exceto default).
 * AJUSTE A2: Deve ser chamado ao encerrar impersonation.
 */
export function clearImpersonationClientCache(): void {
  const defaultClient = clientCache.get('default');
  clientCache.clear();
  if (defaultClient) clientCache.set('default', defaultClient);
  console.log('[IMPERSONATION-CLIENT] Cache cleared');
}
```

---

### 1.2. Modificar `ImpersonationContext.tsx`

**Mudança 1 — Linha 133 (corrigir deps do useCallback):**

```typescript
// DE:
}, [session, isGlobalSuperadmin, navigate, t]);

// PARA:
}, [session, isGlobalSuperadmin, navigate, t, clearSession]);
```

**Mudança 2 — Importar função de limpeza de cache (topo do arquivo):**

```typescript
import { clearImpersonationClientCache } from '@/integrations/supabase/impersonation-client';
```

**Mudança 3 — Adicionar chamada em `clearSession()` (linha ~165):**

```typescript
// clearSession atualizado
const clearSession = useCallback(() => {
  setSession(null);
  setRemainingMinutes(null);
  sessionStorage.removeItem(STORAGE_KEY);
  if (validationInterval.current) clearInterval(validationInterval.current);
  if (expirationTimeout.current) clearTimeout(expirationTimeout.current);
  // AJUSTE A2: Limpar cache de clients Supabase
  clearImpersonationClientCache();
}, []);
```

---

### 1.3. Adicionar diagnóstico em `RequireRoles.tsx`

**Após linha 66 (antes do if !hasAccess):**

```typescript
// 📊 DIAGNOSTIC LOG: Debug impersonation issues (P0 - Safe Mode)
if (isSuperadminAccessingTenant && !hasValidImpersonation) {
  console.warn('[REQUIRE_ROLES] Superadmin blocked - impersonation mismatch:', {
    isImpersonating,
    impersonatedTenantId,
    requiredTenantId: tenant?.id,
    mismatch: impersonatedTenantId !== tenant?.id,
  });
}
```

**Linha 54 — Internacionalizar string:**

```typescript
// DE:
<p className="text-muted-foreground">Verificando permissões...</p>

// PARA:
<p className="text-muted-foreground">{t('common.verifyingPermissions')}</p>
```

**Adicionar import e hook:**

```typescript
import { useI18n } from '@/contexts/I18nContext';

// Dentro do componente:
const { t } = useI18n();
```

---

## FASE 2 — I18N KEYS (AJUSTE A3 — ADICIONAR ANTES DE USAR)

### Novas Keys para pt-BR.ts, en.ts, es.ts

Serão adicionadas ~60 keys em cada arquivo, organizadas por namespace:

#### Common (P1)
```
common.next
common.loadMore
common.refresh
common.verifyingPermissions
common.createNew
```

#### Portal (P1)
```
portal.downloadDiploma
portal.verifyDiploma
portal.digitalCardDescription
```

#### Membership (P1)
```
membership.renewal
```

#### Trial (P1)
```
trial.pendingDeleteDesc
```

#### Nav (P1)
```
nav.toggleTheme
```

#### Events - Image Upload (P1)
```
events.coverImage
events.coverImageDesc
events.imageTypeError
events.imageSizeError
events.imageUploadSuccess
events.imageUploadError
events.imageRemoveSuccess
events.imageRemoveError
events.replaceImage
events.uploadImage
events.removeImage
```

#### Tenant Layout (P1)
```
tenant.loading
tenant.notFound
tenant.notFoundDesc
```

#### Admin - Create Tenant Dialog (P1)
```
admin.newOrganization
admin.createOrganization
admin.createOrganizationDesc
admin.organizationNameLabel
admin.organizationNamePlaceholder
admin.slugLabel
admin.slugPlaceholder
admin.slugHint
admin.modalities
admin.defaultLanguage
admin.primaryColor
admin.descriptionLabel
admin.descriptionPlaceholder
admin.creating
admin.create
admin.organizationCreatedSuccess
admin.organizationCreateError
admin.sessionSyncError
admin.nameSlugRequired
admin.selectModality
admin.slugInUse
```

#### Admin - Platform Health (P1)
```
admin.platformHealth
admin.platformHealthError
admin.platformHealthDesc
admin.platformHealthNote
admin.operational
admin.attentionNeeded
admin.verifying
admin.automaticJobs
admin.expireMemberships
admin.cleanAbandoned
admin.checkTrials
admin.metrics7days
admin.expiredMemberships
admin.cleanedAbandoned
admin.webhookErrors24h
admin.paymentFailures
admin.tenantsWithIssues
admin.blocked
admin.overduePayment
admin.neverRan
admin.lessThan1h
admin.hoursAgo
admin.in24h
admin.jobStatus.ok
admin.jobStatus.delayed
admin.jobStatus.error
admin.jobStatus.noData
admin.jobTooltip.ok
admin.jobTooltip.delayed
admin.jobTooltip.error
admin.jobTooltip.noData
```

---

## FASE 3 — INTERNACIONALIZAR COMPONENTES

### 3.1. TenantLayout.tsx

**Mudanças:**
- Adicionar `import { useI18n } from '@/contexts/I18nContext';`
- Adicionar `const { t } = useI18n();` no início de TenantContent
- Substituir 3 strings hardcoded por `t()`

### 3.2. EventImageUpload.tsx

**Mudanças:**
- Eliminar 8 ocorrências de `as any`
- Usar keys corretas (já existentes após Fase 2)

### 3.3. CreateTenantDialog.tsx

**Mudanças:**
- Adicionar `import { useI18n } from '@/contexts/I18nContext';`
- Adicionar `const { t } = useI18n();`
- Substituir ~15 strings hardcoded por `t()`

### 3.4. PlatformHealthCard.tsx

**Mudanças:**
- Adicionar `import { useI18n } from '@/contexts/I18nContext';`
- Adicionar `const { t } = useI18n();`
- Substituir ~40 strings hardcoded por `t()`

---

## ORDEM DE EXECUÇÃO

1. **Criar** `src/integrations/supabase/impersonation-client.ts`
2. **Editar** `src/contexts/ImpersonationContext.tsx` (2 mudanças)
3. **Editar** `src/locales/pt-BR.ts` (adicionar ~60 keys)
4. **Editar** `src/locales/en.ts` (adicionar ~60 keys)
5. **Editar** `src/locales/es.ts` (adicionar ~60 keys)
6. **Editar** `src/components/auth/RequireRoles.tsx` (log + i18n)
7. **Editar** `src/layouts/TenantLayout.tsx` (i18n)
8. **Editar** `src/components/events/EventImageUpload.tsx` (eliminar `as any`)
9. **Editar** `src/components/admin/CreateTenantDialog.tsx` (i18n)
10. **Editar** `src/components/admin/PlatformHealthCard.tsx` (i18n)

---

## GARANTIAS DE SEGURANÇA

| Garantia | Como Garantido |
|----------|----------------|
| ❌ Não altera rotas/guards | ✅ Apenas adiciona funcionalidade |
| ❌ Não modifica RLS/policies | ✅ Frontend-only |
| ❌ Não remove código funcional | ✅ Apenas estende |
| ❌ Sem efeitos colaterais | ✅ Cache controlado |
| ❌ Client memoizado | ✅ useMemo por impersonationId |
| ✅ A1 — Reatividade via Context | ✅ Depende de session?.impersonationId |
| ✅ A2 — Cache limpo ao encerrar | ✅ clearSession() chama clearImpersonationClientCache() |
| ✅ A3 — Keys existem antes de usar | ✅ Locales editados ANTES dos componentes |

---

## CRITÉRIOS DE ACEITE

| Critério | Verificação |
|----------|-------------|
| Impersonation funciona em queries PostgREST | Client injeta x-impersonation-id |
| Encerrar impersonation limpa contexto | clearSession() limpa cache |
| Nenhuma key retorna undefined | Todas as keys criadas |
| Nenhuma regressão funcional | Zero breaking changes |
| Build limpo | Sem erros de TypeScript |

---

## RESULTADO ESPERADO

```text
TATAME PRO = 100% BLINDADO
✅ Impersonation reativa (A1)
✅ Cache limpo corretamente (A2)
✅ i18n completo (A3)
✅ Zero "funciona por sorte"
✅ Zero regressão
```
