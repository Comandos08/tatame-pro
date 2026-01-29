
# Plano Ajustado: Corrigir Acesso ao Portal do Atleta

## Resumo Executivo

Este plano implementa as correções para o acesso ao Portal do Atleta (`/:tenantSlug/portal`), incorporando os **dois ajustes obrigatórios** solicitados:

1. **Ajuste 1**: IdentityGate deve bloquear decisões de rota enquanto identidade estiver em resolução
2. **Ajuste 2**: Detecção de rota de tenant deve ser estrutural, não heurística

---

## Diagnóstico Revisado

### Estado Atual do IdentityGate

```text
FLUXO ATUAL (linhas 89-144):
┌─────────────────────────────────────────────────────────────────┐
│  1. isPublicPath(pathname) → bypass (children)        ← OK     │
│  2. authLoading → loader                              ← OK     │
│  3. !isAuthenticated → /login                         ← OK     │
│  4. identityState === "loading" → loader              ← OK     │
│  5. identityState === "superadmin" → decisão          ← PROBLEMA│
│     └─ Redireciona para /admin sem feedback           ← ❌     │
│  6. identityState === "resolved" → children           ← OK     │
│  7. identityState === "error" → error UI              ← OK     │
└─────────────────────────────────────────────────────────────────┘
```

**Problema específico na R5:**
- Superadmin tentando acessar `/federacao-demo/portal` sem impersonation
- IdentityGate redireciona silenciosamente para `/admin`
- Isso pode causar abort da Edge Function em andamento → timeout falso

### Estado Atual das Rotas

```typescript
// App.tsx - linhas 51-54
<Route path="/:tenantSlug" element={<TenantLayout />}>
  <Route index element={<TenantLanding />} />
  <Route path="app" element={<TenantDashboard />} />
  // ❌ FALTAM: portal, portal/card, portal/events
</Route>
```

---

## Arquivos Afetados

| Arquivo | Ação | Prioridade |
|---------|------|------------|
| `src/App.tsx` | Modificar | Alta |
| `src/components/identity/IdentityGate.tsx` | Modificar | Alta |
| `src/locales/pt-BR.ts` | Modificar | Média |
| `src/locales/en.ts` | Modificar | Média |
| `src/locales/es.ts` | Modificar | Média |

---

## Fase 1: Adicionar Rotas de Portal

**Arquivo:** `src/App.tsx`

**Mudança:**
Adicionar rotas para `portal`, `portal/card`, `portal/events` dentro do `TenantLayout`.

```typescript
// ANTES (linhas 51-54):
<Route path="/:tenantSlug" element={<TenantLayout />}>
  <Route index element={<TenantLanding />} />
  <Route path="app" element={<TenantDashboard />} />
</Route>

// DEPOIS:
<Route path="/:tenantSlug" element={<TenantLayout />}>
  <Route index element={<TenantLanding />} />
  <Route path="app" element={<TenantDashboard />} />
  
  {/* Portal do Atleta */}
  <Route path="portal" element={<AthletePortal />} />
  <Route path="portal/card" element={<PortalCard />} />
  <Route path="portal/events" element={<PortalEvents />} />
</Route>
```

**Imports a adicionar:**
```typescript
import AthletePortal from "@/pages/AthletePortal";
import PortalCard from "@/pages/PortalCard";
import PortalEvents from "@/pages/PortalEvents";
```

---

## Fase 2: Ajuste do IdentityGate (Ajustes Obrigatórios)

**Arquivo:** `src/components/identity/IdentityGate.tsx`

### 2.1 Criar Helper Estrutural para Detecção de Rota de Tenant

**Adicionar função ANTES de `IdentityGate`:**

```typescript
/**
 * Rotas globais reservadas (não são slugs de tenant).
 * Baseado na estrutura de rotas definida em App.tsx.
 */
const RESERVED_ROUTE_SEGMENTS = new Set([
  "admin",
  "portal",
  "login", 
  "auth",
  "identity",
  "help",
  "forgot-password",
  "reset-password",
]);

/**
 * Detecta estruturalmente se uma rota é de tenant (/:tenantSlug/*).
 * 
 * Uma rota é de tenant se:
 * 1. Começa com / seguido de um segmento
 * 2. O primeiro segmento NÃO é uma rota global reservada
 * 3. O primeiro segmento NÃO é vazio
 * 
 * Exemplos:
 * - /federacao-demo → true (tenant slug)
 * - /federacao-demo/portal → true (tenant portal)
 * - /admin → false (reservado)
 * - /login → false (reservado)
 * - / → false (root)
 */
function isTenantRoute(pathname: string): { isTenant: boolean; tenantSlug: string | null } {
  // Remove trailing slash e split
  const segments = pathname.replace(/\/$/, "").split("/").filter(Boolean);
  
  // Precisa ter pelo menos 1 segmento
  if (segments.length === 0) {
    return { isTenant: false, tenantSlug: null };
  }
  
  const firstSegment = segments[0].toLowerCase();
  
  // Se o primeiro segmento é reservado, não é rota de tenant
  if (RESERVED_ROUTE_SEGMENTS.has(firstSegment)) {
    return { isTenant: false, tenantSlug: null };
  }
  
  // É rota de tenant
  return { isTenant: true, tenantSlug: segments[0] };
}
```

