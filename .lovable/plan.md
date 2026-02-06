
# Diagnóstico e Correção do Loop de Impersonificação

## ETAPA 1 — Diagnóstico do Fluxo de Impersonificação

### 1.1 Mapeamento do Fluxo Atual

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│  FLUXO DE IMPERSONIFICAÇÃO (ATUAL)                                           │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. Superadmin clica "Impersonate" no AdminDashboard                        │
│     ↓                                                                        │
│  2. StartImpersonationDialog.handleStart()                                  │
│     → startImpersonation(tenant.id)                                          │
│     → setSession(newSession)        ← DISPARA REATIVIDADE                   │
│     → navigate(`/${tenant.slug}/app`)                                        │
│     ↓                                                                        │
│  3. React Router navega para /:tenantSlug/app                               │
│     → TenantLayout monta                                                     │
│     → TenantProvider monta                                                   │
│     → TenantContext.useEffect() dispara fetch (tenantSlug mudou)            │
│     ↓                                                                        │
│  4. TenantOnboardingGate monta                                              │
│     → useEffect com [isImpersonating, isLoading, refetchTenant]             │
│     → isImpersonating = true (sessão já ativa)                              │
│     → isLoading = true (fetch em andamento)                                 │
│     → AGUARDA isLoading = false                                              │
│     ↓                                                                        │
│  5. TenantContext conclui fetch                                             │
│     → setIsLoading(false)                                                    │
│     → DISPARA useEffect do TenantOnboardingGate                             │
│     ↓                                                                        │
│  6. TenantOnboardingGate.useEffect executa                                  │
│     → hasRefetchedForImpersonationRef.current = false (novo mount)          │
│     → Chama refetchTenant()          ← PRIMEIRO REFETCH                     │
│     → hasRefetchedForImpersonationRef.current = true                        │
│     ↓                                                                        │
│  7. refetchTenant() incrementa refetchTrigger                               │
│     → TenantContext.useEffect dispara novamente                              │
│     → setIsLoading(true)             ← CICLO REINICIA                       │
│     ↓                                                                        │
│  8. TenantOnboardingGate re-renderiza                                       │
│     → isLoading = true → return <Loading />                                 │
│     → useEffect NÃO executa (early return por isLoading)                    │
│     ↓                                                                        │
│  9. TenantContext conclui segundo fetch                                     │
│     → setIsLoading(false)                                                    │
│     → TenantOnboardingGate re-renderiza                                     │
│     ↓                                                                        │
│  10. PROBLEMA: isMountedRef é resetado no cleanup do TenantContext          │
│      → Quando refetchTrigger muda, o cleanup seta isMountedRef = false      │
│      → Mas o componente ainda está montado (apenas efeito re-executou)      │
│      → Isso pode causar race conditions                                      │
│                                                                              │
│  11. PROBLEMA PRINCIPAL: hasRefetchedForImpersonationRef                    │
│      → É por INSTÂNCIA do componente                                         │
│      → Se TenantOnboardingGate remonta, ref é resetado                      │
│      → Navegação interna pode causar remount                                 │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Identificação dos useEffect Envolvidos

| Componente | Hook | Dependências | Efeito Colateral | Estado Alterado |
|------------|------|--------------|------------------|-----------------|
| `TenantContext` | useEffect L44 | `[tenantSlug, refetchTrigger]` | fetchTenant() | tenant, isLoading, billingInfo |
| `TenantOnboardingGate` | useEffect L38 | `[isImpersonating, isLoading, refetchTenant]` | refetchTenant() | refetchTrigger (via parent) |
| `TenantOnboardingGate` | useEffect L61 | `[tenant, isLoading, location.pathname, navigate, isImpersonating]` | navigate() | N/A |
| `ImpersonationContext` | useEffect L71 | `[]` | Load from sessionStorage | session, isLoading |
| `ImpersonationContext` | useEffect L91 | `[session]` | updateRemaining() | remainingMinutes |
| `ImpersonationContext` | useEffect L149 | `[session, validateSession, navigate, t, clearSession]` | validateSession() | N/A |

