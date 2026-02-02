-- P2.1 Events Core Governance: Add CANCELLED state, soft delete, and backend validation

-- 1. Add CANCELLED to event_status enum
ALTER TYPE event_status ADD VALUE IF NOT EXISTS 'CANCELLED';

-- 2. Add deleted_at column for soft delete
ALTER TABLE events ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 3. Create index for performance on non-deleted events
CREATE INDEX IF NOT EXISTS idx_events_not_deleted ON events (tenant_id, status) WHERE deleted_at IS NULL;

-- 4. Create function to validate event status transitions
CREATE OR REPLACE FUNCTION validate_event_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- If status didn't change, allow
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  
  -- Validate allowed transitions
  IF NOT (
    (OLD.status = 'DRAFT' AND NEW.status IN ('PUBLISHED', 'CANCELLED')) OR
    (OLD.status = 'PUBLISHED' AND NEW.status IN ('REGISTRATION_OPEN', 'CANCELLED')) OR
    (OLD.status = 'REGISTRATION_OPEN' AND NEW.status IN ('REGISTRATION_CLOSED', 'CANCELLED')) OR
    (OLD.status = 'REGISTRATION_CLOSED' AND NEW.status IN ('ONGOING', 'CANCELLED')) OR
    (OLD.status = 'ONGOING' AND NEW.status IN ('FINISHED', 'CANCELLED')) OR
    (OLD.status = 'FINISHED' AND NEW.status = 'ARCHIVED')
  ) THEN
    RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 5. Create trigger to enforce status transitions
DROP TRIGGER IF EXISTS enforce_event_status_transition ON events;
CREATE TRIGGER enforce_event_status_transition
  BEFORE UPDATE ON events
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION validate_event_status_transition();

-- 6. Create soft delete function with validations
CREATE OR REPLACE FUNCTION soft_delete_event(p_event_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_status event_status;
  v_registration_count INT;
BEGIN
  -- Get current status
  SELECT status INTO v_status FROM events WHERE id = p_event_id;
  
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Event not found';
  END IF;
  
  -- Can only delete DRAFT or CANCELLED
  IF v_status NOT IN ('DRAFT', 'CANCELLED') THEN
    RAISE EXCEPTION 'Cannot delete event with status %. Only DRAFT or CANCELLED events can be deleted.', v_status;
  END IF;
  
  -- Check for active registrations
  SELECT COUNT(*) INTO v_registration_count 
  FROM event_registrations 
  WHERE event_id = p_event_id AND status != 'CANCELED';
  
  IF v_registration_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete event with % active registrations', v_registration_count;
  END IF;
  
  -- Soft delete
  UPDATE events SET deleted_at = NOW() WHERE id = p_event_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;