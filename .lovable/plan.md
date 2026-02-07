

# Plano: Tratamento de Erros de Backend

## Resumo do Diagnóstico

### Estado Atual

| Componente | Tratamento de Erro | Problema |
|------------|-------------------|----------|
| `Login.tsx` (linha 101) | `error.message` direto | Exibe mensagens em inglês como "Invalid login credentials" |
| `SignUp.tsx` (linha 105) | `error.message` direto | Exibe mensagens como "User already registered" |
| `ForgotPassword.tsx` (linha 67) | Chave genérica `auth.forgot.errorDesc` | Não diferencia tipos de erro |
| `AuthContext.tsx` | Relança erro do Supabase | Sem transformação/mapeamento |

### Mensagens Técnicas Expostas ao Usuário

```text
"Invalid login credentials"     → Credenciais inválidas (inglês técnico)
"User already registered"       → Email já cadastrado (inglês técnico)
"Failed to fetch"               → Erro de rede (genérico)
"Network request failed"        → Erro de conexão (genérico)
```

### Arquitetura Existente de Erros

O projeto já possui `src/lib/errors/` com:
- `temporaryErrorMap.ts` — Mapeamento de erros temporários para UX
- `index.ts` — Exportações centralizadas

A nova função deve seguir o mesmo padrão arquitetural.

---

## Tarefas de Implementação

### Tarefa 1: Criar Utilitário de Mapeamento de Erros de Autenticação

**Arquivo:** `src/lib/errors/authErrorMap.ts` (NOVO)

```typescript
/**
 * ============================================================================
 * 🔐 AUTH ERROR MAP — Friendly Error Mapping for Authentication
 * ============================================================================
 * 
 * Maps Supabase auth error messages to i18n keys for user-friendly display.
 * 
 * SAFE GOLD PRINCIPLES:
 * - Pure function, no side effects
 * - Returns i18n keys, not hardcoded strings
 * - Extensible pattern matching
 * ============================================================================
 */

export interface AuthError {
  message?: string;
  status?: number;
  statusCode?: number;
  code?: string;
}

/**
 * Maps authentication errors to user-friendly i18n keys.
 * 
 * @param error - The error object from Supabase or network
 * @returns i18n key for the friendly error message
 */
export function getAuthErrorKey(error: AuthError | Error | unknown): string {
  if (!error) return 'auth.genericError';

  const err = error as AuthError;
  const message = err?.message?.toLowerCase() || '';
  const status = err?.status || err?.statusCode || 0;
  const code = err?.code?.toLowerCase() || '';

  // SignUp: Email already registered (Supabase returns 422 or specific message)
  if (
    message.includes('user already registered') ||
    message.includes('email already in use') ||
    code === 'user_already_exists'
  ) {
    return 'auth.alreadyRegistered';
  }

  // Login: Invalid credentials (Supabase returns 400)
  if (
    message.includes('invalid login credentials') ||
    message.includes('invalid email or password') ||
    code === 'invalid_credentials'
  ) {
    return 'auth.invalidCredentials';
  }

  // Email not confirmed
  if (
    message.includes('email not confirmed') ||
    code === 'email_not_confirmed'
  ) {
    return 'auth.emailNotConfirmed';
  }

  // Rate limiting
  if (
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    status === 429
  ) {
    return 'auth.rateLimited';
  }

  // Network errors
  if (
    message.includes('failed to fetch') ||
    message.includes('network request failed') ||
    message.includes('networkerror') ||
    message.includes('fetch error') ||
    status === 0
  ) {
    return 'auth.networkError';
  }

  // Server errors (5xx)
  if (status >= 500) {
    return 'auth.serverError';
  }

  // Default fallback
  return 'auth.genericError';
}
```

### Tarefa 2: Atualizar Exportações do Módulo de Erros

**Arquivo:** `src/lib/errors/index.ts`

```typescript
/**
 * 🚨 Error Utilities — Centralized Error Handling
 */

export {
  TEMPORARY_ERROR_MAP,
  TEMPORARY_ERROR_TYPES,
  type TemporaryErrorType,
  type TemporaryErrorConfig,
} from './temporaryErrorMap';

// Auth error mapping
export { getAuthErrorKey, type AuthError } from './authErrorMap';
```

---

### Tarefa 3: Atualizar Login.tsx

**Arquivo:** `src/pages/Login.tsx`

#### 3.1 Adicionar import

```typescript
import { getAuthErrorKey } from '@/lib/errors';
```

#### 3.2 Modificar bloco catch (linhas 97-105)

```typescript
    } catch (error) {
      console.error("Auth error:", error);
      const errorKey = getAuthErrorKey(error);
      toast({
        title: t("auth.error"),
        description: t(errorKey),
        variant: "destructive",
      });
      setIsSubmitting(false);
    }
```

---

### Tarefa 4: Atualizar SignUp.tsx

**Arquivo:** `src/pages/SignUp.tsx`

#### 4.1 Adicionar import

```typescript
import { getAuthErrorKey } from '@/lib/errors';
```

#### 4.2 Modificar bloco catch (linhas 101-109)

```typescript
    } catch (error) {
      console.error("SignUp error:", error);
      const errorKey = getAuthErrorKey(error);
      toast({
        title: t("auth.error"),
        description: t(errorKey),
        variant: "destructive",
      });
      setIsSubmitting(false);
    }
```

---

### Tarefa 5: Atualizar ForgotPassword.tsx (Opcional mas Recomendado)

**Arquivo:** `src/pages/ForgotPassword.tsx`

#### 5.1 Adicionar import

