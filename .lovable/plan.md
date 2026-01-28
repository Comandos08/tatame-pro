
# Plano de Correção: Rotas Faltando no App.tsx

## Diagnóstico Final

### O que está acontecendo

```text
Login.tsx                IdentityGate.tsx           App.tsx Routes
    │                         │                          │
    │ signIn() OK             │                          │
    │─────────────────────────>                          │
    │ isAuthenticated=true    │                          │
    │ navigate("/portal")     │                          │
    │                         │                          │
    │                         │ authLoading=false        │
    │                         │ identityState="loading"  │
    │                         │ → mostra spinner         │
    │                         │                          │
    │                         │ checkIdentity() retorna: │
    │                         │ status=RESOLVED          │
    │                         │ role=SUPERADMIN_GLOBAL   │
    │                         │ redirectPath="/admin"    │
    │                         │                          │
    │                         │ identityState="superadmin"
    │                         │ R5: pathname != /admin   │
    │                         │ → Navigate to /admin     │
    │                         │                          │
    │                         │                          │ /admin NÃO EXISTE
    │                         │                          │ → cai no path="*"
    │                         │                          │ → NotFound 😱
```

### Problema

O arquivo `App.tsx` foi simplificado e agora tem APENAS estas rotas:

| Rota | Existe? |
|------|---------|
| `/` | ✅ |
| `/login` | ✅ |
| `/help` | ✅ |
| `/forgot-password` | ✅ |
| `/reset-password` | ✅ |
| `/auth/callback` | ✅ |
| `/identity/wizard` | ✅ |
| `/portal/*` | ✅ |
| `/admin/*` | ❌ FALTANDO |
| `/:tenantSlug/*` | ❌ FALTANDO |

O arquivo `routes.tsx` tem a estrutura completa de rotas, mas **não está sendo usado**.

---

## Solução

### Opção A: Usar o AppRoutes do routes.tsx (Recomendado)

Modificar `App.tsx` para usar o componente `AppRoutes` já existente:

```tsx
// src/App.tsx
import { AppRoutes } from "@/routes";

export default function App() {
  return <AppRoutes />;
}
```

**Problema**: O `routes.tsx` tem `IdentityGate` dentro de cada rota protegida, mas o `App.tsx` atual envolve tudo com `IdentityGate` no topo. Isso pode causar duplicação.

### Opção B: Restaurar as rotas faltantes no App.tsx (Cirúrgico)

Adicionar as rotas `/admin/*` e `/:tenantSlug/*` diretamente no `App.tsx` atual:

```tsx
// src/App.tsx - com todas as rotas necessárias
import { Routes, Route } from "react-router-dom";
import IdentityGate from "@/components/identity/IdentityGate";

// Public pages
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Help from "@/pages/Help";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import AuthCallback from "@/pages/AuthCallback";
import NotFound from "@/pages/NotFound";

// Identity
import IdentityWizard from "@/pages/IdentityWizard";

// Portal
import PortalRouter from "@/pages/PortalRouter";

// Admin
import AdminDashboard from "@/pages/AdminDashboard";
import TenantControl from "@/pages/TenantControl";

// Tenant
import { TenantLayout } from "@/layouts/TenantLayout";
import TenantLanding from "@/pages/TenantLanding";
import TenantDashboard from "@/pages/TenantDashboard";
// ... outros componentes de tenant

export default function App() {
  return (
    <IdentityGate>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/help" element={<Help />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* Identity */}
        <Route path="/identity/wizard" element={<IdentityWizard />} />

        {/* Portal */}
        <Route path="/portal/*" element={<PortalRouter />} />

        {/* Admin (Superadmin only - já protegido pelo IdentityGate) */}
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/tenants/:tenantId/control" element={<TenantControl />} />

        {/* Tenant routes */}
        <Route path="/:tenantSlug" element={<TenantLayout />}>
          <Route index element={<TenantLanding />} />
          <Route path="app" element={<TenantDashboard />} />
          {/* ... outras rotas de tenant */}
        </Route>

        {/* Fallback */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </IdentityGate>
  );
}
```

---

## Recomendação

**Opção B** é mais segura porque:
1. Não requer refatorar o `routes.tsx`
2. Mantém o `IdentityGate` como wrapper único
3. Adiciona apenas as rotas que faltam

---

## Mudanças Necessárias

### Arquivo: `src/App.tsx`

Adicionar:
1. Importação de `AdminDashboard` e `TenantControl`
2. Importação de `TenantLayout`, `TenantLanding`, `TenantDashboard`
3. Rotas para `/admin` e `/admin/tenants/:tenantId/control`
4. Rotas para `/:tenantSlug/*`

### Verificação de Segurança

O `IdentityGate` já protege as rotas:
- **R5**: Se `identityState === "superadmin"` e pathname não começa com `/admin`, redireciona para `/admin`
- Isso significa que só superadmins chegam em `/admin/*`

Para rotas de tenant (`/:tenantSlug/app`), precisamos verificar se há proteção adequada no `TenantLayout` ou adicionar um guard similar.

---

## Resultado Esperado

Após aplicar a correção:

| Ação | Resultado |
|------|-----------|
| Login como superadmin | → /portal → identity resolve → /admin (Dashboard carrega) |
| Login como admin de tenant | → /portal → identity resolve → /tenant-slug/app |
| Login como atleta | → /portal → identity resolve → /tenant-slug/portal |
