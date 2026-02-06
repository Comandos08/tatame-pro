
# P1 — UX, Clareza Operacional e Valor Percebido

## Visão Geral

O P1 transforma o TATAME PRO de um sistema tecnicamente correto em um sistema **visivelmente profissional, confiável e agradável de usar**. Cada sub-fase é independente e pode ir para produção sozinha.

---

## Arquitetura Atual Identificada

Após análise do código, identifiquei os seguintes padrões existentes:

### Estados de Bloqueio (inline, não reutilizáveis)
| Componente | Localização | Estrutura |
|------------|-------------|-----------|
| IdentityGate SUPERADMIN | `IdentityGate.tsx:364-384` | Card + CardHeader + CardContent inline |
| IdentityGate no context | `IdentityGate.tsx:399-418` | Card + CardHeader + CardContent inline |
| IdentityGate ERROR | `IdentityGate.tsx:431-476` | Card + escape hatch inline |
| TenantLayout error | `TenantLayout.tsx:84-96` | motion.div + AlertCircle inline |
| TenantBlockedScreen | Componente próprio (bem feito) | 3 variantes: PENDING_DELETE, Admin, Non-Admin |
| AccessDenied | Componente próprio | Contexto-aware, usa i18n |
| IdentityErrorScreen | Componente próprio | Hardcoded strings (não i18n!) |

### Loading States (inconsistentes)
| Componente | Tipo | Texto |
|------------|------|-------|
| IdentityLoadingScreen | Spinner | `t('common.verifyingAccess')` ✅ |
| TenantLayout | Spinner | `t('tenant.loading')` ✅ |
| TenantDashboard | Spinner | Genérico (sem texto explicativo) |
| AthletesList | Spinner | Genérico |
| EventsList | Skeletons | ✅ Já usa |
| PortalEvents | Skeletons | ✅ Já usa |

### Skeleton já implementado
- `src/components/ui/skeleton.tsx` existe
- Já usado em: EventsList, EventDetails, PortalEvents, MyEventsCard, PublicEventDetails

---

## P1.1 — Componente BlockedStateCard (Unificação Visual)

### Objetivo
Criar 1 componente padrão reutilizável para TODOS os estados de bloqueio/erro.

### Componente: `src/components/ux/BlockedStateCard.tsx`

```text
┌───────────────────────────────────────┐
│           ┌─────────────┐             │
│           │   🔴 Icon   │             │
│           └─────────────┘             │
│                                       │
│         [Title - i18n key]            │
│      [Description - i18n key]         │
│                                       │
│  ┌─────────────────────────────────┐  │
│  │    [Hint text - optional]       │  │
│  └─────────────────────────────────┘  │
│                                       │
│  ┌─────────────────────────────────┐  │
│  │   [Primary Action Button]       │  │
│  └─────────────────────────────────┘  │
│  ┌─────────────────────────────────┐  │
│  │   [Secondary Action - outline]  │  │
│  └─────────────────────────────────┘  │
│  ┌─────────────────────────────────┐  │
│  │   [Tertiary Action - ghost]     │  │
│  └─────────────────────────────────┘  │
└───────────────────────────────────────┘
```

### Props Interface
```typescript
interface BlockedStateCardProps {
  icon: LucideIcon;
  iconVariant?: 'destructive' | 'warning' | 'muted';
  titleKey: string;           // i18n key
  descriptionKey: string;     // i18n key
  hintKey?: string;           // i18n key (opcional)
  actions: Array<{
    labelKey: string;         // i18n key
    onClick: () => void;
    variant?: 'default' | 'outline' | 'ghost';
    icon?: LucideIcon;
  }>;
}
```

### Substituições Planejadas

| Local | Estado | Ação |
|-------|--------|------|
| `IdentityGate.tsx:364-384` | SUPERADMIN sem impersonation | Substituir por BlockedStateCard |
| `IdentityGate.tsx:399-418` | RESOLVED sem redirectPath | Substituir por BlockedStateCard |
| `IdentityGate.tsx:431-476` | ERROR state | Substituir por BlockedStateCard |
| `TenantLayout.tsx:84-96` | Tenant not found | Substituir por BlockedStateCard |
| `IdentityErrorScreen.tsx` | Múltiplos erros | Refatorar para usar BlockedStateCard |

### Arquivos a Criar
- `src/components/ux/BlockedStateCard.tsx`

### Arquivos a Modificar
- `src/components/identity/IdentityGate.tsx`
- `src/layouts/TenantLayout.tsx`
- `src/components/identity/IdentityErrorScreen.tsx`

---

## P1.2 — Loading States com Intenção

### Objetivo
Padronizar loadings para explicar O QUE o sistema está fazendo, não apenas "carregando".

### Componente: `src/components/ux/LoadingState.tsx`

```typescript
interface LoadingStateProps {
  titleKey: string;           // e.g., 'loading.identifyingOrg'
  subtitleKey?: string;       // e.g., 'loading.pleaseWait'
  variant?: 'fullscreen' | 'inline' | 'card';
  showTimeoutHint?: boolean;
  timeoutMs?: number;
}
```

### Variantes Visuais

**Fullscreen** (para gates):
```text
┌─────────────────────────────────────────┐
│                                         │
│                                         │
│              ⟳ (spinner)                │
│                                         │
│      "Identificando organização..."     │
│      "Aguarde um momento"               │
│                                         │
│                                         │
└─────────────────────────────────────────┘
```

