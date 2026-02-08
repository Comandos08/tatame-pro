

# PI-BILL-ENV-001 — Governança Determinística de Ambiente Stripe (FINAL)

## Resumo Executivo

Este PI implementa uma camada de governança explícita para billing Stripe garantindo que:
- A Edge Function **nunca** tente usar um `price_id` LIVE com `sk_test` (ou o inverso)
- Toda criação/alteração de assinatura é **determinística**, fail-closed e auditável
- O ambiente Stripe é um **contrato do sistema** (não uma suposição)
- Erros de configuração retornam HTTP 200 com `error_code` estável

---

## Ajustes Incorporados (15/15)

| Ajuste | Descrição | Implementação |
|--------|-----------|---------------|
| **Ajuste 1** | Diferenciar audit de BILLING_KEY_UNKNOWN | Evento separado `BILLING_KEY_UNKNOWN_BLOCKED` |
| **Ajuste 2** | Preflight opcional via feature flag | `ENABLE_STRIPE_PREFLIGHT=true` para habilitar |
| **Ajuste 3** | Proteção contra múltiplos rows no singleton | Log WARN se houver > 1 row |

---

## Escopo de Modificações (7 arquivos + 1 migração)

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| SQL Migration | CREATE | Tabelas `billing_environment_config` e `subscription_plans` |
| `supabase/functions/_shared/stripeEnv.ts` | CREATE | Helper de validação de ambiente |
| `supabase/functions/_shared/audit-logger.ts` | MODIFY | 6 novos eventos de billing env |
| `supabase/functions/create-tenant-subscription/index.ts` | MODIFY | Pre-flight checks + guardrails |
| `src/locales/pt-BR.ts` | MODIFY | Mensagens de erro env mismatch |
| `src/locales/en.ts` | MODIFY | Mensagens de erro env mismatch |
| `src/locales/es.ts` | MODIFY | Mensagens de erro env mismatch |

---

## 1. Migração SQL

```sql
-- PI-BILL-ENV-001: Global billing environment config (singleton)
CREATE TABLE IF NOT EXISTS public.billing_environment_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_env text NOT NULL CHECK (stripe_env IN ('test', 'live')) DEFAULT 'test',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enforce single-row semantics
CREATE UNIQUE INDEX IF NOT EXISTS billing_environment_config_singleton
ON public.billing_environment_config ((true));

-- Seed default to 'test' (SAFE GOLD: mais seguro)
INSERT INTO public.billing_environment_config (stripe_env)
SELECT 'test'
WHERE NOT EXISTS (SELECT 1 FROM public.billing_environment_config);

-- RLS: Apenas leitura para service role
ALTER TABLE public.billing_environment_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can read billing_environment_config"
ON public.billing_environment_config FOR SELECT
TO service_role
USING (true);

-- PI-BILL-ENV-001: Subscription plans with environment-aware price IDs
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  stripe_price_id_test text NULL,
  stripe_price_id_live text NULL,
  is_active boolean NOT NULL DEFAULT true,
  billing_interval text NOT NULL CHECK (billing_interval IN ('monthly', 'annual')) DEFAULT 'annual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_active ON public.subscription_plans (is_active);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_code ON public.subscription_plans (code);

-- Seed initial plans with known price IDs (LIVE only, TEST null)
INSERT INTO public.subscription_plans (code, name, billing_interval, stripe_price_id_test, stripe_price_id_live) VALUES
  ('FEDERATION_MONTHLY', 'Plano Federação Mensal', 'monthly', NULL, 'price_1SrOU8HH533PC5Ddq3h54ooX'),
  ('FEDERATION_ANNUAL', 'Plano Federação Anual', 'annual', NULL, 'price_1SrPnhHH533PC5DdmXxmsrRk')
ON CONFLICT (code) DO NOTHING;

-- RLS: Service role only
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can read subscription_plans"
ON public.subscription_plans FOR SELECT
TO service_role
USING (true);
```

---

## 2. Helper `stripeEnv.ts` (CREATE)

### Interface

