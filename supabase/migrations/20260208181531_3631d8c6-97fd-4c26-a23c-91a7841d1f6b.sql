-- PI-POL-001A: Contrato Canônico de Oficialidade (DATA LAYER)
-- STATUS: SAFE GOLD • APENAS DDL • ZERO IMPACTO FUNCIONAL

-- ============================================================================
-- 1. COLUNA is_official EM athlete_gradings
-- ============================================================================
ALTER TABLE public.athlete_gradings 
ADD COLUMN IF NOT EXISTS is_official BOOLEAN NOT NULL DEFAULT false;

-- ============================================================================
-- 2. COLUNA is_official EM diplomas
-- ============================================================================
ALTER TABLE public.diplomas 
ADD COLUMN IF NOT EXISTS is_official BOOLEAN NOT NULL DEFAULT false;

-- ============================================================================
-- 3. ÍNDICES PARA LEITURA/RELATÓRIOS
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_athlete_gradings_is_official 
ON public.athlete_gradings (is_official);

CREATE INDEX IF NOT EXISTS idx_diplomas_is_official 
ON public.diplomas (is_official);

-- ============================================================================
-- 4. DOCUMENTAÇÃO INLINE (OBRIGATÓRIA)
-- ============================================================================
COMMENT ON COLUMN public.athlete_gradings.is_official IS
'PI-POL-001A: Snapshot imutável da oficialidade no momento da graduação. false=não oficial, true=reconhecida institucionalmente.';

COMMENT ON COLUMN public.diplomas.is_official IS
'PI-POL-001A: Snapshot imutável da oficialidade no momento da emissão. false=não oficial, true=institucionalmente válido.';