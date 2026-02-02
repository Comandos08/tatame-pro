-- P2.5 — Match Results: Columns, Constraints, Triggers, and RPC

-- 1️⃣ Add audit columns to event_bracket_matches
ALTER TABLE event_bracket_matches
ADD COLUMN IF NOT EXISTS completed_at timestamptz,
ADD COLUMN IF NOT EXISTS recorded_by uuid REFERENCES profiles(id);

-- 2️⃣ Add constraint: winner must be a participant
ALTER TABLE event_bracket_matches
DROP CONSTRAINT IF EXISTS winner_must_be_participant;

ALTER TABLE event_bracket_matches
ADD CONSTRAINT winner_must_be_participant
CHECK (
  winner_registration_id IS NULL
  OR winner_registration_id = athlete1_registration_id
  OR winner_registration_id = athlete2_registration_id
);

-- 3️⃣ Create governance trigger function
CREATE OR REPLACE FUNCTION enforce_match_result_rules()
RETURNS TRIGGER AS $$
DECLARE
  v_bracket_status text;
BEGIN
  -- 1. Get bracket status
  SELECT status INTO v_bracket_status
  FROM event_brackets
  WHERE id = NEW.bracket_id;

  -- 2. Only allow result on PUBLISHED bracket
  IF v_bracket_status IS DISTINCT FROM 'PUBLISHED' THEN
    RAISE EXCEPTION 'Cannot record result on non-published bracket';
  END IF;

  -- 3. Block re-recording (immutable after COMPLETED)
  IF OLD.status = 'COMPLETED' THEN
    RAISE EXCEPTION 'Match result is immutable once completed';
  END IF;

  -- 4. Validate winner is a participant
  IF NEW.winner_registration_id IS NOT NULL 
     AND NEW.winner_registration_id NOT IN (NEW.athlete1_registration_id, NEW.athlete2_registration_id) THEN
    RAISE EXCEPTION 'Winner must be one of the match participants';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- 4️⃣ Create trigger for SCHEDULED→COMPLETED transition
DROP TRIGGER IF EXISTS enforce_match_result ON event_bracket_matches;
CREATE TRIGGER enforce_match_result
BEFORE UPDATE ON event_bracket_matches
FOR EACH ROW
WHEN (OLD.status = 'SCHEDULED' AND NEW.status = 'COMPLETED')
EXECUTE FUNCTION enforce_match_result_rules();

-- 5️⃣ Update immutability trigger to allow controlled updates on PUBLISHED matches
CREATE OR REPLACE FUNCTION validate_bracket_immutability()
RETURNS TRIGGER AS $$
DECLARE
  v_bracket_status text;
BEGIN
  IF TG_TABLE_NAME = 'event_brackets' THEN
    IF TG_OP = 'UPDATE' THEN
      IF OLD.status = 'PUBLISHED' THEN
        RAISE EXCEPTION 'Cannot modify published bracket';
      END IF;
      RETURN NEW;
    END IF;
    
    IF TG_OP = 'DELETE' THEN
      IF OLD.status = 'PUBLISHED' THEN
        RAISE EXCEPTION 'Cannot delete published bracket';
      END IF;
      RETURN OLD;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'event_bracket_matches' THEN
    SELECT status INTO v_bracket_status
    FROM event_brackets
    WHERE id = COALESCE(NEW.bracket_id, OLD.bracket_id);
    
    IF v_bracket_status = 'PUBLISHED' THEN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Cannot delete matches from published bracket';
      END IF;
      
      IF TG_OP = 'UPDATE' THEN
        -- P2.5: Match already completed is IMMUTABLE
        IF OLD.status = 'COMPLETED' THEN
          RAISE EXCEPTION 'Cannot modify completed match';
        END IF;
        
        -- Only allow authorized field changes
        IF (
          OLD.round IS DISTINCT FROM NEW.round OR
          OLD.position IS DISTINCT FROM NEW.position OR
          OLD.bracket_id IS DISTINCT FROM NEW.bracket_id OR
          OLD.category_id IS DISTINCT FROM NEW.category_id OR
          OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
        ) THEN
          RAISE EXCEPTION 'Cannot modify structural fields of match in published bracket';
        END IF;
        
        -- Allow: status, winner, completed_at, recorded_by, athletes (for advancement)
        RETURN NEW;
      END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- 6️⃣ Create transactional RPC for recording match result
CREATE OR REPLACE FUNCTION record_match_result_rpc(
  p_match_id uuid,
  p_winner_registration_id uuid,
  p_recorded_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_match record;
  v_bracket record;
  v_next_match record;
  v_source_key text;
BEGIN
  -- 1️⃣ Lock and fetch match
  SELECT * INTO v_match
  FROM event_bracket_matches
  WHERE id = p_match_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  -- 2️⃣ Validate match status
  IF v_match.status = 'COMPLETED' THEN
    RAISE EXCEPTION 'Match result is already recorded';
  END IF;

  IF v_match.status = 'BYE' THEN
    RAISE EXCEPTION 'Cannot record result for BYE match';
  END IF;

  -- 3️⃣ Validate both athletes are defined
  IF v_match.athlete1_registration_id IS NULL OR v_match.athlete2_registration_id IS NULL THEN
    RAISE EXCEPTION 'Both athletes must be defined to record result';
  END IF;

  -- 4️⃣ Validate winner is participant
  IF p_winner_registration_id NOT IN (v_match.athlete1_registration_id, v_match.athlete2_registration_id) THEN
    RAISE EXCEPTION 'Winner must be one of the match participants';
  END IF;

  -- 5️⃣ Fetch bracket and validate status
  SELECT * INTO v_bracket
  FROM event_brackets
  WHERE id = v_match.bracket_id;

  IF v_bracket.status != 'PUBLISHED' THEN
    RAISE EXCEPTION 'Can only record results on published brackets';
  END IF;

  -- 6️⃣ Update current match
  UPDATE event_bracket_matches
  SET
    winner_registration_id = p_winner_registration_id,
    status = 'COMPLETED',
    completed_at = now(),
    recorded_by = p_recorded_by,
    updated_at = now()
  WHERE id = p_match_id;

  -- 7️⃣ Advance winner to next round
  v_source_key := format('R%sM%s', v_match.round, v_match.position);

  SELECT * INTO v_next_match
  FROM event_bracket_matches
  WHERE bracket_id = v_match.bracket_id
    AND round = v_match.round + 1
    AND meta->'source'->'from' ? v_source_key
    AND deleted_at IS NULL
  LIMIT 1;

  IF FOUND THEN
    -- Determine which slot to fill
    IF v_next_match.athlete1_registration_id IS NULL THEN
      UPDATE event_bracket_matches
      SET athlete1_registration_id = p_winner_registration_id,
          updated_at = now()
      WHERE id = v_next_match.id;
    ELSIF v_next_match.athlete2_registration_id IS NULL THEN
      UPDATE event_bracket_matches
      SET athlete2_registration_id = p_winner_registration_id,
          updated_at = now()
      WHERE id = v_next_match.id;
    END IF;
  END IF;

  -- 8️⃣ Return result
  RETURN jsonb_build_object(
    'success', true,
    'matchId', p_match_id,
    'winnerId', p_winner_registration_id,
    'status', 'COMPLETED',
    'completedAt', now(),
    'nextMatchId', v_next_match.id
  );
END;
$$;