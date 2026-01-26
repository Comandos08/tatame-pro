
# P4B — Athlete Portal UX + Flow Refinement

## Análise do Estado Atual

| Componente | Status Atual | Problema Identificado |
|------------|--------------|----------------------|
| `PortalAccessGate` | Decide + Redireciona | Mistura responsabilidades de segurança (P4A) e UX |
| Empty States | Básicos | Mensagens genéricas, sem orientação clara |
| Membership Forms | Funcionais | Sem feedback quando atleta já tem membership |
| Portal Home | Cards soltos | Falta headline clara e hierarquia visual |

## Contrato Imutável P4B

**P4B NÃO PODE:**
- Criar guards novos
- Criar redirects automáticos
- Mexer em `routes.tsx`
- Mexer em `AuthCallback.tsx`
- Mexer em billing
- Tomar decisão de acesso (isso é P4A)

**P4B SÓ PODE:**
- Ler estado já resolvido
- Mostrar UX adequada ao estado
- Orientar o atleta
- Exibir CTAs claros
- Melhorar textos, vazios e loaders

---

## Estrutura Fracionada (4 PRs)

### P4B-1 — PortalAccessGate (UX-Only Refactor)

**Arquivo:** `src/components/portal/PortalAccessGate.tsx`

**Problema atual:**
O `PortalAccessGate` tem `useEffect` que faz redirects automáticos (linhas 72-90), misturando responsabilidade de acesso (P4A) com UX.

**Mudanças:**
1. **REMOVER** o `useEffect` de redirect (linhas 72-90) - P4A já cuida disso
2. **REMOVER** `useNavigate` - componente passa a ser UX-only
3. **MANTER** todos os estados visuais (`pendingReview`, `expired`, `cancelled`, `rejected`)
4. **MELHORAR** mensagens e CTAs para cada estado

**Estados que ele exibe:**
| Estado | Ícone | Mensagem | CTA |
|--------|-------|----------|-----|
| `loading` | Loader2 | "Carregando..." | - |
| `noAthlete` | AlertTriangle | Mensagem i18n melhorada | "Iniciar Filiação" |
| `pendingReview` | Clock | Mensagem i18n humanizada | - (aguardar) |
| `expired` | AlertTriangle | Mensagem i18n clara | "Renovar" |
| `cancelled` | Ban | Mensagem i18n acolhedora | "Nova Filiação" |
| `rejected` | XCircle | Mensagem i18n + orientação | "Tentar Novamente" |
| `allowed` | - | Render children | - |

**Após P4B-1:**
```text
PortalAccessGate
├── Recebe props (athlete, membership, isLoading, error)
├── Calcula estado visual
├── Renderiza UI adequada ao estado
├── ZERO navigate()
├── ZERO useEffect de redirect
└── PURAMENTE VISUAL
```

---

### P4B-2 — Empty States do Portal

**Arquivos:**
- `src/components/portal/DigitalCardSection.tsx`
- `src/components/portal/DiplomasListCard.tsx`
- `src/components/portal/GradingHistoryCard.tsx`
- `src/components/portal/MyEventsCard.tsx`

**Problema atual:**
Empty states genéricos sem orientação:
```typescript
// DiplomasListCard.tsx linha 71
<p className="text-muted-foreground">{t('portal.noDiplomas')}</p>
// Só isso. Sem contexto, sem orientação.
```

**Mudanças por componente:**

| Componente | Empty State Atual | Empty State Novo |
|------------|-------------------|------------------|
| `DigitalCardSection` | "Carteira não disponível" | "Sua carteira digital será gerada após aprovação da filiação." |
| `DiplomasListCard` | "Nenhum diploma emitido ainda" | "Diplomas de graduação aparecerão aqui conforme você evolui." |
| `GradingHistoryCard` | "Nenhuma graduação registrada ainda" | "Seu histórico de faixas será exibido aqui após sua primeira graduação." |
| `MyEventsCard` | Já tem CTA "Ver Eventos" | Manter, apenas ajustar texto |

**Novos i18n keys:**
```typescript
'portal.emptyDigitalCard': 'Sua carteira digital será gerada automaticamente após a aprovação da sua filiação.',
'portal.emptyDiplomas': 'Diplomas de graduação aparecerão aqui conforme você evolui no esporte.',
'portal.emptyGradings': 'Seu histórico de faixas será exibido aqui após sua primeira graduação.',
```

---

### P4B-3 — Membership Forms (Mensagens e CTAs)

**Arquivo:** `src/components/membership/MembershipTypeSelector.tsx`

**Contexto:**
P4A já bloqueia o acesso se atleta tem membership ativa. Mas se por algum motivo chegar aqui (edge case, link direto antes do guard carregar), deve ter feedback claro.

**Mudança:**
Adicionar hook para verificar se usuário já tem membership e exibir Card informativo em vez de bloquear:

```typescript
// Novo componente visual (não bloqueia, apenas informa)
{hasMembership && (
  <Alert className="mb-8">
    <CheckCircle className="h-4 w-4" />
    <AlertTitle>{t('membership.alreadyMember')}</AlertTitle>
    <AlertDescription>
      {t('membership.alreadyMemberDesc')}
      <Button variant="link" asChild>
        <Link to={`/${tenantSlug}/portal`}>
          {t('membership.goToPortal')}
        </Link>
      </Button>
    </AlertDescription>
  </Alert>
)}
```

