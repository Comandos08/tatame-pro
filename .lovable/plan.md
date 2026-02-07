
# Plano: Separação de Rotas de Login e Cadastro

## Resumo do Diagnóstico

### Estado Atual

| Componente | Arquivo | Comportamento Atual |
|------------|---------|---------------------|
| Login + SignUp | `src/pages/Login.tsx` | Formulário único com toggle `isSignUp` para alternar entre modos |
| Rotas | `src/App.tsx` | Apenas `/login` existe, não há `/signup` |
| IdentityGate | `src/components/identity/IdentityGate.tsx` | `/login` está na whitelist pública (linha 125) |
| Traduções | `src/locales/*.ts` | Chaves existentes para ambos os fluxos (`auth.signUpTitle`, `auth.loginTitle`, etc.) |

### Problema

O formulário atual mistura login e cadastro em uma única página, com toggle para alternar entre modos. Isso:
- Aumenta a complexidade do código
- Dificulta links diretos para cadastro
- Prejudica SEO e analytics
- Confunde o fluxo de navegação

---

## Tarefas de Implementação

### Tarefa 1: Criar SignUp.tsx

**Arquivo:** `src/pages/SignUp.tsx` (NOVO)

Criar componente dedicado para cadastro, baseado na lógica existente de `Login.tsx`:

```typescript
// src/pages/SignUp.tsx

import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, Lock, Eye, EyeOff, Loader2, User } from "lucide-react";
import iconLogo from "@/assets/iconLogo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCurrentUser } from "@/contexts/AuthContext";
import { useIdentity } from "@/contexts/IdentityContext";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/contexts/I18nContext";

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function SignUp() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
  }>({});

  const { signUp, isAuthenticated } = useCurrentUser();
  const { identityState, redirectPath } = useIdentity();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useI18n();

  // Redirect quando autenticado
  useEffect(() => {
    if (isAuthenticated && identityState !== "loading") {
      if (identityState === "wizard_required") {
        navigate("/identity/wizard", { replace: true });
        return;
      }
      const destination = redirectPath || "/portal";
      navigate(destination, { replace: true });
    }
  }, [isAuthenticated, identityState, redirectPath, navigate]);

  const validateForm = (): boolean => {
    const errors: typeof formErrors = {};

    if (!name.trim()) {
      errors.name = t('auth.fullNameRequired');
    }

    if (!email.trim()) {
      errors.email = t('auth.emailRequired');
    } else if (!EMAIL_REGEX.test(email.trim())) {
      errors.email = t('auth.invalidEmail');
    }

    if (!password.trim()) {
      errors.password = t('auth.passwordRequired');
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const isFormValid = (): boolean => {
    return (
      name.trim() !== '' &&
      email.trim() !== '' &&
      EMAIL_REGEX.test(email.trim()) &&
      password.trim() !== ''
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setFormErrors({});
    if (!validateForm()) {
      toast({
        title: t('auth.formError'),
        description: t('auth.correctErrors'),
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      await signUp(email, password, name);
      toast({
        title: t("auth.accountCreated"),
        description: t("auth.accountCreatedDesc"),
      });
      // Não navegar manualmente - aguardar isAuthenticated no useEffect
    } catch (error) {
      console.error("SignUp error:", error);
      toast({
        title: t("auth.error"),
        description: error instanceof Error ? error.message : t("auth.genericError"),
        variant: "destructive",
      });
      setIsSubmitting(false);
    }
  };

  // ... JSX com campos para nome, email, senha
  // ... Link para /login na parte inferior
}
```

**Estrutura do formulário:**
- Campo: Nome completo (com ícone User)
- Campo: E-mail (com ícone Mail)
- Campo: Senha (com toggle mostrar/ocultar)
- Botão: Criar conta (desabilitado até `isFormValid()`)
- Link: "Já tem uma conta? Entrar" → `/login`

---

### Tarefa 2: Refatorar Login.tsx para Login Puro

**Arquivo:** `src/pages/Login.tsx`

#### Alterações:

1. **Remover estados de cadastro:**
   - Remover `isSignUp` state
   - Remover `name` state
   - Remover `formErrors.name`

2. **Simplificar validação:**
   ```typescript
   const validateForm = (): boolean => {
     const errors: typeof formErrors = {};

     if (!email.trim()) {
       errors.email = t('auth.emailRequired');
     } else if (!EMAIL_REGEX.test(email.trim())) {
       errors.email = t('auth.invalidEmail');
     }

     if (!password.trim()) {
       errors.password = t('auth.passwordRequired');
     }

     setFormErrors(errors);
     return Object.keys(errors).length === 0;
   };

   const isFormValid = (): boolean => {
     return (
       email.trim() !== '' &&
       EMAIL_REGEX.test(email.trim()) &&
       password.trim() !== ''
     );
   };
   ```

3. **Simplificar handleSubmit:**
   ```typescript
   const handleSubmit = async (e: React.FormEvent) => {
     e.preventDefault();
     if (isSubmitting) return;

     setFormErrors({});
     if (!validateForm()) {
       toast({
         title: t('auth.formError'),
         description: t('auth.correctErrors'),
         variant: 'destructive',
       });
       return;
     }

     setIsSubmitting(true);

     try {
       await signIn(email, password);
       toast({
         title: t("auth.welcome"),
         description: t("auth.loginSuccess"),
       });
     } catch (error) {
       console.error("Auth error:", error);
       toast({
         title: t("auth.error"),
         description: error instanceof Error ? error.message : t("auth.genericError"),
         variant: "destructive",
       });
       setIsSubmitting(false);
     }
   };
   ```

