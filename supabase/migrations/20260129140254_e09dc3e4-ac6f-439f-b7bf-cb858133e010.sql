-- 1. Adicionar novos valores ao enum billing_status
ALTER TYPE billing_status ADD VALUE IF NOT EXISTS 'TRIAL_EXPIRED';
ALTER TYPE billing_status ADD VALUE IF NOT EXISTS 'PENDING_DELETE';

-- 2. Adicionar colunas de controle de trial em tenant_billing
ALTER TABLE tenant_billing 
ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS trial_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS scheduled_delete_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

-- 3. Tabela para auditoria LGPD de tenants deletados
CREATE TABLE IF NOT EXISTS deleted_tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_tenant_id UUID NOT NULL,
  tenant_slug TEXT NOT NULL,
  tenant_name TEXT NOT NULL,
  creator_email TEXT,
  billing_email TEXT,
  trial_started_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ DEFAULT NOW(),
  deletion_reason TEXT,
  metadata JSONB,
  athletes_count INTEGER,
  memberships_count INTEGER,
  events_count INTEGER
);

-- 4. RLS para deleted_tenants (somente leitura para superadmin)
ALTER TABLE deleted_tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can read deleted_tenants"
ON deleted_tenants FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role = 'SUPERADMIN_GLOBAL'
    AND tenant_id IS NULL
  )
);

-- 5. Atualizar tenants existentes em TRIALING com datas de trial
UPDATE tenant_billing tb
SET 
  trial_started_at = COALESCE(tb.created_at, NOW()),
  trial_expires_at = COALESCE(tb.current_period_end, NOW() + INTERVAL '7 days')
WHERE tb.status = 'TRIALING'
AND tb.trial_started_at IS NULL;