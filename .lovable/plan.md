

# P1.3.A — CAMADA INSTITUCIONAL NO LOGIN

## MODO DE EXECUÇÃO

- **SAFE GOLD MODE** — Zero Interpretação
- ❌ NÃO alterar fluxo de auth
- ❌ NÃO alterar AuthContext / IdentityContext
- ❌ NÃO criar nova rota
- ❌ NÃO criar CMS
- ❌ NÃO tocar em tenants
- ❌ NÃO alterar layout base
- ✅ APENAS substituir copy do painel lateral
- ✅ i18n obrigatório (pt/en/es)

---

## ARQUITETURA IDENTIFICADA

| Aspecto | Estado Atual | Proposto |
|---------|--------------|----------|
| Painel esquerdo | Formulário de login | **INTOCADO** |
| Painel direito (desktop) | Copy genérico ("Gerencie sua federação") | Copy institucional |
| i18n keys | `auth.manageOrganization`, `auth.manageOrganizationDesc` | Substituir por novas chaves `login.institutional.*` |

---

## 1️⃣ LOGIN.TSX — PAINEL INSTITUCIONAL

### Ponto de Alteração

- **Linhas:** 198-212 (painel direito existente)
- **Ação:** Substituir conteúdo interno mantendo estrutura

### Código Atual (linhas 198-212)

```tsx
<div className="hidden lg:flex flex-1 items-center justify-center bg-card border-l border-border relative overflow-hidden">
  <div className="absolute inset-0 bg-gradient-glow opacity-30" />
  <motion.div
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ duration: 0.5, delay: 0.2 }}
    className="relative z-10 text-center p-8"
  >
    <div className="w-24 h-24 rounded-2xl mx-auto flex items-center justify-center mb-8 glow-primary overflow-hidden">
      <img src={iconLogo} alt="TATAME" className="max-h-full max-w-full rounded-2xl object-contain" />
    </div>
    <h2 className="font-display text-3xl font-bold mb-4">{t("auth.manageOrganization")}</h2>
    <p className="text-muted-foreground max-w-sm">{t("auth.manageOrganizationDesc")}</p>
  </motion.div>
</div>
```

### Código Proposto

```tsx
<div className="hidden lg:flex flex-1 items-center justify-center bg-card border-l border-border relative overflow-hidden">
  <div className="absolute inset-0 bg-gradient-glow opacity-30" />
  <motion.div
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ duration: 0.5, delay: 0.2 }}
    className="relative z-10 text-center p-8 max-w-md"
  >
    <div className="w-24 h-24 rounded-2xl mx-auto flex items-center justify-center mb-8 glow-primary overflow-hidden">
      <img src={iconLogo} alt="TATAME" className="max-h-full max-w-full rounded-2xl object-contain" />
    </div>
    <h2 className="font-display text-2xl md:text-3xl font-bold mb-4">
      {t("login.institutional.title")}
    </h2>
    <p className="text-muted-foreground leading-relaxed mb-6">
      {t("login.institutional.description")}
    </p>
    <div className="flex flex-col gap-3 text-sm text-muted-foreground">
      <div className="flex items-center justify-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
        <span>{t("login.institutional.point1")}</span>
      </div>
      <div className="flex items-center justify-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
        <span>{t("login.institutional.point2")}</span>
      </div>
      <div className="flex items-center justify-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
        <span>{t("login.institutional.point3")}</span>
      </div>
    </div>
  </motion.div>
</div>
```

**Mudanças:**
- `max-w-md` adicionado para melhor leitura
- Título e descrição institucionais
- 3 bullet points de reforço (governança, rastreabilidade, neutralidade)

---

## 2️⃣ i18n — CHAVES pt-BR.ts

### Ponto de Inserção

- **Após:** `'auth.manageOrganizationDesc': '...',` (linha ~540)

### Chaves a Adicionar

```typescript
  // Login institutional block
  'login.institutional.title': 'Infraestrutura institucional para esportes de combate',
  'login.institutional.description': 'O Tatame organiza, registra e preserva a história esportiva de federações, academias e atletas em um ambiente verificável e confiável.',
  'login.institutional.point1': 'Governança e organização institucional',
  'login.institutional.point2': 'Rastreabilidade e histórico verificável',
  'login.institutional.point3': 'Neutralidade e colaboração no ecossistema',
```

---

## 3️⃣ i18n — CHAVES en.ts

### Chaves a Adicionar

```typescript
  // Login institutional block
  'login.institutional.title': 'Institutional infrastructure for combat sports',
  'login.institutional.description': 'Tatame organizes, registers and preserves the sports history of federations, academies and athletes in a verifiable and reliable environment.',
  'login.institutional.point1': 'Governance and institutional organization',
  'login.institutional.point2': 'Traceability and verifiable history',
  'login.institutional.point3': 'Neutrality and ecosystem collaboration',
```

---

## 4️⃣ i18n — CHAVES es.ts

### Chaves a Adicionar

```typescript
  // Login institutional block
  'login.institutional.title': 'Infraestructura institucional para deportes de combate',
  'login.institutional.description': 'Tatame organiza, registra y preserva la historia deportiva de federaciones, academias y atletas en un entorno verificable y confiable.',
  'login.institutional.point1': 'Gobernanza y organización institucional',
  'login.institutional.point2': 'Trazabilidad e historial verificable',
  'login.institutional.point3': 'Neutralidad y colaboración en el ecosistema',
```

---

## 📦 RESUMO DE ALTERAÇÕES

| Arquivo | Ação | Impacto |
|---------|------|---------|
| `src/pages/Login.tsx` | EDITAR | Linhas 198-212: substituir conteúdo do painel direito |
| `src/locales/pt-BR.ts` | EDITAR | +5 chaves (`login.institutional.*`) |
| `src/locales/en.ts` | EDITAR | +5 chaves (`login.institutional.*`) |
| `src/locales/es.ts` | EDITAR | +5 chaves (`login.institutional.*`) |

**Total de linhas alteradas:** ~30 linhas

---

## 🚫 FORA DE ESCOPO (CONFIRMADO)

- ❌ Fluxo de auth
- ❌ AuthContext / IdentityContext
- ❌ Nova rota
- ❌ CMS
- ❌ Tenants
- ❌ Alterar formulário de login
- ❌ Alterar validações

---

## ✅ CRITÉRIOS DE ACEITE (BINÁRIO)

| Item | Esperado |
|------|----------|
| Login continua funcionando exatamente igual | ✅ |
| Nenhuma mudança em auth/identity | ✅ |
| Bloco institucional aparece no painel direito | ✅ |
| i18n completo pt/en/es | ✅ |
| UX limpa, sem poluição visual | ✅ |
| Reforço institucional claro | ✅ |
| Responsivo (painel oculto em mobile) | ✅ |

---

## 🏁 RESULTADO ESPERADO

Após P1.3.A:

- ✅ Continuidade narrativa da Landing → About → Login
- ✅ Visitante entende que está entrando em infraestrutura institucional
- ✅ Não há quebra de contexto entre páginas públicas e login
- ✅ Zero impacto em funcionalidade de auth
- ✅ Maturidade institucional completa no funil de entrada

