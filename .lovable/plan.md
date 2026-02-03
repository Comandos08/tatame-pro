

# P-REG-VIS-01 — RESTRIÇÃO DE VISIBILIDADE DE EVENTOS POR ORGANIZAÇÃO

## SAFE MODE · FRONTEND-FIRST · BACKEND-COMPATIBLE · ZERO BREAKING CHANGES

---

## RESUMO DOS AJUSTES OBRIGATÓRIOS APLICADOS

| Ajuste | Implementação |
|--------|---------------|
| **A) Hook compartilhado** | Novo `useHasAthleteInTenant` hook reutilizável |
| **B) Estado diferenciado** | Mensagens específicas: "sem vínculo neste tenant" vs "sem vínculo em nenhuma org" |
| **C) Loading composto** | Combinação de auth + athlete check + event antes de qualquer decisão |

---

## ARQUIVOS A CRIAR/MODIFICAR

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `src/hooks/useHasAthleteInTenant.ts` | **CRIAR** | Hook compartilhado (Ajuste A) |
| `src/pages/PublicEventsList.tsx` | EDITAR | Adicionar verificação de acesso |
| `src/pages/PublicEventDetails.tsx` | EDITAR | Adicionar verificação de acesso |
| `src/locales/pt-BR.ts` | EDITAR | 4 novas chaves i18n |
| `src/locales/en.ts` | EDITAR | 4 novas chaves i18n |
| `src/locales/es.ts` | EDITAR | 4 novas chaves i18n |

---

## FASE 1 — HOOK COMPARTILHADO (Ajuste A)

### Novo Arquivo: `src/hooks/useHasAthleteInTenant.ts`

```typescript
/**
 * Hook para verificar se o usuário logado possui athlete em um tenant específico.
 * Também verifica se o usuário possui athlete em QUALQUER tenant (para mensagens diferenciadas).
 * 
 * Retorna:
 * - hasAthleteInTenant: boolean | undefined (undefined = loading)
 * - hasAthleteAnywhere: boolean | undefined (undefined = loading)
 * - isLoading: boolean
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/contexts/AuthContext';

interface UseHasAthleteInTenantResult {
  /** Se o usuário tem athlete neste tenant específico */
  hasAthleteInTenant: boolean | undefined;
  /** Se o usuário tem athlete em algum tenant (qualquer um) */
  hasAthleteAnywhere: boolean | undefined;
  /** Se a verificação ainda está carregando */
  isLoading: boolean;
}

export function useHasAthleteInTenant(tenantId: string | undefined): UseHasAthleteInTenantResult {
  const { currentUser, isAuthenticated, isLoading: authLoading } = useCurrentUser();

  // Query 1: Verificar athlete neste tenant específico
  const { data: hasAthleteInTenant, isLoading: tenantCheckLoading } = useQuery({
    queryKey: ['athlete-tenant-check', currentUser?.id, tenantId],
    queryFn: async () => {
      if (!currentUser?.id || !tenantId) return false;
      const { data, error } = await supabase
        .from('athletes')
        .select('id')
        .eq('profile_id', currentUser.id)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
    enabled: !!currentUser?.id && !!tenantId && isAuthenticated,
  });

  // Query 2: Verificar se tem athlete em QUALQUER tenant (para Ajuste B)
  const { data: hasAthleteAnywhere, isLoading: anywhereCheckLoading } = useQuery({
    queryKey: ['athlete-anywhere-check', currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) return false;
      const { data, error } = await supabase
        .from('athletes')
        .select('id')
        .eq('profile_id', currentUser.id)
        .limit(1);
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
    enabled: !!currentUser?.id && isAuthenticated,
  });

  // Loading composto (Ajuste C)
  const isLoading = authLoading || 
    (isAuthenticated && (tenantCheckLoading || anywhereCheckLoading));

  return {
    hasAthleteInTenant: isAuthenticated ? hasAthleteInTenant : undefined,
    hasAthleteAnywhere: isAuthenticated ? hasAthleteAnywhere : undefined,
    isLoading,
  };
}
```

