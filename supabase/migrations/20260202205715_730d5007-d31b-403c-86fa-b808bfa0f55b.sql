-- P2.3 — CATEGORIAS DE COMPETIÇÃO
-- SAFE MODE: Alterações aditivas, null-safe, governadas pelo backend

-- 1. Criar enum category_gender
CREATE TYPE category_gender AS ENUM ('MALE', 'FEMALE', 'MIXED');

-- 2. Adicionar colunas de competição à tabela event_categories
ALTER TABLE event_categories
  ADD COLUMN gender category_gender DEFAULT NULL,
  ADD COLUMN min_weight NUMERIC(5,2) DEFAULT NULL,
  ADD COLUMN max_weight NUMERIC(5,2) DEFAULT NULL,
  ADD COLUMN min_age INTEGER DEFAULT NULL,
  ADD COLUMN max_age INTEGER DEFAULT NULL,
  ADD COLUMN belt_min_id UUID REFERENCES grading_levels(id) DEFAULT NULL,
  ADD COLUMN belt_max_id UUID REFERENCES grading_levels(id) DEFAULT NULL,
  ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 3. Índice parcial para performance (excluir deleted)
CREATE INDEX idx_event_categories_not_deleted 
  ON event_categories (event_id, tenant_id) 
  WHERE deleted_at IS NULL;

-- 4. Trigger de Imutabilidade (AJUSTE A: Retorna OLD para DELETE)
CREATE OR REPLACE FUNCTION validate_event_category_mutation()
RETURNS TRIGGER AS $$
DECLARE
  v_event_status event_status;
  v_event_id UUID;
BEGIN
  -- Para DELETE, usar OLD.event_id; para INSERT/UPDATE, usar NEW.event_id
  IF TG_OP = 'DELETE' THEN
    v_event_id := OLD.event_id;
  ELSE
    v_event_id := NEW.event_id;
  END IF;
  
  -- Obter status do evento
  SELECT status INTO v_event_status 
  FROM events 
  WHERE id = v_event_id;
  
  -- Permitir apenas em estados editáveis
  IF v_event_status NOT IN ('DRAFT', 'PUBLISHED', 'REGISTRATION_OPEN') THEN
    RAISE EXCEPTION 'Cannot modify categories when event status is %', v_event_status;
  END IF;
  
  -- AJUSTE A: Retornar OLD para DELETE, NEW para INSERT/UPDATE
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

CREATE TRIGGER enforce_event_category_immutability
  BEFORE INSERT OR UPDATE OR DELETE ON event_categories
  FOR EACH ROW
  EXECUTE FUNCTION validate_event_category_mutation();

-- 5. Trigger para validar registro em categoria ativa (AJUSTE B: INSERT e UPDATE)
CREATE OR REPLACE FUNCTION validate_registration_category_active()
RETURNS TRIGGER AS $$
BEGIN
  -- Verificar se categoria não está soft-deleted
  IF EXISTS (
    SELECT 1 FROM event_categories 
    WHERE id = NEW.category_id AND deleted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Cannot register in deleted category';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- AJUSTE B: Trigger para INSERT E UPDATE
CREATE TRIGGER enforce_registration_category_active
  BEFORE INSERT OR UPDATE ON event_registrations
  FOR EACH ROW
  EXECUTE FUNCTION validate_registration_category_active();

-- 6. Atualizar RLS para excluir categorias deletadas e eventos CANCELLED
DROP POLICY IF EXISTS event_categories_public_select ON event_categories;
CREATE POLICY event_categories_public_select ON event_categories
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM events e 
      WHERE e.id = event_categories.event_id 
        AND e.is_public = true 
        AND e.status NOT IN ('DRAFT', 'ARCHIVED', 'CANCELLED')
        AND e.deleted_at IS NULL
    )
  );