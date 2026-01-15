
-- Enums for the membership system
CREATE TYPE public.gender_type AS ENUM ('MALE', 'FEMALE', 'OTHER');
CREATE TYPE public.guardian_relationship AS ENUM ('PARENT', 'GUARDIAN', 'OTHER');
CREATE TYPE public.membership_status AS ENUM ('DRAFT', 'PENDING_PAYMENT', 'PENDING_REVIEW', 'APPROVED', 'ACTIVE', 'EXPIRED', 'CANCELLED');
CREATE TYPE public.membership_type AS ENUM ('FIRST_MEMBERSHIP', 'RENEWAL');
CREATE TYPE public.payment_status AS ENUM ('NOT_PAID', 'PAID', 'FAILED');
CREATE TYPE public.document_type AS ENUM ('ID_DOCUMENT', 'MEDICAL_CERTIFICATE', 'ADDRESS_PROOF', 'OTHER');

-- Athletes table
CREATE TABLE public.athletes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  birth_date DATE NOT NULL,
  national_id TEXT,
  gender gender_type NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'BR',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, profile_id),
  UNIQUE(tenant_id, email)
);

-- Guardians table (legal guardians for minors)
CREATE TABLE public.guardians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  national_id TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, email)
);

-- Guardian-Athlete links
CREATE TABLE public.guardian_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  guardian_id UUID NOT NULL REFERENCES public.guardians(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  relationship guardian_relationship NOT NULL DEFAULT 'PARENT',
  is_primary BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(guardian_id, athlete_id)
);

-- Memberships table
CREATE TABLE public.memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  status membership_status NOT NULL DEFAULT 'DRAFT',
  start_date DATE,
  end_date DATE,
  type membership_type NOT NULL DEFAULT 'FIRST_MEMBERSHIP',
  price_cents INTEGER NOT NULL DEFAULT 15000,
  currency TEXT NOT NULL DEFAULT 'BRL',
  payment_status payment_status NOT NULL DEFAULT 'NOT_PAID',
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Documents table
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  type document_type NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  valid_until DATE,
  ocr_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Digital cards table
CREATE TABLE public.digital_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES public.memberships(id) ON DELETE CASCADE,
  qr_code_data TEXT,
  qr_code_image_url TEXT,
  pdf_url TEXT,
  valid_until DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(membership_id)
);

-- Enable RLS on all tables
ALTER TABLE public.athletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digital_cards ENABLE ROW LEVEL SECURITY;

-- RLS Policies for athletes
CREATE POLICY "Superadmin full access to athletes"
  ON public.athletes FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "Tenant admin can manage athletes"
  ON public.athletes FOR ALL
  USING (is_tenant_admin(tenant_id))
  WITH CHECK (is_tenant_admin(tenant_id));

CREATE POLICY "Users can view own athlete record"
  ON public.athletes FOR SELECT
  USING (profile_id = auth.uid());

CREATE POLICY "Users can update own athlete record"
  ON public.athletes FOR UPDATE
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Public can insert athletes for membership"
  ON public.athletes FOR INSERT
  WITH CHECK (true);

-- RLS Policies for guardians
CREATE POLICY "Superadmin full access to guardians"
  ON public.guardians FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "Tenant admin can manage guardians"
  ON public.guardians FOR ALL
  USING (is_tenant_admin(tenant_id))
  WITH CHECK (is_tenant_admin(tenant_id));

CREATE POLICY "Users can view own guardian record"
  ON public.guardians FOR SELECT
  USING (profile_id = auth.uid());

CREATE POLICY "Public can insert guardians"
  ON public.guardians FOR INSERT
  WITH CHECK (true);

-- RLS Policies for guardian_links
CREATE POLICY "Superadmin full access to guardian_links"
  ON public.guardian_links FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "Tenant admin can manage guardian_links"
  ON public.guardian_links FOR ALL
  USING (is_tenant_admin(tenant_id))
  WITH CHECK (is_tenant_admin(tenant_id));

CREATE POLICY "Guardians can view their links"
  ON public.guardian_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.guardians g
      WHERE g.id = guardian_id AND g.profile_id = auth.uid()
    )
  );

CREATE POLICY "Public can insert guardian_links"
  ON public.guardian_links FOR INSERT
  WITH CHECK (true);

-- RLS Policies for memberships
CREATE POLICY "Superadmin full access to memberships"
  ON public.memberships FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "Tenant admin can manage memberships"
  ON public.memberships FOR ALL
  USING (is_tenant_admin(tenant_id))
  WITH CHECK (is_tenant_admin(tenant_id));

CREATE POLICY "Athletes can view own memberships"
  ON public.memberships FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.athletes a
      WHERE a.id = athlete_id AND a.profile_id = auth.uid()
    )
  );

CREATE POLICY "Guardians can view linked athlete memberships"
  ON public.memberships FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.guardian_links gl
      JOIN public.guardians g ON g.id = gl.guardian_id
      WHERE gl.athlete_id = athlete_id AND g.profile_id = auth.uid()
    )
  );

CREATE POLICY "Public can insert memberships"
  ON public.memberships FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update memberships"
  ON public.memberships FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- RLS Policies for documents
CREATE POLICY "Superadmin full access to documents"
  ON public.documents FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "Tenant admin can manage documents"
  ON public.documents FOR ALL
  USING (is_tenant_admin(tenant_id))
  WITH CHECK (is_tenant_admin(tenant_id));

CREATE POLICY "Athletes can view own documents"
  ON public.documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.athletes a
      WHERE a.id = athlete_id AND a.profile_id = auth.uid()
    )
  );

CREATE POLICY "Public can insert documents"
  ON public.documents FOR INSERT
  WITH CHECK (true);

-- RLS Policies for digital_cards
CREATE POLICY "Superadmin full access to digital_cards"
  ON public.digital_cards FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "Tenant admin can manage digital_cards"
  ON public.digital_cards FOR ALL
  USING (is_tenant_admin(tenant_id))
  WITH CHECK (is_tenant_admin(tenant_id));

CREATE POLICY "Athletes can view own digital cards"
  ON public.digital_cards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships m
      JOIN public.athletes a ON a.id = m.athlete_id
      WHERE m.id = membership_id AND a.profile_id = auth.uid()
    )
  );

-- Update triggers
CREATE TRIGGER update_athletes_updated_at
  BEFORE UPDATE ON public.athletes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_guardians_updated_at
  BEFORE UPDATE ON public.guardians
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_memberships_updated_at
  BEFORE UPDATE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_digital_cards_updated_at
  BEFORE UPDATE ON public.digital_cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for documents
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);

-- Storage policies for documents bucket
CREATE POLICY "Authenticated users can upload documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'documents');

CREATE POLICY "Public can upload documents for membership"
  ON storage.objects FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'documents');

CREATE POLICY "Users can view own documents"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'documents');
