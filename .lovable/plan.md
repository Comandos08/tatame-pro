

# P-IMP-01 — CORREÇÃO DEFINITIVA DO LOOP DE IMPERSONATION

## SAFE MODE · DETERMINÍSTICO · ZERO REGRESSÃO

---

## DIAGNÓSTICO CONFIRMADO

### Causa Raiz Identificada

O problema está na interação entre `TenantOnboardingGate` e `TenantContext`:

```text
┌─────────────────────────────────────────────────────────────────────┐
│                        CICLO DE LOOP                                │
├─────────────────────────────────────────────────────────────────────┤
│  1. Superadmin inicia impersonation                                 │
│     ↓                                                               │
│  2. TenantOnboardingGate.useEffect detecta isImpersonating=true     │
│     ↓                                                               │
│  3. Chama refetchTenant()                                           │
│     ↓                                                               │
│  4. TenantContext: isLoading=true → fetch → isLoading=false         │
│     ↓                                                               │
│  5. isLoading mudou! Effect roda novamente                          │
│     ↓                                                               │
│  6. isImpersonating=true AND isLoading=false → refetchTenant()      │
│     ↓                                                               │
│  7. VOLTA PARA O PASSO 4 → LOOP INFINITO                           │
└─────────────────────────────────────────────────────────────────────┘
```

**Arquivo problemático:** `src/components/onboarding/TenantOnboardingGate.tsx` (linhas 35-39)

```typescript
// ❌ CÓDIGO PROBLEMÁTICO
useEffect(() => {
  if (isImpersonating && !isLoading) {
    refetchTenant();  // Dispara a cada mudança de isLoading
  }
}, [isImpersonating, isLoading, refetchTenant]);
```

---

## ESTRATÉGIA DE CORREÇÃO (SAFE MODE)

### Princípio: "Resolver UMA vez, nunca mais"

Usar `useRef` para garantir que o refetch de impersonation aconteça apenas uma vez por sessão de impersonation.

---

## FASE 1 — CORRIGIR `TenantOnboardingGate.tsx`

### Antes (problemático)
```typescript
useEffect(() => {
  if (isImpersonating && !isLoading) {
    refetchTenant();
  }
}, [isImpersonating, isLoading, refetchTenant]);
```

### Depois (SAFE)
```typescript
// ✅ P-IMP-01 — Trava de refetch único por sessão de impersonation
const hasRefetchedForImpersonationRef = useRef(false);

useEffect(() => {
  // Reset da trava quando impersonation termina
  if (!isImpersonating) {
    hasRefetchedForImpersonationRef.current = false;
    return;
  }

  // Já fez refetch para esta sessão? Não fazer novamente
  if (hasRefetchedForImpersonationRef.current) {
    return;
  }

  // Aguardar loading inicial terminar antes de refetch
  if (isLoading) {
    return;
  }

  // Marcar como executado e fazer refetch UMA VEZ
  hasRefetchedForImpersonationRef.current = true;
  console.log('[ONBOARDING-GATE] Refetching tenant for impersonation (once)');
  refetchTenant();
}, [isImpersonating, isLoading, refetchTenant]);
```

### Garantias
- `useRef` não causa re-render
- Refetch acontece exatamente UMA vez por sessão
- Reset automático quando impersonation termina
- Log explícito para auditoria

---

## FASE 2 — HARDENING ADICIONAL EM `TenantContext.tsx`

Embora a correção principal seja no OnboardingGate, vamos adicionar uma camada de proteção no TenantContext para evitar loops causados por outros componentes.

### Adicionar ao TenantContext
```typescript
// ✅ P-IMP-01 — Trava para evitar múltiplos refetches simultâneos
const isFetchingRef = useRef(false);

async function fetchTenant() {
  // Guard: evitar fetch concorrente
  if (isFetchingRef.current) {
    console.log('[TENANT] Fetch already in progress, skipping');
    return;
  }
  isFetchingRef.current = true;

  // ... resto do código existente ...

  // No finally:
  finally {
    isFetchingRef.current = false;
    if (!abortController.signal.aborted && isMountedRef.current) {
      setIsLoading(false);
    }
  }
}
```

