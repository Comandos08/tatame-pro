-- P2.4 — CHAVES / BRACKETS — "OFFICIAL SNAPSHOT + JUSTIFIED BRACKET"
-- Tables, triggers, RLS, indices for event brackets system

-- ============================================================================
-- 1.1 Nova Tabela: event_brackets
-- ============================================================================
CREATE TABLE public.event_brackets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  event_id uuid NOT NULL REFERENCES public.events(id),
  category_id uuid NOT NULL REFERENCES public.event_categories(id),
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED')),
  generated_by uuid REFERENCES public.profiles(id),
  generated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  notes text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, category_id, version)
);

-- ============================================================================
-- 1.2 Nova Tabela: event_bracket_matches
-- ============================================================================
CREATE TABLE public.event_bracket_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  bracket_id uuid NOT NULL REFERENCES public.event_brackets(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.event_categories(id),
  round integer NOT NULL CHECK (round > 0),
  position integer NOT NULL CHECK (position > 0),
  athlete1_registration_id uuid REFERENCES public.event_registrations(id),
  athlete2_registration_id uuid REFERENCES public.event_registrations(id),
  winner_registration_id uuid REFERENCES public.event_registrations(id),
  status text NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'COMPLETED', 'BYE')),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(bracket_id, round, position)
);

-- ============================================================================
-- 1.3 Índices
-- ============================================================================
CREATE INDEX idx_event_brackets_category ON event_brackets(category_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_event_brackets_event ON event_brackets(event_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_event_bracket_matches_bracket ON event_bracket_matches(bracket_id) WHERE deleted_at IS NULL;

-- ============================================================================
-- 1.4 Trigger de Imutabilidade (Ajuste B)
-- ============================================================================
CREATE OR REPLACE FUNCTION validate_bracket_immutability()
RETURNS TRIGGER AS $$
DECLARE
  v_bracket_status text;
BEGIN
  -- Para event_brackets: bloquear modificações em PUBLISHED
  IF TG_TABLE_NAME = 'event_brackets' THEN
    IF TG_OP = 'UPDATE' THEN
      -- Permitir apenas transição DRAFT→PUBLISHED
      IF OLD.status = 'PUBLISHED' THEN
        RAISE EXCEPTION 'Cannot modify published bracket';
      END IF;
      -- Permitir atualização se ainda DRAFT
      RETURN NEW;
    END IF;
    
    IF TG_OP = 'DELETE' THEN
      IF OLD.status = 'PUBLISHED' THEN
        RAISE EXCEPTION 'Cannot delete published bracket';
      END IF;
      RETURN OLD;
    END IF;
  END IF;

  -- Para event_bracket_matches
  IF TG_TABLE_NAME = 'event_bracket_matches' THEN
    SELECT status INTO v_bracket_status
    FROM event_brackets
    WHERE id = COALESCE(NEW.bracket_id, OLD.bracket_id);
    
    IF v_bracket_status = 'PUBLISHED' THEN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Cannot delete matches from published bracket';
      END IF;
      IF TG_OP = 'UPDATE' THEN
        -- P2.4: Bloquear tudo. P2.5+ permitirá winner_registration_id
        RAISE EXCEPTION 'Cannot modify matches in published bracket';
      END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

CREATE TRIGGER enforce_bracket_immutability
  BEFORE UPDATE OR DELETE ON event_brackets
  FOR EACH ROW EXECUTE FUNCTION validate_bracket_immutability();

CREATE TRIGGER enforce_bracket_match_immutability
  BEFORE UPDATE OR DELETE ON event_bracket_matches
  FOR EACH ROW EXECUTE FUNCTION validate_bracket_immutability();

-- ============================================================================
-- 1.5 RLS Policies
-- ============================================================================
ALTER TABLE event_brackets ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_bracket_matches ENABLE ROW LEVEL SECURITY;

-- event_brackets: Admin ALL
CREATE POLICY event_brackets_admin_all ON event_brackets
  FOR ALL USING (is_tenant_admin(tenant_id) OR is_superadmin())
  WITH CHECK (is_tenant_admin(tenant_id) OR is_superadmin());

-- event_brackets: Público SELECT (apenas PUBLISHED + evento válido)
CREATE POLICY event_brackets_public_select ON event_brackets
  FOR SELECT USING (
    deleted_at IS NULL
    AND status = 'PUBLISHED'
    AND EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_brackets.event_id
      AND e.is_public = true
      AND e.status NOT IN ('DRAFT', 'ARCHIVED', 'CANCELLED')
      AND e.deleted_at IS NULL
    )
  );

-- event_bracket_matches: Admin ALL
CREATE POLICY event_bracket_matches_admin_all ON event_bracket_matches
  FOR ALL USING (is_tenant_admin(tenant_id) OR is_superadmin())
  WITH CHECK (is_tenant_admin(tenant_id) OR is_superadmin());

-- event_bracket_matches: Público SELECT (se bracket PUBLISHED)
CREATE POLICY event_bracket_matches_public_select ON event_bracket_matches
  FOR SELECT USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM event_brackets b
      WHERE b.id = event_bracket_matches.bracket_id
      AND b.status = 'PUBLISHED'
      AND b.deleted_at IS NULL
    )
  );