```typescript
export type StripeEnv = 'test' | 'live';

export interface EnvValidationResult {
  ok: true;
  keyEnv: StripeEnv;
  configEnv: StripeEnv;
} | {
  ok: false;
  error_code: 'BILLING_ENV_MISMATCH' | 'BILLING_KEY_UNKNOWN' | 'BILLING_CONFIG_MISSING';
  keyEnv: StripeEnv | 'unknown';
  configEnv: StripeEnv | null;
  message: string;
}

export interface PriceResolutionResult {
  ok: true;
  priceId: string;
  planCode: string;
  planName: string;
} | {
  ok: false;
  error_code: 'BILLING_PRICE_NOT_CONFIGURED' | 'BILLING_PLAN_NOT_FOUND';
  message: string;
}

// Ajuste 1: Separate error codes for diagnostic granularity
export function inferKeyEnv(secretKey: string): StripeEnv | 'unknown';

// Ajuste 3: Logs WARN if multiple rows in singleton
export async function getStripeEnvConfig(supabase): Promise<StripeEnv | null>;

export async function validateStripeEnv(supabase, secretKey): Promise<EnvValidationResult>;

export async function resolvePriceId(supabase, planType, stripeEnv): Promise<PriceResolutionResult>;

// Ajuste 2: Feature flag for preflight
export function isPreflightEnabled(): boolean;
```

### Implementação com Ajustes

```typescript
// Ajuste 3: Defensive singleton check
export async function getStripeEnvConfig(supabase): Promise<StripeEnv | null> {
  const { data, error } = await supabase
    .from('billing_environment_config')
    .select('stripe_env')
    .limit(2);  // Fetch 2 to detect corruption
  
  if (!data || data.length === 0) return null;
  
  // Ajuste 3: Log WARN if corrupted
  if (data.length > 1) {
    console.warn(
      '[STRIPE-ENV] ⚠️ SINGLETON CORRUPTION: billing_environment_config has multiple rows. ' +
      'Expected 1, found ' + data.length + '. Using first row.'
    );
  }
  
  return data[0].stripe_env as StripeEnv;
}

// Ajuste 2: Feature flag for preflight
export function isPreflightEnabled(): boolean {
  return Deno.env.get('ENABLE_STRIPE_PREFLIGHT') === 'true';
}
```

---

## 3. Novos Eventos de Audit (Ajuste 1)

Adicionar ao `AUDIT_EVENTS` em `audit-logger.ts`:

```typescript
// Billing environment governance (PI-BILL-ENV-001)
BILLING_ENV_MISMATCH_BLOCKED: 'BILLING_ENV_MISMATCH_BLOCKED',
BILLING_KEY_UNKNOWN_BLOCKED: 'BILLING_KEY_UNKNOWN_BLOCKED',  // Ajuste 1: Separado
BILLING_CONFIG_MISSING_BLOCKED: 'BILLING_CONFIG_MISSING_BLOCKED',
BILLING_PRICE_NOT_CONFIGURED_BLOCKED: 'BILLING_PRICE_NOT_CONFIGURED_BLOCKED',
BILLING_STRIPE_PRICE_LOOKUP_FAILED: 'BILLING_STRIPE_PRICE_LOOKUP_FAILED',
BILLING_ENV_VALIDATED: 'BILLING_ENV_VALIDATED',
```

---

## 4. Edge Function `create-tenant-subscription/index.ts`

### 4.1 Adicionar Imports

```typescript
import { 
  validateStripeEnv, 
  resolvePriceId, 
  isPreflightEnabled 
} from "../_shared/stripeEnv.ts";
import { createAuditLog, AUDIT_EVENTS } from "../_shared/audit-logger.ts";
```

### 4.2 Remover `getPriceId` Hardcoded

Remover linhas 14-27 (funções `getPriceId` e `getPlanName`)

### 4.3 Inserir Pre-flight Validation (após linha 99)

```typescript
// ─────────────────────────────────────────────────────────────
// PI-BILL-ENV-001 — STRIPE ENVIRONMENT VALIDATION (PRE-FLIGHT)
// Contract: HTTP 200 always. Fail-closed on any env mismatch.
// ─────────────────────────────────────────────────────────────

const envValidation = await validateStripeEnv(supabase, stripeSecretKey);

if (!envValidation.ok) {
  logStep("Environment validation failed", { 
    error_code: envValidation.error_code,
    keyEnv: envValidation.keyEnv,
    configEnv: envValidation.configEnv
  });
  
  // Ajuste 1: Map error_code to specific audit event
  let auditEvent = AUDIT_EVENTS.BILLING_ENV_MISMATCH_BLOCKED;
  if (envValidation.error_code === 'BILLING_KEY_UNKNOWN') {
    auditEvent = AUDIT_EVENTS.BILLING_KEY_UNKNOWN_BLOCKED;
  } else if (envValidation.error_code === 'BILLING_CONFIG_MISSING') {
    auditEvent = AUDIT_EVENTS.BILLING_CONFIG_MISSING_BLOCKED;
  }
  
  await createAuditLog(supabase, {
    event_type: auditEvent,
    tenant_id: tenantId,
    metadata: {
      error_code: envValidation.error_code,
      key_env: envValidation.keyEnv,
      config_env: envValidation.configEnv,
      plan_type: planType || 'annual',
      decision: 'BLOCKED',
      source: 'create-tenant-subscription'
    }
  });
  
  return new Response(
    JSON.stringify({
      success: false,
      error_code: envValidation.error_code,
      message: envValidation.message
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
  );
}

logStep("Environment validation passed", { 
  keyEnv: envValidation.keyEnv, 
  configEnv: envValidation.configEnv 
});
```

