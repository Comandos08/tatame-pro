
# P1.2.C.B.1 — LANDING PAGE: FAQs INSTITUCIONAIS

## MODO DE EXECUÇÃO

- **SAFE GOLD MODE** — Zero Interpretação
- ❌ NÃO criar CMS
- ❌ NÃO criar novas páginas
- ❌ NÃO tocar em backend / Edge Functions
- ❌ NÃO impactar tenants
- ❌ NÃO alterar lógica existente
- ✅ APENAS Landing Page
- ✅ APENAS conteúdo institucional
- ✅ APENAS texto + layout simples

---

## ARQUITETURA IDENTIFICADA

| Aspecto | Estado Atual | Proposto |
|---------|--------------|----------|
| Landing.tsx | Hero → Features → Partners → CTA → Footer | Hero → Features → Partners → **FAQ** → CTA → Footer |
| i18n keys | `landing.*` (25 chaves existentes) | Adicionar +14 chaves |
| Dependências | Nenhuma nova | Nenhuma nova |

---

## 1️⃣ LANDING.TSX — INSERÇÃO DA SEÇÃO FAQ

### Ponto de Inserção

- **Após:** Partners Section (linha 242 - fechamento `)}`)
- **Antes:** CTA Section (linha 244 - `{/* CTA Section */}`)

### Código a Inserir (linha 243)

```text
      {/* Institutional FAQ Section */}
      <section className="py-16 lg:py-24 border-t border-border">
        <div className="container mx-auto px-4">
          <motion.div
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
            variants={stagger}
            className="max-w-4xl mx-auto"
          >
            <motion.div variants={fadeInUp} className="text-center mb-12">
              <h2 className="font-display text-2xl md:text-3xl font-bold mb-3">
                {t('landing.faqTitle')}
              </h2>
              <p className="text-muted-foreground">
                {t('landing.faqSubtitle')}
              </p>
            </motion.div>

            <motion.div variants={fadeInUp} className="space-y-8">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="border-b border-border pb-6 last:border-0">
                  <h3 className="font-medium text-lg mb-2">
                    {t(`landing.faq.q${i}` as TranslationKey)}
                  </h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {t(`landing.faq.a${i}` as TranslationKey)}
                  </p>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>
```

---

## 2️⃣ i18n — CHAVES pt-BR.ts

### Ponto de Inserção

- **Após:** `'landing.partnersTitle': 'Organizações que confiam',` (linha 589)
- **Antes:** `// Admin Landing Settings` (linha 591)

### Chaves a Adicionar

```typescript
  // Landing FAQ
  'landing.faqTitle': 'FAQ Institucional',
  'landing.faqSubtitle': 'Entenda o papel do Tatame no ecossistema dos esportes de combate',
  'landing.faq.q1': 'O que é o Tatame?',
  'landing.faq.a1': 'O Tatame é uma infraestrutura digital criada para organizar, registrar e dar governança ao ecossistema dos esportes de combate. Ele conecta federações, academias e atletas em um ambiente institucional, rastreável e confiável.',
  'landing.faq.q2': 'O Tatame é uma federação?',
  'landing.faq.a2': 'Não. O Tatame não substitui federações nem compete com elas. Ele atua como uma plataforma de suporte institucional, oferecendo tecnologia, registro e organização para fortalecer o ecossistema existente.',
  'landing.faq.q3': 'Para quem o Tatame foi criado?',
  'landing.faq.a3': 'O Tatame foi criado para federações, ligas, academias, professores e atletas que precisam de organização, certificação, identidade digital e governança institucional.',
  'landing.faq.q4': 'O Tatame é focado apenas em competição?',
  'landing.faq.a4': 'Não. O Tatame atende tanto ambientes competitivos quanto educacionais, formativos e institucionais, respeitando diferentes modelos de prática esportiva.',
  'landing.faq.q5': 'Como o Tatame garante credibilidade?',
  'landing.faq.a5': 'Os registros são estruturados, com histórico verificável, identidade digital e mecanismos de validação pública que garantem autenticidade e rastreabilidade.',
  'landing.faq.q6': 'O Tatame é um sistema fechado?',
  'landing.faq.a6': 'Não. O Tatame foi concebido como uma infraestrutura aberta à integração e colaboração institucional, respeitando a autonomia das organizações.',
```

---

## 3️⃣ i18n — CHAVES en.ts

### Ponto de Inserção

- **Após:** `'landing.partnersTitle'`
- **Antes:** `// Admin Landing Settings`

### Chaves a Adicionar