---

## FASE 2 — PUBLICEVENTLIST.TSX

### Mudanças Necessárias

**1. Imports adicionais:**
```typescript
import { AlertCircle, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useHasAthleteInTenant } from '@/hooks/useHasAthleteInTenant';
```

**2. Hooks no componente (logo após tenant guard):**
```typescript
const { isAuthenticated, isLoading: authLoading } = useCurrentUser();
const { 
  hasAthleteInTenant, 
  hasAthleteAnywhere, 
  isLoading: athleteCheckLoading 
} = useHasAthleteInTenant(tenant?.id);
```

**3. Lógica de bloqueio (Ajustes B e C):**
```typescript
// Loading composto: aguardar auth + athlete check (Ajuste C)
const isPageLoading = isLoading || (isAuthenticated && athleteCheckLoading);

// Condições de bloqueio (apenas para usuários logados)
const isBlockedWrongTenant = isAuthenticated && !athleteCheckLoading && 
  hasAthleteAnywhere === true && hasAthleteInTenant === false;

const isBlockedNoAffiliation = isAuthenticated && !athleteCheckLoading && 
  hasAthleteAnywhere === false;
```

**4. Renderização condicional (antes do return principal):**
```tsx
// Usuário logado sem vínculo em NENHUMA organização (Ajuste B)
if (isBlockedNoAffiliation) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <PublicHeader tenant={tenant} showBackButton backTo={`/${tenant.slug}`} />
      <main className="container mx-auto px-4 py-8 max-w-4xl flex-1">
        <Card>
          <CardContent className="py-12 text-center">
            <UserX className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
            <h3 className="mt-4 text-lg font-medium">
              {t('events.noAffiliation')}
            </h3>
            <p className="text-muted-foreground mt-2 max-w-md mx-auto">
              {t('events.noAffiliationDesc')}
            </p>
            <Button asChild className="mt-6">
              <Link to={`/${tenant.slug}/membership`}>
                {t('portal.startMembership')}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

// Usuário logado COM vínculo, mas em OUTRA organização
if (isBlockedWrongTenant) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <PublicHeader tenant={tenant} showBackButton backTo={`/${tenant.slug}`} />
      <main className="container mx-auto px-4 py-8 max-w-4xl flex-1">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
            <h3 className="mt-4 text-lg font-medium">
              {t('events.notAvailable')}
            </h3>
            <p className="text-muted-foreground mt-2 max-w-md mx-auto">
              {t('events.notAvailableForYourOrganization')}
            </p>
            <Button asChild variant="outline" className="mt-6">
              <Link to="/portal">
                {t('portal.title')}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
```

**5. Ajustar loading (Ajuste C):**
```tsx
{/* Loading composto */}
{isPageLoading && (
  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
    {[1, 2, 3].map((i) => (
      <Card key={i}>
        <CardContent className="pt-6">
          <Skeleton className="h-32 w-full mb-4" />
          <Skeleton className="h-6 w-3/4 mb-2" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
    ))}
  </div>
)}
```

---

## FASE 3 — PUBLICEVENTDETAILS.TSX

### Mudanças Necessárias

**1. Imports adicionais:**
```typescript
import { AlertCircle, UserX } from 'lucide-react';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useHasAthleteInTenant } from '@/hooks/useHasAthleteInTenant';
```

**2. Hooks no componente:**
```typescript
const { isAuthenticated, isLoading: authLoading } = useCurrentUser();
const { 
  hasAthleteInTenant, 
  hasAthleteAnywhere, 
  isLoading: athleteCheckLoading 
} = useHasAthleteInTenant(tenant?.id);
```

