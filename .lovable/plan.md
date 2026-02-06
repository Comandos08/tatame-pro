

# P2.6 — UX de Empty States Inteligentes (SAFE GOLD)

## Auditoria Realizada

### Estado Atual do Sistema

| Item | Status |
|------|--------|
| `BlockedStateCard` existe | ✅ Disponível em `src/components/ux/` |
| `LoadingState` existe | ✅ Padrão de variantes (fullscreen, card, inline) |
| `TemporaryErrorCard` existe | ✅ Usa BlockedStateCard internamente |
| Chaves `empty.*` i18n | ❌ Não existem — serão criadas |
| Componente `EmptyStateCard` | ❌ Não existe — será criado |

### Padrões de Empty State Atuais (Inconsistentes)

| Componente | Empty State Atual | Problema |
|------------|------------------|----------|
| `MyEventsCard` | `<div>` genérico com ícone + texto + botão | Estilo inconsistente, CTA pode causar ansiedade |
| `AthletesList` | `<Card>` com ícone Users + texto filtro | Mensagem só fala de filtros, não de estado vazio geral |
| `EventsList` | `<Card>` com ícone + texto + botão Create | CTA agressivo no centro da página |
| `PortalEvents` | `<Card>` com ícone + texto + botão | Estilo similar mas sem hint de próximos passos |
| `TenantDashboard` | `<div>` com borda dashed + texto | Só para atividades, sem pattern geral |

---

## Arquivos a Criar

### 1. `src/components/ux/EmptyStateCard.tsx`

Componente wrapper SAFE GOLD que usa `BlockedStateCard` internamente, mas **SEM ações**.

```text
PASSO 1 — Estrutura do Componente
```

**Props (FECHADAS):**
```typescript
interface EmptyStateCardProps {
  /** Lucide icon component */
  icon: LucideIcon;
  /** i18n key for title */
  titleKey: string;
  /** i18n key for description */
  descriptionKey: string;
  /** Optional i18n key for hint/orientation text */
  hintKey?: string;
  /** Visual variant: inline (inside cards), standalone (centered) */
  variant?: 'inline' | 'standalone';
  /** Optional className */
  className?: string;
}
```

**Comportamento SAFE GOLD:**
- ❌ NÃO aceita `actions`
- ❌ NÃO aceita `onClick`
- ❌ NÃO faz fetch
- ❌ NÃO cria estado
- ✅ Usa `iconVariant="muted"` (tom neutro, não-bloqueante)
- ✅ Variante `inline` para uso dentro de Cards existentes (sem min-h-screen)
- ✅ Variante `standalone` para uso centralizado (mantém min-h-screen)

**Diferença do `BlockedStateCard`:**
| Aspecto | BlockedStateCard | EmptyStateCard |
|---------|-----------------|----------------|
| Propósito | Bloquear/Erro | Informar ausência |
| Tom visual | Destructive/Warning | Muted (neutro) |
| Ações | Suportadas | Não suportadas |
| Layout | Sempre fullscreen | inline ou standalone |

---

### 2. Atualizar `src/components/ux/index.ts`

Adicionar export:
```typescript
// P2.6 — Empty State Card (informative absence UX)
export { EmptyStateCard, type EmptyStateCardProps } from './EmptyStateCard';
```

---

## Arquivos de i18n a Atualizar

### 3. `src/locales/pt-BR.ts`, `en.ts`, `es.ts`

Adicionar 9 novas chaves no grupo `empty.*`:

| Chave | pt-BR | en | es |
|-------|-------|----|----|
| `empty.events.title` | Nenhum evento encontrado | No events found | Ningún evento encontrado |
| `empty.events.desc` | Você ainda não está inscrito em nenhum evento. | You are not registered for any events yet. | Aún no estás inscrito en ningún evento. |
| `empty.events.hint` | Quando houver eventos disponíveis, eles aparecerão aqui. | When events are available, they will appear here. | Cuando haya eventos disponibles, aparecerán aquí. |
| `empty.athletes.title` | Nenhum atleta cadastrado | No athletes registered | Ningún atleta registrado |
| `empty.athletes.desc` | Ainda não há atletas vinculados a esta organização. | No athletes are linked to this organization yet. | Aún no hay atletas vinculados a esta organización. |
| `empty.athletes.hint` | Cadastros aparecerão aqui assim que forem criados. | Registrations will appear here once created. | Los registros aparecerán aquí una vez creados. |
| `empty.dashboard.title` | Sem dados no momento | No data at the moment | Sin datos por el momento |
| `empty.dashboard.desc` | Ainda não há informações suficientes para exibir métricas. | There is not enough information to display metrics yet. | Aún no hay información suficiente para mostrar métricas. |
| `empty.dashboard.hint` | Os dados aparecerão conforme o uso do sistema. | Data will appear as the system is used. | Los datos aparecerán según el uso del sistema. |

---

## Integração (Pontual, NÃO GLOBAL)

O componente será criado e exportado, mas a **integração nos componentes existentes não será feita automaticamente** para manter o princípio SAFE GOLD.

```text
PASSO 4 — Uso Recomendado (Documentado, Não Aplicado)
```

**Exemplo de uso futuro em `MyEventsCard`:**
```tsx
// ANTES (inline genérico)
<div className="text-center py-6 text-muted-foreground">
  <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
  <p>{t('portal.noEvents')}</p>
  ...
</div>

// DEPOIS (padronizado)
<EmptyStateCard
  icon={Calendar}
  titleKey="empty.events.title"
  descriptionKey="empty.events.desc"
  hintKey="empty.events.hint"
  variant="inline"
/>
```

**Locais recomendados para integração futura:**
- `MyEventsCard` → `empty.events.*`
- `AthletesList` → `empty.athletes.*`
- `EventsList` → `empty.events.*` (admin context)
- `PortalEvents` → `empty.events.*`
- `TenantDashboard` (recentActivity) → `empty.dashboard.*`

---

## Checklist SAFE GOLD

| Critério | Status |
|----------|--------|
| Nenhuma regra de domínio alterada | ✅ |
| Nenhum fetch novo | ✅ |
| Nenhuma ação/callback adicionada | ✅ |
| Nenhum retry | ✅ |
| Nenhum estado novo | ✅ |
| Componente usa padrão existente (BlockedStateCard base) | ✅ |
| iconVariant="muted" (não-bloqueante) | ✅ |
| i18n completo nos 3 idiomas | ✅ |
| Build limpo esperado | ✅ |
| Totalmente reversível (remover não quebra nada) | ✅ |

---

## Resumo de Arquivos

| Operação | Arquivo |
|----------|---------|
| **CRIAR** | `src/components/ux/EmptyStateCard.tsx` |
| **EDITAR** | `src/components/ux/index.ts` (adicionar export) |
| **EDITAR** | `src/locales/pt-BR.ts` (adicionar 9 chaves) |
| **EDITAR** | `src/locales/en.ts` (adicionar 9 chaves) |
| **EDITAR** | `src/locales/es.ts` (adicionar 9 chaves) |

---

## Declaração Final

Após implementação:

```
P2.6 — UX de Empty States Inteligentes SAFE GOLD concluído.

- Empty states claros e não-bloqueantes
- Nenhuma ansiedade gerada ao usuário
- Nenhuma lógica nova introduzida
- UX consistente em todo o sistema
- i18n completo
- Build limpo
```