---

## FASE 3 — LOG DE DIAGNÓSTICO

Adicionar logs estratégicos para confirmar que o problema foi resolvido:

```typescript
// Em TenantOnboardingGate:
console.log('[ONBOARDING-GATE] Effect triggered:', {
  isImpersonating,
  isLoading,
  hasRefetched: hasRefetchedForImpersonationRef.current
});

// Em TenantContext:
console.log('[TENANT] Fetch started for slug:', tenantSlug);
console.log('[TENANT] Fetch completed, tenant:', tenant?.name);
```

---

## ARQUIVOS A MODIFICAR

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `src/components/onboarding/TenantOnboardingGate.tsx` | EDITAR | Adicionar trava de refetch único com `useRef` |
| `src/contexts/TenantContext.tsx` | EDITAR | Adicionar guard de fetch concorrente (proteção extra) |

---

## CÓDIGO COMPLETO: TenantOnboardingGate.tsx

```typescript
/**
 * 🔐 TenantOnboardingGate — Block access until onboarding is complete
 * 
 * ✅ P-IMP-01 — Fixed infinite loop on impersonation with single-refetch guard
 */
import React, { ReactNode, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useTenant } from '@/contexts/TenantContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';

// ... ALLOWED_ROUTES unchanged ...

export function TenantOnboardingGate({ children }: TenantOnboardingGateProps) {
  const { tenant, isLoading, refetchTenant } = useTenant();
  const { isImpersonating } = useImpersonation();
  const navigate = useNavigate();
  const location = useLocation();

  // ✅ P-IMP-01 — Trava de refetch único por sessão de impersonation
  const hasRefetchedForImpersonationRef = useRef(false);

  // ✅ P-IMP-01 — Refetch tenant data ONCE when impersonation starts
  useEffect(() => {
    // Reset trava quando impersonation termina
    if (!isImpersonating) {
      hasRefetchedForImpersonationRef.current = false;
      return;
    }

    // Já fez refetch? Não fazer novamente
    if (hasRefetchedForImpersonationRef.current) {
      return;
    }

    // Aguardar loading inicial terminar
    if (isLoading) {
      return;
    }

    // Executar UMA vez
    hasRefetchedForImpersonationRef.current = true;
    console.log('[ONBOARDING-GATE] Refetching tenant for impersonation (once)');
    refetchTenant();
  }, [isImpersonating, isLoading, refetchTenant]);

  // ... resto do componente INALTERADO ...
}
```

---

## CHECKLIST DE VALIDAÇÃO

### Antes de merge
- [ ] Entrar em impersonation → máximo 1-2 requests de tenant
- [ ] Loader aparece uma vez e desaparece
- [ ] Tela não pisca/flicker
- [ ] Console não repete logs infinitamente
- [ ] Refresh da página funciona
- [ ] Sair de impersonation funciona
- [ ] Entrar novamente em impersonation funciona
- [ ] Logout/login normal continua funcionando

### Testes de regressão
- [ ] Fluxo de onboarding normal funciona
- [ ] Tenant sem onboarding completo redireciona corretamente
- [ ] Superadmin pode navegar em /admin sem problemas
- [ ] Portal do atleta funciona normalmente

---

## O QUE NÃO SERÁ ALTERADO

- ❌ Nenhuma Edge Function
- ❌ Nenhuma RLS policy
- ❌ Nenhum schema de banco
- ❌ Nenhum outro Context (Auth, Impersonation, Identity)
- ❌ Nenhum navigate() forçado

---

## CRITÉRIO DE ACEITE

```text
✅ Impersonation entra sem loop
✅ Tenant resolve uma única vez
✅ Loader finaliza corretamente
✅ Sem flicker visual
✅ Console limpo (sem repetições)
✅ Zero regressão em fluxos existentes
```

---

## RESULTADO ESPERADO

```text
P-IMP-01 = DONE
Sistema estável
Impersonation confiável
Pronto para UX
```

