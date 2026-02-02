

# P1.3.B — CAMADA INSTITUCIONAL NO PRIMEIRO ACESSO (PÓS-LOGIN)

## MODO DE EXECUÇÃO

- **SAFE GOLD MODE** — Zero Interpretação
- ❌ NÃO criar novas rotas
- ❌ NÃO alterar fluxo de autenticação
- ❌ NÃO alterar AuthContext / IdentityContext
- ❌ NÃO criar onboarding, wizard ou tour
- ❌ NÃO impactar tenants
- ❌ NÃO tocar em backend / Edge Functions
- ❌ NÃO criar CMS
- ❌ NÃO alterar lógica existente
- ✅ APENAS UI contextual
- ✅ APENAS copy institucional
- ✅ APENAS primeiro acesso da sessão
- ✅ i18n obrigatório (pt-BR / en / es)

---

## ARQUITETURA IDENTIFICADA

| Componente | Função | Ação Proposta |
|------------|--------|---------------|
| `PortalRouter.tsx` | Passthrough (retorna null) | ❌ NÃO APLICÁVEL |
| `AdminDashboard.tsx` | Dashboard superadmin | ✅ Inserir bloco institucional |
| `TenantDashboard.tsx` | Dashboard tenant admin | ✅ Inserir bloco institucional |
| `AthletePortal.tsx` | Portal do atleta | ✅ Inserir bloco institucional |

### Estratégia: Componente Reutilizável

Para evitar duplicação de código, criar um componente isolado `PostLoginInstitutionalBanner.tsx` que encapsula:
- Lógica de sessionStorage
- UI do bloco institucional
- i18n

---

## 1️⃣ NOVO COMPONENTE — PostLoginInstitutionalBanner.tsx

### Localização

`src/components/notifications/PostLoginInstitutionalBanner.tsx`

### Código

```tsx
import React, { useState, useEffect } from 'react';
import { useI18n } from '@/contexts/I18nContext';

const STORAGE_KEY = 'tatame:postlogin_institutional_seen';

export function PostLoginInstitutionalBanner() {
  const { t } = useI18n();
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    // Check if already seen this session
    const alreadySeen = sessionStorage.getItem(STORAGE_KEY) === 'true';
    
    if (!alreadySeen) {
      setShouldShow(true);
      // Mark as seen
      sessionStorage.setItem(STORAGE_KEY, 'true');
    }
  }, []);

  if (!shouldShow) {
    return null;
  }

  return (
    <div className="mb-6 rounded-xl border border-border bg-card p-6">
      <h2 className="font-display text-xl font-bold mb-2">
        {t('postlogin.institutional.title')}
      </h2>
      <p className="text-muted-foreground mb-4 max-w-2xl">
        {t('postlogin.institutional.description')}
      </p>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          {t('postlogin.institutional.point1')}
        </span>
        <span className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          {t('postlogin.institutional.point2')}
        </span>
        <span className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          {t('postlogin.institutional.point3')}
        </span>
      </div>
    </div>
  );
}
```

---

## 2️⃣ ADMINDASHBOARD.TSX — INSERIR COMPONENTE

### Ponto de Inserção

- **Linha:** 346 (início do conteúdo `<main>`)
- **Após:** `<motion.div initial...>`
- **Antes:** `<div className="mb-8">` (título do painel)

### Código a Inserir

```tsx
// Import no topo
import { PostLoginInstitutionalBanner } from '@/components/notifications/PostLoginInstitutionalBanner';

// Dentro do main, após o motion.div de abertura
<PostLoginInstitutionalBanner />
```

### Posição Final

```tsx
<main className="container mx-auto px-4 py-8">
  <motion.div ...>
    <PostLoginInstitutionalBanner />  {/* ← NOVO */}
    <div className="mb-8">
      <h2>...</h2>
    </div>
    ...
  </motion.div>
</main>
```

---

## 3️⃣ TENANTDASHBOARD.TSX — INSERIR COMPONENTE

### Ponto de Inserção

- **Linha:** 254-255 (dentro de `<AppShell>`, após `<BillingStatusBanner />`)
- **Antes:** `<div>` com o welcome message

### Código a Inserir

```tsx
// Import no topo
import { PostLoginInstitutionalBanner } from '@/components/notifications/PostLoginInstitutionalBanner';

// Dentro do AppShell, após BillingStatusBanner
<PostLoginInstitutionalBanner />
```

### Posição Final

```tsx
<AppShell>
  <div className="space-y-8">
    <BillingStatusBanner />
    <PostLoginInstitutionalBanner />  {/* ← NOVO */}
    <div>
      <motion.h1>...</motion.h1>
    </div>
    ...
  </div>
</AppShell>
```

---

## 4️⃣ ATHLETEPORTAL.TSX — INSERIR COMPONENTE

### Ponto de Inserção

- **Linha:** 216 (dentro de `<PortalAccessGate>`, antes do header)
- **Antes:** `{/* Header */}` comment

