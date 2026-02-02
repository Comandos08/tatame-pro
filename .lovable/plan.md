

# P2.3 — CATEGORIAS DE COMPETIÇÃO — PLANO DE IMPLEMENTAÇÃO

## MODO DE EXECUÇÃO

- **SAFE MODE** — Zero Criatividade
- Alterações aditivas, null-safe, governadas pelo backend
- Com os 3 ajustes obrigatórios aplicados

---

## ALTERAÇÕES DE BANCO DE DADOS

### Migração SQL Completa

```sql
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
```

---

## ALTERAÇÕES TYPESCRIPT

### 1. Atualizar `src/types/event.ts`

Adicionar tipo `CategoryGender` e atualizar interface `EventCategory`:

```typescript
// Adicionar após linha 12 (após EventRegistrationStatus)
export type CategoryGender = 'MALE' | 'FEMALE' | 'MIXED';

// Atualizar interface EventCategory (linhas 43-54)
export interface EventCategory {
  id: string;
  event_id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  // Campos de competição (P2.3)
  gender: CategoryGender | null;
  min_weight: number | null;
  max_weight: number | null;
  min_age: number | null;
  max_age: number | null;
  belt_min_id: string | null;
  belt_max_id: string | null;
  deleted_at: string | null;
  // Campos de pagamento (P3)
  price_cents: number;
  currency: string;
  max_participants: number | null;
  is_active: boolean;
  // Timestamps
  created_at: string;
  updated_at: string;
}

// Adicionar helper após canDeleteEvent (após linha 202)
export function canEditCategories(eventStatus: EventStatus): boolean {
  return eventStatus === 'DRAFT' || eventStatus === 'PUBLISHED' || eventStatus === 'REGISTRATION_OPEN';
}
```

### 2. Criar `src/lib/eventEligibility.ts` (NOVO)

```typescript
/**
 * Event Eligibility Helpers - TATAME Platform
 * P2.3 — Categorias de Competição
 * 
 * Deterministic athlete eligibility validation for event categories.
 * AJUSTE C: Weight validation is conditional - only applied when athlete.weight is available.
 */

import { CategoryGender } from '@/types/event';

export interface AthleteForEligibility {
  tenant_id: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  birth_date: string;
  current_grading?: {
    grading_level_id: string;
    order_index: number;
  } | null;
  weight?: number | null; // Optional - AJUSTE C
}

export interface CategoryForEligibility {
  tenant_id: string;
  gender: CategoryGender | null;
  min_weight: number | null;
  max_weight: number | null;
  min_age: number | null;
  max_age: number | null;
  belt_min_order_index?: number | null;
  belt_max_order_index?: number | null;
}

export interface EligibilityResult {
  eligible: boolean;
  reasons: string[];
}

function calculateAge(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

/**
 * Deterministic eligibility check
 * AJUSTE C: Weight is only validated if athlete.weight is defined and not null
 */
export function isAthleteEligibleForCategory(
  athlete: AthleteForEligibility,
  category: CategoryForEligibility,
  eventTenantId: string
): EligibilityResult {
  const reasons: string[] = [];
  
  // 1. Tenant match
  if (athlete.tenant_id !== eventTenantId) {
    reasons.push('Atleta não pertence à organização do evento');
  }
  
  // 2. Gender check
  if (category.gender !== null && category.gender !== 'MIXED') {
    if (athlete.gender === 'OTHER' || athlete.gender !== category.gender) {
      reasons.push('Gênero incompatível com a categoria');
    }
  }
  
  // 3. Age check
  if (category.min_age !== null || category.max_age !== null) {
    const age = calculateAge(athlete.birth_date);
    if (category.min_age !== null && age < category.min_age) {
      reasons.push(`Idade mínima: ${category.min_age} anos`);
    }
    if (category.max_age !== null && age > category.max_age) {
      reasons.push(`Idade máxima: ${category.max_age} anos`);
    }
  }
  
  // 4. Belt check
  if (athlete.current_grading && 
      (category.belt_min_order_index !== null || category.belt_max_order_index !== null)) {
    const athleteBeltOrder = athlete.current_grading.order_index;
    if (category.belt_min_order_index !== null && athleteBeltOrder < category.belt_min_order_index) {
      reasons.push('Faixa abaixo do mínimo');
    }
    if (category.belt_max_order_index !== null && athleteBeltOrder > category.belt_max_order_index) {
      reasons.push('Faixa acima do máximo');
    }
  }
  
  // 5. Weight check - AJUSTE C: ONLY if athlete.weight is available
  if (athlete.weight !== undefined && athlete.weight !== null) {
    if (category.min_weight !== null && athlete.weight < category.min_weight) {
      reasons.push(`Peso mínimo: ${category.min_weight}kg`);
    }
    if (category.max_weight !== null && athlete.weight > category.max_weight) {
      reasons.push(`Peso máximo: ${category.max_weight}kg`);
    }
  }
  // Se weight for undefined/null, validação de peso é IGNORADA (não falha)
  
  return { eligible: reasons.length === 0, reasons };
}
```

