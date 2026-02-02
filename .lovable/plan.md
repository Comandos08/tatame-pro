

# P1.2.C.B.2 — PÁGINA INSTITUCIONAL (/about)

## MODO DE EXECUÇÃO

- **SAFE GOLD MODE** — Zero Interpretação
- ❌ NÃO criar CMS
- ❌ NÃO tocar em backend / Edge Functions
- ❌ NÃO impactar tenants
- ❌ NÃO alterar fluxos de auth
- ❌ NÃO alterar Landing existente
- ✅ Criar apenas uma página institucional estática
- ✅ Conteúdo 100% institucional
- ✅ i18n obrigatório (pt-BR / en / es)

---

## ARQUITETURA IDENTIFICADA

| Aspecto | Estado Atual | Proposto |
|---------|--------------|----------|
| App.tsx | Rotas públicas em linhas 50-56 | Adicionar `/about` após linha 53 |
| IdentityGate | `isPublicPath()` em linha 78-103 | Rota `/about` já será pública (padrão root) |
| i18n keys | `landing.*`, `landing.faq.*` | Adicionar `about.*` (13 chaves) |
| Padrões visuais | `motion`, `fadeInUp`, `stagger` | Reutilizar de Landing.tsx |

---

## 1️⃣ APP.TSX — NOVA ROTA PÚBLICA

### Ponto de Inserção

- **Após:** linha 53 (`<Route path="/help" element={<Help />} />`)
- **Antes:** linha 54 (`<Route path="/forgot-password"...`)

### Código

```typescript
// Import no topo (após Help)
import About from "@/pages/About";

// Na seção {/* Public */}
<Route path="/about" element={<About />} />
```

### Validação IdentityGate

A função `isPublicPath()` (linha 78-89) já faz bypass para rotas raiz listadas no Set:
```typescript
const rootPublic = new Set([
  "/",
  "/login",
  "/forgot-password",
  ...
]);
```

A rota `/about` precisa ser adicionada ao Set `rootPublic` para garantir bypass.

---

## 2️⃣ IDENTITYGATE — BYPASS PARA /about

### Ponto de Alteração

- **Arquivo:** `src/components/identity/IdentityGate.tsx`
- **Linha:** 79-88 (Set `rootPublic`)

### Código Atualizado

```typescript
const rootPublic = new Set([
  "/",
  "/about",  // ← NOVA ROTA
  "/login",
  "/forgot-password",
  "/reset-password",
  "/help",
  "/auth/callback",
  "/identity/wizard",
  "/identity/error",
]);
```

---

## 3️⃣ NOVA PÁGINA — src/pages/About.tsx

### Estrutura

```text
PublicHeader
↓
Hero Institucional
↓
Seção 1: O que é o Tatame
↓
Seção 2: O que o Tatame não é
↓
Seção 3: Para quem existe
↓
Seção 4: Governança & Credibilidade
↓
Seção 5: Neutralidade e Ecossistema
↓
CTA final (link para /login)
↓
Footer (reutilizado de Landing)
```

### Código Completo

```tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PublicHeader from '@/components/PublicHeader';
import iconLogo from '@/assets/iconLogo.png';
import { useI18n } from '@/contexts/I18nContext';

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 },
};

const stagger = {
  animate: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

export default function About() {
  const { t } = useI18n();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <PublicHeader />

      {/* Hero Section */}
      <section className="py-24 lg:py-32 border-b border-border">
        <div className="container mx-auto px-4">
          <motion.div
            initial="initial"
            animate="animate"
            variants={stagger}
            className="max-w-4xl mx-auto text-center"
          >
            <motion.h1
              variants={fadeInUp}
              className="font-display text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6"
            >
              {t('about.heroTitle')}
            </motion.h1>
            <motion.p
              variants={fadeInUp}
              className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto"
            >
              {t('about.heroSubtitle')}
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* Content Sections */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4">
          <motion.div
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
            variants={stagger}
            className="max-w-3xl mx-auto space-y-16"
          >
            {/* Section 1 */}
            <motion.div variants={fadeInUp}>
              <h2 className="font-display text-2xl md:text-3xl font-bold mb-4">
                {t('about.section1.title')}
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                {t('about.section1.text')}
              </p>
            </motion.div>

            {/* Section 2 */}
            <motion.div variants={fadeInUp}>
              <h2 className="font-display text-2xl md:text-3xl font-bold mb-4">
                {t('about.section2.title')}
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                {t('about.section2.text')}
              </p>
            </motion.div>

            {/* Section 3 */}
            <motion.div variants={fadeInUp}>
              <h2 className="font-display text-2xl md:text-3xl font-bold mb-4">
                {t('about.section3.title')}
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                {t('about.section3.text')}
              </p>
            </motion.div>

            {/* Section 4 */}
            <motion.div variants={fadeInUp}>
              <h2 className="font-display text-2xl md:text-3xl font-bold mb-4">
                {t('about.section4.title')}
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                {t('about.section4.text')}
              </p>
            </motion.div>

            {/* Section 5 */}
            <motion.div variants={fadeInUp}>
              <h2 className="font-display text-2xl md:text-3xl font-bold mb-4">
                {t('about.section5.title')}
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                {t('about.section5.text')}
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 lg:py-24 border-t border-border">
        <div className="container mx-auto px-4">
          <motion.div
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
            variants={fadeInUp}
            className="text-center"
          >
            <Button size="lg" className="text-lg h-12 px-8" asChild>
              <Link to="/login">
                {t('about.cta')}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <img src={iconLogo} alt="TATAME" className="h-8 w-8 rounded-lg object-contain" />
              <span className="font-display font-bold">TATAME</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('landing.copyright').replace('{year}', new Date().getFullYear().toString())}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
```

---

## 4️⃣ i18n — CHAVES pt-BR.ts

### Ponto de Inserção

- **Após:** `'landing.faq.a6': '...',` (linha 605)
- **Antes:** `// Admin Landing Settings` (linha 607)

### Chaves a Adicionar

```typescript
  // About Page
  'about.heroTitle': 'Infraestrutura institucional para esportes de combate',
  'about.heroSubtitle': 'Governança, rastreabilidade e organização para o ecossistema esportivo',
  'about.section1.title': 'O que é o Tatame',
  'about.section1.text': 'O Tatame é uma infraestrutura digital criada para organizar, registrar e dar governança ao ecossistema dos esportes de combate. Ele conecta federações, academias e atletas em um ambiente institucional confiável.',
  'about.section2.title': 'O que o Tatame não é',
  'about.section2.text': 'O Tatame não é uma federação, não substitui entidades existentes e não compete com organizações esportivas. Ele atua como uma camada de suporte institucional e tecnológico.',
  'about.section3.title': 'Para quem o Tatame existe',
  'about.section3.text': 'O Tatame existe para federações, ligas, academias, professores e atletas que precisam de organização, certificação, identidade digital e histórico verificável.',
  'about.section4.title': 'Governança e credibilidade',
  'about.section4.text': 'Os registros no Tatame são estruturados, rastreáveis e verificáveis publicamente, garantindo autenticidade, transparência e preservação histórica.',
  'about.section5.title': 'Neutralidade e ecossistema',
  'about.section5.text': 'O Tatame foi concebido como uma infraestrutura neutra, respeitando a autonomia das organizações e promovendo colaboração institucional.',
  'about.cta': 'Acessar a plataforma',
```

---

## 5️⃣ i18n — CHAVES en.ts

### Ponto de Inserção

- **Após:** `'landing.faq.a6': '...',` (linha 607)
- **Antes:** `// Admin Landing Settings` (linha 609)

### Chaves a Adicionar