### Código a Inserir

```tsx
// Import no topo
import { PostLoginInstitutionalBanner } from '@/components/notifications/PostLoginInstitutionalBanner';

// Dentro do PortalAccessGate, antes do Header
<PostLoginInstitutionalBanner />
```

### Posição Final

```tsx
<PortalAccessGate ...>
  <PostLoginInstitutionalBanner />  {/* ← NOVO */}
  {/* Header */}
  <div className="mb-6">
    ...
  </div>
  ...
</PortalAccessGate>
```

---

## 5️⃣ i18n — CHAVES pt-BR.ts

### Ponto de Inserção

- **Após:** chaves `login.institutional.*` (linha ~548)

### Chaves a Adicionar

```typescript
  // Post-login institutional
  'postlogin.institutional.title': 'Você está acessando uma infraestrutura institucional',
  'postlogin.institutional.description': 'O Tatame organiza, registra e preserva informações esportivas de forma estruturada, rastreável e institucionalmente confiável.',
  'postlogin.institutional.point1': 'Governança e organização do ecossistema',
  'postlogin.institutional.point2': 'Histórico esportivo verificável',
  'postlogin.institutional.point3': 'Neutralidade e colaboração institucional',
```

---

## 6️⃣ i18n — CHAVES en.ts

### Chaves a Adicionar

```typescript
  // Post-login institutional
  'postlogin.institutional.title': 'You are accessing an institutional infrastructure',
  'postlogin.institutional.description': 'Tatame organizes, registers and preserves sports information in a structured, traceable and institutionally reliable way.',
  'postlogin.institutional.point1': 'Ecosystem governance and organization',
  'postlogin.institutional.point2': 'Verifiable sports history',
  'postlogin.institutional.point3': 'Neutrality and institutional collaboration',
```

---

## 7️⃣ i18n — CHAVES es.ts

### Chaves a Adicionar

```typescript
  // Post-login institutional
  'postlogin.institutional.title': 'Está accediendo a una infraestructura institucional',
  'postlogin.institutional.description': 'Tatame organiza, registra y preserva información deportiva de forma estructurada, trazable y confiable a nivel institucional.',
  'postlogin.institutional.point1': 'Gobernanza y organización del ecosistema',
  'postlogin.institutional.point2': 'Historial deportivo verificable',
  'postlogin.institutional.point3': 'Neutralidad y colaboración institucional',
```

---

## 📦 RESUMO DE ALTERAÇÕES

| Arquivo | Ação | Impacto |
|---------|------|---------|
| `src/components/notifications/PostLoginInstitutionalBanner.tsx` | CRIAR | Componente reutilizável (~40 linhas) |
| `src/pages/AdminDashboard.tsx` | EDITAR | +1 import, +1 componente |
| `src/pages/TenantDashboard.tsx` | EDITAR | +1 import, +1 componente |
| `src/pages/AthletePortal.tsx` | EDITAR | +1 import, +1 componente |
| `src/locales/pt-BR.ts` | EDITAR | +4 chaves |
| `src/locales/en.ts` | EDITAR | +4 chaves |
| `src/locales/es.ts` | EDITAR | +4 chaves |

**Total de linhas alteradas:** ~60 linhas

---

## 🔒 COMPORTAMENTO DA SESSÃO

```text
Primeiro acesso:
  sessionStorage['tatame:postlogin_institutional_seen'] = undefined
  → Bloco APARECE
  → Marca como 'true'

Navegação subsequente:
  sessionStorage['tatame:postlogin_institutional_seen'] = 'true'
  → Bloco NÃO APARECE

Nova aba/sessão:
  sessionStorage limpo
  → Bloco APARECE novamente
```

---

## 🚫 FORA DE ESCOPO (CONFIRMADO)

- ❌ Onboarding
- ❌ Tour
- ❌ Modal
- ❌ CTA obrigatório
- ❌ Persistência em banco
- ❌ Backend
- ❌ Alteração de fluxo
- ❌ Tenant logic
- ❌ Eventos
- ❌ Admin settings

---

## ✅ CRITÉRIOS DE ACEITE (BINÁRIO)

| Item | Esperado |
|------|----------|
| Aparece só no primeiro acesso da sessão | ✅ |
| Não bloqueia navegação | ✅ |
| Não altera auth | ✅ |
| Linguagem institucional | ✅ |
| UX discreta | ✅ |
| i18n completo | ✅ |
| Zero impacto sistêmico | ✅ |
| Presente em AdminDashboard | ✅ |
| Presente em TenantDashboard | ✅ |
| Presente em AthletePortal | ✅ |

---

## 🏁 RESULTADO ESPERADO

Após P1.3.B:

- ✅ A jornada institucional está 100% fechada
- ✅ O usuário entende onde entrou
- ✅ O sistema ganha densidade institucional
- ✅ Não há fricção nem onboarding forçado
- ✅ Plataforma pronta para eventos, governança, dados e parceiros institucionais