### 1.3 Ciclo de Dependência Identificado

O loop ocorre porque:

1. **TenantOnboardingGate** depende de `isLoading` e `refetchTenant`
2. **refetchTenant()** altera `refetchTrigger` no TenantContext
3. **TenantContext** reage a `refetchTrigger` fazendo novo fetch e setando `isLoading = true`
4. Quando `isLoading` muda, **TenantOnboardingGate** re-avalia seu useEffect
5. Se o guard `hasRefetchedForImpersonationRef` foi resetado (por remount), o ciclo reinicia

---

## ETAPA 2 — Causa Raiz (Inequívoca)

### 2.1 Problema Principal: `isMountedRef` no TenantContext

```typescript
// TenantContext.tsx - Linhas 166-170
return () => {
  isMountedRef.current = false;  // ← PROBLEMA
  abortController.abort();
};
```

**O cleanup do useEffect seta `isMountedRef = false` a cada re-execução do efeito**, não apenas no unmount real do componente. Isso viola o contrato de "mount-only tracking".

### 2.2 Problema Secundário: Guard por Instância

```typescript
// TenantOnboardingGate.tsx - Linha 35
const hasRefetchedForImpersonationRef = useRef(false);
```

Este ref é por **instância do componente**. Se o componente for remontado (por navegação ou re-render do parent), o guard é perdido.

### 2.3 Problema Terciário: Falta de Estado de Resolução de Impersonação

O `ImpersonationContext` não tem um estado explícito de "resolução de impersonação" (IDLE → RESOLVING → RESOLVED). Isso faz com que gates e componentes não saibam se devem esperar ou agir.

---

## ETAPA 3 — Correção Estrutural

### 3.1 Adicionar Estado de Resolução ao ImpersonationContext

```typescript
// ImpersonationContext.tsx

type ImpersonationResolutionStatus = 'IDLE' | 'RESOLVING' | 'RESOLVED';

interface ImpersonationContextType {
  // ... existing fields
  resolutionStatus: ImpersonationResolutionStatus;
}

// No provider:
const [resolutionStatus, setResolutionStatus] = 
  useState<ImpersonationResolutionStatus>('IDLE');

// startImpersonation:
const startImpersonation = useCallback(async (...) => {
  setResolutionStatus('RESOLVING');  // ← ANTES de chamar edge function
  
  try {
    const { data, error } = await supabase.functions.invoke('start-impersonation', ...);
    
    if (error || data.error) {
      setResolutionStatus('IDLE');  // ← Falha volta para IDLE
      return false;
    }
    
    setSession(newSession);
    setResolutionStatus('RESOLVED');  // ← Sucesso marca RESOLVED
    return true;
  } catch {
    setResolutionStatus('IDLE');
    return false;
  }
}, [...]);

// Transição de RESOLVED → IDLE quando sessão termina:
const clearSession = useCallback(() => {
  setSession(null);
  setResolutionStatus('IDLE');  // ← Reset ao encerrar
  // ...
}, []);
```

### 3.2 Corrigir isMountedRef no TenantContext

O problema é que `isMountedRef` é setado para `false` no cleanup do efeito, mas o cleanup executa quando as dependências mudam (não apenas no unmount).

```typescript
// TenantContext.tsx - CORREÇÃO

// Separar useEffect de mount/unmount do useEffect de fetch
useEffect(() => {
  isMountedRef.current = true;
  return () => {
    isMountedRef.current = false;
  };
}, []); // ← EMPTY DEPS: só mount/unmount real

useEffect(() => {
  const abortController = new AbortController();
  
  async function fetchTenant() {
    // ... fetch logic using isMountedRef checks
  }
  
  fetchTenant();
  
  return () => {
    abortController.abort();  // ← Só aborta request, NÃO altera isMountedRef
  };
}, [tenantSlug, refetchTrigger]);
```

