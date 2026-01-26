

## P4.x FINAL HARDENING — LANDING PAGE i18n + VISUAL FIX

### Resumo Executivo

A página de Landing pública (`/`) está com todos os textos hardcoded em português, não reagindo às mudanças de idioma. Esta implementação corrige esse problema utilizando chaves i18n que **já existem** nos arquivos de tradução, além de padronizar o botão secundário.

---

### Diagnóstico

| Componente | Problema | Solução |
|------------|----------|---------|
| `Landing.tsx` | Textos hardcoded em PT | Substituir por `t()` |
| `Landing.tsx:97` | Botão usa `variant="outline"` | Substituir por `variant="tenant-outline"` |
| `PublicHeader.tsx:108` | "Entrar" hardcoded | Usar `t('auth.login')` |
| `PublicHeader.tsx:111` | "Começar Agora" hardcoded | Usar `t('landing.accessPlatform')` |

### Chaves i18n Disponíveis

Todas as chaves necessárias **já existem** em `pt-BR.ts`, `en.ts` e `es.ts`:

```text
landing.platformBadge     → "Plataforma de Gestão..." / "Management Platform..." / "Plataforma de Gestión..."
landing.heroTitle         → "Gerencie sua" / "Manage your" / "Gestione su"
landing.heroTitleHighlight→ "organização de esporte de combate" / ...
landing.heroTitleEnd      → "com excelência" / "with excellence" / "con excelencia"
landing.heroDescription   → Descrição completa
landing.accessPlatform    → "Acessar Plataforma" / "Access Platform" / "Acceder a la Plataforma"
landing.learnMore         → "Saiba Mais" / "Learn More" / "Saber Más"
landing.featuresTitle     → "Tudo que você precisa" / ...
landing.featuresDescription → ...
landing.featureAthletes   → "Gestão de Atletas" / "Athlete Management" / ...
landing.featureAthletesDesc → ...
landing.featureGradings   → "Graduações & Diplomas" / ...
landing.featureGradingsDesc → ...
landing.featureMultiSport → "Multi-esporte" / "Multi-sport" / ...
landing.featureMultiSportDesc → ...
landing.featurePayments   → "Pagamentos Integrados" / ...
landing.featurePaymentsDesc → ...
landing.ctaTitle          → "Pronto para começar?" / "Ready to start?" / ...
landing.ctaFreeSignup     → "Cadastro gratuito" / "Free registration" / ...
landing.ctaSupport        → "Suporte especializado" / ...
landing.ctaStripe         → "Integração Stripe incluída" / ...
landing.createFreeAccount → "Criar Conta Grátis" / "Create Free Account" / ...
landing.copyright         → "© {year} TATAME Pro..." (requer interpolação)
auth.login                → "Entrar" / "Sign in" / "Iniciar sesión"
```

---

### Tarefas de Implementação

#### Arquivo 1: `src/pages/Landing.tsx`

**1.1 Adicionar import do hook i18n:**
```typescript
import { useI18n } from '@/contexts/I18nContext';
```

**1.2 Inicializar o hook dentro do componente:**
```typescript
export default function Landing() {
  const { t } = useI18n();
  // ...
}
```

**1.3 Refatorar o array `features` para usar `t()`:**

O array `features` (linhas 9-30) será movido para dentro do componente e usará as chaves i18n:

```typescript
const features = [
  {
    icon: Users,
    titleKey: 'landing.featureAthletes' as const,
    descKey: 'landing.featureAthletesDesc' as const,
  },
  {
    icon: Award,
    titleKey: 'landing.featureGradings' as const,
    descKey: 'landing.featureGradingsDesc' as const,
  },
  {
    icon: Shield,
    titleKey: 'landing.featureMultiSport' as const,
    descKey: 'landing.featureMultiSportDesc' as const,
  },
  {
    icon: Zap,
    titleKey: 'landing.featurePayments' as const,
    descKey: 'landing.featurePaymentsDesc' as const,
  },
];
```

**1.4 Substituições de texto hardcoded:**

| Linha | Antes | Depois |
|-------|-------|--------|
| 68 | `Plataforma de Gestão para Esportes de Combate` | `{t('landing.platformBadge')}` |
| 76 | `Gerencie sua{' '}` | `{t('landing.heroTitle')}{' '}` |
| 77 | `organização de esporte de combate` | `{t('landing.heroTitleHighlight')}` |
| 79 | `com excelência` | `{t('landing.heroTitleEnd')}` |
| 86-87 | `Sistema completo para...` | `{t('landing.heroDescription')}` |
| 93 | `Acessar Plataforma` | `{t('landing.accessPlatform')}` |
| 97 | `variant="outline"` | `variant="tenant-outline"` |
| 98 | `Saiba Mais` | `{t('landing.learnMore')}` |
| 122 | `Tudo que você precisa` | `{t('landing.featuresTitle')}` |
| 128 | `Ferramentas completas...` | `{t('landing.featuresDescription')}` |
| 148 | `{feature.title}` | `{t(feature.titleKey)}` |
| 149 | `{feature.description}` | `{t(feature.descKey)}` |
| 170 | `Pronto para começar?` | `{t('landing.ctaTitle')}` |
| 173 | Array com textos hardcoded | Array com chaves i18n |
| 185 | `Criar Conta Grátis` | `{t('landing.createFreeAccount')}` |
| 203 | `© {year} TATAME Pro...` | `{t('landing.copyright').replace('{year}', ...)}` |

**1.5 Refatorar a lista CTA:**

```typescript
const ctaItems = [
  'landing.ctaFreeSignup' as const,
  'landing.ctaSupport' as const,
  'landing.ctaStripe' as const,
];
```

---

#### Arquivo 2: `src/components/PublicHeader.tsx`

**2.1 Substituições (já usa `useI18n`):**

| Linha | Antes | Depois |
|-------|-------|--------|
| 108 | `Entrar` | `{t('auth.login')}` |
| 111 | `Começar Agora` | `{t('landing.accessPlatform')}` |

---

### Arquivos a Modificar

| Arquivo | Modificações |
|---------|--------------|
| `src/pages/Landing.tsx` | Import `useI18n`, refatorar features array, substituir todos os textos hardcoded, trocar `variant="outline"` por `variant="tenant-outline"` |
| `src/components/PublicHeader.tsx` | Substituir "Entrar" e "Começar Agora" por chaves i18n |

---

### Garantias SAFE GOLD

| Restrição | Status |
|-----------|--------|
| Auth inalterado | ✅ Garantido |
| Stripe inalterado | ✅ Garantido |
| Billing inalterado | ✅ Garantido |
| RLS inalterado | ✅ Garantido |
| Edge Functions inalteradas | ✅ Garantido |
| Routing inalterado | ✅ Garantido |
| Regras de negócio inalteradas | ✅ Garantido |

---

### Critérios de Aceite

- ✅ Trocar idioma PT → EN → ES atualiza **todos** os textos da landing imediatamente
- ✅ Nenhuma chave técnica aparece na tela
- ✅ Botão primário usa cor do sistema (sem tenant na landing global)
- ✅ Botão secundário usa `tenant-outline` (responde à cor do sistema)
- ✅ Nenhuma regressão no portal/admin
- ✅ SAFE GOLD 100% preservado

---

### Resultado Esperado

```text
P4.x FINAL HARDENING — LANDING PAGE i18n + VISUAL FIX COMPLETE
├── Landing.tsx: 100% internacionalizado
├── PublicHeader.tsx: Auth links traduzidos
├── Botão secundário: tenant-outline aplicado
├── Nenhuma nova chave i18n necessária
└── SAFE GOLD: 100% preservado
```

