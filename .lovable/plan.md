

# PI-INSTITUTIONAL-APPROVAL-001: Reconstrucao do ApprovalDetails.tsx (SAFE GOLD HARDENED)

## Resumo

Reescrita completa de `src/pages/ApprovalDetails.tsx`. Arquivo unico modificado. Todos os ajustes P0/P1 do review anterior + 2 ajustes SAFE GOLD incorporados.

---

## Verificacoes Realizadas (Ajustes do Review Anterior)

### P0 -- Payload da Edge Function: CONFIRMADO

O `approve-membership` aceita:

```text
{ membershipId, academyId?, coachId?, reviewNotes?, roles?, impersonationId? }
```

Roles whitelist no backend: `ATLETA`, `COACH_ASSISTENTE`, `COACH_PRINCIPAL`, `INSTRUTOR`, `STAFF_ORGANIZACAO`. Default quando vazio: `ATLETA`.

O `reject-membership` aceita:

```text
{ membershipId, reason?, rejectionReason?, impersonationId? }
```

### P0 -- Filtro tenant_id: SEGURO

Rota dentro de `/:tenantSlug/app/...`. `useTenant()` garantido neste contexto.

### P1 -- digital_cards: CONFIRMADO

FK `membership_id` existe. Secao opcional na UI.

### P1 -- reject-membership: EXISTE

Confirmado em `supabase/functions/reject-membership/index.ts`.

---

## AJUSTES SAFE GOLD (P0-1 e P0-2)

### P0-1 -- Determinismo de Query Key e Refetch

A queryKey sera definida explicitamente como:

```text
const QUERY_KEY = ['membership-approval-detail', approvalId] as const;
```

Uso no `useQuery`:

```text
useQuery({
  queryKey: QUERY_KEY,
  queryFn: async () => { ... },
  enabled: !!approvalId && !!tenant?.id,
})
```

Apos sucesso de approve ou reject:

```text
await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
```

Garantias:
- A mesma referencia `QUERY_KEY` e usada em ambos os pontos
- Nao existe chave parcial, string solta ou chave diferente
- O `invalidateQueries` dispara refetch automatico via react-query
- A UI nunca exibe estado stale apos acao bem-sucedida
- O toast de sucesso so aparece apos o `invalidateQueries` resolver

### P0-2 -- Imutabilidade da Role Padrao

Constante declarada no topo do arquivo, fora do componente:

```text
const DEFAULT_APPROVAL_ROLES = ['ATLETA'] as const;
```

Garantias:
- O payload de aprovacao usa exclusivamente `DEFAULT_APPROVAL_ROLES`
- Nenhum `useState` controla ou altera roles
- Nenhum campo de UI (dropdown, checkbox, input) expoe roles
- Roles nao e derivavel de input do usuario
- A constante e `as const` (readonly tuple), imutavel em tempo de compilacao
- O payload enviado sera: `roles: [...DEFAULT_APPROVAL_ROLES]`

---

## Implementacao

### Arquivo Unico: `src/pages/ApprovalDetails.tsx` (reescrita completa)

### 1. Constantes Imutaveis (topo do arquivo, fora do componente)

```text
const DEFAULT_APPROVAL_ROLES = ['ATLETA'] as const;
const QUERY_KEY_PREFIX = 'membership-approval-detail';
```

### 2. Correcao do Param

```text
const { approvalId } = useParams<{ approvalId: string }>();
```

### 3. Tipagem Local

```text
ApplicantData -- todos campos opcionais (tolerante a JSONB parcial)
AthleteJoin -- id, full_name, email, phone, birth_date, gender, national_id, endereco
MembershipDetail -- campos da membership + joins tipados
```

### 4. Query Deterministica

```text
const QUERY_KEY = [QUERY_KEY_PREFIX, approvalId] as const;

useQuery({
  queryKey: QUERY_KEY,
  queryFn: async () => {
    const { data, error } = await supabase
      .from("memberships")
      .select(`
        id, status, payment_status, type, created_at,
        start_date, end_date, price_cents, currency,
        review_notes, reviewed_at, applicant_data,
        applicant_profile_id, athlete_id, academy_id,
        preferred_coach_id, documents_uploaded,
        athlete:athletes!athlete_id(
          id, full_name, email, phone, birth_date,
          gender, national_id, address_line1, address_line2,
          city, state, postal_code, country
        ),
        profile:profiles!applicant_profile_id(id, name, email),
        academy:academies!academy_id(id, name),
        coach:coaches!preferred_coach_id(id, full_name),
        digital_cards(id, qr_code_image_url, pdf_url)
      `)
      .eq("id", approvalId)
      .eq("tenant_id", tenant.id)
      .maybeSingle();

    if (error) throw error;
    return data;
  },
  enabled: !!approvalId && !!tenant?.id,
})
```

