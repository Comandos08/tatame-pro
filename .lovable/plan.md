

# Plano Refinado: Validação e Feedback nos Formulários

## Diagnóstico Atualizado

O plano anterior foi parcialmente aprovado, mas requer os seguintes ajustes críticos:

| Problema | Status | Correção Necessária |
|----------|--------|---------------------|
| Botão ForgotPassword não valida formato de email | ❌ Pendente | Adicionar `EMAIL_REGEX.test()` na condição `disabled` |
| Toast em ForgotPassword usa chaves antigas | ❌ Pendente | Usar `auth.emailRequired` e `auth.invalidEmail` |
| AthleteLogin não valida formato no botão | ❌ Pendente | Adicionar validação de regex no `disabled` |
| Chaves de tradução ausentes | ❌ Pendente | Adicionar 6 chaves aos 3 locales |
| Login.tsx sem validação completa | ❌ Pendente | Implementar estado de erros e validação |

---

## Tarefas de Implementação

### Tarefa 1: Adicionar Chaves de Tradução (Pré-requisito)

**Arquivos:** `src/locales/pt-BR.ts`, `src/locales/en.ts`, `src/locales/es.ts`

Adicionar na seção de auth (após linha ~540):

```typescript
// pt-BR.ts
'auth.emailRequired': 'E-mail é obrigatório.',
'auth.invalidEmail': 'Formato de e-mail inválido.',
'auth.passwordRequired': 'Senha é obrigatória.',
'auth.fullNameRequired': 'Nome completo é obrigatório.',
'auth.formError': 'Corrija os erros',
'auth.correctErrors': 'Preencha todos os campos obrigatórios.',

// en.ts
'auth.emailRequired': 'Email is required.',
'auth.invalidEmail': 'Invalid email format.',
'auth.passwordRequired': 'Password is required.',
'auth.fullNameRequired': 'Full name is required.',
'auth.formError': 'Please correct the errors',
'auth.correctErrors': 'Fill in all required fields.',

// es.ts
'auth.emailRequired': 'Correo electrónico es obligatorio.',
'auth.invalidEmail': 'Formato de correo electrónico inválido.',
'auth.passwordRequired': 'Contraseña es obligatoria.',
'auth.fullNameRequired': 'Nombre completo es obligatorio.',
'auth.formError': 'Por favor corrija los errores',
'auth.correctErrors': 'Complete todos los campos requeridos.',
```

---

### Tarefa 2: Atualizar ForgotPassword.tsx

**Arquivo:** `src/pages/ForgotPassword.tsx`

#### 2.1 Adicionar regex e estado de erro

```typescript
// Após linha 18 (const { t } = useI18n();)
const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const [emailError, setEmailError] = useState<string | null>(null);
```

#### 2.2 Modificar handleSubmit com validação completa

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setEmailError(null);

  // Validar email vazio
  if (!email.trim()) {
    setEmailError(t('auth.emailRequired'));
    toast({
      title: t('auth.formError'),
      description: t('auth.emailRequired'),
      variant: "destructive",
    });
    return;
  }

  // Validar formato de email
  if (!EMAIL_REGEX.test(email.trim())) {
    setEmailError(t('auth.invalidEmail'));
    toast({
      title: t('auth.formError'),
      description: t('auth.invalidEmail'),
      variant: "destructive",
    });
    return;
  }

  setIsLoading(true);
  // ... resto do código existente
};
```

#### 2.3 Atualizar botão com validação de formato

```tsx
// Linha 140 - Antes:
<Button type="submit" className="w-full" disabled={isLoading}>

// Depois:
<Button 
  type="submit" 
  className="w-full" 
  disabled={isLoading || !email.trim() || !EMAIL_REGEX.test(email.trim())}
>
```

#### 2.4 Adicionar mensagem de erro inline

```tsx
// Após o Input (linha 135), adicionar:
{emailError && (
  <p className="text-sm text-destructive mt-1">{emailError}</p>
)}
```

#### 2.5 Limpar erro ao digitar

```tsx
// Modificar onChange do Input:
onChange={(e) => {
  setEmail(e.target.value);
  if (emailError) setEmailError(null);
}}
```

---

### Tarefa 3: Atualizar AthleteLogin.tsx

**Arquivo:** `src/pages/AthleteLogin.tsx`

#### 3.1 Adicionar regex

```typescript
// Após linha 23 (const [error, setError] = useState...)
const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
```

#### 3.2 Adicionar validação no handleMagicLink

```typescript
const handleMagicLink = async (e: React.FormEvent) => {
  e.preventDefault();
  setIsLoading(true);
  setError(null);

  // Validar email vazio
  if (!email.trim()) {
    setError(t('auth.emailRequired'));
    setIsLoading(false);
    return;
  }

  // Validar formato de email
  if (!EMAIL_REGEX.test(email.trim())) {
    setError(t('auth.invalidEmail'));
    setIsLoading(false);
    return;
  }

  // Guard defensivo: tenantSlug é obrigatório
  if (!tenantSlug) {
    // ... código existente
  }
  // ... resto do código
};
```

#### 3.3 Atualizar botão com validação de formato

```tsx
// Linha 138 - Antes:
<Button type="submit" className="w-full" disabled={isLoading || !email} variant="tenant">

