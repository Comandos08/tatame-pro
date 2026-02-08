

# Plano Atualizado: P3.MEMBERSHIP.RETRY.PAYMENT (SAFE GOLD)

## Ajustes Incorporados

Este plano incorpora as **5 correções críticas** solicitadas antes da aprovação:

| # | Ajuste | Criticidade | Status |
|---|--------|-------------|--------|
| 1 | Rollback transacional se Stripe falhar | 🔴 CRÍTICO | ✅ Incorporado |
| 2 | Verificação de ownership / tenant boundary | 🔴 SEGURANÇA | ✅ Incorporado |
| 3 | Proteção contra retry em CANCELLED não relacionado a pagamento | 🟡 RECOMENDADO | ✅ Incorporado |
| 4 | Versionamento lógico do stripe_checkout_session_id | 🟡 AUDITORIA | ✅ Incorporado |
| 5 | UI/UX para evitar double-click / race | 🟢 UX | ✅ Incorporado |

---

## Descobertas do Diagnóstico

### Fontes de Verdade Existentes

| Componente | Observação |
|------------|------------|
| `cleanup-pending-payment-memberships` | Já registra `reason: 'payment_timeout'` na metadata |
| `cleanup-abandoned-memberships` | Registra `reason: 'DRAFT status for more than 24 hours...'` |
| `create-membership-checkout` | Não valida tenant boundary (busca apenas por ID) |
| `MembershipStatus.tsx` | Não possui `payment_status` na query |

### Campo `reason` na Auditoria (Ajuste #3)

Os GC jobs JÁ registram `reason` na auditoria:
- `MEMBERSHIP_PENDING_PAYMENT_CLEANUP`: `reason: 'payment_timeout'`
- `MEMBERSHIP_ABANDONED_CLEANUP`: `reason: 'DRAFT status for more than 24 hours...'`

Isso permite validar se um CANCELLED é elegível para retry via consulta no audit_logs.

---

## Tarefas de Implementação

### Tarefa 1: Criar Edge Function `retry-membership-payment`

**Arquivo:** `supabase/functions/retry-membership-payment/index.ts`

```typescript
/**
 * retry-membership-payment
 * 
 * Allows a CANCELLED membership to retry payment.
 * 
 * SAFE GOLD Rules:
 * - ONLY works for status === CANCELLED && payment_status === NOT_PAID
 * - ONLY for cancellations due to payment_timeout (verified via audit_logs)
 * - Creates NEW Stripe checkout session
 * - Updates status → PENDING_PAYMENT
 * - Does NOT create new membership
 * - Does NOT delete anything
 * - 100% auditable
 * 
 * SECURITY:
 * - Validates tenant boundary (membership.tenant_id must match tenant from tenantSlug)
 * - Validates ownership (applicant_profile_id === current user OR athlete.profile_id === current user)
 * - Rate limiting (3 per 10min per membership, 10 per hour per IP)
 * - CAPTCHA validation (Cloudflare Turnstile)
 * 
 * TRANSACTIONAL SAFETY:
 * - If Stripe session creation fails AFTER status update → ROLLBACK status to CANCELLED
 * - Logs MEMBERSHIP_PAYMENT_RETRY_FAILED on rollback
 */
```

**Fluxo Completo:**

