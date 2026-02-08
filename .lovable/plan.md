

# PI-D5-ABOUT1.2 — Revisao Visual Institucional + Micro-Interacoes Sutis

**Status:** PLAN (Aguardando aprovacao)
**Escopo:** Ajustes visuais e micro-interacoes institucionais
**Impacto funcional:** Nenhum
**Arquivos afetados:** 1 (src/pages/About.tsx)
**Risco de regressao:** Muito baixo

---

## 1. Diagnostico do Estado Atual

### 1.1 Estrutura Visual Existente

```text
+--------------------------------------------+
| HERO (py-24/32, border-b)                  |
| max-w-4xl, text-center                     |
| h1: 4xl-6xl, bold                          |
| p: lg-xl, muted-foreground                 |
+--------------------------------------------+
| CONTENT (py-16/24)                         |
| max-w-3xl, space-y-16                      |
| 5 blocos identicos:                        |
|   h2: 2xl-3xl, bold, mb-4                  |
|   p: muted-foreground, leading-relaxed    |
+--------------------------------------------+
| CTA (py-16/24, border-t)                   |
| Button: lg, primary, ArrowRight            |
+--------------------------------------------+
| FOOTER (py-8, border-t)                    |
+--------------------------------------------+
```

### 1.2 Problemas Identificados

| Elemento | Problema | Impacto |
|----------|----------|---------|
| `space-y-16` uniforme | Ritmo monotono, parece lista de features | Medio |
| `fadeInUp` com `y: 20` | Movimento muito "startup" | Baixo |
| `stagger: 0.1s` | Efeito cascata comercial | Baixo |
| Button `variant="default"` | CTA chamativo demais | Medio |
| `ArrowRight` no CTA | Linguagem de conversao | Medio |
| `max-w-3xl` para texto | Linhas muito longas (65-80 caracteres ideais) | Baixo |
| Ecosistema `border-l-2 border-primary/20` | Cor primaria cria associacao comercial | Baixo |

### 1.3 Animacoes Atuais

```typescript
const fadeInUp = {
  initial: { opacity: 0, y: 20 },  // y: 20 e muito
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 },   // 0.5s e apropriado
};

const stagger = {
  animate: {
    transition: {
      staggerChildren: 0.1,  // stagger comercial
    },
  },
};
```

---

## 2. Alteracoes Propostas

### 2.1 Animacoes — Institucionalizar

**Antes:**
```typescript
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
```

**Depois:**
```typescript
// Animacao institucional sutil
const fadeIn = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: "easeOut" },
};

// Sem stagger - todos os blocos animam uniformemente
// Remover stagger do container principal
```

**Justificativa:**
- `y: 8` em vez de `y: 20` — movimento minimo, quase imperceptivel
- `ease: "easeOut"` explicito — sem spring, sem bounce
- Remover `stagger` — evita efeito cascata de marketing

---

### 2.2 Hierarquia Tipografica — Reduzir Peso

**Hero (h1):**
- Manter tamanho (`text-4xl md:text-5xl lg:text-6xl`)
- Reduzir peso: `font-bold` → `font-semibold`
- Adicionar `tracking-tight` (ja existe)

**Section Titles (h2):**
- Reduzir tamanho: `text-2xl md:text-3xl` → `text-xl md:text-2xl`
- Manter `font-bold`
- Adicionar `text-foreground/90` para levemente suavizar

**Subtitulo Hero:**
- Adicionar `font-light` para contraste com titulo

---

### 2.3 Espacamento e Ritmo — Variacao Institucional

**Problema atual:** `space-y-16` cria ritmo identico entre todos os blocos.

**Solucao:** Variar espacamento por bloco semantico

```text
HERO
  |
  v (gap maior - py-20)
ROLE (bloco introdutorio)
  |
  v (gap padrao - mt-12)
LIMITS (complemento do role)
  |
  v (gap maior - mt-16 + separator visual)
ECOSYSTEM (bloco estrutural - destaque)
  |
  v (gap maior - mt-16 + separator visual)
GOVERNANCE (principios)
  |
  v (gap padrao - mt-12)
NEUTRALITY (fechamento)
  |
  v
CTA
```

**Implementacao:** Remover `space-y-16` do container e aplicar margins individuais.

---

### 2.4 Largura de Texto — Editorial

**Antes:**
```jsx
className="max-w-3xl mx-auto"  // ~65ch no desktop
```

**Depois:**
```jsx
className="max-w-2xl mx-auto"  // ~55ch - mais editorial
```

**Justificativa:** Textos institucionais sao mais legiveis com linhas mais curtas. 55-60 caracteres e o padrao editorial.

---

### 2.5 Bloco Ecossistema — Refino Visual

**Antes:**
```jsx
<div className="space-y-4 pl-4 border-l-2 border-primary/20">
```

**Depois:**
```jsx
<div className="space-y-3 pl-5 border-l border-border">
```

