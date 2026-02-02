

# P1.2.A — LANDING PAGE: HERO + COPY INSTITUCIONAL

## ⚠️ MODO DE EXECUÇÃO

- **SAFE GOLD MODE** — Zero Interpretação
- ❌ NÃO tocar em backend / Edge Functions
- ❌ NÃO alterar estrutura do Landing.tsx
- ❌ NÃO criar novas rotas ou componentes
- ✅ APENAS ajustes textuais em arquivos de localização

---

## 📋 ESCOPO FECHADO

| Permitido | Proibido |
|-----------|----------|
| Alterar strings i18n | Landing.tsx estrutura |
| pt-BR, en, es | Novos componentes |
| Copy institucional | CTAs (estrutura) |
| Ajuste de tom | Novas seções |

---

## 📍 ARQUIVOS ALVO

| Arquivo | Alterações |
|---------|------------|
| `src/locales/pt-BR.ts` | Atualizar 10 chaves landing.* |
| `src/locales/en.ts` | Atualizar 10 chaves landing.* |
| `src/locales/es.ts` | Atualizar 10 chaves landing.* |

**Nota:** O arquivo `Landing.tsx` **NÃO será alterado** — toda a copy está nos arquivos de localização.

---

## 1️⃣ HERO — AJUSTES DE COPY

### 1.1 Badge / Eyebrow (`landing.platformBadge`)

| Idioma | Atual | Novo |
|--------|-------|------|
| pt-BR | `Plataforma de Gestão para Esportes de Combate` | `Plataforma oficial de gestão para esportes de combate` |
| en | `Management Platform for Combat Sports` | `Official management platform for combat sports` |
| es | `Plataforma de Gestión para Deportes de Combate` | `Plataforma oficial de gestión para deportes de combate` |

### 1.2 Headline H1 (`landing.heroTitle` + `landing.heroTitleHighlight` + `landing.heroTitleEnd`)

| Idioma | Chave | Atual | Novo |
|--------|-------|-------|------|
| pt-BR | `heroTitle` | `Gerencie sua` | `Gerencie sua` |
| pt-BR | `heroTitleHighlight` | `organização de esporte de combate` | `organização de esporte de combate` |
| pt-BR | `heroTitleEnd` | `com excelência` | `com excelência e credibilidade institucional` |
| en | `heroTitle` | `Manage your` | `Manage your` |
| en | `heroTitleHighlight` | `combat sports organization` | `combat sports organization` |
| en | `heroTitleEnd` | `with excellence` | `with excellence and institutional credibility` |
| es | `heroTitle` | `Gestione su` | `Gestione su` |
| es | `heroTitleHighlight` | `organización de deporte de combate` | `organización de deporte de combate` |
| es | `heroTitleEnd` | `con excelencia` | `con excelencia y credibilidad institucional` |

### 1.3 Subheadline / Descrição (`landing.heroDescription`)

| Idioma | Atual | Novo |
|--------|-------|------|
| pt-BR | `Sistema completo para sua organização de esporte de combate. Filiações, graduações, eventos e pagamentos em uma única plataforma.` | `Governança, certificação e identidade digital para federações, academias e atletas. Sistema completo com rastreabilidade, validação oficial e histórico auditável.` |
| en | `Complete system for your combat sports organization. Memberships, gradings, events and payments in one platform.` | `Governance, certification and digital identity for federations, academies and athletes. Complete system with traceability, official validation and auditable history.` |
| es | `Sistema completo para su organización de deporte de combate. Afiliaciones, graduaciones, eventos y pagos en una sola plataforma.` | `Gobernanza, certificación e identidad digital para federaciones, academias y atletas. Sistema completo con trazabilidad, validación oficial e historial auditable.` |

---

## 2️⃣ SEÇÃO FEATURES — AJUSTES DE TOM

### 2.1 Subtítulo da seção (`landing.featuresDescription`)

| Idioma | Atual | Novo |
|--------|-------|------|
| pt-BR | `Ferramentas completas para gerenciar atletas, academias, graduações e eventos.` | `Infraestrutura completa para a gestão oficial de atletas, academias, graduações e eventos.` |
| en | `Complete tools to manage athletes, academies, gradings and events.` | `Complete infrastructure for official management of athletes, academies, gradings and events.` |
| es | `Herramientas completas para gestionar atletas, academias, graduaciones y eventos.` | `Infraestructura completa para la gestión oficial de atletas, academias, graduaciones y eventos.` |

### 2.2 Cards de Features (descrições)

#### Gestão de Atletas (`landing.featureAthletesDesc`)