**3. Loading composto e lógica de bloqueio:**
```typescript
// Loading composto: event + auth + athlete check (Ajuste C)
const isPageLoading = eventLoading || (isAuthenticated && athleteCheckLoading);

// Condições de bloqueio
const isBlockedWrongTenant = isAuthenticated && !athleteCheckLoading && 
  hasAthleteAnywhere === true && hasAthleteInTenant === false;

const isBlockedNoAffiliation = isAuthenticated && !athleteCheckLoading && 
  hasAthleteAnywhere === false;
```

**4. Renderização condicional (após loading, antes do return principal):**
```tsx
// Loading composto (Ajuste C)
if (isPageLoading) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <PublicHeader />
      <main className="container mx-auto px-4 py-8 max-w-4xl flex-1">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-48 w-full" />
      </main>
    </div>
  );
}

// Usuário logado sem vínculo em NENHUMA organização (Ajuste B)
if (isBlockedNoAffiliation) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <PublicHeader />
      <main className="container mx-auto px-4 py-8 max-w-4xl flex-1">
        <Card>
          <CardContent className="py-12 text-center">
            <UserX className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
            <h3 className="mt-4 text-lg font-medium">
              {t('events.noAffiliation')}
            </h3>
            <p className="text-muted-foreground mt-2 max-w-md mx-auto">
              {t('events.noAffiliationDesc')}
            </p>
            <Button asChild className="mt-6">
              <Link to={`/${tenant?.slug}/membership`}>
                {t('portal.startMembership')}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

// Usuário logado COM vínculo, mas em OUTRA organização
if (isBlockedWrongTenant) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <PublicHeader />
      <main className="container mx-auto px-4 py-8 max-w-4xl flex-1">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
            <h3 className="mt-4 text-lg font-medium">
              {t('events.notAvailable')}
            </h3>
            <p className="text-muted-foreground mt-2 max-w-md mx-auto">
              {t('events.notAvailableForYourOrganization')}
            </p>
            <Button asChild variant="outline" className="mt-6">
              <Link to="/portal">
                {t('portal.title')}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
```

---

## FASE 4 — I18N KEYS

### Novas Chaves (4 em cada locale)

**pt-BR.ts:**
```typescript
// Events - Access Control (P-REG-VIS-01)
'events.notAvailable': 'Evento não disponível',
'events.notAvailableForYourOrganization': 'Este conteúdo é exclusivo para atletas filiados a esta organização. Acesse o portal da sua organização para ver seus eventos.',
'events.noAffiliation': 'Sem filiação ativa',
'events.noAffiliationDesc': 'Você ainda não possui filiação como atleta em nenhuma organização. Faça sua filiação para ter acesso aos eventos.',
```

**en.ts:**
```typescript
// Events - Access Control (P-REG-VIS-01)
'events.notAvailable': 'Event not available',
'events.notAvailableForYourOrganization': 'This content is exclusive to athletes affiliated with this organization. Access your organization\'s portal to view your events.',
'events.noAffiliation': 'No active affiliation',
'events.noAffiliationDesc': 'You don\'t have an athlete affiliation with any organization yet. Complete your membership to access events.',
```

**es.ts:**
```typescript
// Events - Access Control (P-REG-VIS-01)
'events.notAvailable': 'Evento no disponible',
'events.notAvailableForYourOrganization': 'Este contenido es exclusivo para atletas afiliados a esta organización. Accede al portal de tu organización para ver tus eventos.',
'events.noAffiliation': 'Sin afiliación activa',
'events.noAffiliationDesc': 'Aún no tienes afiliación como atleta en ninguna organización. Completa tu afiliación para acceder a los eventos.',
```

---

## FLUXO DE DECISÃO (ATUALIZADO)

