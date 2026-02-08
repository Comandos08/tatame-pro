-- ============================================================
-- PI-D5-FEDERATION1.0 & PI-D5-COUNCIL1.0
-- Federation Layer + Institutional Council
-- REORDERED: Tables first, then policies
-- ============================================================

-- ============================================================
-- ENUMS
-- ============================================================

-- Federation status
CREATE TYPE public.federation_status AS ENUM ('ACTIVE', 'SUSPENDED');

-- Federation roles (closed list)
CREATE TYPE public.federation_role AS ENUM ('FED_ADMIN', 'COUNCIL_MEMBER', 'OBSERVER');

-- Council member roles
CREATE TYPE public.council_role AS ENUM ('CHAIR', 'MEMBER');

-- Council decision types (closed list)
CREATE TYPE public.council_decision_type AS ENUM (
  'TENANT_ADMISSION',
  'TENANT_SUSPENSION',
  'POLICY_APPROVAL'
);

-- Council decision status
CREATE TYPE public.council_decision_status AS ENUM ('OPEN', 'APPROVED', 'REJECTED');

-- ============================================================
-- TABLES (ALL TABLES FIRST, NO POLICIES YET)
-- ============================================================

-- Federations
CREATE TABLE public.federations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  country_code TEXT,
  logo_url TEXT,
  status public.federation_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.federations ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_federations_slug ON public.federations(slug);

-- Federation Roles (must exist before policies reference it)
CREATE TABLE public.federation_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  federation_id UUID NOT NULL REFERENCES public.federations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.federation_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(federation_id, user_id, role)
);

ALTER TABLE public.federation_roles ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_federation_roles_user ON public.federation_roles(user_id);
CREATE INDEX idx_federation_roles_federation ON public.federation_roles(federation_id);

-- Federation Tenants
CREATE TABLE public.federation_tenants (
  federation_id UUID NOT NULL REFERENCES public.federations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  PRIMARY KEY (federation_id, tenant_id)
);

ALTER TABLE public.federation_tenants ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_federation_tenants_federation ON public.federation_tenants(federation_id);
CREATE INDEX idx_federation_tenants_tenant ON public.federation_tenants(tenant_id);

-- Councils
CREATE TABLE public.councils (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  federation_id UUID NOT NULL REFERENCES public.federations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.councils ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_councils_federation ON public.councils(federation_id);

-- Council Members
CREATE TABLE public.council_members (
  council_id UUID NOT NULL REFERENCES public.councils(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.council_role NOT NULL DEFAULT 'MEMBER',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (council_id, user_id)
);

ALTER TABLE public.council_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_council_members_user ON public.council_members(user_id);
CREATE INDEX idx_council_members_council ON public.council_members(council_id);

-- Council Decisions
CREATE TABLE public.council_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  council_id UUID NOT NULL REFERENCES public.councils(id) ON DELETE CASCADE,
  decision_type public.council_decision_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  target_tenant_id UUID REFERENCES public.tenants(id),
  status public.council_decision_status NOT NULL DEFAULT 'OPEN',
  created_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.council_decisions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_council_decisions_council ON public.council_decisions(council_id);
CREATE INDEX idx_council_decisions_status ON public.council_decisions(status);
CREATE INDEX idx_council_decisions_target ON public.council_decisions(target_tenant_id);

-- ============================================================
-- NOW CREATE POLICIES (after all tables exist)
-- ============================================================

-- Federations policies
CREATE POLICY "Superadmins can manage federations"
  ON public.federations FOR ALL
  USING (public.is_superadmin());

CREATE POLICY "Federation members can view their federation"
  ON public.federations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.federation_roles fr
      WHERE fr.federation_id = federations.id
        AND fr.user_id = auth.uid()
    )
  );

-- Federation roles policies
CREATE POLICY "Superadmins can manage federation_roles"
  ON public.federation_roles FOR ALL
  USING (public.is_superadmin());

CREATE POLICY "Fed admins can manage roles in their federation"
  ON public.federation_roles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.federation_roles fr
      WHERE fr.federation_id = federation_roles.federation_id
        AND fr.user_id = auth.uid()
        AND fr.role = 'FED_ADMIN'
    )
  );

CREATE POLICY "Users can view their own federation roles"
  ON public.federation_roles FOR SELECT
  USING (user_id = auth.uid());