---

## ALTERAÇÕES DE i18n

### `src/locales/pt-BR.ts` (após linha 896)

```typescript
  // Eventos - Categorias de Competição (P2.3)
  'events.categoryGender': 'Gênero',
  'events.categoryGender.male': 'Masculino',
  'events.categoryGender.female': 'Feminino',
  'events.categoryGender.mixed': 'Misto',
  'events.categoryWeight': 'Peso',
  'events.categoryMinWeight': 'Peso mínimo (kg)',
  'events.categoryMaxWeight': 'Peso máximo (kg)',
  'events.categoryAge': 'Idade',
  'events.categoryMinAge': 'Idade mínima',
  'events.categoryMaxAge': 'Idade máxima',
  'events.categoryBelt': 'Faixa',
  'events.categoryBeltMin': 'Faixa mínima',
  'events.categoryBeltMax': 'Faixa máxima',
  'events.categoriesLocked': 'Categorias bloqueadas após fechamento das inscrições',
  'events.athleteNotEligible': 'Atleta não elegível para esta categoria',
  'events.eligibility.wrongTenant': 'Atleta não pertence à organização do evento',
  'events.eligibility.genderMismatch': 'Gênero incompatível com a categoria',
  'events.eligibility.ageTooLow': 'Idade abaixo do mínimo',
  'events.eligibility.ageTooHigh': 'Idade acima do máximo',
  'events.eligibility.weightTooLow': 'Peso abaixo do mínimo',
  'events.eligibility.weightTooHigh': 'Peso acima do máximo',
  'events.eligibility.beltTooLow': 'Faixa abaixo do mínimo',
  'events.eligibility.beltTooHigh': 'Faixa acima do máximo',
```

### `src/locales/en.ts` (após linha 898)

```typescript
  // Events - Competition Categories (P2.3)
  'events.categoryGender': 'Gender',
  'events.categoryGender.male': 'Male',
  'events.categoryGender.female': 'Female',
  'events.categoryGender.mixed': 'Mixed',
  'events.categoryWeight': 'Weight',
  'events.categoryMinWeight': 'Minimum weight (kg)',
  'events.categoryMaxWeight': 'Maximum weight (kg)',
  'events.categoryAge': 'Age',
  'events.categoryMinAge': 'Minimum age',
  'events.categoryMaxAge': 'Maximum age',
  'events.categoryBelt': 'Belt',
  'events.categoryBeltMin': 'Minimum belt',
  'events.categoryBeltMax': 'Maximum belt',
  'events.categoriesLocked': 'Categories locked after registration closes',
  'events.athleteNotEligible': 'Athlete not eligible for this category',
  'events.eligibility.wrongTenant': 'Athlete does not belong to the event organization',
  'events.eligibility.genderMismatch': 'Gender incompatible with category',
  'events.eligibility.ageTooLow': 'Age below minimum',
  'events.eligibility.ageTooHigh': 'Age above maximum',
  'events.eligibility.weightTooLow': 'Weight below minimum',
  'events.eligibility.weightTooHigh': 'Weight above maximum',
  'events.eligibility.beltTooLow': 'Belt below minimum',
  'events.eligibility.beltTooHigh': 'Belt above maximum',
```