```typescript
import { getAuthErrorKey } from '@/lib/errors';
```

#### 5.2 Modificar bloco catch (linhas 63-70)

```typescript
    } catch (error) {
      console.error("Password reset error:", error);
      const errorKey = getAuthErrorKey(error);
      toast({
        title: t('auth.forgot.error'),
        description: t(errorKey),
        variant: "destructive",
      });
    } finally {
```

---

### Tarefa 6: Adicionar Chaves de Tradução

**Arquivos:** `src/locales/pt-BR.ts`, `src/locales/en.ts`, `src/locales/es.ts`

Adicionar após a linha com `auth.genericError` (≈ linha 536):

```typescript
// pt-BR.ts
'auth.alreadyRegistered': 'Este e-mail já está cadastrado. Faça login ou redefina sua senha.',
'auth.invalidCredentials': 'E-mail ou senha inválidos.',
'auth.emailNotConfirmed': 'E-mail não confirmado. Verifique sua caixa de entrada.',
'auth.rateLimited': 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
'auth.networkError': 'Erro de rede. Verifique sua conexão e tente novamente.',
'auth.serverError': 'Erro no servidor. Tente novamente em alguns instantes.',

// en.ts
'auth.alreadyRegistered': 'This email is already registered. Please log in or reset your password.',
'auth.invalidCredentials': 'Invalid email or password.',
'auth.emailNotConfirmed': 'Email not confirmed. Please check your inbox.',
'auth.rateLimited': 'Too many attempts. Please wait a few minutes and try again.',
'auth.networkError': 'Network error. Please check your connection and try again.',
'auth.serverError': 'Server error. Please try again in a moment.',

// es.ts
'auth.alreadyRegistered': 'Este correo electrónico ya está registrado. Inicie sesión o restablezca su contraseña.',
'auth.invalidCredentials': 'Correo electrónico o contraseña inválidos.',
'auth.emailNotConfirmed': 'Correo electrónico no confirmado. Verifique su bandeja de entrada.',
'auth.rateLimited': 'Demasiados intentos. Espere unos minutos e inténtelo de nuevo.',
'auth.networkError': 'Error de red. Verifique su conexión e inténtelo de nuevo.',
'auth.serverError': 'Error del servidor. Inténtelo de nuevo en unos momentos.',
```

---

## Arquivos Modificados

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `src/lib/errors/authErrorMap.ts` | **CRIAR** | Função de mapeamento de erros de auth |
| `src/lib/errors/index.ts` | **MODIFICAR** | Exportar nova função |
| `src/pages/Login.tsx` | **MODIFICAR** | Usar `getAuthErrorKey` no catch |
| `src/pages/SignUp.tsx` | **MODIFICAR** | Usar `getAuthErrorKey` no catch |
| `src/pages/ForgotPassword.tsx` | **MODIFICAR** | Usar `getAuthErrorKey` no catch |
| `src/locales/pt-BR.ts` | **ADICIONAR** | 6 chaves de erro |
| `src/locales/en.ts` | **ADICIONAR** | 6 chaves de erro |
| `src/locales/es.ts` | **ADICIONAR** | 6 chaves de erro |

---

## Critérios de Aceitação

- [ ] Cadastro com email duplicado exibe "Este e-mail já está cadastrado..."
- [ ] Login com senha errada exibe "E-mail ou senha inválidos."
- [ ] Erro de rede exibe "Erro de rede. Verifique sua conexão..."
- [ ] Mensagens técnicas em inglês não são exibidas diretamente
- [ ] Traduções funcionam nos 3 idiomas (pt-BR, en, es)
- [ ] Build compila sem erros
- [ ] Função `getAuthErrorKey` é reutilizável em outros contextos

---

## Seção Técnica

### Mapeamento de Erros Supabase

| Erro Supabase | Status | Chave i18n |
|--------------|--------|------------|
| `User already registered` | 422 | `auth.alreadyRegistered` |
| `Invalid login credentials` | 400 | `auth.invalidCredentials` |
| `Email not confirmed` | 400 | `auth.emailNotConfirmed` |
| `Too many requests` | 429 | `auth.rateLimited` |
| `Failed to fetch` | 0 | `auth.networkError` |
| `Internal Server Error` | 5xx | `auth.serverError` |
| (qualquer outro) | - | `auth.genericError` |

### Fluxo de Mapeamento

```text
┌─────────────────────────────────────────────────────┐
│ Supabase retorna erro                               │
├─────────────────────────────────────────────────────┤
│ catch (error) {                                     │
│   const errorKey = getAuthErrorKey(error);          │
│   toast({ description: t(errorKey) });              │
│ }                                                   │
├─────────────────────────────────────────────────────┤
│                                                     │
│ getAuthErrorKey(error):                             │
│   ├─ "User already registered" → auth.alreadyRegistered
│   ├─ "Invalid login credentials" → auth.invalidCredentials
│   ├─ "Failed to fetch" → auth.networkError          │
│   └─ default → auth.genericError                    │
│                                                     │
├─────────────────────────────────────────────────────┤
│ t(errorKey) retorna texto traduzido                 │
│ → "Este e-mail já está cadastrado..."               │
└─────────────────────────────────────────────────────┘
```

### Extensibilidade

Para adicionar novos mapeamentos no futuro, basta:
1. Adicionar condição na função `getAuthErrorKey`
2. Adicionar chave correspondente nos 3 locales

Exemplo para erro de senha fraca:
```typescript
if (message.includes('password too weak')) {
  return 'auth.passwordTooWeak';
}
```