**Card** (para seções):
```text
┌───────────────────────────────┐
│ ⟳ Carregando seus eventos... │
│   Buscando inscrições ativas  │
└───────────────────────────────┘
```

**Inline** (para tabelas):
```text
⟳ Buscando atletas...
```

### Novas Chaves i18n (a adicionar)
```typescript
'loading.identifyingOrg': 'Identificando organização...',
'loading.validatingPermissions': 'Validando permissões...',
'loading.loadingDashboard': 'Preparando seu painel...',
'loading.loadingAthletes': 'Carregando atletas...',
'loading.loadingEvents': 'Carregando eventos...',
'loading.pleaseWait': 'Aguarde um momento',
```

### Arquivos a Criar
- `src/components/ux/LoadingState.tsx`

### Arquivos a Modificar
- `src/locales/pt-BR.ts`
- `src/locales/en.ts`
- `src/locales/es.ts`
- `src/components/identity/IdentityLoadingScreen.tsx` (opcional - já está bom)
- `src/pages/TenantDashboard.tsx`
- `src/pages/AthletesList.tsx`

---

## P1.3 — Microcopy de Confiança

### Objetivo
Ajustar textos de botões e mensagens para soar mais intencional e confiável.

### Mapeamento de Ajustes

| Atual | Proposto | Chave i18n |
|-------|----------|------------|
| "Tentar novamente" | "Tentar novamente agora" | `common.retryNow` |
| "Voltar" | "Voltar ao painel" | `common.backToDashboard` |
| "Ir para Início" | "Voltar ao início" | `common.backToHome` |
| "Sair" | "Encerrar sessão" | `auth.endSession` |
| "Contatar Suporte" | "Falar com suporte" | `common.contactSupport` |

### Arquivos a Modificar
- `src/locales/pt-BR.ts`
- `src/locales/en.ts`
- `src/locales/es.ts`
- Componentes que usam essas chaves (ajuste pontual)

---

## P1.4 — Skeletons ao invés de Spinners

### Objetivo
Onde já conhecemos a estrutura visual, trocar spinners por skeletons para percepção premium.

### Componente: `src/components/ux/TableSkeleton.tsx`
```typescript
interface TableSkeletonProps {
  columns: number;
  rows?: number;
}
```

### Componente: `src/components/ux/CardGridSkeleton.tsx`
```typescript
interface CardGridSkeletonProps {
  cards?: number;
  columns?: 2 | 3 | 4 | 5;
}
```

### Locais de Aplicação

| Página | Atual | Proposto |
|--------|-------|----------|
| TenantDashboard | Spinner único | CardGridSkeleton (5 cards) + skeleton de gráficos |
| AthletesList | Spinner único | TableSkeleton (6 colunas, 5 rows) |
| AcademiesList | Spinner único | TableSkeleton |
| CoachesList | Spinner único | TableSkeleton |
| ApprovalsList | Spinner único | TableSkeleton |

### Arquivos a Criar
- `src/components/ux/TableSkeleton.tsx`
- `src/components/ux/CardGridSkeleton.tsx`
- `src/components/ux/index.ts` (barrel export)

### Arquivos a Modificar
- `src/pages/TenantDashboard.tsx`
- `src/pages/AthletesList.tsx`
- `src/pages/AcademiesList.tsx`
- `src/pages/CoachesList.tsx`
- `src/pages/ApprovalsList.tsx`

---

## Ordem de Execução Recomendada

```text
P1.1 → P1.2 → P1.3 → P1.4
```

Cada fase pode ir para produção independentemente.

---

## Riscos e Mitigações

| Fase | Risco | Mitigação |
|------|-------|-----------|
| P1.1 | Quebrar escape hatches existentes | Testar cada substituição individualmente |
| P1.2 | Loadings não aparecem (muito rápidos) | Manter lógica atual, só mudar visual |
| P1.3 | Quebrar traduções existentes | Adicionar novas chaves, não substituir |
| P1.4 | Skeletons muito diferentes do conteúdo | Mapear estrutura real antes de implementar |

---

## Critérios de Aceite (por fase)

### P1.1
- [ ] BlockedStateCard criado e exportado
- [ ] 5+ locais substituídos
- [ ] IdentityErrorScreen usa i18n (não hardcoded)
- [ ] Visual homogêneo em todos os bloqueios

### P1.2
- [ ] LoadingState criado com 3 variantes
- [ ] Dashboard usa loading explicativo
- [ ] Listas principais usam loading explicativo

### P1.3
- [ ] Novas chaves adicionadas aos 3 locales
- [ ] Botões principais atualizados

### P1.4
- [ ] TableSkeleton e CardGridSkeleton criados
- [ ] Dashboard usa skeletons
- [ ] AthletesList usa skeletons

---

## Seção Técnica

### Estrutura de Arquivos Final

```text
src/components/ux/
├── BlockedStateCard.tsx    # P1.1
├── LoadingState.tsx        # P1.2
├── TableSkeleton.tsx       # P1.4
├── CardGridSkeleton.tsx    # P1.4
├── RecoveryGuide.tsx       # (já existe)
└── index.ts                # barrel export
```

### Dependências
- Nenhuma nova dependência externa
- Usa componentes existentes: Card, Button, Skeleton
- Usa lucide-react (já instalado)

### Compatibilidade
- Zero breaking changes
- Backwards compatible
- Todas as substituições são 1:1 funcionalmente