**Novos i18n keys:**
```typescript
'membership.alreadyMember': 'Você já possui uma filiação',
'membership.alreadyMemberDesc': 'Sua filiação está ativa. Acesse o portal para ver seus dados.',
'membership.goToPortal': 'Ir para o Portal',
```

---

### P4B-4 — Portal Home Polish

**Arquivo:** `src/pages/AthletePortal.tsx`

**Problema atual:**
- Header genérico com ícone + "Meu Portal"
- Sem destaque do estado atual
- Sem orientação de próxima ação

**Mudanças:**

1. **Headline dinâmica baseada no status:**
```typescript
const getWelcomeMessage = () => {
  const status = membership?.status?.toUpperCase();
  switch (status) {
    case 'ACTIVE':
      return t('portal.welcomeActive');
    case 'APPROVED':
      return t('portal.welcomeApproved');
    case 'PENDING_REVIEW':
      return t('portal.welcomePending');
    default:
      return t('portal.welcome');
  }
};
```

2. **Status badge no header:**
```typescript
<Badge className={statusBadgeClass}>
  {statusLabel}
</Badge>
```

3. **Próxima ação recomendada:**
```typescript
// Card de próxima ação no topo (condicional)
{daysUntilExpiry <= 30 && daysUntilExpiry > 0 && (
  <Card className="border-primary/20 bg-primary/5 mb-6">
    <CardContent className="pt-4">
      <p>Sua filiação expira em {daysUntilExpiry} dias.</p>
      <Button asChild>
        <Link to={`/${tenantSlug}/membership/renew`}>
          Renovar Agora
        </Link>
      </Button>
    </CardContent>
  </Card>
)}
```

**Novos i18n keys:**
```typescript
'portal.welcomeActive': 'Sua filiação está ativa!',
'portal.welcomeApproved': 'Bem-vindo! Sua filiação foi aprovada.',
'portal.welcomePending': 'Aguardando aprovação...',
'portal.nextAction': 'Próxima ação recomendada',
```

---

## Arquivos Modificados por Sub-Prompt

| P4B-X | Arquivo | Tipo |
|-------|---------|------|
| P4B-1 | `src/components/portal/PortalAccessGate.tsx` | Refactor |
| P4B-1 | `src/locales/pt-BR.ts` | i18n |
| P4B-1 | `src/locales/en.ts` | i18n |
| P4B-1 | `src/locales/es.ts` | i18n |
| P4B-2 | `src/components/portal/DigitalCardSection.tsx` | Polish |
| P4B-2 | `src/components/portal/DiplomasListCard.tsx` | Polish |
| P4B-2 | `src/components/portal/GradingHistoryCard.tsx` | Polish |
| P4B-2 | `src/locales/pt-BR.ts` | i18n |
| P4B-2 | `src/locales/en.ts` | i18n |
| P4B-2 | `src/locales/es.ts` | i18n |
| P4B-3 | `src/components/membership/MembershipTypeSelector.tsx` | Polish |
| P4B-3 | `src/locales/*.ts` | i18n |
| P4B-4 | `src/pages/AthletePortal.tsx` | Polish |
| P4B-4 | `src/locales/*.ts` | i18n |

---

## SAFE MODE — Arquivos NÃO Modificados

| Arquivo | Razão |
|---------|-------|
| `src/routes.tsx` | P4A já cuida |
| `src/pages/AuthCallback.tsx` | P3 — Hardened |
| `src/pages/Login.tsx` | P2 — Admin login |
| `src/lib/billing/*` | P1 — Billing core |
| `src/components/auth/AthleteRouteGuard.tsx` | P4A — Security |
| `src/lib/resolveAthleteRouteAccess.ts` | P4A — Security |
| `src/lib/resolveAthletePostLoginRedirect.ts` | P3 — Redirect |

---

## Ordem de Execução Recomendada

```text
P4B-1 → P4B-2 → P4B-3 → P4B-4
  │        │        │        │
  │        │        │        └── Portal polish (depende de P4B-1)
  │        │        └── Membership forms (independente)
  │        └── Empty states (independente)
  └── PortalAccessGate refactor (base)
```

**P4B-1 DEVE ser primeiro** porque remove a lógica de redirect do `PortalAccessGate`, deixando claro que P4A é o único responsável por acesso.

---

## Checklist de Aceite por Sub-Prompt

### P4B-1
- [ ] `PortalAccessGate` sem `useNavigate`
- [ ] `PortalAccessGate` sem `useEffect` de redirect
- [ ] Todos estados visuais funcionando
- [ ] Mensagens i18n humanizadas

### P4B-2
- [ ] Empty states com orientação
- [ ] i18n em pt-BR, en, es
- [ ] Sem mudança de lógica

### P4B-3
- [ ] Card informativo para atleta com membership
- [ ] CTA para portal
- [ ] Sem bloqueio (P4A faz isso)

### P4B-4
- [ ] Welcome dinâmico por status
- [ ] Status badge no header
- [ ] Card de próxima ação (expiração)

---

## Resultado Final P4B

```text
P4B — ATHLETE PORTAL UX + FLOW REFINEMENT
├── P4B-1: PortalAccessGate UX-only ✓
├── P4B-2: Empty states humanizados ✓
├── P4B-3: Membership forms polish ✓
├── P4B-4: Portal home hierarchy ✓
├── Zero redirects novos ✓
├── Zero guards novos ✓
├── Zero billing ✓
├── SAFE MODE preservado ✓
└── P4A intacto ✓
```