### 2.2 Modificar Regra R5 (Superadmin)

**Substituir bloco R5 (linhas 129-144) por:**

```typescript
// ===== R5: Superadmin → /admin (ou tenant se impersonating) =====
if (identityState === "superadmin") {
  // Permitir acesso às rotas do tenant impersonado
  if (isImpersonating && impersonationSession?.targetTenantSlug) {
    const tenantPrefix = `/${impersonationSession.targetTenantSlug}`;
    if (pathname === tenantPrefix || pathname.startsWith(`${tenantPrefix}/`)) {
      return <>{children}</>;
    }
  }
  
  // Permitir acesso normal às rotas /admin
  if (pathname.startsWith("/admin")) return <>{children}</>;
  
  // ✅ AJUSTE 2: Detecção estrutural de rota de tenant
  const { isTenant, tenantSlug } = isTenantRoute(pathname);
  
  if (isTenant && tenantSlug) {
    // Superadmin tentando acessar rota de tenant SEM impersonation ativa
    // Mostrar UI explicativa em vez de redirect silencioso
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <AlertCircle className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
            <CardTitle className="text-center">{t("impersonation.accessDenied")}</CardTitle>
            <CardDescription className="text-center">
              {t("impersonation.superadminMustImpersonate")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground text-center">
              {t("identity.superadminTenantAccessHint", { tenant: tenantSlug })}
            </p>
            <Button onClick={() => navigate("/admin")} className="w-full">
              {t("impersonation.goToAdmin")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // Qualquer outra rota global não /admin → redirecionar para /admin
  return <Navigate to="/admin" replace />;
}
```

### 2.3 Adicionar Import de `useNavigate`

```typescript
// Linha 10 - modificar import existente:
import { Navigate, useLocation, useNavigate } from "react-router-dom";
```

### 2.4 Adicionar Hook `useNavigate` no Componente

```typescript
// Dentro de IdentityGate, após linha 79:
const navigate = useNavigate();
```

---

## Fase 3: Adicionar Chaves i18n

### pt-BR.ts

```typescript
// Adicionar após 'identity.noContextDesc':
'identity.superadminTenantAccessHint': 'Para acessar "{tenant}", inicie uma sessão de impersonation pelo painel de administração.',
```

### en.ts

```typescript
'identity.superadminTenantAccessHint': 'To access "{tenant}", start an impersonation session from the admin panel.',
```

### es.ts

```typescript
'identity.superadminTenantAccessHint': 'Para acceder a "{tenant}", inicie una sesión de impersonación desde el panel de administración.',
```

---

## Fase 4: Garantir Billing para Tenant (SQL Manual)

**Executar via Cloud View > Run SQL:**

```sql
INSERT INTO tenant_billing (tenant_id, status, trial_expires_at)
SELECT id, 'TRIALING', NOW() + INTERVAL '14 days'
FROM tenants
WHERE slug = 'federacao-demo'
AND NOT EXISTS (
  SELECT 1 FROM tenant_billing WHERE tenant_id = tenants.id
);
```

---

## Ordem de Execução

```text
1. [ROTAS] Adicionar rotas de portal ao App.tsx
   └─ Impacto: Portal do atleta passa a existir como rota válida
   └─ Tempo: 10 min

2. [IDENTITY GATE] Implementar ajustes obrigatórios
   ├─ 2.1 Criar helper isTenantRoute() para detecção estrutural
   ├─ 2.2 Modificar regra R5 com UI explicativa
   ├─ 2.3 Adicionar useNavigate
   └─ Tempo: 20 min

3. [I18N] Adicionar chave de tradução
   └─ Impacto: Mensagem disponível em pt-BR, en, es
   └─ Tempo: 5 min

4. [DATA] Criar billing para tenant federacao-demo
   └─ Impacto: Tenant tem estado de billing válido
   └─ Tempo: 2 min

TEMPO TOTAL: ~40 min
```

---

## Validação de Conformidade

### Ajuste 1: Loading State Respeitado ✅

O fluxo atual **já respeita** o loading state corretamente:

