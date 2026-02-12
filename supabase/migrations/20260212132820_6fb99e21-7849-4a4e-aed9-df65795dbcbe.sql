
CREATE TABLE public.membership_analytics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_slug TEXT NOT NULL,
  event_name TEXT NOT NULL,
  membership_type TEXT,
  step INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_membership_analytics_tenant_slug ON public.membership_analytics (tenant_slug);
CREATE INDEX idx_membership_analytics_event_name ON public.membership_analytics (event_name);
CREATE INDEX idx_membership_analytics_created_at ON public.membership_analytics (created_at);

ALTER TABLE public.membership_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert analytics"
ON public.membership_analytics
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Only superadmins can read analytics"
ON public.membership_analytics
FOR SELECT
USING (public.is_superadmin());