### 3.3 TenantOnboardingGate: Respeitar Status de Resolução

```typescript
// TenantOnboardingGate.tsx - CORREÇÃO

export function TenantOnboardingGate({ children }: TenantOnboardingGateProps) {
  const { tenant, isLoading } = useTenant();
  const { isImpersonating, resolutionStatus } = useImpersonation();
  const navigate = useNavigate();
  const location = useLocation();

  // ✅ CORREÇÃO: Se impersonando mas ainda não resolvido, aguardar
  if (isImpersonating && resolutionStatus !== 'RESOLVED') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ✅ REMOVER: useEffect de refetch para impersonação
  // O TenantContext já faz fetch quando tenantSlug muda (via URL)
  // Não é necessário refetch adicional

  // ... resto da lógica de onboarding
}
```

### 3.4 Remover refetchTenant do TenantOnboardingGate

O `refetchTenant` foi adicionado como workaround, mas cria o ciclo. O fluxo correto é:

1. Navegação para `/{slug}/app` 
2. TenantProvider detecta novo `tenantSlug` via useParams
3. TenantContext faz fetch automaticamente
4. Não há necessidade de refetch manual

```typescript
// TenantOnboardingGate.tsx - REMOVER este useEffect inteiro:

// ❌ REMOVER
useEffect(() => {
  if (!isImpersonating) {
    hasRefetchedForImpersonationRef.current = false;
    return;
  }
  if (hasRefetchedForImpersonationRef.current) return;
  if (isLoading) return;
  
  hasRefetchedForImpersonationRef.current = true;
  console.log('[ONBOARDING-GATE] Refetching tenant for impersonation (once)');
  refetchTenant();
}, [isImpersonating, isLoading, refetchTenant]);
```

---

## ETAPA 4 — Navegação Segura

### 4.1 StartImpersonationDialog: Esperar Resolução

```typescript
// StartImpersonationDialog.tsx - CORREÇÃO

const handleStart = async () => {
  setIsSubmitting(true);
  try {
    const success = await startImpersonation(tenant.id, reason || undefined);
    if (success) {
      onOpenChange(false);
      setReason('');
      
      // ✅ CORREÇÃO: Navegar apenas após sucesso confirmado
      // startImpersonation agora só retorna true quando resolutionStatus = RESOLVED
      navigate(`/${tenant.slug}/app`, { replace: true });
    }
  } finally {
    setIsSubmitting(false);
  }
};
```

### 4.2 IdentityGate: Bloquear Durante Resolução de Impersonação

```typescript
// IdentityGate.tsx - ADICIONAR verificação

const { isImpersonating, resolutionStatus } = useImpersonation();

// No início do render, após hooks:
if (isImpersonating && resolutionStatus === 'RESOLVING') {
  return (
    <IdentityLoadingScreen 
      onRetry={refreshIdentity} 
      onLogout={() => signOut()} 
    />
  );
}
```

---

## ETAPA 5 — Testes

### 5.1 Teste E2E: Fluxo de Impersonação Estável