| Idioma | Atual | Novo |
|--------|-------|------|
| pt-BR | `Controle completo de filiações, documentos e histórico de graduações.` | `Controle institucional de filiações, vínculo federativo e histórico do atleta.` |
| en | `Complete control of memberships, documents and grading history.` | `Institutional control of memberships, federation bonds and athlete history.` |
| es | `Control completo de afiliaciones, documentos e historial de graduaciones.` | `Control institucional de afiliaciones, vínculo federativo e historial del atleta.` |

#### Graduações & Diplomas (`landing.featureGradingsDesc`)

| Idioma | Atual | Novo |
|--------|-------|------|
| pt-BR | `Emissão digital de diplomas com verificação QR Code integrada.` | `Emissão de diplomas e graduações com verificação digital e validade oficial.` |
| en | `Digital diploma issuance with integrated QR Code verification.` | `Diploma and grading issuance with digital verification and official validity.` |
| es | `Emisión digital de diplomas con verificación QR Code integrada.` | `Emisión de diplomas y graduaciones con verificación digital y validez oficial.` |

#### Multi-esporte (`landing.featureMultiSportDesc`)

| Idioma | Atual | Novo |
|--------|-------|------|
| pt-BR | `Suporte a BJJ, Judô, Wrestling, Muay Thai e outros esportes de combate.` | `Suporte a múltiplas modalidades de esporte de combate em uma única governança.` |
| en | `Support for BJJ, Judo, Wrestling, Muay Thai and other combat sports.` | `Support for multiple combat sports modalities under a single governance.` |
| es | `Soporte para BJJ, Judo, Wrestling, Muay Thai y otros deportes de combate.` | `Soporte para múltiples modalidades de deporte de combate bajo una única gobernanza.` |

#### Pagamentos Integrados (`landing.featurePaymentsDesc`)

| Idioma | Atual | Novo |
|--------|-------|------|
| pt-BR | `Stripe integrado para filiações, eventos e taxas de graduação.` | `Gestão financeira integrada para filiações, eventos e taxas institucionais.` |
| en | `Stripe integrated for memberships, events and grading fees.` | `Integrated financial management for memberships, events and institutional fees.` |
| es | `Stripe integrado para afiliaciones, eventos y tasas de graduación.` | `Gestión financiera integrada para afiliaciones, eventos y tasas institucionales.` |

---

## 3️⃣ SEÇÃO CTA FINAL — AJUSTE DE TÍTULO

### Título (`landing.ctaTitle`)

| Idioma | Atual | Novo |
|--------|-------|------|
| pt-BR | `Pronto para começar?` | `Pronto para estruturar sua organização com credibilidade?` |
| en | `Ready to start?` | `Ready to structure your organization with credibility?` |
| es | `¿Listo para comenzar?` | `¿Listo para estructurar su organización con credibilidad?` |

---

## 4️⃣ CHAVES MANTIDAS SEM ALTERAÇÃO

| Chave | Razão |
|-------|-------|
| `landing.featuresTitle` | "Tudo que você precisa" — mantém conforme especificação |
| `landing.accessPlatform` | CTA preservado |
| `landing.learnMore` | CTA preservado |
| `landing.createFreeAccount` | CTA preservado |
| `landing.ctaFreeSignup` | Bullet preservado |
| `landing.ctaSupport` | Bullet preservado |
| `landing.ctaStripe` | Bullet preservado |
| `landing.copyright` | Footer preservado |

---

## 📦 RESUMO DE ARQUIVOS MODIFICADOS

| Arquivo | Chaves Alteradas |
|---------|------------------|
| `src/locales/pt-BR.ts` | 10 chaves landing.* |
| `src/locales/en.ts` | 10 chaves landing.* |
| `src/locales/es.ts` | 10 chaves landing.* |

**Total: 30 alterações de strings (10 por idioma)**

---

## 🚫 FORA DE ESCOPO (REAFIRMADO)

- ❌ Landing.tsx (estrutura/layout)
- ❌ Carrossel de logos
- ❌ CMS / Admin de banners
- ❌ Eventos
- ❌ FAQs
- ❌ SEO avançado
- ❌ Novas seções
- ❌ Backend / Edge Functions

---

## ✅ CRITÉRIOS DE ACEITE (BINÁRIO)

| Item | Esperado |
|------|----------|
| Hero transmite oficialidade | ✅ |
| Linguagem institucional clara | ✅ |
| Clareza funcional preservada | ✅ |
| Nenhuma quebra visual | ✅ |
| Nenhuma alteração estrutural | ✅ |
| Console sem erros | ✅ |
| Três idiomas atualizados | ✅ |

❌ Se qualquer ponto falhar → P1.2.A REPROVADO

---

## 🏁 RESULTADO ESPERADO

Após P1.2.A, o visitante perceberá o TATAME Pro como:

1. Uma **plataforma oficial**
2. Uma **infraestrutura de governança**
3. Um **registro institucional do esporte**
4. E só depois... um software