### 4.4 Resolver Price ID via Banco

```typescript
// ─────────────────────────────────────────────────────────────
// PI-BILL-ENV-001 — RESOLVE PRICE ID FROM DATABASE
// ─────────────────────────────────────────────────────────────

const priceResolution = await resolvePriceId(
  supabase, 
  planType || 'annual', 
  envValidation.configEnv
);

if (!priceResolution.ok) {
  logStep("Price resolution failed", { 
    error_code: priceResolution.error_code,
    planType: planType || 'annual',
    stripeEnv: envValidation.configEnv
  });
  
  await createAuditLog(supabase, {
    event_type: AUDIT_EVENTS.BILLING_PRICE_NOT_CONFIGURED_BLOCKED,
    tenant_id: tenantId,
    metadata: {
      error_code: priceResolution.error_code,
      plan_type: planType || 'annual',
      stripe_env: envValidation.configEnv,
      decision: 'BLOCKED',
      source: 'create-tenant-subscription'
    }
  });
  
  return new Response(
    JSON.stringify({
      success: false,
      error_code: priceResolution.error_code,
      message: priceResolution.message
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
  );
}

const priceId = priceResolution.priceId;
const planName = priceResolution.planName;

logStep("Price resolved from database", { 
  priceId, 
  planName, 
  planCode: priceResolution.planCode 
});
```

### 4.5 Preflight Price Check (Ajuste 2: Condicional)

```typescript
// ─────────────────────────────────────────────────────────────
// PI-BILL-ENV-001 — PREFLIGHT: VERIFY PRICE EXISTS IN STRIPE
// Ajuste 2: Controlled by ENABLE_STRIPE_PREFLIGHT feature flag
// ─────────────────────────────────────────────────────────────

if (isPreflightEnabled()) {
  try {
    await stripe.prices.retrieve(priceId);
    logStep("Preflight price check passed", { priceId });
  } catch (priceError: unknown) {
    const errorMessage = priceError instanceof Error ? priceError.message : String(priceError);
    
    logStep("Preflight price check failed", { priceId, error: errorMessage });
    
    await createAuditLog(supabase, {
      event_type: AUDIT_EVENTS.BILLING_STRIPE_PRICE_LOOKUP_FAILED,
      tenant_id: tenantId,
      metadata: {
        price_id: priceId,
        stripe_env: envValidation.configEnv,
        plan_type: planType || 'annual',
        error: errorMessage,
        decision: 'BLOCKED',
        source: 'create-tenant-subscription'
      }
    });
    
    return new Response(
      JSON.stringify({
        success: false,
        error_code: 'BILLING_STRIPE_PRICE_NOT_FOUND',
        message: 'Stripe price not found in current environment. Check billing configuration.'
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  }
} else {
  logStep("Preflight price check skipped (ENABLE_STRIPE_PREFLIGHT not set)");
}
```

---

## 5. i18n — Mensagens de Erro

### pt-BR.ts

```typescript
// PI-BILL-ENV-001 — Billing Environment Governance
'billing.env.mismatch.title': 'Ambiente de cobrança inconsistente',
'billing.env.mismatch.desc': 'O sistema detectou uma inconsistência entre a chave Stripe e a configuração de ambiente.',
'billing.env.keyUnknown.title': 'Chave Stripe não reconhecida',
'billing.env.keyUnknown.desc': 'A chave Stripe configurada não possui formato válido (esperado sk_test_* ou sk_live_*).',
'billing.env.configMissing.title': 'Configuração de ambiente ausente',
'billing.env.configMissing.desc': 'A configuração de ambiente de cobrança não foi encontrada no sistema.',
'billing.env.priceNotConfigured.title': 'Preço não configurado',
'billing.env.priceNotConfigured.desc': 'O plano selecionado não possui preço configurado para o ambiente atual.',
'billing.env.priceNotFound.title': 'Preço não encontrado no Stripe',
'billing.env.priceNotFound.desc': 'O preço configurado não existe no ambiente Stripe atual.',
```