### 5. applicantView Derivado (fallback deterministico)

| Campo | Prioridade 1 | Prioridade 2 | Prioridade 3 | Fallback |
|-------|-------------|-------------|-------------|----------|
| name | athlete.full_name | profile.name | applicant_data.full_name | "Nome nao informado" |
| email | athlete.email | profile.email | applicant_data.email | "Email nao informado" |
| phone | athlete.phone | -- | applicant_data.phone | null |
| birth_date | athlete.birth_date | -- | applicant_data.birth_date | null |
| gender | athlete.gender | -- | applicant_data.gender | null |
| national_id | athlete.national_id | -- | applicant_data.national_id | null |
| endereco | athlete.address_* | -- | applicant_data.address_* | null |

### 6. State Machine Local

```text
const isPendingReview = membership.status === 'PENDING_REVIEW'
const isPaymentCompleted = membership.payment_status === 'PAID'
const canApproveOrReject = isPendingReview && isPaymentCompleted
```

### 7. Acoes -- Payloads Exatos

**Aprovar**:

```text
const handleApprove = async () => {
  setIsSubmitting(true);
  const body: Record<string, unknown> = {
    membershipId: approvalId,
    roles: [...DEFAULT_APPROVAL_ROLES],
  };
  if (reviewNotes.trim()) body.reviewNotes = reviewNotes.trim();

  const { error } = await supabase.functions.invoke('approve-membership', { body });
  if (error) { toast.error(...); setIsSubmitting(false); return; }

  await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  toast.success(...);
  setIsSubmitting(false);
};
```

**Rejeitar**:

```text
const handleReject = async () => {
  setIsSubmitting(true);
  const { error } = await supabase.functions.invoke('reject-membership', {
    body: {
      membershipId: approvalId,
      rejectionReason: rejectionReason.trim(),
    }
  });
  if (error) { toast.error(...); setIsSubmitting(false); return; }

  await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  toast.success(...);
  setIsSubmitting(false);
};
```

### 8. Estrutura da UI

1. **Header**: Botao Voltar + titulo + Badge de status
2. **Card Dados da Solicitacao**: Status, pagamento, valor, tipo, datas
3. **Card Dados do Atleta**: applicantView completo
4. **Card Documentos**: Lista de documentos (se existirem)
5. **Card Carteira Digital**: Exibido somente se `digital_cards` retornar dados
6. **Card Decisao**: Notas do revisor + botoes Aprovar/Rejeitar
7. **Alerta de pagamento**: Exibido se `payment_status !== 'PAID'`, desabilitando acoes

**Roles NAO aparecem na UI. Nenhum dropdown, checkbox ou input de roles existe.**

### 9. Estados Explicitos

| Estado | Condicao | UI |
|--------|---------|-----|
| Loading | isLoading | Spinner institucional |
| Error | isError | Card com mensagem + botao voltar |
| Not Found | !membership | Card "Nao encontrado" + botao voltar |
| Processing | isSubmitting | Botoes desabilitados + spinner inline |
| Success | apos acao | Toast via sonner + refetch via invalidateQueries(QUERY_KEY) |

### 10. Protecoes

- **Duplo clique**: `useState<boolean>` de `isSubmitting` desabilita botoes
- **Rejeicao vazia**: Botao confirmar desabilitado se `rejectionReason.trim() === ''`
- **Confirmacao**: AlertDialog antes de aprovar e antes de rejeitar

---

## O que NAO sera tocado

- Rotas (AppRouter.tsx)
- RLS policies
- Edge Functions (approve-membership, reject-membership)
- ApprovalsList.tsx
- Enums, guards, estado global
- Schema do banco

---

## Checklist SAFE GOLD

| Item | Status |
|------|--------|
| queryKey explicita e unica | `[QUERY_KEY_PREFIX, approvalId] as const` |
| invalidateQueries usa mesma queryKey | Sim, referencia `QUERY_KEY` |
| Refetch deterministico pos-acao | `await invalidateQueries` antes do toast |
| DEFAULT_APPROVAL_ROLES imutavel | `as const`, fora do componente |
| Roles nao editavel por UI | Nenhum campo de input expoe roles |
| Roles nao derivavel de input | Payload usa spread da constante |
| Nenhum estado controla roles | Zero useState para roles |

