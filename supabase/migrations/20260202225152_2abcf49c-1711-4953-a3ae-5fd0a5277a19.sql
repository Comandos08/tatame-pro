-- P2.4 SAFE MODE: Transactional RPC for bracket generation
-- Ensures atomic bracket + matches creation with single DRAFT lock

CREATE OR REPLACE FUNCTION generate_event_bracket_rpc(
  p_tenant_id uuid,
  p_event_id uuid,
  p_category_id uuid,
  p_generated_by uuid,
  p_registrations jsonb  -- Array de {id, athlete_id, created_at}
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bracket_id uuid;
  v_version int;
  v_n int;
  v_bracket_size int;
  v_byes int;
  v_rounds int;
  v_reg_ids text[];
  v_hash text;
  v_match_count int := 0;
  v_round int;
  v_pos int;
  v_matches_in_round int;
  v_idx1 int;
  v_idx2 int;
  v_athlete1 uuid;
  v_athlete2 uuid;
  v_is_bye boolean;
BEGIN
  -- 1. Verificar se já existe DRAFT para esta categoria (LOCK)
  IF EXISTS (
    SELECT 1 FROM event_brackets
    WHERE category_id = p_category_id
      AND tenant_id = p_tenant_id
      AND status = 'DRAFT'
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Draft bracket already exists for this category';
  END IF;

  -- 2. Calcular próxima versão
  SELECT COALESCE(MAX(version), 0) + 1
  INTO v_version
  FROM event_brackets
  WHERE category_id = p_category_id
    AND tenant_id = p_tenant_id;

  -- 3. Extrair IDs ordenados e calcular hash SHA-256 completo (64 chars)
  SELECT array_agg(r->>'id' ORDER BY r->>'created_at', r->>'id')
  INTO v_reg_ids
  FROM jsonb_array_elements(p_registrations) r;

  v_hash := encode(digest(array_to_string(v_reg_ids, '|'), 'sha256'), 'hex');
  v_n := array_length(v_reg_ids, 1);

  -- 4. Calcular estrutura do bracket
  v_bracket_size := power(2, ceil(log(2, greatest(v_n, 2))))::int;
  v_byes := v_bracket_size - v_n;
  v_rounds := ceil(log(2, v_bracket_size))::int;

  -- 5. Inserir bracket (DRAFT)
  INSERT INTO event_brackets (
    tenant_id, event_id, category_id, version, status,
    generated_by, meta
  ) VALUES (
    p_tenant_id, p_event_id, p_category_id, v_version, 'DRAFT',
    p_generated_by,
    jsonb_build_object(
      'criterion', 'SEED_BY_CREATED_AT_ASC_ID_ASC',
      'registrations_count', v_n,
      'bracket_size', v_bracket_size,
      'byes_count', v_byes,
      'registration_ids_hash', v_hash
    )
  )
  RETURNING id INTO v_bracket_id;

  -- 6. Criar matches Round 1
  v_matches_in_round := v_bracket_size / 2;
  FOR v_pos IN 1..v_matches_in_round LOOP
    v_idx1 := (v_pos - 1) * 2 + 1;
    v_idx2 := v_idx1 + 1;
    
    v_athlete1 := CASE WHEN v_idx1 <= v_n THEN (v_reg_ids[v_idx1])::uuid ELSE NULL END;
    v_athlete2 := CASE WHEN v_idx2 <= v_n THEN (v_reg_ids[v_idx2])::uuid ELSE NULL END;
    v_is_bye := v_athlete1 IS NULL OR v_athlete2 IS NULL;

    INSERT INTO event_bracket_matches (
      tenant_id, bracket_id, category_id, round, position,
      athlete1_registration_id, athlete2_registration_id,
      status, meta
    ) VALUES (
      p_tenant_id, v_bracket_id, p_category_id, 1, v_pos,
      v_athlete1, v_athlete2,
      CASE WHEN v_is_bye THEN 'BYE' ELSE 'SCHEDULED' END,
      CASE WHEN v_is_bye THEN '{"is_bye": true, "note": "BYE"}'::jsonb ELSE '{}'::jsonb END
    );
    v_match_count := v_match_count + 1;
  END LOOP;

  -- 7. Criar matches para rounds futuros (placeholders)
  FOR v_round IN 2..v_rounds LOOP
    v_matches_in_round := v_matches_in_round / 2;
    FOR v_pos IN 1..v_matches_in_round LOOP
      INSERT INTO event_bracket_matches (
        tenant_id, bracket_id, category_id, round, position,
        athlete1_registration_id, athlete2_registration_id,
        status, meta
      ) VALUES (
        p_tenant_id, v_bracket_id, p_category_id, v_round, v_pos,
        NULL, NULL, 'SCHEDULED',
        jsonb_build_object(
          'note', format('Winner of R%sM%s vs R%sM%s', 
            v_round-1, (v_pos-1)*2+1, v_round-1, (v_pos-1)*2+2),
          'source', jsonb_build_object('from', 
            array[format('R%sM%s', v_round-1, (v_pos-1)*2+1),
                  format('R%sM%s', v_round-1, (v_pos-1)*2+2)])
        )
      );
      v_match_count := v_match_count + 1;
    END LOOP;
  END LOOP;

  -- 8. Retornar resultado como JSONB
  RETURN jsonb_build_object(
    'success', true,
    'bracketId', v_bracket_id,
    'version', v_version,
    'status', 'DRAFT',
    'matchesCreated', v_match_count,
    'meta', jsonb_build_object(
      'criterion', 'SEED_BY_CREATED_AT_ASC_ID_ASC',
      'registrations_count', v_n,
      'bracket_size', v_bracket_size,
      'byes_count', v_byes,
      'registration_ids_hash', v_hash
    )
  );
END;
$$;