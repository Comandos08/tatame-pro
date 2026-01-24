-- =====================================================
-- TATAME Events Module v2.2 - SAFE GOLD
-- Enums, Tables, Triggers, and RLS Policies
-- =====================================================

-- 1. Create Enums
CREATE TYPE public.event_status AS ENUM (
  'DRAFT', 'PUBLISHED', 'REGISTRATION_OPEN', 
  'REGISTRATION_CLOSED', 'ONGOING', 'FINISHED', 'ARCHIVED'
);

CREATE TYPE public.event_registration_status AS ENUM (
  'PENDING', 'CONFIRMED', 'CANCELED'
);

-- 2. Create events table (root of tenant hierarchy)
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  banner_url TEXT,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  location TEXT,
  status public.event_status NOT NULL DEFAULT 'DRAFT',
  is_public BOOLEAN NOT NULL DEFAULT false,
  sport_type TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_events_tenant ON public.events(tenant_id);
CREATE INDEX idx_events_status ON public.events(status);
CREATE INDEX idx_events_public ON public.events(is_public);
CREATE INDEX idx_events_start_date ON public.events(start_date);

CREATE TRIGGER trg_events_updated
BEFORE UPDATE ON public.events
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Create event_categories table with tenant consistency trigger
CREATE TABLE public.event_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER DEFAULT 0,
  currency TEXT DEFAULT 'BRL',
  max_participants INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_event_categories_event ON public.event_categories(event_id);

CREATE TRIGGER trg_event_categories_updated
BEFORE UPDATE ON public.event_categories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tenant consistency validation function for categories
CREATE OR REPLACE FUNCTION public.validate_event_category_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tenant_id != (SELECT tenant_id FROM public.events WHERE id = NEW.event_id) THEN
    RAISE EXCEPTION 'tenant_id must match the event tenant_id';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_event_categories_tenant_check
BEFORE INSERT OR UPDATE ON public.event_categories
FOR EACH ROW EXECUTE FUNCTION public.validate_event_category_tenant();

-- 4. Create event_registrations table with tenant consistency trigger
CREATE TABLE public.event_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.event_categories(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  status public.event_registration_status NOT NULL DEFAULT 'PENDING',
  payment_status public.payment_status NOT NULL DEFAULT 'NOT_PAID',
  registered_by UUID REFERENCES public.profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, category_id, athlete_id)
);

CREATE INDEX idx_event_registrations_event ON public.event_registrations(event_id);
CREATE INDEX idx_event_registrations_athlete ON public.event_registrations(athlete_id);

CREATE TRIGGER trg_event_registrations_updated
BEFORE UPDATE ON public.event_registrations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tenant consistency validation function for registrations
CREATE OR REPLACE FUNCTION public.validate_event_registration_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tenant_id != (SELECT tenant_id FROM public.events WHERE id = NEW.event_id) THEN
    RAISE EXCEPTION 'tenant_id must match the event tenant_id';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_event_registrations_tenant_check
BEFORE INSERT OR UPDATE ON public.event_registrations
FOR EACH ROW EXECUTE FUNCTION public.validate_event_registration_tenant();

-- 5. Create event_results table with tenant consistency + immutability
CREATE TABLE public.event_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.event_categories(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position > 0),
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, category_id, athlete_id)
);

CREATE INDEX idx_event_results_event ON public.event_results(event_id);
CREATE INDEX idx_event_results_athlete ON public.event_results(athlete_id);

-- Tenant consistency validation function for results
CREATE OR REPLACE FUNCTION public.validate_event_result_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tenant_id != (SELECT tenant_id FROM public.events WHERE id = NEW.event_id) THEN
    RAISE EXCEPTION 'tenant_id must match the event tenant_id';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_event_results_tenant_check
BEFORE INSERT ON public.event_results
FOR EACH ROW EXECUTE FUNCTION public.validate_event_result_tenant();

-- Immutability: Block UPDATE and DELETE on event_results
CREATE OR REPLACE FUNCTION public.prevent_event_results_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'event_results are immutable - UPDATE and DELETE are not allowed';
END;
$$;

CREATE TRIGGER trg_event_results_immutable
BEFORE UPDATE OR DELETE ON public.event_results
FOR EACH ROW EXECUTE FUNCTION public.prevent_event_results_modification();

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- EVENTS RLS
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_public_select" ON public.events
  FOR SELECT USING (is_public = true AND status NOT IN ('DRAFT', 'ARCHIVED'));

CREATE POLICY "events_admin_all" ON public.events
  FOR ALL TO authenticated
  USING (is_tenant_admin(tenant_id) OR is_superadmin())
  WITH CHECK (is_tenant_admin(tenant_id) OR is_superadmin());

-- EVENT_CATEGORIES RLS
ALTER TABLE public.event_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_categories_public_select" ON public.event_categories
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.events e 
      WHERE e.id = event_id AND e.is_public = true AND e.status NOT IN ('DRAFT', 'ARCHIVED'))
  );

CREATE POLICY "event_categories_admin_all" ON public.event_categories
  FOR ALL TO authenticated
  USING (is_tenant_admin(tenant_id) OR is_superadmin())
  WITH CHECK (is_tenant_admin(tenant_id) OR is_superadmin());

-- EVENT_REGISTRATIONS RLS
ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "registrations_athlete_select" ON public.event_registrations
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.athletes a WHERE a.id = athlete_id AND a.profile_id = auth.uid()));

CREATE POLICY "registrations_athlete_insert" ON public.event_registrations
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.status = 'REGISTRATION_OPEN')
    AND EXISTS (SELECT 1 FROM public.athletes a WHERE a.id = athlete_id AND a.profile_id = auth.uid())
  );

CREATE POLICY "registrations_athlete_cancel" ON public.event_registrations
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.athletes a WHERE a.id = athlete_id AND a.profile_id = auth.uid()))
  WITH CHECK (
    status = 'CANCELED'
    AND EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.status IN ('REGISTRATION_OPEN', 'REGISTRATION_CLOSED'))
  );

CREATE POLICY "registrations_admin_all" ON public.event_registrations
  FOR ALL TO authenticated
  USING (is_tenant_admin(tenant_id) OR is_superadmin())
  WITH CHECK (is_tenant_admin(tenant_id) OR is_superadmin());

-- EVENT_RESULTS RLS
ALTER TABLE public.event_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_results_public_select" ON public.event_results
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.events e 
      WHERE e.id = event_id AND e.is_public = true AND e.status IN ('FINISHED', 'ARCHIVED'))
  );

CREATE POLICY "event_results_athlete_select" ON public.event_results
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.athletes a WHERE a.id = athlete_id AND a.profile_id = auth.uid()));

CREATE POLICY "event_results_admin_insert" ON public.event_results
  FOR INSERT TO authenticated
  WITH CHECK (is_tenant_admin(tenant_id) OR is_superadmin());