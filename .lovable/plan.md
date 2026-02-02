

# P1.2.C.C — FECHAMENTO INSTITUCIONAL GLOBAL

## MODO DE EXECUÇÃO

- **SAFE GOLD MODE** — Zero Interpretação
- ❌ NÃO criar novas rotas
- ❌ NÃO tocar em backend / Edge Functions
- ❌ NÃO alterar textos existentes
- ❌ NÃO alterar layout base
- ✅ APENAS links de navegação
- ✅ APENAS modificar destinos
- ✅ i18n obrigatório

---

## ARQUITETURA IDENTIFICADA

| Local | Estado Atual | Proposto |
|-------|--------------|----------|
| Hero CTA secundário | `/help` | `/about` |
| PublicHeader (no tenant) | Sem link institucional | Adicionar "Sobre" → `/about` |
| Landing Footer | Logo + copyright | Adicionar link "Sobre" |
| About Footer | Logo + copyright | Adicionar link "Sobre" |
| i18n | Sem `nav.about` | Adicionar chave |

---

## 1️⃣ LANDING.TSX — HERO CTA SECUNDÁRIO

### Ponto de Alteração

- **Linha:** 147
- **Atual:** `<Link to="/help">{t('landing.learnMore')}</Link>`
- **Novo:** `<Link to="/about">{t('landing.learnMore')}</Link>`

### Código

```tsx
<Button size="lg" variant="tenant-outline" className="text-lg h-12 px-8" asChild>
  <Link to="/about">{t('landing.learnMore')}</Link>
</Button>
```

**Observação:** O texto permanece `landing.learnMore` (já existente) — apenas o destino muda.

---

## 2️⃣ PUBLICHEADER.TSX — LINK "SOBRE"

### Ponto de Inserção

- **Após:** Theme Selector (linha 110)
- **Antes:** Auth Links (linha 112)

### Código a Inserir

```tsx
{/* Institutional Link */}
<Link 
  to="/about" 
  className="hidden md:block text-muted-foreground hover:text-foreground transition-colors"
>
  {t('nav.about')}
</Link>
```

### Posição Final na UI

```text
[Logo] .................. [Globe] [Theme] [Sobre] [Login] [Acessar Plataforma]
```

---

## 3️⃣ LANDING.TSX — FOOTER

### Ponto de Alteração

- **Linha:** 320-328 (dentro do footer flex container)

### Código Atualizado

```tsx
<footer className="py-8 border-t border-border">
  <div className="container mx-auto px-4">
    <div className="flex flex-col md:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <img src={iconLogo} alt="TATAME" className="h-8 w-8 rounded-lg object-contain" />
          <span className="font-display font-bold">TATAME</span>
        </div>
        <Link 
          to="/about" 
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {t('nav.about')}
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        {t('landing.copyright').replace('{year}', new Date().getFullYear().toString())}
      </p>
    </div>
  </div>
</footer>
```

---

## 4️⃣ ABOUT.TSX — FOOTER

### Ponto de Alteração

- **Linha:** 140-152 (footer section)

### Código Atualizado

```tsx
<footer className="py-8 border-t border-border">
  <div className="container mx-auto px-4">
    <div className="flex flex-col md:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <img src={iconLogo} alt="TATAME" className="h-8 w-8 rounded-lg object-contain" />
          <span className="font-display font-bold">TATAME</span>
        </div>
        <Link 
          to="/about" 
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {t('nav.about')}
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        {t('landing.copyright').replace('{year}', new Date().getFullYear().toString())}
      </p>
    </div>
  </div>
</footer>
```

---

## 5️⃣ i18n — NOVA CHAVE

### Arquivos

- `src/locales/pt-BR.ts`
- `src/locales/en.ts`
- `src/locales/es.ts`

### Ponto de Inserção

- **Após:** `'nav.rankings': 'Rankings',` (linha 19)
- **Antes:** `// Common` (linha 21)

### Chaves a Adicionar

**pt-BR.ts:**
```typescript
'nav.about': 'Sobre',
```

**en.ts:**
```typescript
'nav.about': 'About',
```

**es.ts:**
```typescript
'nav.about': 'Acerca de',
```

---

## 📦 RESUMO DE ALTERAÇÕES

| Arquivo | Ação | Impacto |
|---------|------|---------|
| `src/pages/Landing.tsx` | EDITAR | Linha 147: `/help` → `/about` |
| `src/pages/Landing.tsx` | EDITAR | Footer: adicionar link "Sobre" |
| `src/components/PublicHeader.tsx` | EDITAR | Adicionar link "Sobre" |
| `src/pages/About.tsx` | EDITAR | Footer: adicionar link "Sobre" |
| `src/locales/pt-BR.ts` | EDITAR | +1 chave (`nav.about`) |
| `src/locales/en.ts` | EDITAR | +1 chave (`nav.about`) |
| `src/locales/es.ts` | EDITAR | +1 chave (`nav.about`) |

**Total de linhas alteradas:** ~25 linhas

---

## 🚫 FORA DE ESCOPO (CONFIRMADO)

- ❌ CMS
- ❌ SEO
- ❌ Analytics
- ❌ Novas páginas
- ❌ Alterar copy existente
- ❌ Alterar layout base
- ❌ Eventos
- ❌ Admin
- ❌ Permissões

---

## ✅ VALIDAÇÕES OBRIGATÓRIAS

Após execução, garantir:

| Validação | Esperado |
|-----------|----------|
| `/about` acessível sem login | ✅ (já implementado em P1.2.C.B.2) |
| Hero → "Saiba mais" leva para `/about` | ✅ |
| Header → "Sobre" leva para `/about` | ✅ |
| Footer (Landing) → "Sobre" leva para `/about` | ✅ |
| Footer (About) → "Sobre" leva para `/about` | ✅ |
| `/about` → CTA final leva para `/login` | ✅ (já implementado) |
| Zero impacto em IdentityGate | ✅ |
| Zero warning ou erro de rota | ✅ |

---

## 🏁 RESULTADO ESPERADO

Após P1.2.C.C:

- ✅ Navegação institucional completa
- ✅ 3 pontos de entrada para `/about` (Hero, Header, Footer)
- ✅ Qualquer visitante entende quem somos antes de entrar
- ✅ Landing deixa de ser "porta cega"
- ✅ Plataforma com maturidade institucional

