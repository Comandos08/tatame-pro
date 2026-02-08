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

COMMENT ON TABLE public.billing_environment_config IS 'PI-BILL-ENV-001: Single-row config for Stripe environment (test/live). Immutable at runtime.';

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

COMMENT ON TABLE public.subscription_plans IS 'PI-BILL-ENV-001: Subscription plans with separate price IDs for test/live Stripe environments.';
COMMENT ON COLUMN public.subscription_plans.stripe_price_id_test IS 'Stripe Price ID for TEST environment (sk_test_*)';
COMMENT ON COLUMN public.subscription_plans.stripe_price_id_live IS 'Stripe Price ID for LIVE environment (sk_live_*)';