```text
┌─────────────────────────────────────────────────────────────┐
│ 1. CORS Preflight                                           │
├─────────────────────────────────────────────────────────────┤
│ 2. Rate Limiting (IP: 10/hour, membership: 3/10min)         │
├─────────────────────────────────────────────────────────────┤
│ 3. CAPTCHA Validation (Turnstile)                           │
├─────────────────────────────────────────────────────────────┤
│ 4. Parse Input & Validate UUIDs                             │
├─────────────────────────────────────────────────────────────┤
│ 5. Fetch Membership with Tenant                             │
│    → Validates: status === CANCELLED                        │
│    → Validates: payment_status === NOT_PAID                 │
│    → Validates: membership.tenant.slug === tenantSlug       │ ← AJUSTE #2
├─────────────────────────────────────────────────────────────┤
│ 6. Validate Ownership                                        │ ← AJUSTE #2
│    → applicant_profile_id === currentUser.id                │
│    → OR athlete.profile_id === currentUser.id               │
├─────────────────────────────────────────────────────────────┤
│ 7. Verify Cancellation Reason (audit_logs)                  │ ← AJUSTE #3
│    → Must be from GC job (payment_timeout or abandoned)     │
│    → NOT from manual invalidation                           │
├─────────────────────────────────────────────────────────────┤
│ 8. Store Previous Session ID                                │ ← AJUSTE #4
│    → previous_stripe_session_id = membership.stripe_*       │
├─────────────────────────────────────────────────────────────┤
│ 9. Race-safe Update: status → PENDING_PAYMENT               │
│    → WHERE id = :id AND status = 'CANCELLED'                │
│    → If rowCount === 0 → abort (race condition)             │
├─────────────────────────────────────────────────────────────┤
│ 10. TRY: Create Stripe Checkout Session                     │
│     → On SUCCESS: Update stripe_checkout_session_id         │
│     → On FAILURE: ROLLBACK (status → CANCELLED)             │ ← AJUSTE #1
├─────────────────────────────────────────────────────────────┤
│ 11. Audit: MEMBERSHIP_PAYMENT_RETRY                          │
│     → Includes previous_stripe_session_id                   │ ← AJUSTE #4
│     → Includes new_stripe_session_id                        │
├─────────────────────────────────────────────────────────────┤
│ 12. Return Checkout URL                                      │
└─────────────────────────────────────────────────────────────┘
```

---

### Tarefa 2: Adicionar Eventos ao `audit-logger.ts`

**Arquivo:** `supabase/functions/_shared/audit-logger.ts`

Adicionar após linha 25:

```typescript
MEMBERSHIP_PAYMENT_RETRY: 'MEMBERSHIP_PAYMENT_RETRY',
MEMBERSHIP_PAYMENT_RETRY_FAILED: 'MEMBERSHIP_PAYMENT_RETRY_FAILED',
```

**Estrutura do Evento de Sucesso:**
```json
{
  "event_type": "MEMBERSHIP_PAYMENT_RETRY",
  "tenant_id": "uuid",
  "metadata": {
    "membership_id": "uuid",
    "previous_status": "CANCELLED",
    "new_status": "PENDING_PAYMENT",
    "payment_status": "NOT_PAID",
    "previous_stripe_session_id": "cs_old_xxx",
    "new_stripe_session_id": "cs_new_xxx",
    "cancellation_reason": "payment_timeout",
    "automatic": false,
    "source": "user_retry",
    "ip_address": "x.x.x.x"
  }
}
```

