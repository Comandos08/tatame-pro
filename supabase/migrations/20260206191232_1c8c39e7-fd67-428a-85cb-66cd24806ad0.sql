-- ============================================================================
-- P2.HOTFIX — WIZARD ORGANIZATION CREATION SUPPORT
-- ============================================================================
-- Adiciona campos para rastrear origem e status de setup de tenants.
-- Isso permite que tenants criados via Wizard entrem em estado SETUP
-- antes de completar o onboarding sem interferir em billing.
-- ============================================================================

-- Adicionar campo creation_source para rastrear origem do tenant
ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS creation_source TEXT NOT NULL DEFAULT 'admin' 
  CHECK (creation_source IN ('admin', 'wizard', 'migration'));

-- Adicionar campo status para estado do tenant
-- 'SETUP' = tenant criado via wizard, ainda em configuração inicial
-- 'ACTIVE' = tenant totalmente configurado e operacional
-- 'SUSPENDED' = tenant suspenso por questões de billing ou administrativa
ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE'
  CHECK (status IN ('SETUP', 'ACTIVE', 'SUSPENDED'));

-- Comentários para documentação
COMMENT ON COLUMN public.tenants.creation_source IS 'Origem da criação do tenant: admin (painel), wizard (self-service), migration (script)';
COMMENT ON COLUMN public.tenants.status IS 'Status do tenant: SETUP (configuração inicial), ACTIVE (operacional), SUSPENDED (suspenso)';