```typescript
  // About Page
  'about.heroTitle': 'Institutional infrastructure for combat sports',
  'about.heroSubtitle': 'Governance, traceability and organization for the sports ecosystem',
  'about.section1.title': 'What is Tatame',
  'about.section1.text': 'Tatame is a digital infrastructure designed to organize, register and provide governance for the combat sports ecosystem. It connects federations, academies and athletes in a reliable institutional environment.',
  'about.section2.title': 'What Tatame is not',
  'about.section2.text': 'Tatame is not a federation, does not replace existing entities and does not compete with sports organizations. It acts as an institutional and technological support layer.',
  'about.section3.title': 'Who Tatame is for',
  'about.section3.text': 'Tatame exists for federations, leagues, academies, instructors and athletes who need organization, certification, digital identity and verifiable history.',
  'about.section4.title': 'Governance and credibility',
  'about.section4.text': 'Records in Tatame are structured, traceable and publicly verifiable, ensuring authenticity, transparency and historical preservation.',
  'about.section5.title': 'Neutrality and ecosystem',
  'about.section5.text': 'Tatame was designed as a neutral infrastructure, respecting organizational autonomy and promoting institutional collaboration.',
  'about.cta': 'Access the platform',
```

---

## 6️⃣ i18n — CHAVES es.ts

### Ponto de Inserção

- **Após:** `'landing.faq.a6': '...',` (linha 607)
- **Antes:** `// Admin Landing Settings` (linha 609)

### Chaves a Adicionar

```typescript
  // About Page
  'about.heroTitle': 'Infraestructura institucional para deportes de combate',
  'about.heroSubtitle': 'Gobernanza, trazabilidad y organización para el ecosistema deportivo',
  'about.section1.title': '¿Qué es Tatame?',
  'about.section1.text': 'Tatame es una infraestructura digital creada para organizar, registrar y dar gobernanza al ecosistema de los deportes de combate. Conecta federaciones, academias y atletas en un entorno institucional confiable.',
  'about.section2.title': '¿Qué no es Tatame?',
  'about.section2.text': 'Tatame no es una federación, no sustituye entidades existentes ni compite con organizaciones deportivas. Actúa como una capa de soporte institucional y tecnológico.',
  'about.section3.title': '¿Para quién existe Tatame?',
  'about.section3.text': 'Tatame existe para federaciones, ligas, academias, instructores y atletas que necesitan organización, certificación, identidad digital e historial verificable.',
  'about.section4.title': 'Gobernanza y credibilidad',
  'about.section4.text': 'Los registros en Tatame son estructurados, trazables y verificables públicamente, garantizando autenticidad, transparencia y preservación histórica.',
  'about.section5.title': 'Neutralidad y ecosistema',
  'about.section5.text': 'Tatame fue concebido como una infraestructura neutral, respetando la autonomía de las organizaciones y promoviendo la colaboración institucional.',
  'about.cta': 'Acceder a la plataforma',
```

---

## 📦 RESUMO DE ALTERAÇÕES

| Arquivo | Ação | Impacto |
|---------|------|---------|
| `src/App.tsx` | EDITAR | +1 import, +1 rota |
| `src/components/identity/IdentityGate.tsx` | EDITAR | +1 entrada no Set `rootPublic` |
| `src/pages/About.tsx` | CRIAR | Nova página (~160 linhas) |
| `src/locales/pt-BR.ts` | EDITAR | +13 chaves |
| `src/locales/en.ts` | EDITAR | +13 chaves |
| `src/locales/es.ts` | EDITAR | +13 chaves |

**Total de linhas alteradas:** ~200 linhas

---

## 🚫 FORA DE ESCOPO (CONFIRMADO)

- ❌ CMS
- ❌ SEO avançado
- ❌ Conteúdo por tenant
- ❌ FAQs adicionais
- ❌ Eventos
- ❌ Permissões
- ❌ Editor visual
- ❌ Backend

---

## ✅ CRITÉRIOS DE ACEITE (BINÁRIO)

| Item | Esperado |
|------|----------|
| Página pública acessível | ✅ |
| Bypass pelo IdentityGate | ✅ |
| Linguagem institucional | ✅ |
| Não compete com federações | ✅ |
| Clareza de papel | ✅ |
| i18n completo | ✅ |
| Zero impacto sistêmico | ✅ |
| Código simples | ✅ |

---

## 🏁 RESULTADO ESPERADO

Após P1.2.C.B.2, o Tatame:

- ✅ Tem página institucional dedicada
- ✅ Deixa explícito quem é
- ✅ Elimina ruído institucional
- ✅ Ganha maturidade de plataforma de governança
- ✅ Fica pronto para parcerias sérias

