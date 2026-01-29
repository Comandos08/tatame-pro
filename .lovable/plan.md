
# Plano: Correcao de Cores Laranjas + Governanca de Tokens

## Resumo Executivo

Implementacao aprovada para unificar a paleta de cores, removendo os tons laranjas e alinhando `--accent` com a hue primaria (vermelho). Adicionalmente, formalizacao da regra de uso do token `--accent` no documento de governanca.

---

## Parte 1: Atualizacao do Arquivo CSS

### Arquivo: `src/index.css`

**Mudanca 1 - Dark theme (linha 53):**
```css
/* De: */
--accent: 25 95% 53%;
/* Para: */
--accent: 0 70% 35%;
```

**Mudanca 2 - Gradiente primario (linha 65):**
```css
/* De: */
--gradient-primary: linear-gradient(135deg, hsl(0 84% 50%) 0%, hsl(25 95% 53%) 100%);
/* Para: */
--gradient-primary: linear-gradient(135deg, hsl(0 84% 50%) 0%, hsl(0 72% 40%) 100%);
```

**Mudanca 3 - Light theme (linha 92):**
```css
/* De: */
--accent: 25 95% 53%;
/* Para: */
--accent: 0 50% 90%;
```

---

## Parte 2: Atualizacao da Governanca

### Arquivo: `docs/UI-GOVERNANCE.md`

Adicionar nova subsecao dentro da secao **8. COLOR and TOKEN USAGE** (apos a Token Reference table, linha ~398):

```text
### Token Semantic Hierarchy

The design system tokens follow a strict semantic hierarchy:

| Token | Purpose | Usage Context |
|-------|---------|---------------|
| `--primary` | Main brand color, CTAs | Buttons, links, primary actions |
| `--accent` | Interactive state feedback | Hover, focus, selection states ONLY |
| `--secondary` | Supporting surfaces | Cards, panels, secondary elements |
| `--muted` | Subdued content | Placeholder text, disabled states |
| `--destructive` | Danger actions | Delete, remove, cancel |

### CRITICAL: Accent Token Rules

The `--accent` token is **exclusively reserved** for interactive state feedback:

**ALLOWED uses:**
- Dropdown/menu item hover backgrounds
- Focus ring highlights
- Toggle/checkbox selection indicators
- Slider track active portions

**FORBIDDEN uses:**
- Primary action buttons (use `--primary`)
- Brand identity elements
- Text color for emphasis
- Background for content cards

This separation ensures visual hierarchy remains consistent and prevents
competing colors from diluting the primary brand identity.
```

---

## Arquivos Modificados

| Arquivo | Linhas Alteradas | Tipo de Mudanca |
|---------|------------------|-----------------|
| `src/index.css` | 53, 65, 92 | Valor de variaveis CSS |
| `docs/UI-GOVERNANCE.md` | ~399-425 (insercao) | Documentacao de regra |

**Total: 3 linhas editadas + 1 bloco inserido**

---

## Validacao

### Testes a executar apos implementacao:

```bash
# Verificar que nao ha cores hardcoded
npx playwright test e2e/ui/color-hardcode.spec.ts

# Verificar integridade visual geral
npx playwright test e2e/ui/
```

### Verificacao visual manual:
- Pagina `/federacao-demo/events` - botoes de inscricao
- Dropdowns em qualquer pagina - estados de hover
- Portal do atleta - badges e cards

---

## Impacto

- Zero regressao funcional
- Nenhuma logica de negocio alterada
- Consistencia visual com identidade primaria (vermelho)
- Documentacao formalizada para prevenir ambiguidades futuras
- Hierarquia de tokens claramente definida
