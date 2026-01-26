
# P4B-3 — Membership Forms (UX Informativo) - Plano de Implementação

## Resumo

Adicionar card informativo na tela de seleção de filiação (`MembershipTypeSelector.tsx`) para orientar atletas que já possuem uma filiação existente (ACTIVE, APPROVED ou PENDING_REVIEW), sem bloquear acesso ou criar redirects automáticos.

---

## Arquivos a Modificar

| Arquivo | Ação |
|---------|------|
| `src/components/membership/MembershipTypeSelector.tsx` | Adicionar imports + query read-only + handler + card informativo |
| `src/locales/pt-BR.ts` | Adicionar 3 novas i18n keys (linha 660) |
| `src/locales/en.ts` | Adicionar 3 novas i18n keys (linha 662) |
| `src/locales/es.ts` | Adicionar 3 novas i18n keys (linha 662) |

---

## Arquivos NÃO Modificados (SAFE MODE)

| Arquivo | Razão |
|---------|-------|
| `src/routes.tsx` | P4A - Intacto |
| `src/pages/AuthCallback.tsx` | P3 - Intacto |
| `src/components/portal/PortalAccessGate.tsx` | P4B-1 - Intacto |
| `src/components/auth/AthleteRouteGuard.tsx` | P4A - Intacto |
| `src/lib/billing/*` | P1 - Intacto |
| `src/components/portal/*` | P4B-2 - Intacto |

---

## Mudanças Técnicas

### 1. MembershipTypeSelector.tsx - Imports (linhas 1-12)

**Adicionar:**
- `CheckCircle` ao import de lucide-react (linha 3)
- `useQuery` de `@tanstack/react-query` (nova linha após 6)
- `useCurrentUser` de `@/contexts/AuthContext` (nova linha após 8)

### 2. MembershipTypeSelector.tsx - Query Read-Only (após linha 20)

Adicionar após `const [isOpeningPortal, setIsOpeningPortal] = React.useState(false);`:

```typescript
const { currentUser } = useCurrentUser();

const { data: existingMembership } = useQuery({
  queryKey: ['existing-membership', currentUser?.id, tenant?.id],
  queryFn: async () => {
    if (!currentUser?.id || !tenant?.id) return null;

    const { data: athlete } = await supabase
      .from('athletes')
      .select('id')
      .eq('profile_id', currentUser.id)
      .eq('tenant_id', tenant.id)
      .maybeSingle();

    if (!athlete) return null;

    const { data: membership } = await supabase
      .from('memberships')
      .select('id, status')
      .eq('athlete_id', athlete.id)
      .in('status', ['ACTIVE', 'APPROVED', 'PENDING_REVIEW'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return membership;
  },
  enabled: !!currentUser?.id && !!tenant?.id,
});

const hasMembership = !!existingMembership;
```

### 3. MembershipTypeSelector.tsx - Handler Explícito (após linha 44)

Adicionar após o `handleOpenPortal`:

```typescript
// Handler explícito para navegação ao portal (P4B-3 hardening)
const handleGoToPortal = () => {
  navigate(`/${tenantSlug}/portal`);
};
```

### 4. MembershipTypeSelector.tsx - Card Informativo (linha 86, entre header e isMembershipBlocked)

Inserir ANTES do bloco `{isMembershipBlocked && (`:

```jsx
{/* Informational card when athlete already has membership (P4B-3 UX-only) */}
{hasMembership && (
  <motion.div
    initial={{ opacity: 0, y: -10 }}
    animate={{ opacity: 1, y: 0 }}
    className="mb-8"
  >
    <Alert className="border-primary/30 bg-primary/5">
      <CheckCircle className="h-4 w-4 text-primary" />
      <AlertTitle>{t('membership.alreadyMember')}</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>{t('membership.alreadyMemberDesc')}</p>
        <button
          type="button"
          onClick={handleGoToPortal}
          className="text-sm font-medium text-primary hover:underline"
        >
          {t('membership.goToPortal')}
        </button>
      </AlertDescription>
    </Alert>
  </motion.div>
)}
```

---

## Novas Chaves i18n

### pt-BR.ts (inserir após linha 659, antes da linha em branco 660)

```typescript
  // Membership Already Exists (P4B-3 UX Informational)
  'membership.alreadyMember': 'Você já possui uma filiação',
  'membership.alreadyMemberDesc': 'Sua filiação já está ativa ou em análise. Você pode acompanhar todas as informações no portal do atleta.',
  'membership.goToPortal': 'Ir para o Portal',
```

### en.ts (inserir após linha 661, antes da linha em branco 662)

```typescript
  // Membership Already Exists (P4B-3 UX Informational)
  'membership.alreadyMember': 'You already have a membership',
  'membership.alreadyMemberDesc': 'Your membership is already active or under review. You can view all details in the athlete portal.',
  'membership.goToPortal': 'Go to Portal',
```

### es.ts (inserir após linha 661, antes da linha em branco 662)

```typescript
  // Membership Already Exists (P4B-3 UX Informational)
  'membership.alreadyMember': 'Ya tienes una afiliación',
  'membership.alreadyMemberDesc': 'Tu afiliación ya está activa o en revisión. Puedes ver todos los detalles en el portal del atleta.',
  'membership.goToPortal': 'Ir al Portal',
```

---

## Comportamento Final

| Cenário | Resultado |
|---------|-----------|
| Atleta sem filiação | Tela normal, sem card informativo |
| Atleta com filiação ACTIVE | Card informativo aparece + opções visíveis e clicáveis |
| Atleta com filiação APPROVED | Card informativo aparece + opções visíveis e clicáveis |
| Atleta com filiação PENDING_REVIEW | Card informativo aparece + opções visíveis e clicáveis |
| Atleta com filiação EXPIRED | Tela normal, sem card informativo |
| Atleta com filiação CANCELLED | Tela normal, sem card informativo |
| Usuário não autenticado | Query desabilitada, tela normal |

---

## Checklist de Aceite

| Critério | Status |
|----------|--------|
| Nenhum `navigate()` inline | Garantido - usa `handleGoToPortal` |
| Navegação apenas via handler | Garantido |
| Nenhum `useEffect` novo | Garantido |
| Nenhum redirect automático | Garantido |
| Nenhuma mudança de rota | Garantido |
| Nenhuma mudança de guard | Garantido |
| Query somente SELECT | Garantido |
| Build compila sem erro | Garantido |
| UX apenas informativa | Garantido |
| i18n completo (pt / en / es) | Garantido |
| P4A intacto | Garantido |
| P4B-1 e P4B-2 intactos | Garantido |

---

## Resultado Esperado

```text
P4B-3 — MEMBERSHIP FORMS (HARDENED)
├── Query read-only ✓
├── JSX válido ✓
├── Navegação explícita (handleGoToPortal) ✓
├── UX-only ✓
├── Zero regressão ✓
├── SAFE MODE ✓
└── Pronto para P4B-4 ✓
```