**Mudancas:**
- `border-l-2` → `border-l` (mais sutil)
- `border-primary/20` → `border-border` (neutro, sem cor comercial)
- `pl-4` → `pl-5` (leve ajuste de padding)
- `space-y-4` → `space-y-3` (mais compacto)

**Labels das camadas:**
```jsx
// Antes: hardcoded em portugues
<span className="font-medium text-foreground">Instituicoes</span>

// Depois: usar primeira palavra do i18n
<span className="font-medium text-foreground">
  {t('about.ecosystem.layer1').split(' — ')[0]}
</span>
```

---

### 2.6 Separadores Visuais — Capitulos

Adicionar separadores sutis entre blocos semanticos maiores:

```jsx
{/* Separador antes do Ecossistema */}
<div className="h-px w-16 bg-border mx-auto" />

{/* Separador antes da Governanca */}
<div className="h-px w-16 bg-border mx-auto" />
```

**Caracteristicas:**
- Linha horizontal curta (w-16 = 4rem)
- Cor neutra (`bg-border`)
- Centralizada
- Sem animacao

---

### 2.7 CTA — Institucionalizar

**Antes:**
```jsx
<Button size="lg" className="text-lg h-12 px-8" asChild>
  <Link to="/login">
    {t('about.cta')}
    <ArrowRight className="ml-2 h-5 w-5" />
  </Link>
</Button>
```

**Depois:**
```jsx
<Button 
  variant="outline" 
  size="lg" 
  className="text-base h-11 px-6 border-muted-foreground/30 hover:border-foreground/50 hover:bg-transparent"
  asChild
>
  <Link to="/login">
    {t('about.cta')}
  </Link>
</Button>
```

**Mudancas:**
- `variant="outline"` — menos chamativo
- `text-base` em vez de `text-lg` — mais sutil
- `h-11` em vez de `h-12` — menor
- `px-6` em vez de `px-8` — menor
- Remover `ArrowRight` — nao e conversao
- Border customizada com cores sutis
- `hover:bg-transparent` — sem preenchimento no hover

---

### 2.8 Secao CTA — Reposicionar

**Antes:**
```jsx
<section className="py-16 lg:py-24 border-t border-border">
```

**Depois:**
```jsx
<section className="py-12 lg:py-16">
```

**Mudancas:**
- Remover `border-t` — CTA como continuacao, nao secao separada
- Reduzir padding vertical — menos destaque

---

## 3. Codigo Final Esperado

### 3.1 Animacoes Institucionais

```typescript
// Animacao institucional - sutil e uniforme
const fadeIn = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: "easeOut" },
};
```

### 3.2 Estrutura de Blocos

```text
Hero Section
  |
  py-20 lg:py-28 (aumentado)
  |
Content Section (max-w-2xl)
  |
  +-- Role Block
  |     mt-0
  |
  +-- Limits Block
  |     mt-12
  |
  +-- Separator (h-px w-16)
  |     mt-16
  |
  +-- Ecosystem Block
  |     mt-8
  |
  +-- Separator (h-px w-16)
  |     mt-16
  |
  +-- Governance Block
  |     mt-8
  |
  +-- Neutrality Block
  |     mt-12
  |
CTA Section (py-12, sem border)
  |
Footer
```

---

## 4. Arquivos Afetados

| Arquivo | Acao | Linhas |
|---------|------|--------|
| `src/pages/About.tsx` | Editar | ~50 linhas modificadas |

**Nenhum outro arquivo sera alterado.**

---

## 5. O Que NAO Sera Feito

- Alterar textos (i18n)
- Adicionar novas cores ao CSS
- Criar novos componentes
- Adicionar ilustracoes/icones
- Implementar logica nova
- Modificar header/footer

---

## 6. Criterios de Aceite (SAFE GOLD)

| Criterio | Validacao |
|----------|-----------|
| Nao parece landing page | Ritmo de leitura editorial |
| Nao parece SaaS | Sem animacoes comerciais |
| CTA discreto | Outline, sem seta, sem destaque |
| Hierarquia clara | Titulos menos pesados |
| Texto como protagonista | max-w-2xl, espacamento variado |
| Pode ser apresentado a regulador | Sobriedade visual |

---

## 7. Resumo Executivo

Este PI transforma a pagina About de um layout "feature-list" para um layout "documental institucional" atraves de:

1. **Animacoes**: `y: 20 → y: 8`, remover stagger
2. **Tipografia**: Reduzir peso dos titulos
3. **Espacamento**: Ritmo variado em vez de uniforme
4. **Largura**: `max-w-3xl → max-w-2xl`
5. **Ecossistema**: Border neutra, labels dinamicas
6. **CTA**: Outline discreto, sem seta
7. **Separadores**: Linhas curtas entre capitulos

**Impacto funcional:** Zero
**Risco de regressao:** Muito baixo
**Arquivos alterados:** 1

