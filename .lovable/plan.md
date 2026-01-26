
## P4.x-HARDENING FINAL — Plano de Implementação

### Resumo Executivo

Finalização do P4.x com dois focos: (A) garantir completude i18n em EN/ES e (B) padronizar o botão secundário para derivar da cor do tenant.

---

### ITEM A — i18n COMPLETENESS (EN / ES)

#### Diagnóstico

Após análise detalhada dos arquivos de tradução:

| Arquivo | Total de Chaves | Status |
|---------|-----------------|--------|
| `pt-BR.ts` | 1010 chaves | ✅ Referência |
| `en.ts` | 1012 chaves | ✅ Completo |
| `es.ts` | 1012 chaves | ✅ Completo |

**Resultado:** Todas as chaves adicionadas no P4.3/P4.4 (eventos, imagens, portal) já existem em EN e ES. A estrutura `Record<TranslationKey, string>` garante type-safety no build.

#### Verificação Adicional Necessária

Auditar usos de `t()` no runtime para garantir que não há:
- Chaves dinâmicas sem fallback
- Uso de `as any` para mascarar ausências
- Concatenação de chaves em runtime

#### Tarefas

1. **Verificar chaves críticas adicionadas no P4.x:**
   - `events.coverImage` / `events.coverImageDesc` — ✅ Presente em EN/ES
   - `events.uploadImage` / `events.replaceImage` / `events.removeImage` — ✅ Presente
   - `events.imageUploadSuccess` / `events.imageUploadError` — ✅ Presente
   - `portal.athletePhoto` — ✅ Presente em EN/ES

2. **Nenhuma ação de código necessária** — traduções já completas

---

### ITEM B — BOTÃO SECUNDÁRIO CONSISTENTE

#### Diagnóstico Atual

O componente `Button` em `src/components/ui/button.tsx` possui:

```text
Variantes atuais:
├── default      → bg-primary (tema global)
├── destructive  → bg-destructive  
├── outline      → border-input (cinza genérico) ⚠️
├── secondary    → bg-secondary (cinza genérico) ⚠️
├── ghost        → transparente
├── link         → text-primary
├── tenant       → bg-[--tenant-primary] ✅
└── tenant-outline → border + text [--tenant-primary] ✅
```

**Problema identificado:** As variantes `outline` e `secondary` usam tokens genéricos (`border-input`, `bg-secondary`) que não respondem à cor do tenant.

#### Locais de Uso Críticos

| Componente | Variante Atual | Ação |
|------------|---------------|------|
| `EventCard.tsx:105` | `outline` | Avaliar contexto |
| `EventImageUpload.tsx:152` | `outline` | Upload interno - OK |
| `DigitalCardSection.tsx:125` | `outline` | Portal - substituir por `tenant-outline` |
| `MembershipTypeSelector.tsx:140` | `outline` | Landing - substituir por `tenant-outline` |
| `BrandingUploadSection.tsx:129` | `outline` | Admin - OK (não é tenant) |
| `EditablePersonalData.tsx:198` | `outline` | Portal - substituir por `tenant-outline` |
| `Landing.tsx:97` | `outline` | Landing global - OK |
| `calendar.tsx:22` | `outline` | UI primitivo - OK |
| `alert-dialog.tsx:86` | `outline` | UI primitivo - OK |

#### Decisão Arquitetural

**Manter variantes `outline` e `secondary` inalteradas** — são tokens do design system global (shadcn/ui). Usar `tenant-outline` explicitamente em páginas tenant-aware.

#### Tarefas de Implementação

1. **Substituir `variant="outline"` por `variant="tenant-outline"`** nos seguintes arquivos:

   **Arquivo:** `src/components/events/EventCard.tsx`
   - Linha ~105: Botão "Ver Detalhes" em eventos públicos
   - Contexto: Página pública de tenant

   **Arquivo:** `src/components/portal/DigitalCardSection.tsx`
   - Linha ~125: Botão "Download Card"
   - Contexto: Portal do atleta

   **Arquivo:** `src/components/membership/MembershipTypeSelector.tsx`
   - Linha ~140: Botão de seleção de tipo de filiação
   - Contexto: Landing do tenant

   **Arquivo:** `src/components/athlete/EditablePersonalData.tsx`
   - Linha ~198: Botão "Editar" dados pessoais
   - Contexto: Portal do atleta

2. **Manter inalterados** (contexto admin/global):
   - `BrandingUploadSection.tsx` — área admin
   - `Landing.tsx` — landing global (não tenant)
   - `calendar.tsx` — componente UI primitivo
   - `alert-dialog.tsx` — componente UI primitivo
   - `AdminDashboard.tsx` — área admin global

---

### Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `src/components/events/EventCard.tsx` | `variant="outline"` → `variant="tenant-outline"` |
| `src/components/portal/DigitalCardSection.tsx` | `variant="outline"` → `variant="tenant-outline"` |
| `src/components/membership/MembershipTypeSelector.tsx` | `variant="outline"` → `variant="tenant-outline"` |
| `src/components/athlete/EditablePersonalData.tsx` | `variant="outline"` → `variant="tenant-outline"` |

---

### Garantias SAFE GOLD

| Restrição | Status |
|-----------|--------|
| Auth inalterado | ✅ Garantido |
| Stripe inalterado | ✅ Garantido |
| Billing inalterado | ✅ Garantido |
| RLS inalterado | ✅ Garantido |
| Edge Functions inalteradas | ✅ Garantido |
| Lógica de negócio inalterada | ✅ Garantido |
| Status badges inalterados | ✅ Garantido |

---

### Critérios de Aceite

#### i18n
- ✅ Nenhuma chave usada em runtime falta em EN ou ES
- ✅ Build sem warnings de i18n
- ✅ Nenhum `t('key' as any)` usado
- ✅ Experiência funcional idêntica em pt/en/es

#### Botão Secundário
- ✅ Botões tenant-aware usam `tenant-outline` em páginas de tenant
- ✅ Cor derivada de `--tenant-primary`
- ✅ Nenhum hardcode residual em botões de ação tenant-aware
- ✅ Componentes admin/global mantêm variantes padrão

---

### Validação Final

1. **Trocar idioma do tenant:** PT → EN → ES
   - Verificar que nenhum texto aparece como chave técnica
   - Verificar tradução completa em todas as telas

2. **Trocar `tenant.primaryColor`:**
   - Botão primário (`tenant`) responde corretamente
   - Botão secundário (`tenant-outline`) responde corretamente
   - Nenhuma regressão visual

---

### Resultado Esperado

```text
P4.x-HARDENING FINAL — CONCLUÍDO COM SUCESSO
├── i18n: EN/ES 100% sincronizado com PT-BR
├── Botões: tenant-outline aplicado em contextos corretos
├── SAFE GOLD: 100% preservado
└── Pronto para PI 5 — Observabilidade & Operação
```