```typescript
  // Landing FAQ
  'landing.faqTitle': 'Institutional FAQ',
  'landing.faqSubtitle': 'Understand Tatame\'s role in the combat sports ecosystem',
  'landing.faq.q1': 'What is Tatame?',
  'landing.faq.a1': 'Tatame is a digital infrastructure designed to organize, register and provide governance for the combat sports ecosystem. It connects federations, academies and athletes in an institutional, traceable and reliable environment.',
  'landing.faq.q2': 'Is Tatame a federation?',
  'landing.faq.a2': 'No. Tatame does not replace federations nor compete with them. It acts as an institutional support platform, providing technology, registration and organization to strengthen the existing ecosystem.',
  'landing.faq.q3': 'Who was Tatame created for?',
  'landing.faq.a3': 'Tatame was created for federations, leagues, academies, instructors and athletes who need organization, certification, digital identity and institutional governance.',
  'landing.faq.q4': 'Is Tatame focused only on competition?',
  'landing.faq.a4': 'No. Tatame supports competitive, educational, formative and institutional environments, respecting different models of sports practice.',
  'landing.faq.q5': 'How does Tatame ensure credibility?',
  'landing.faq.a5': 'Records are structured with verifiable history, digital identity and public validation mechanisms that ensure authenticity and traceability.',
  'landing.faq.q6': 'Is Tatame a closed system?',
  'landing.faq.a6': 'No. Tatame was designed as an infrastructure open to institutional integration and collaboration, respecting the autonomy of organizations.',
```

---

## 4️⃣ i18n — CHAVES es.ts

### Ponto de Inserção

- **Após:** `'landing.partnersTitle'`
- **Antes:** `// Admin Landing Settings`

### Chaves a Adicionar

```typescript
  // Landing FAQ
  'landing.faqTitle': 'Preguntas Institucionales',
  'landing.faqSubtitle': 'Comprenda el papel de Tatame en el ecosistema de los deportes de combate',
  'landing.faq.q1': '¿Qué es Tatame?',
  'landing.faq.a1': 'Tatame es una infraestructura digital creada para organizar, registrar y dar gobernanza al ecosistema de los deportes de combate. Conecta federaciones, academias y atletas en un entorno institucional, trazable y confiable.',
  'landing.faq.q2': '¿Tatame es una federación?',
  'landing.faq.a2': 'No. Tatame no sustituye a las federaciones ni compite con ellas. Actúa como una plataforma de apoyo institucional, ofreciendo tecnología, registro y organización para fortalecer el ecosistema existente.',
  'landing.faq.q3': '¿Para quién fue creado Tatame?',
  'landing.faq.a3': 'Tatame fue creado para federaciones, ligas, academias, instructores y atletas que necesitan organización, certificación, identidad digital y gobernanza institucional.',
  'landing.faq.q4': '¿Tatame está enfocado solo en la competición?',
  'landing.faq.a4': 'No. Tatame atiende entornos competitivos, educativos, formativos e institucionales, respetando diferentes modelos de práctica deportiva.',
  'landing.faq.q5': '¿Cómo garantiza Tatame la credibilidad?',
  'landing.faq.a5': 'Los registros están estructurados con historial verificable, identidad digital y mecanismos de validación pública que garantizan autenticidad y trazabilidad.',
  'landing.faq.q6': '¿Tatame es un sistema cerrado?',
  'landing.faq.a6': 'No. Tatame fue concebido como una infraestructura abierta a la integración y colaboración institucional, respetando la autonomía de las organizaciones.',
```

---

## 📦 RESUMO DE ALTERAÇÕES

| Arquivo | Ação | Impacto |
|---------|------|---------|
| `src/pages/Landing.tsx` | INSERIR | Nova seção FAQ (~30 linhas) |
| `src/locales/pt-BR.ts` | ADICIONAR | +14 chaves |
| `src/locales/en.ts` | ADICIONAR | +14 chaves |
| `src/locales/es.ts` | ADICIONAR | +14 chaves |

**Total de linhas alteradas:** ~72 linhas

---

## 🚫 FORA DE ESCOPO (CONFIRMADO)

- ❌ Página /about
- ❌ Help Center
- ❌ CMS
- ❌ SEO
- ❌ Backend
- ❌ Eventos
- ❌ Permissões
- ❌ Lógica condicional
- ❌ Admin

---

## ✅ CRITÉRIOS DE ACEITE (BINÁRIO)

| Item | Esperado |
|------|----------|
| Linguagem institucional clara | ✅ |
| Elimina objeções comuns | ✅ |
| Não parece marketing | ✅ |
| Não cria dependências | ✅ |
| Zero impacto sistêmico | ✅ |
| Funciona sem auth | ✅ |
| i18n completo (pt/en/es) | ✅ |

❌ Qualquer desvio → P1.2.C.B.1 REPROVADO

---

## 🏁 RESULTADO ESPERADO

Após este PI, o visitante entende que:

- ✅ O Tatame não é só um software
- ✅ O Tatame não compete com federações
- ✅ O Tatame é infraestrutura
- ✅ O Tatame organiza o ecossistema
- ✅ O Tatame é confiável
