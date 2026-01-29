
# Implementação: Impersonation Access no IdentityGate

## Resumo da Mudança

Ajustar a **Regra R5** do `IdentityGate` para permitir que superadmins acessem rotas de tenant durante sessões ativas de impersonation, sem quebrar a segurança existente.

## Alterações no Arquivo

**Arquivo:** `src/components/identity/IdentityGate.tsx`

### 1. Adicionar Import

```typescript
import { useImpersonation } from "@/contexts/ImpersonationContext";
```

### 2. Extrair Estado de Impersonation

Após os hooks existentes (linha 84), adicionar:

```typescript
const { isImpersonating, session: impersonationSession } = useImpersonation();
```

### 3. Modificar Regra R5 (linhas 127-131)

**De:**
```typescript
// ===== R5: Superadmin → /admin =====
if (identityState === "superadmin") {
  if (pathname.startsWith("/admin")) return <>{children}</>;
  return <Navigate to="/admin" replace />;
}
```

**Para:**
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
  
  // Qualquer outra rota → redirecionar para /admin
  return <Navigate to="/admin" replace />;
}
```

## Matriz de Decisão

| Condição | Resultado |
|----------|-----------|
| Superadmin + impersonando tenant X + rota `/x/*` | ✅ Permitir |
| Superadmin + impersonando tenant X + rota `/y/*` | ❌ Redirect `/admin` |
| Superadmin + sem impersonation + rota `/admin/*` | ✅ Permitir |
| Superadmin + sem impersonation + qualquer outra | ❌ Redirect `/admin` |

## Impacto

- **Nenhum arquivo adicional modificado**
- **Sem alterações em AuthContext, IdentityContext ou Edge Functions**
- **Segurança mantida**: acesso condicionado ao estado de impersonation validado pelo backend

## Verificação

1. Login como Superadmin
2. Iniciar impersonation em um tenant
3. Confirmar navegação para `/${tenantSlug}/app`
4. Confirmar banner de impersonation visível
5. Encerrar impersonation → confirmar retorno ao `/admin`
6. Tentar acessar rota de tenant sem impersonation → confirmar redirect