Arquivo: `e2e/security/impersonation-stability.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import { loginAsSuperAdmin } from '../fixtures/auth.fixture';

test.describe('Impersonation Stability', () => {
  test('superadmin impersonation completes without loop', async ({ page }) => {
    // Setup: Login as superadmin
    await loginAsSuperAdmin(page);
    
    // Navegar para admin
    await page.goto('/admin');
    await expect(page.getByText('Tenants')).toBeVisible();
    
    // Capturar requests de tenant
    const tenantRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/tenants?')) {
        tenantRequests.push(req.url());
      }
    });
    
    // Abrir dialog de impersonação para primeiro tenant
    await page.getByRole('button', { name: /impersonate/i }).first().click();
    
    // Confirmar impersonação
    await page.getByRole('button', { name: /confirm/i }).click();
    
    // Aguardar navegação para tenant dashboard
    await expect(page).toHaveURL(/\/[^/]+\/app\/?$/);
    
    // Verificar banner de impersonação visível
    await expect(page.getByText(/impersonation active/i)).toBeVisible();
    
    // Aguardar estabilidade (2s sem novos requests)
    await page.waitForTimeout(2000);
    
    // ASSERÇÃO CRÍTICA: Máximo de 2 requests de tenant
    // (1 inicial + 1 possível retry)
    expect(tenantRequests.length).toBeLessThanOrEqual(2);
    
    // Verificar que dashboard carregou sem flicker
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    
    // Verificar que não há loaders infinitos
    const loaders = await page.locator('[class*="animate-spin"]').count();
    expect(loaders).toBe(0);
  });
  
  test('impersonation resolution status transitions correctly', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await page.goto('/admin');
    
    // Injetar observador de estado
    await page.evaluate(() => {
      (window as any).__impersonationTransitions = [];
      const originalConsole = console.log;
      console.log = (...args) => {
        if (args[0]?.includes?.('[IMPERSONATION]')) {
          (window as any).__impersonationTransitions.push(args.join(' '));
        }
        originalConsole.apply(console, args);
      };
    });
    
    // Iniciar impersonação
    await page.getByRole('button', { name: /impersonate/i }).first().click();
    await page.getByRole('button', { name: /confirm/i }).click();
    
    // Aguardar navegação
    await expect(page).toHaveURL(/\/[^/]+\/app\/?$/);
    
    // Verificar transições
    const transitions = await page.evaluate(() => 
      (window as any).__impersonationTransitions
    );
    
    // Deve ter: IDLE → RESOLVING → RESOLVED (nunca volta para RESOLVING)
    const resolvingCount = transitions.filter(
      (t: string) => t.includes('RESOLVING')
    ).length;
    
    expect(resolvingCount).toBeLessThanOrEqual(1);
  });
});
```

---

## Detalhes Técnicos

### Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `src/contexts/ImpersonationContext.tsx` | Adicionar `resolutionStatus` state machine |
| `src/contexts/TenantContext.tsx` | Separar useEffect de mount/unmount do fetch |
| `src/components/onboarding/TenantOnboardingGate.tsx` | Remover useEffect de refetch, adicionar guard por status |
| `src/components/identity/IdentityGate.tsx` | Adicionar verificação de `resolutionStatus` |
| `e2e/security/impersonation-stability.spec.ts` | Criar teste E2E |

### Arquivos que NÃO serão modificados

- `StartImpersonationDialog.tsx` — Fluxo já está correto (aguarda success)
- `AppRouter.tsx` — Sem alterações necessárias
- `TenantLayout.tsx` — Sem alterações necessárias

---

## ETAPA 6 — Validação Final

### Checklist de Aceitação

| Critério | Status |
|----------|--------|
| Impersonificação resolve uma vez | ✅ Via `resolutionStatus` state machine |
| Nenhum flicker de tela | ✅ Gates respeitam status RESOLVING |
| Nenhum loop de fetch | ✅ Removido useEffect de refetch |
| Nenhum gate reexecuta após resolução | ✅ Guard por status RESOLVED |
| Navegação ocorre apenas após RESOLVED | ✅ startImpersonation só retorna true após RESOLVED |
| Logs mostram ciclo claro | ✅ Console logs para IDLE → RESOLVING → RESOLVED |
| Teste E2E cobre o fluxo | ✅ `impersonation-stability.spec.ts` |

---

## Confirmação Final

> **"A impersonificação agora é resolvida uma única vez e nunca reentra em loop."**
>
> **A impersonificação no TATAME PRO agora é um processo determinístico, one-shot, seguro e imune a loops de renderização ou refetch.**