**Estrutura do Evento de Falha (AJUSTE #1):**
```json
{
  "event_type": "MEMBERSHIP_PAYMENT_RETRY_FAILED",
  "tenant_id": "uuid",
  "metadata": {
    "membership_id": "uuid",
    "reason": "stripe_session_creation_failed",
    "stripe_error": "Error message from Stripe",
    "rolled_back": true,
    "previous_status": "CANCELLED",
    "attempted_status": "PENDING_PAYMENT",
    "rollback_status": "CANCELLED",
    "ip_address": "x.x.x.x"
  }
}
```

---

### Tarefa 3: Registrar Função no `config.toml`

**Arquivo:** `supabase/config.toml`

```toml
[functions.retry-membership-payment]
verify_jwt = false
```

---

### Tarefa 4: Atualizar `MembershipStatus.tsx` (com Ajuste #5)

**Arquivo:** `src/pages/MembershipStatus.tsx`

**4.1 Atualizar interface `MembershipData`:**

```typescript
interface MembershipData {
  id: string;
  status: MembershipStatusValue;
  payment_status: 'PAID' | 'NOT_PAID' | null;
  created_at: string;
  rejection_reason?: string | null;
}
```

**4.2 Atualizar query para incluir `payment_status`:**

```typescript
.select('id, status, payment_status, created_at, rejection_reason')
```

**4.3 Adicionar estados para controle de retry (AJUSTE #5):**

```typescript
const [isRetrying, setIsRetrying] = useState(false);
const [captchaToken, setCaptchaToken] = useState<string | null>(null);
const [retryError, setRetryError] = useState<string | null>(null);
const [retryInitiated, setRetryInitiated] = useState(false); // AJUSTE #5

// Determinar se pode fazer retry (CANCELLED + NOT_PAID + não iniciado)
const canRetryPayment = 
  status === 'CANCELLED' && 
  membership.payment_status === 'NOT_PAID' &&
  !retryInitiated; // AJUSTE #5
```

**4.4 Handler de retry com bloqueio de double-click (AJUSTE #5):**

```typescript
const handleRetryPayment = async () => {
  // Prevenir double-click (AJUSTE #5)
  if (isRetrying || retryInitiated) {
    return;
  }
  
  if (!captchaToken) {
    toast.error(t('membership.errorCaptchaRequired'));
    return;
  }
  
  setIsRetrying(true);
  setRetryError(null);
  
  try {
    const { data, error } = await supabase.functions.invoke(
      'retry-membership-payment',
      {
        body: {
          membershipId: membership.id,
          tenantSlug,
          successUrl: `${window.location.origin}/${tenantSlug}/membership/success`,
          cancelUrl: `${window.location.origin}/${tenantSlug}/membership/status`,
          captchaToken,
        },
      }
    );
    
    if (error || data?.error) {
      const errorMsg = data?.error || error?.message || 'Unknown error';
      
      // Verificar se retry já foi iniciado por outro clique (AJUSTE #5)
      if (errorMsg.includes('status_changed') || errorMsg.includes('already_pending')) {
        setRetryInitiated(true);
        toast.info(t('membership.retryAlreadyInitiated'));
        return;
      }
      
      throw new Error(errorMsg);
    }
    
    if (!data?.url) {
      throw new Error('No checkout URL returned');
    }
    
    // Marcar como iniciado antes de redirecionar (AJUSTE #5)
    setRetryInitiated(true);
    window.location.href = data.url;
    
  } catch (err) {
    console.error('Retry payment error:', err);
    const errorMessage = err instanceof Error ? err.message : 'Failed to retry payment';
    setRetryError(errorMessage);
    toast.error(t('membership.errorPaymentSession'));
  } finally {
    setIsRetrying(false);
  }
};
```

**4.5 UI com mensagem de retry já iniciado (AJUSTE #5):**

```tsx
{canRetryPayment && !retryInitiated && (
  <div className="space-y-4">
    <div className="bg-warning/10 border border-warning/20 rounded-lg p-4 text-sm text-left">
      <p className="font-medium text-warning mb-1">
        {t('membership.retryPaymentTitle')}
      </p>
      <p className="text-muted-foreground">
        {t('membership.retryPaymentDesc')}
      </p>
    </div>
    
    <TurnstileWidget
      onSuccess={(token) => setCaptchaToken(token)}
      onExpire={() => setCaptchaToken(null)}
    />
    
    <Button
      className="w-full"
      size="lg"
      onClick={handleRetryPayment}
      disabled={isRetrying || !captchaToken}
    >
      {isRetrying ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          {t('common.loading')}
        </>
      ) : (
        <>
          <CreditCard className="h-4 w-4 mr-2" />
          {t('membership.retryPayment')}
        </>
      )}
    </Button>
    
    {retryError && (
      <p className="text-sm text-destructive text-center">{retryError}</p>
    )}
  </div>
)}

{/* Mensagem quando retry já foi iniciado (AJUSTE #5) */}
{retryInitiated && (
  <div className="bg-info/10 border border-info/20 rounded-lg p-4 text-sm text-center">
    <p className="text-info font-medium">{t('membership.retryAlreadyInitiated')}</p>
  </div>
)}
```

---

### Tarefa 5: Adicionar Traduções (i18n)

**Arquivo:** `src/locales/pt-BR.ts`

```typescript
'membership.retryPayment': 'Tentar pagamento novamente',
'membership.retryPaymentTitle': 'Pagamento não concluído',
'membership.retryPaymentDesc': 'Seu pagamento anterior não foi finalizado. Você pode tentar novamente sem perder seus dados.',
'membership.retryAlreadyInitiated': 'Uma nova tentativa de pagamento já foi iniciada.',
'membership.errorCaptchaRequired': 'Verificação de segurança necessária.',
'membership.errorPaymentSession': 'Erro ao iniciar pagamento. Tente novamente.',
```

**Arquivo:** `src/locales/en.ts`

```typescript
'membership.retryPayment': 'Retry payment',
'membership.retryPaymentTitle': 'Payment not completed',
'membership.retryPaymentDesc': 'Your previous payment was not completed. You can try again without losing your data.',
'membership.retryAlreadyInitiated': 'A new payment attempt has already been initiated.',
'membership.errorCaptchaRequired': 'Security verification required.',
'membership.errorPaymentSession': 'Error starting payment. Please try again.',
```

**Arquivo:** `src/locales/es.ts`

```typescript
'membership.retryPayment': 'Reintentar pago',
'membership.retryPaymentTitle': 'Pago no completado',
'membership.retryPaymentDesc': 'Tu pago anterior no fue completado. Puedes intentarlo de nuevo sin perder tus datos.',
'membership.retryAlreadyInitiated': 'Ya se ha iniciado un nuevo intento de pago.',
'membership.errorCaptchaRequired': 'Verificación de seguridad necesaria.',
'membership.errorPaymentSession': 'Error al iniciar el pago. Inténtalo de nuevo.',
```

---

### Tarefa 6: Atualizar Documentação

**Arquivo:** `docs/BUSINESS-FLOWS.md`

```markdown
### Retry de Pagamento (Membership)

Permite que uma filiação cancelada por timeout volte ao fluxo de pagamento 
sem criar nova membership.

```text
┌─────────────────────────────────────────────────────────────────┐
│                    CANCELLED + NOT_PAID                         │
│                  (cancellation_reason: payment_timeout)         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (usuário clica "Tentar novamente")
┌─────────────────────────────────────────────────────────────────┐
│                  retry-membership-payment                        │
│                                                                  │
│  Validações:                                                     │
│  ✓ status === CANCELLED                                          │
│  ✓ payment_status === NOT_PAID                                   │
│  ✓ tenant boundary (membership.tenant.slug === tenantSlug)       │
│  ✓ ownership (applicant_profile_id === currentUser.id)           │
│  ✓ cancellation_reason === 'payment_timeout' (via audit_logs)   │
│                                                                  │
│  Fluxo:                                                          │
│  1. UPDATE status → PENDING_PAYMENT (race-safe)                  │
│  2. CREATE Stripe Checkout Session                               │
│     → On failure: ROLLBACK status → CANCELLED                   │
│  3. UPDATE stripe_checkout_session_id                            │
│  4. LOG MEMBERSHIP_PAYMENT_RETRY                                 │
│                                                                  │
│  Auditoria:                                                      │
│  • previous_stripe_session_id                                    │
│  • new_stripe_session_id                                         │
│  • cancellation_reason                                           │
│  • rolled_back (se aplicável)                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      PENDING_PAYMENT                             │
│                (com nova Stripe session)                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (pagamento confirmado)
┌─────────────────────────────────────────────────────────────────┐
│                   PENDING_REVIEW + PAID                          │
└─────────────────────────────────────────────────────────────────┘
```

**Princípios SAFE GOLD:**
- ❌ NÃO cria nova membership
- ❌ NÃO apaga histórico
- ❌ NÃO toca em memberships pagas
- ❌ NÃO permite retry de cancelamentos manuais
- ✅ Rollback transacional se Stripe falhar
- ✅ Validação de tenant boundary
- ✅ Validação de ownership
- ✅ Versionamento de session IDs
- ✅ Mantém auditabilidade completa
```

---

## Arquivos Modificados

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `supabase/functions/retry-membership-payment/index.ts` | **CRIAR** | Edge Function com todos os ajustes |
| `supabase/functions/_shared/audit-logger.ts` | **MODIFICAR** | Adicionar 2 eventos |
| `supabase/config.toml` | **MODIFICAR** | Registrar função |
| `src/pages/MembershipStatus.tsx` | **MODIFICAR** | UI de retry com ajuste #5 |
| `src/locales/pt-BR.ts` | **ADICIONAR** | 6 novas chaves |
| `src/locales/en.ts` | **ADICIONAR** | 6 novas chaves |
| `src/locales/es.ts` | **ADICIONAR** | 6 novas chaves |
| `docs/BUSINESS-FLOWS.md` | **ADICIONAR** | Documentar fluxo completo |

---

## Critérios de Aceitação (Atualizado)

### Funcionalidade Core
- [ ] Retry só funciona para `CANCELLED + NOT_PAID`
- [ ] Nenhuma membership paga é afetada
- [ ] Nova Stripe session criada
- [ ] Mesmo `membership_id` mantido

### Ajuste #1 — Rollback Transacional
- [ ] Se Stripe falhar após UPDATE → status volta para CANCELLED
- [ ] Evento `MEMBERSHIP_PAYMENT_RETRY_FAILED` registrado
- [ ] Metadata inclui `rolled_back: true`

### Ajuste #2 — Tenant Boundary & Ownership
- [ ] Retorna 403 se tenant não corresponde
- [ ] Retorna 403 se usuário não é owner da membership
- [ ] Validação ocorre ANTES de qualquer UPDATE

### Ajuste #3 — Proteção contra CANCELLED não-pagamento
- [ ] Verifica `reason: 'payment_timeout'` no audit_logs
- [ ] Retorna 400 se cancelamento não foi por timeout

### Ajuste #4 — Versionamento de Session ID
- [ ] Auditoria inclui `previous_stripe_session_id`
- [ ] Auditoria inclui `new_stripe_session_id`

### Ajuste #5 — UI Anti Double-Click
- [ ] Estado `retryInitiated` bloqueia botão após primeiro clique
- [ ] Mensagem "Uma nova tentativa já foi iniciada" exibida
- [ ] Tratamento de erro `status_changed` no response

### Segurança & Governança
- [ ] Rate limiting aplicado (IP + membership)
- [ ] CAPTCHA obrigatório
- [ ] Auditoria completa registrada
- [ ] Documentação atualizada

---

## Seção Técnica

### Pseudocódigo da Edge Function

```typescript
// === AJUSTE #2: Tenant Boundary Validation ===
const { data: membership } = await supabase
  .from("memberships")
  .select("*, tenant:tenants(*), athlete:athletes(*)")
  .eq("id", membershipId)
  .single();

if (!membership) {
  return error(404, "Membership not found");
}

// Tenant boundary check
if (membership.tenant.slug !== tenantSlug) {
  return error(403, "FORBIDDEN_CROSS_TENANT");
}

// Ownership check
const isOwner = 
  membership.applicant_profile_id === userId ||
  membership.athlete?.profile_id === userId;

if (!isOwner) {
  return error(403, "FORBIDDEN_NOT_OWNER");
}

// Status validation
if (membership.status !== "CANCELLED" || membership.payment_status !== "NOT_PAID") {
  return error(400, "MEMBERSHIP_NOT_ELIGIBLE_FOR_RETRY");
}

// === AJUSTE #3: Cancellation Reason Validation ===
const { data: cancelLog } = await supabase
  .from("audit_logs")
  .select("metadata")
  .eq("tenant_id", membership.tenant_id)
  .in("event_type", ["MEMBERSHIP_PENDING_PAYMENT_CLEANUP", "MEMBERSHIP_ABANDONED_CLEANUP"])
  .eq("metadata->>membership_id", membershipId)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

const cancellationReason = cancelLog?.metadata?.reason;
const isPaymentTimeout = 
  cancellationReason === "payment_timeout" ||
  cancellationReason?.includes("DRAFT status");

if (!isPaymentTimeout) {
  return error(400, "RETRY_NOT_ALLOWED_FOR_MANUAL_CANCELLATION");
}

// === AJUSTE #4: Store Previous Session ID ===
const previousStripeSessionId = membership.stripe_checkout_session_id;

// === Race-safe Update ===
const { data: updateData, error: updateError } = await supabase
  .from("memberships")
  .update({ status: "PENDING_PAYMENT", updated_at: new Date().toISOString() })
  .eq("id", membershipId)
  .eq("status", "CANCELLED") // Race protection
  .select("id");

if (!updateData?.length) {
  return error(409, "STATUS_CHANGED_CONCURRENT_RETRY");
}

// === AJUSTE #1: Stripe with Rollback ===
let stripeSession;
try {
  stripeSession = await stripe.checkout.sessions.create({
    customer_email: customerEmail,
    line_items: [...],
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { membership_id: membershipId, ... },
  });
} catch (stripeError) {
  // ROLLBACK: Revert status to CANCELLED
  await supabase
    .from("memberships")
    .update({ status: "CANCELLED", updated_at: new Date().toISOString() })
    .eq("id", membershipId)
    .eq("status", "PENDING_PAYMENT");
  
  // Log failure
  await createAuditLog(supabase, {
    event_type: AUDIT_EVENTS.MEMBERSHIP_PAYMENT_RETRY_FAILED,
    tenant_id: membership.tenant_id,
    metadata: {
      membership_id: membershipId,
      reason: "stripe_session_creation_failed",
      stripe_error: stripeError.message,
      rolled_back: true,
      previous_status: "CANCELLED",
      attempted_status: "PENDING_PAYMENT",
      rollback_status: "CANCELLED",
      ip_address: clientIP,
    },
  });
  
  return error(500, "STRIPE_SESSION_FAILED");
}

// Update session ID
await supabase
  .from("memberships")
  .update({ stripe_checkout_session_id: stripeSession.id })
  .eq("id", membershipId);

// === AJUSTE #4: Audit with Session Versioning ===
await createAuditLog(supabase, {
  event_type: AUDIT_EVENTS.MEMBERSHIP_PAYMENT_RETRY,
  tenant_id: membership.tenant_id,
  metadata: {
    membership_id: membershipId,
    previous_status: "CANCELLED",
    new_status: "PENDING_PAYMENT",
    payment_status: "NOT_PAID",
    previous_stripe_session_id: previousStripeSessionId,
    new_stripe_session_id: stripeSession.id,
    cancellation_reason: cancellationReason,
    automatic: false,
    source: "user_retry",
    ip_address: clientIP,
  },
});

return { url: stripeSession.url };
```

### Rate Limiting

| Identificador | Limite | Janela |
|---------------|--------|--------|
| IP | 10 | 1 hora |
| membership_id | 3 | 10 min |

---

## Conclusão

Este plano atualizado incorpora **todos os 5 ajustes críticos** solicitados:

1. ✅ **Rollback Transacional** — Se Stripe falhar, status volta para CANCELLED com auditoria
2. ✅ **Tenant Boundary** — Validação explícita de tenant.slug === tenantSlug
3. ✅ **Cancellation Reason** — Verifica reason via audit_logs antes de permitir retry
4. ✅ **Session ID Versioning** — Auditoria inclui previous e new session IDs
5. ✅ **UI Anti Double-Click** — Estado `retryInitiated` + mensagem informativa

Com esses ajustes, o PI vira **referência de mercado** em governança e segurança.