4. **Atualizar JSX:**
   - Remover bloco condicional `{isSignUp && (...)}` do campo nome
   - Usar sempre `t("auth.loginTitle")` e `t("auth.loginDesc")` no header
   - Remover lógica ternária no texto do botão (sempre "Login")
   - Substituir botão de toggle por Link:
     ```tsx
     <p className="mt-4 text-center text-sm text-muted-foreground">
       {t("auth.dontHaveAccount")}{" "}
       <Link to="/signup" className="text-primary hover:underline font-medium">
         {t("auth.createAccount")}
       </Link>
     </p>
     ```
   - Atualizar `autoComplete` da senha para sempre `"current-password"`

---

### Tarefa 3: Atualizar Rotas em App.tsx

**Arquivo:** `src/App.tsx`

#### Alterações:

1. **Adicionar import:**
   ```typescript
   import SignUp from "@/pages/SignUp";
   ```

2. **Adicionar rota `/signup`** (após `/login`):
   ```tsx
   <Route path="/login" element={<Login />} />
   <Route path="/signup" element={<SignUp />} />  {/* NOVO */}
   ```

---

### Tarefa 4: Atualizar IdentityGate (Whitelist)

**Arquivo:** `src/components/identity/IdentityGate.tsx`

#### Alterações:

Na função `isPublicPath`, adicionar `/signup` à whitelist (linha 122-132):

```typescript
const rootPublic = new Set([
  "/",
  "/about",
  "/login",
  "/signup",  // ← ADICIONAR
  "/forgot-password",
  "/reset-password",
  "/help",
  "/auth/callback",
  "/identity/wizard",
  "/identity/error",
]);
```

---

### Tarefa 5: Verificar Links em Outras Páginas

**Arquivos a verificar:**

| Arquivo | Link Atual | Ação |
|---------|------------|------|
| `ForgotPassword.tsx` | `/login` (linha 101, 179) | ✅ Manter (correto) |
| `ResetPassword.tsx` | `/login` (linhas 158, 161, 164, 194, 291, 294) | ✅ Manter (correto) |

Nenhuma alteração necessária — ambos linkam corretamente para `/login`.

---

## Arquivos Modificados

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `src/pages/SignUp.tsx` | **CRIAR** | Novo componente de cadastro |
| `src/pages/Login.tsx` | **MODIFICAR** | Remover lógica de cadastro, simplificar |
| `src/App.tsx` | **MODIFICAR** | Adicionar rota `/signup` |
| `src/components/identity/IdentityGate.tsx` | **MODIFICAR** | Adicionar `/signup` à whitelist |

---

## Critérios de Aceitação

- [ ] Rota `/signup` exibe formulário de cadastro funcional
- [ ] Rota `/login` exibe apenas formulário de login
- [ ] Link "Não tem uma conta? Criar conta" no login → `/signup`
- [ ] Link "Já tem uma conta? Entrar" no signup → `/login`
- [ ] Validação e feedback funcionam em ambos os formulários
- [ ] Redirecionamento pós-autenticação funciona corretamente
- [ ] `/signup` está na whitelist pública do IdentityGate
- [ ] Build compila sem erros
- [ ] Traduções funcionam nos 3 idiomas

---

## Seção Técnica

### Fluxo de Navegação

```text
┌─────────────────────────────────────────────────────┐
│                    LANDING (/)                      │
├─────────────────────────────────────────────────────┤
│  [Login]              [Criar Conta]                 │
│     ↓                      ↓                        │
│  /login                 /signup                     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────────────┐    ┌─────────────────┐        │
│  │     LOGIN       │    │     SIGNUP      │        │
│  │                 │    │                 │        │
│  │ [Email]         │    │ [Nome]          │        │
│  │ [Senha]         │    │ [Email]         │        │
│  │                 │    │ [Senha]         │        │
│  │ [Esqueceu?] ──→ /forgot-password       │        │
│  │                 │    │                 │        │
│  │ "Não tem conta?"│    │ "Já tem conta?" │        │
│  │  → /signup      │    │  → /login       │        │
│  └────────┬────────┘    └────────┬────────┘        │
│           │                      │                  │
│           └──────────┬───────────┘                  │
│                      ↓                              │
│            [isAuthenticated = true]                 │
│                      ↓                              │
│     ┌─────────────────────────────────────┐        │
│     │ identityState === "wizard_required" │        │
│     │         → /identity/wizard          │        │
│     │ else → redirectPath || /portal      │        │
│     └─────────────────────────────────────┘        │
└─────────────────────────────────────────────────────┘
```

### Chaves i18n Utilizadas

Todas as chaves já existem nos locales:

| Chave | pt-BR | en | es |
|-------|-------|----|----|
| `auth.loginTitle` | "Entrar" | "Sign in" | "Iniciar sesión" |
| `auth.loginDesc` | "Entre com suas credenciais..." | "Enter your credentials..." | "Ingrese sus credenciales..." |
| `auth.signUpTitle` | "Criar conta" | "Create account" | "Crear cuenta" |
| `auth.signUpDesc` | "Preencha os dados..." | "Fill in your details..." | "Complete sus datos..." |
| `auth.alreadyHaveAccount` | "Já tem uma conta?" | "Already have an account?" | "¿Ya tiene una cuenta?" |
| `auth.dontHaveAccount` | "Não tem uma conta?" | "Don't have an account?" | "¿No tiene una cuenta?" |
| `auth.createAccount` | "Criar conta" | "Create account" | "Crear cuenta" |
| `auth.login` | "Entrar" | "Login" | "Iniciar sesión" |

