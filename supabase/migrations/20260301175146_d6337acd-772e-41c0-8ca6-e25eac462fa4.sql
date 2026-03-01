
-- Add unique constraint for upsert support
ALTER TABLE public.observability_dismissed_alerts
  ADD CONSTRAINT observability_dismissed_alerts_alert_user_unique
  UNIQUE (alert_id, user_id);

-- Allow authenticated users to INSERT their own dismissed alerts
CREATE POLICY "Users can insert own dismissed alerts"
  ON public.observability_dismissed_alerts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Allow authenticated users to DELETE their own dismissed alerts
CREATE POLICY "Users can delete own dismissed alerts"
  ON public.observability_dismissed_alerts
  FOR DELETE
  USING (auth.uid() = user_id);