### en.ts

```typescript
// PI-BILL-ENV-001 — Billing Environment Governance
'billing.env.mismatch.title': 'Billing environment mismatch',
'billing.env.mismatch.desc': 'The system detected an inconsistency between the Stripe key and environment configuration.',
'billing.env.keyUnknown.title': 'Stripe key not recognized',
'billing.env.keyUnknown.desc': 'The configured Stripe key does not have a valid format (expected sk_test_* or sk_live_*).',
'billing.env.configMissing.title': 'Environment configuration missing',
'billing.env.configMissing.desc': 'The billing environment configuration was not found in the system.',
'billing.env.priceNotConfigured.title': 'Price not configured',
'billing.env.priceNotConfigured.desc': 'The selected plan has no price configured for the current environment.',
'billing.env.priceNotFound.title': 'Price not found in Stripe',
'billing.env.priceNotFound.desc': 'The configured price does not exist in the current Stripe environment.',
```

### es.ts

```typescript
// PI-BILL-ENV-001 — Billing Environment Governance
'billing.env.mismatch.title': 'Entorno de facturación inconsistente',
'billing.env.mismatch.desc': 'El sistema detectó una inconsistencia entre la clave Stripe y la configuración de entorno.',
'billing.env.keyUnknown.title': 'Clave Stripe no reconocida',
'billing.env.keyUnknown.desc': 'La clave Stripe configurada no tiene un formato válido (esperado sk_test_* o sk_live_*).',
'billing.env.configMissing.title': 'Configuración de entorno ausente',
'billing.env.configMissing.desc': 'La configuración de entorno de facturación no fue encontrada en el sistema.',
'billing.env.priceNotConfigured.title': 'Precio no configurado',
'billing.env.priceNotConfigured.desc': 'El plan seleccionado no tiene precio configurado para el entorno actual.',
'billing.env.priceNotFound.title': 'Precio no encontrado en Stripe',
'billing.env.priceNotFound.desc': 'El precio configurado no existe en el entorno Stripe actual.',
```

---

## Matriz de Error Codes (Contrato Final)

| Error Code | Quando | Audit Event (Ajuste 1) |
|------------|--------|------------------------|
| `BILLING_KEY_UNKNOWN` | Key vazia ou malformada | `BILLING_KEY_UNKNOWN_BLOCKED` |
| `BILLING_CONFIG_MISSING` | Tabela config vazia | `BILLING_CONFIG_MISSING_BLOCKED` |
| `BILLING_ENV_MISMATCH` | key env ≠ config env | `BILLING_ENV_MISMATCH_BLOCKED` |
| `BILLING_PLAN_NOT_FOUND` | Plano não existe | `BILLING_PRICE_NOT_CONFIGURED_BLOCKED` |
| `BILLING_PRICE_NOT_CONFIGURED` | price_id null para env | `BILLING_PRICE_NOT_CONFIGURED_BLOCKED` |
| `BILLING_STRIPE_PRICE_NOT_FOUND` | price.retrieve falha | `BILLING_STRIPE_PRICE_LOOKUP_FAILED` |

---

## Invariantes SAFE GOLD Garantidas

| Invariante | Como é Atendida |
|------------|-----------------|
| HTTP 200 sempre | Todos os returns usam status: 200 |
| Error codes estáveis | Enum fechado de error_code |
| Fail-closed | Qualquer inconsistência bloqueia |
| Zero side effects no bloqueio | Return antes de qualquer Stripe API call |
| Audit obrigatório | Todos os bloqueios geram audit log |
| Determinismo | Mesmos inputs = mesma decisão |
| Default seguro | `stripe_env` default = 'test' |
| Ajuste 1 | Eventos de audit granulares por tipo de erro |
| Ajuste 2 | Preflight condicional via feature flag |
| Ajuste 3 | Log WARN em singleton corrompido |

---

## Ordem de Execução

1. Executar migração SQL
2. Criar helper `_shared/stripeEnv.ts`
3. Atualizar `_shared/audit-logger.ts` com novos eventos
4. Atualizar `create-tenant-subscription/index.ts`
5. Deploy Edge Function
6. Atualizar locales (pt-BR, en, es)
7. Teste manual dos cenários A-D

