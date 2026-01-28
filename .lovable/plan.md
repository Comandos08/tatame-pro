

# Plano de Correção: Spinner Infinito na Rota "/"

## Diagnóstico

O spinner infinito acontece porque:

1. **App.tsx não tem a rota "/" definida** - quando o usuário acessa "/", não existe um match direto e cai no wildcard "/*" que leva ao PortalRouter
2. **PortalRouter exige autenticação** - ele chama `useCurrentUser()` e mostra um spinner enquanto `isLoading=true`
3. **Mesmo após auth carregar**, se o usuário não estiver autenticado, o PortalRouter redireciona para "/login", mas como não há match para "/", o ciclo pode se repetir

## Solução

### Arquivo 1: `src/App.tsx`

**O que muda:**
- Adicionar a rota `"/"` apontando para o componente `Landing`
- Adicionar todas as rotas públicas que estão faltando (`/help`, `/forgot-password`, `/reset-password`)

**Código final:**
```tsx
import { Routes, Route } from "react-router-dom";
import IdentityGate from "@/components/identity/IdentityGate";

import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Help from "@/pages/Help";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import PortalRouter from "@/pages/PortalRouter";
import IdentityWizard from "@/pages/IdentityWizard";
import AuthCallback from "@/pages/AuthCallback";
import NotFound from "@/pages/NotFound";

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

        {/* Protected - todas as outras rotas */}
        <Route path="/portal/*" element={<PortalRouter />} />
        
        {/* Fallback */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </IdentityGate>
  );
}
```

### Arquivo 2: `src/contexts/IdentityContext.tsx` (Opcional mas Recomendado)

**O que muda:**
- Mudar o estado inicial de `"loading"` para `"resolved"`
- Isso evita que rotas públicas mostrem loading desnecessário enquanto o IdentityContext inicializa

**Linha 88:**
```tsx
// DE:
const [identityState, setIdentityState] = useState<IdentityState>("loading");

// PARA:
const [identityState, setIdentityState] = useState<IdentityState>("resolved");
```

## Resultado Esperado

Após aplicar essas correções:

| Rota | Comportamento |
|------|---------------|
| `/` | Landing carrega IMEDIATAMENTE (sem spinner) |
| `/login` | Tela de login carrega imediatamente |
| `/help` | Página de ajuda carrega imediatamente |
| `/forgot-password` | Formulário de recuperação carrega imediatamente |
| `/reset-password` | Formulário de nova senha carrega imediatamente |
| `/portal` | Verifica autenticação → se não logado, vai para `/login` |
| `/admin` | Verifica autenticação + superadmin |

## Detalhes Técnicos

O IdentityGate já tem a lógica correta de bypass para rotas públicas (função `isPublicPath`), mas essa lógica só funciona se a rota estiver definida. Sem a rota "/" no App.tsx, o React Router não sabe o que renderizar e cai no wildcard que leva ao PortalRouter (que é protegido).

A mudança do estado inicial do IdentityContext de "loading" para "resolved" é uma otimização que evita delays desnecessários. Quando o usuário está em uma rota pública, não precisamos esperar a resolução de identidade - o bypass já cuida disso.