```text
┌─────────────────────────────────────────────────────────────┐
│                    USUÁRIO ACESSA                            │
│              /{tenantSlug}/events                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                   ┌──────────────────┐
                   │  Está logado?    │
                   └──────────────────┘
                    │              │
                   NÃO            SIM
                    │              │
                    ▼              ▼
           ┌──────────────┐  ┌──────────────────────┐
           │ Mostra       │  │ Aguardar loading     │
           │ eventos      │  │ composto (Ajuste C)  │
           │ normalmente  │  └──────────────────────┘
           └──────────────┘             │
                                        ▼
                             ┌──────────────────────┐
                             │ Tem athlete em       │
                             │ ALGUM tenant?        │
                             └──────────────────────┘
                              │            │
                             SIM          NÃO
                              │            │
                              ▼            ▼
                   ┌──────────────────┐  ┌──────────────────┐
                   │ Tem athlete      │  │ Bloqueio:        │
                   │ NESTE tenant?    │  │ "Sem filiação    │
                   └──────────────────┘  │  ativa"          │
                    │            │       │ + CTA Filiar-se  │
                   SIM          NÃO      └──────────────────┘
                    │            │              (Ajuste B)
                    ▼            ▼
           ┌──────────────┐  ┌──────────────────┐
           │ Mostra       │  │ Bloqueio:        │
           │ eventos      │  │ "Não disponível  │
           │ normalmente  │  │  para sua org"   │
           └──────────────┘  │ + CTA Portal     │
                             └──────────────────┘
```

---

## CENÁRIOS DE TESTE

| # | Cenário | Comportamento Esperado |
|---|---------|------------------------|
| 1 | Usuário NÃO logado acessa `/federacao-sp/events` | ✅ Vê eventos normalmente |
| 2 | Atleta de `federacao-sp` acessa `/federacao-sp/events` | ✅ Vê eventos normalmente |
| 3 | Atleta de `federacao-sp` acessa `/outra-federacao/events` | ❌ Bloqueio "Não disponível para sua org" |
| 4 | Atleta de `federacao-sp` acessa `/outra-federacao/events/123` | ❌ Bloqueio "Não disponível para sua org" |
| 5 | Usuário logado SEM nenhum athlete acessa eventos | ❌ Bloqueio "Sem filiação ativa" + CTA filiar-se |
| 6 | Atleta com múltiplos tenants acessa evento de tenant válido | ✅ Vê eventos normalmente |
| 7 | Loading entre páginas | ✅ Skeleton sem flicker |

---

## GARANTIAS DE SEGURANÇA

| Garantia | Status |
|----------|--------|
| Nenhuma mudança em RLS | ✅ |
| Nenhuma mudança em schema | ✅ |
| Nenhuma mudança em Edge Functions | ✅ |
| Regressão de inscrição | ✅ Não afetado |
| Frontend-only | ✅ |
| Reversível | ✅ |
| Compatível com Modelo C futuro | ✅ |

---

## EDGE CASES TRATADOS

| Caso | Tratamento |
|------|------------|
| Auth loading | Aguarda loading composto |
| Athlete check loading | Aguarda loading composto |
| Usuário logado sem athlete em NENHUM tenant | Bloqueio diferenciado (Ajuste B) |
| Usuário logado com athlete em outro tenant | Bloqueio diferenciado (Ajuste B) |
| Tenant inválido na URL | Fallback para 404 (já existente) |
| Session expira durante visualização | Auth state change handled |

---

## CRITÉRIOS DE ACEITE

```text
✅ Hook compartilhado useHasAthleteInTenant (Ajuste A)
✅ Mensagens diferenciadas: "sem vínculo neste tenant" vs "sem filiação" (Ajuste B)
✅ Loading composto sem flicker (Ajuste C)
✅ Atleta só vê eventos da própria organização quando logado
✅ Usuário não logado continua vendo eventos públicos
✅ Acesso direto via URL bloqueado corretamente
✅ Inscrição permanece consistente (não alterado)
✅ Zero regressão em fluxos existentes
✅ Zero alteração de backend
```

---

## RESULTADO ESPERADO

```text
P-REG-VIS-01 = DONE
Modelo A consolidado
UX coerente com modelo de federação
Expectativa do usuário alinhada
Mensagens educacionais claras
Escalável para Modelo C sem retrabalho
```

