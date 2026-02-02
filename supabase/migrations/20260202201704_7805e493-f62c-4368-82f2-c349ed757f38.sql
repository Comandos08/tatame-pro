-- P2.2: Update RLS policies to validate deleted_at IS NULL

-- Update INSERT policy to validate deleted_at
DROP POLICY IF EXISTS registrations_athlete_insert ON event_registrations;
CREATE POLICY registrations_athlete_insert ON event_registrations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM events e 
      WHERE e.id = event_registrations.event_id 
        AND e.status = 'REGISTRATION_OPEN'
        AND e.deleted_at IS NULL
    )
    AND EXISTS (
      SELECT 1 FROM athletes a 
      WHERE a.id = event_registrations.athlete_id 
        AND a.profile_id = auth.uid()
    )
  );

-- Update UPDATE policy (cancellation) to validate deleted_at
DROP POLICY IF EXISTS registrations_athlete_cancel ON event_registrations;
CREATE POLICY registrations_athlete_cancel ON event_registrations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM athletes a 
      WHERE a.id = event_registrations.athlete_id 
        AND a.profile_id = auth.uid()
    )
  )
  WITH CHECK (
    status = 'CANCELED'
    AND EXISTS (
      SELECT 1 FROM events e 
      WHERE e.id = event_registrations.event_id 
        AND e.status IN ('REGISTRATION_OPEN', 'REGISTRATION_CLOSED')
        AND e.deleted_at IS NULL
    )
  );