### `src/locales/es.ts` (após linha 898)

```typescript
  // Eventos - Categorías de Competición (P2.3)
  'events.categoryGender': 'Género',
  'events.categoryGender.male': 'Masculino',
  'events.categoryGender.female': 'Femenino',
  'events.categoryGender.mixed': 'Mixto',
  'events.categoryWeight': 'Peso',
  'events.categoryMinWeight': 'Peso mínimo (kg)',
  'events.categoryMaxWeight': 'Peso máximo (kg)',
  'events.categoryAge': 'Edad',
  'events.categoryMinAge': 'Edad mínima',
  'events.categoryMaxAge': 'Edad máxima',
  'events.categoryBelt': 'Cinturón',
  'events.categoryBeltMin': 'Cinturón mínimo',
  'events.categoryBeltMax': 'Cinturón máximo',
  'events.categoriesLocked': 'Categorías bloqueadas después del cierre de inscripciones',
  'events.athleteNotEligible': 'Atleta no elegible para esta categoría',
  'events.eligibility.wrongTenant': 'El atleta no pertenece a la organización del evento',
  'events.eligibility.genderMismatch': 'Género incompatible con la categoría',
  'events.eligibility.ageTooLow': 'Edad por debajo del mínimo',
  'events.eligibility.ageTooHigh': 'Edad por encima del máximo',
  'events.eligibility.weightTooLow': 'Peso por debajo del mínimo',
  'events.eligibility.weightTooHigh': 'Peso por encima del máximo',
  'events.eligibility.beltTooLow': 'Cinturón por debajo del mínimo',
  'events.eligibility.beltTooHigh': 'Cinturón por encima del máximo',
```

---

## RESUMO DOS AJUSTES OBRIGATÓRIOS APLICADOS

| Ajuste | Descrição | Status |
|--------|-----------|--------|
| **A** | Trigger retorna `OLD` para `DELETE` | ✅ Aplicado |
| **B** | Trigger de categoria ativa para `INSERT OR UPDATE` | ✅ Aplicado |
| **C** | Peso condicional — não falha se `athlete.weight` for `undefined/null` | ✅ Aplicado |

---

## ARQUIVOS A MODIFICAR

| Arquivo | Ação | Linhas |
|---------|------|--------|
| Migration SQL | CRIAR | ~70 linhas |
| `src/types/event.ts` | EDITAR | ~20 linhas |
| `src/lib/eventEligibility.ts` | **CRIAR** | ~100 linhas |
| `src/locales/pt-BR.ts` | EDITAR | +22 chaves |
| `src/locales/en.ts` | EDITAR | +22 chaves |
| `src/locales/es.ts` | EDITAR | +22 chaves |

**Total**: ~180 linhas de alteração

---

## CRITÉRIOS DE ACEITE

| Critério | Esperado |
|----------|----------|
| Campos de competição na tabela | ✅ gender, weight, age, belt |
| Enum `category_gender` criado | ✅ MALE, FEMALE, MIXED |
| Soft delete com `deleted_at` | ✅ |
| Imutabilidade após REGISTRATION_CLOSED | ✅ Trigger bloqueia |
| Delete retorna OLD corretamente | ✅ AJUSTE A |
| Update de registro valida categoria | ✅ AJUSTE B |
| Peso não bloqueia sem dados | ✅ AJUSTE C |
| RLS exclui categorias deletadas | ✅ |
| Helper `isAthleteEligibleForCategory()` | ✅ Determinístico |
| Zero impacto em inscrições existentes | ✅ Campos nullable |