// Depois:
<Button 
  type="submit" 
  className="w-full" 
  disabled={isLoading || !email.trim() || !EMAIL_REGEX.test(email.trim())} 
  variant="tenant"
>
```

---

### Tarefa 4: Atualizar Login.tsx

**Arquivo:** `src/pages/Login.tsx`

#### 4.1 Adicionar estado de erros e regex

```typescript
// Após linha 22 (const [name, setName] = useState("");)
const [formErrors, setFormErrors] = useState<{
  email?: string;
  password?: string;
  name?: string;
}>({});

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
```

#### 4.2 Criar função de validação

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

  if (isSignUp && !name.trim()) {
    errors.name = t('auth.fullNameRequired');
  }

  setFormErrors(errors);
  return Object.keys(errors).length === 0;
};
```

#### 4.3 Criar função isFormValid

```typescript
const isFormValid = (): boolean => {
  const emailValid = email.trim() !== '' && EMAIL_REGEX.test(email.trim());
  const passwordValid = password.trim() !== '';
  const nameValid = !isSignUp || name.trim() !== '';
  return emailValid && passwordValid && nameValid;
};
```

#### 4.4 Modificar handleSubmit

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
  // ... resto do código existente
};
```

#### 4.5 Atualizar botão de submit

```tsx
// Linha 163 - Antes:
<Button type="submit" className="w-full h-11" disabled={isSubmitting}>

// Depois:
<Button type="submit" className="w-full h-11" disabled={isSubmitting || !isFormValid()}>
```

#### 4.6 Adicionar mensagens de erro inline

```tsx
{/* Após o input de nome (linha 115) */}
{formErrors.name && (
  <p className="text-sm text-destructive mt-1">{formErrors.name}</p>
)}

{/* Após o input de email (linha 134) */}
{formErrors.email && (
  <p className="text-sm text-destructive mt-1">{formErrors.email}</p>
)}

{/* Após o div de senha (linha 160) */}
{formErrors.password && (
  <p className="text-sm text-destructive mt-1">{formErrors.password}</p>
)}
```

#### 4.7 Limpar erros ao alternar modo

```tsx
// Linha 186-189 - Modificar o onClick:
onClick={() => {
  setIsSignUp(!isSignUp);
  setIsSubmitting(false);
  setFormErrors({});
}}
```

---

## Arquivos Modificados

| Arquivo | Ação | Alterações |
|---------|------|------------|
| `src/locales/pt-BR.ts` | ADICIONAR | 6 chaves de validação |
| `src/locales/en.ts` | ADICIONAR | 6 chaves de validação |
| `src/locales/es.ts` | ADICIONAR | 6 chaves de validação |
| `src/pages/Login.tsx` | MODIFICAR | Estado de erros, validação, mensagens inline |
| `src/pages/ForgotPassword.tsx` | MODIFICAR | Validação de formato, botão disabled, mensagens inline |
| `src/pages/AthleteLogin.tsx` | MODIFICAR | Validação de formato, botão disabled |

---

## Critérios de Aceitação

- [ ] Botão de Login/Criar Conta habilitado apenas quando campos preenchidos E válidos
- [ ] Botão de ForgotPassword desabilitado até email ter formato válido
- [ ] Botão de AthleteLogin desabilitado até email ter formato válido
- [ ] Mensagens de erro inline aparecem abaixo de cada campo inválido
- [ ] Toast geral é exibido quando há erros de validação
- [ ] Erros são limpos ao alternar entre Login e Signup
- [ ] Erros são limpos ao digitar em campos com erro
- [ ] Traduções funcionam nos 3 idiomas
- [ ] Build compila sem erros

---

## Seção Técnica

### Regex de Validação

```typescript
const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
```

Valida:
- Pelo menos um caractere antes do `@` (exceto espaços)
- Pelo menos um caractere entre `@` e `.`
- Pelo menos um caractere após o último `.`
- Não permite espaços em nenhuma posição

### Fluxo de Validação Unificado

```text
┌─────────────────────────────────────────────────────┐
│ Usuário interage com formulário                     │
├─────────────────────────────────────────────────────┤
│ 1. isFormValid() avalia em tempo real               │
│    → Botão habilitado/desabilitado dinamicamente    │
│                                                     │
│ 2. Usuário clica Submit                             │
│    → setFormErrors({}) limpa erros anteriores       │
│    → validateForm() executa validação completa      │
│                                                     │
│ 3. Se erros encontrados:                            │
│    → setFormErrors(errors) atualiza estado          │
│    → toast() exibe mensagem geral                   │
│    → return (não prossegue)                         │
│                                                     │
│ 4. Se sem erros:                                    │
│    → setIsSubmitting(true)                          │
│    → Executa signIn/signUp/etc                      │
└─────────────────────────────────────────────────────┘
```

### Estrutura de Estado de Erros

```typescript
interface FormErrors {
  email?: string;    // Mensagem traduzida ou undefined
  password?: string; // Mensagem traduzida ou undefined
  name?: string;     // Mensagem traduzida ou undefined (só cadastro)
}
```