-- Federation tenants policies
CREATE POLICY "Superadmins can manage federation_tenants"
  ON public.federation_tenants FOR ALL
  USING (public.is_superadmin());

CREATE POLICY "Fed admins can view their federation tenants"
  ON public.federation_tenants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.federation_roles fr
      WHERE fr.federation_id = federation_tenants.federation_id
        AND fr.user_id = auth.uid()
        AND fr.role = 'FED_ADMIN'
    )
  );

CREATE POLICY "Council members can view federation tenants"
  ON public.federation_tenants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.federation_roles fr
      WHERE fr.federation_id = federation_tenants.federation_id
        AND fr.user_id = auth.uid()
        AND fr.role = 'COUNCIL_MEMBER'
    )
  );

-- Councils policies
CREATE POLICY "Superadmins can manage councils"
  ON public.councils FOR ALL
  USING (public.is_superadmin());

CREATE POLICY "Fed admins can manage councils in their federation"
  ON public.councils FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.federation_roles fr
      WHERE fr.federation_id = councils.federation_id
        AND fr.user_id = auth.uid()
        AND fr.role = 'FED_ADMIN'
    )
  );

CREATE POLICY "Council members can view their council"
  ON public.councils FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.council_members cm
      WHERE cm.council_id = councils.id
        AND cm.user_id = auth.uid()
    )
  );

-- Council members policies
CREATE POLICY "Superadmins can manage council_members"
  ON public.council_members FOR ALL
  USING (public.is_superadmin());

CREATE POLICY "Fed admins can manage council members"
  ON public.council_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.councils c
      JOIN public.federation_roles fr ON fr.federation_id = c.federation_id
      WHERE c.id = council_members.council_id
        AND fr.user_id = auth.uid()
        AND fr.role = 'FED_ADMIN'
    )
  );

CREATE POLICY "Council members can view their council members"
  ON public.council_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.council_members cm
      WHERE cm.council_id = council_members.council_id
        AND cm.user_id = auth.uid()
    )
  );

-- Council decisions policies
CREATE POLICY "Superadmins can manage council_decisions"
  ON public.council_decisions FOR ALL
  USING (public.is_superadmin());

CREATE POLICY "Fed admins can view council decisions"
  ON public.council_decisions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.councils c
      JOIN public.federation_roles fr ON fr.federation_id = c.federation_id
      WHERE c.id = council_decisions.council_id
        AND fr.user_id = auth.uid()
        AND fr.role = 'FED_ADMIN'
    )
  );

CREATE POLICY "Council members can view and create decisions"
  ON public.council_decisions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.council_members cm
      WHERE cm.council_id = council_decisions.council_id
        AND cm.user_id = auth.uid()
    )
  );

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_federation_role(_user_id UUID, _federation_id UUID, _role federation_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.federation_roles
    WHERE user_id = _user_id
      AND federation_id = _federation_id
      AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_federation_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.federation_roles
    WHERE user_id = _user_id
      AND role = 'FED_ADMIN'
  )
$$;

CREATE OR REPLACE FUNCTION public.is_council_member(_user_id UUID, _council_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.council_members
    WHERE user_id = _user_id
      AND council_id = _council_id
  )
$$;

CREATE OR REPLACE FUNCTION public.can_view_tenant(_user_id UUID, _tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT 
    public.is_superadmin()
    OR public.is_member_of_tenant(_tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.federation_tenants ft
      JOIN public.federation_roles fr ON fr.federation_id = ft.federation_id
      WHERE ft.tenant_id = _tenant_id
        AND fr.user_id = _user_id
        AND ft.left_at IS NULL
    )
$$;

CREATE OR REPLACE FUNCTION public.can_view_federation(_user_id UUID, _federation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT 
    public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.federation_roles
      WHERE user_id = _user_id
        AND federation_id = _federation_id
    )
$$;

CREATE OR REPLACE FUNCTION public.can_act_as_federation(_user_id UUID, _federation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT 
    public.is_superadmin()
    OR public.has_federation_role(_user_id, _federation_id, 'FED_ADMIN')
$$;

-- ============================================================
-- TRIGGERS
-- ============================================================

CREATE TRIGGER update_federations_updated_at
  BEFORE UPDATE ON public.federations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_councils_updated_at
  BEFORE UPDATE ON public.councils
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_council_decisions_updated_at
  BEFORE UPDATE ON public.council_decisions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();