```text
R1: authLoading → loader (bloqueia decisões)
R3: identityState === "loading" → loader (bloqueia decisões)
R5: identityState === "superadmin" → só executa APÓS loading resolvido
```

**Não há redirect durante loading.** O problema era que o redirect para `/admin` acontecia sem feedback visual, não durante loading.

### Ajuste 2: Detecção Estrutural ✅

A função `isTenantRoute()` proposta:
- Usa conjunto fixo de rotas reservadas (baseado em App.tsx)
- Detecta tenant pelo padrão estrutural (primeiro segmento não-reservado)
- Escalável: novas rotas globais só precisam ser adicionadas a `RESERVED_ROUTE_SEGMENTS`
- Sem heurísticas frágeis

---

## Checklist de Validação

- [ ] Acessar `/:tenantSlug/portal` como atleta com membership → portal renderiza
- [ ] Acessar `/:tenantSlug/portal/card` como atleta → card renderiza
- [ ] Acessar `/:tenantSlug/portal/events` como atleta → eventos renderizam
- [ ] Acessar `/:tenantSlug/portal` como Superadmin SEM impersonation → mensagem explicativa
- [ ] Acessar `/:tenantSlug/portal` como Superadmin COM impersonation → portal renderiza
- [ ] Verificar que tenant `federacao-demo` tem registro em `tenant_billing`
- [ ] Nenhum redirect ocorre durante `identityState === "loading"`

---

## Diagrama de Fluxo Corrigido

```text
┌────────────────────────────────────────────────────────────────────┐
│                     IDENTITY GATE (Corrigido)                       │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  [Entrada: pathname, auth, identity]                               │
│                    │                                                │
│                    ▼                                                │
│           ┌───────────────────┐                                    │
│           │  isPublicPath()   │──yes──▶ render children            │
│           └───────┬───────────┘                                    │
│                   │ no                                              │
│                   ▼                                                 │
│           ┌───────────────────┐                                    │
│           │   authLoading?    │──yes──▶ show loader (BLOQUEIA)     │
│           └───────┬───────────┘                                    │
│                   │ no                                              │
│                   ▼                                                 │
│           ┌───────────────────┐                                    │
│           │  !isAuthenticated │──yes──▶ Navigate /login            │
│           └───────┬───────────┘                                    │
│                   │ no                                              │
│                   ▼                                                 │
│           ┌───────────────────┐                                    │
│           │ identity loading? │──yes──▶ show loader (BLOQUEIA)     │
│           └───────┬───────────┘                                    │
│                   │ no                                              │
│                   ▼                                                 │
│           ┌───────────────────┐                                    │
│           │ wizard_required?  │──yes──▶ Navigate /identity/wizard  │
│           └───────┬───────────┘                                    │
│                   │ no                                              │
│                   ▼                                                 │
│           ┌───────────────────┐                                    │
│           │   superadmin?     │                                    │
│           └───────┬───────────┘                                    │
│                   │ yes                                             │
│                   ▼                                                 │
│    ┌──────────────────────────────┐                                │
│    │ isImpersonating + slug match?│──yes──▶ render children        │
│    └──────────┬───────────────────┘                                │
│               │ no                                                  │
│               ▼                                                     │
│    ┌──────────────────────────────┐                                │
│    │ pathname starts /admin?      │──yes──▶ render children        │
│    └──────────┬───────────────────┘                                │
│               │ no                                                  │
│               ▼                                                     │
│    ┌──────────────────────────────┐                                │
│    │ isTenantRoute(pathname)?     │ ◀── DETECÇÃO ESTRUTURAL        │
│    └──────────┬───────────────────┘                                │
│               │ yes                                                 │
│               ▼                                                     │
│    ┌──────────────────────────────┐                                │
│    │ MOSTRAR UI EXPLICATIVA       │ ◀── NÃO É REDIRECT SILENCIOSO  │
│    │ "Inicie impersonation"       │                                │
│    │ [Voltar ao Admin]            │                                │
│    └──────────────────────────────┘                                │
│               │ no (rota global desconhecida)                      │
│               ▼                                                     │
│    Navigate /admin (fallback seguro)                               │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```

---

## Resultado Esperado

| Cenário | Antes | Depois |
|---------|-------|--------|
| Atleta acessa `/tenant/portal` | Carregamento infinito | Portal renderiza |
| Superadmin acessa sem impersonation | Timeout / redirect silencioso | UI explicativa com CTA |
| Novas rotas globais adicionadas | Falso positivo possível | Adicionar a RESERVED_ROUTE_SEGMENTS |
| Decisão durante loading | Possível race condition | Bloqueado por R1/R3 |

**Veredito:** Após implementação, o sistema estará estável, determinístico e escalável.
