-- =====================================================
-- P1.2.B: Platform Landing Configuration Tables
-- SUPERADMIN ONLY — Institutional control for Landing Page
-- =====================================================

-- Tabela 1: Configuração da Landing (hero)
CREATE TABLE IF NOT EXISTS public.platform_landing_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hero_image_url text,
  hero_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Inserir registro padrão (único registro)
INSERT INTO public.platform_landing_config (id) 
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- Tabela 2: Parceiros / Logos
CREATE TABLE IF NOT EXISTS public.platform_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_url text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índice para ordenação
CREATE INDEX IF NOT EXISTS idx_platform_partners_order ON public.platform_partners(display_order);

-- =====================================================
-- RLS Policies
-- =====================================================

-- Habilitar RLS
ALTER TABLE public.platform_landing_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_partners ENABLE ROW LEVEL SECURITY;

-- SELECT público para platform_landing_config
CREATE POLICY "Public read platform_landing_config"
  ON public.platform_landing_config FOR SELECT
  USING (true);

-- SELECT público apenas para parceiros ativos
CREATE POLICY "Public read active platform_partners"
  ON public.platform_partners FOR SELECT
  USING (is_active = true);

-- INSERT/UPDATE/DELETE apenas SUPERADMIN para platform_landing_config
CREATE POLICY "Superadmin manage platform_landing_config"
  ON public.platform_landing_config FOR ALL
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

-- INSERT/UPDATE/DELETE apenas SUPERADMIN para platform_partners
CREATE POLICY "Superadmin manage platform_partners"
  ON public.platform_partners FOR ALL
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());