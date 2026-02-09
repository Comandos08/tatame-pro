
-- =============================================
-- PI A1: DEFINITIVE enum migration
-- =============================================

-- === A: Drop ALL inline app_role policies ===
DROP POLICY IF EXISTS "Superadmins can read deleted_tenants" ON public.deleted_tenants;
DROP POLICY IF EXISTS "superadmin_manage_own_sessions" ON public.superadmin_impersonations;
DROP POLICY IF EXISTS "Tenant admin can manage tenant roles" ON public.user_roles;
DROP POLICY IF EXISTS "Members can view tenant roles" ON public.user_roles;
DROP POLICY IF EXISTS "Superadmin full access to user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;

-- Also explicitly drop the Staff/function-dep policies
DROP POLICY IF EXISTS "Staff can manage academies" ON public.academies;
DROP POLICY IF EXISTS "Staff can manage academy_coaches" ON public.academy_coaches;
DROP POLICY IF EXISTS "Staff can manage athlete_gradings" ON public.athlete_gradings;
DROP POLICY IF EXISTS "Staff can view tenant athletes" ON public.athletes;
DROP POLICY IF EXISTS "Staff can manage coaches" ON public.coaches;
DROP POLICY IF EXISTS "Staff can manage diplomas" ON public.diplomas;
DROP POLICY IF EXISTS "Staff can manage grading_levels" ON public.grading_levels;
DROP POLICY IF EXISTS "Staff can manage grading_schemes" ON public.grading_schemes;
DROP POLICY IF EXISTS "Staff and admins can update memberships" ON public.memberships;
DROP POLICY IF EXISTS "Staff can view tenant billing" ON public.tenant_billing;
DROP POLICY IF EXISTS "Tenant admins can view their invoices" ON public.tenant_invoices;

-- Storage (from manual patch or prior)
DROP POLICY IF EXISTS "Tenant admins can upload branding" ON storage.objects;
DROP POLICY IF EXISTS "Tenant admins can update branding" ON storage.objects;
DROP POLICY IF EXISTS "Tenant admins can delete branding" ON storage.objects;
DROP POLICY IF EXISTS "Tenant admins can upload event images" ON storage.objects;
DROP POLICY IF EXISTS "Tenant admins can update event images" ON storage.objects;
DROP POLICY IF EXISTS "Tenant admins can delete event images" ON storage.objects;

-- === B: Drop functions CASCADE ===
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role) CASCADE;
DROP FUNCTION IF EXISTS public.is_tenant_admin(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.can_approve_membership(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_superadmin() CASCADE;
DROP FUNCTION IF EXISTS public.is_member_of_tenant(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_any_tenant_admin() CASCADE;
DROP FUNCTION IF EXISTS public.is_head_coach_of_academy(uuid) CASCADE;

DROP TYPE IF EXISTS public.app_role_v2;

-- === C: Enum migration ===
ALTER TABLE public.user_roles ALTER COLUMN role TYPE text;
DROP TYPE IF EXISTS public.app_role;
CREATE TYPE public.app_role AS ENUM ('SUPERADMIN_GLOBAL', 'ADMIN_TENANT', 'ATLETA');

UPDATE public.user_roles SET role = 'ADMIN_TENANT' WHERE role IN ('STAFF_ORGANIZACAO', 'COACH_PRINCIPAL', 'COACH_ASSISTENTE', 'INSTRUTOR', 'RECEPCAO');
UPDATE public.user_roles SET role = 'ATLETA' WHERE role = 'RESPONSAVELLEGAL';

ALTER TABLE public.user_roles ALTER COLUMN role TYPE public.app_role USING role::public.app_role;

-- === D: Recreate functions ===
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role, _tenant_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role AND (tenant_id = _tenant_id OR (_tenant_id IS NULL AND tenant_id IS NULL))) $$;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'SUPERADMIN_GLOBAL' AND tenant_id IS NULL) $$;

CREATE OR REPLACE FUNCTION public.is_tenant_admin(_tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_role(auth.uid(), 'ADMIN_TENANT', _tenant_id) $$;

CREATE OR REPLACE FUNCTION public.is_member_of_tenant(_tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND tenant_id = _tenant_id) OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND tenant_id = _tenant_id) $$;

CREATE OR REPLACE FUNCTION public.is_any_tenant_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'ADMIN_TENANT') $$;

CREATE OR REPLACE FUNCTION public.is_head_coach_of_academy(_academy_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.academy_coaches ac JOIN public.coaches c ON c.id = ac.coach_id WHERE ac.academy_id = _academy_id AND c.profile_id = auth.uid() AND ac.role = 'HEAD_COACH' AND ac.is_active = true AND c.is_active = true) $$;

CREATE OR REPLACE FUNCTION public.can_approve_membership(_membership_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.memberships m WHERE m.id = _membership_id AND (is_superadmin() OR is_tenant_admin(m.tenant_id))) $$;

CREATE OR REPLACE FUNCTION public.enforce_canonical_roles()
RETURNS trigger LANGUAGE plpgsql SET search_path = public
AS $$ BEGIN IF NEW.role::text NOT IN ('SUPERADMIN_GLOBAL', 'ADMIN_TENANT', 'ATLETA') THEN RAISE EXCEPTION 'Role % is not a canonical role', NEW.role; END IF; RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_enforce_canonical_roles ON public.user_roles;
CREATE TRIGGER trg_enforce_canonical_roles BEFORE INSERT OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.enforce_canonical_roles();

-- === E: Recreate ALL policies (with safety drops) ===

-- user_roles
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (user_id = auth.uid() OR is_superadmin() OR (tenant_id IS NOT NULL AND is_tenant_admin(tenant_id)));
CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT WITH CHECK (is_superadmin() OR (tenant_id IS NOT NULL AND is_tenant_admin(tenant_id) AND role != 'SUPERADMIN_GLOBAL'));
CREATE POLICY "Admins can update roles" ON public.user_roles FOR UPDATE USING (is_superadmin() OR (tenant_id IS NOT NULL AND is_tenant_admin(tenant_id) AND role != 'SUPERADMIN_GLOBAL'));
CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE USING (is_superadmin() OR (tenant_id IS NOT NULL AND is_tenant_admin(tenant_id) AND role != 'SUPERADMIN_GLOBAL'));

-- superadmin_impersonations
CREATE POLICY "superadmin_manage_own_sessions" ON public.superadmin_impersonations FOR ALL USING (is_superadmin() AND superadmin_user_id = auth.uid()) WITH CHECK (is_superadmin() AND superadmin_user_id = auth.uid());

-- deleted_tenants
CREATE POLICY "Superadmins can read deleted_tenants" ON public.deleted_tenants FOR SELECT USING (is_superadmin());

-- tenants (check if policy already exists)
DROP POLICY IF EXISTS "Tenant admin can update own tenant" ON public.tenants;
CREATE POLICY "Tenant admin can update own tenant" ON public.tenants FOR UPDATE USING (is_superadmin() OR is_tenant_admin(id));

-- academies
CREATE POLICY "Tenant admins can manage academies" ON public.academies FOR ALL USING (is_superadmin() OR is_tenant_admin(tenant_id)) WITH CHECK (is_superadmin() OR is_tenant_admin(tenant_id));

-- coaches
CREATE POLICY "Tenant admins can manage coaches" ON public.coaches FOR ALL USING (is_superadmin() OR is_tenant_admin(tenant_id)) WITH CHECK (is_superadmin() OR is_tenant_admin(tenant_id));

-- academy_coaches
CREATE POLICY "Tenant admins can manage academy_coaches" ON public.academy_coaches FOR ALL USING (is_superadmin() OR is_tenant_admin(tenant_id)) WITH CHECK (is_superadmin() OR is_tenant_admin(tenant_id));

-- grading_schemes
CREATE POLICY "Tenant admins can manage grading_schemes" ON public.grading_schemes FOR ALL USING (is_superadmin() OR is_tenant_admin(tenant_id)) WITH CHECK (is_superadmin() OR is_tenant_admin(tenant_id));

-- grading_levels
CREATE POLICY "Tenant admins can manage grading_levels" ON public.grading_levels FOR ALL USING (is_superadmin() OR is_tenant_admin(tenant_id)) WITH CHECK (is_superadmin() OR is_tenant_admin(tenant_id));

-- athlete_gradings
CREATE POLICY "Tenant admins can manage athlete_gradings" ON public.athlete_gradings FOR ALL USING (is_superadmin() OR is_tenant_admin(tenant_id)) WITH CHECK (is_superadmin() OR is_tenant_admin(tenant_id));

-- diplomas
CREATE POLICY "Tenant admins can manage diplomas" ON public.diplomas FOR ALL USING (is_superadmin() OR is_tenant_admin(tenant_id)) WITH CHECK (is_superadmin() OR is_tenant_admin(tenant_id));

-- athletes
CREATE POLICY "Tenant admins can view athletes" ON public.athletes FOR SELECT USING (is_superadmin() OR is_tenant_admin(tenant_id) OR is_member_of_tenant(tenant_id));

-- tenant_billing
CREATE POLICY "Tenant admins can view billing" ON public.tenant_billing FOR SELECT USING (is_superadmin() OR is_tenant_admin(tenant_id));

-- tenant_invoices
CREATE POLICY "Tenant admins can view invoices" ON public.tenant_invoices FOR SELECT USING (is_superadmin() OR is_tenant_admin(tenant_id));

-- memberships
CREATE POLICY "Tenant admins can update memberships" ON public.memberships FOR UPDATE USING (is_superadmin() OR is_tenant_admin(tenant_id));

-- storage: branding
CREATE POLICY "Tenant admins can upload branding" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'branding' AND (is_superadmin() OR is_any_tenant_admin()));
CREATE POLICY "Tenant admins can update branding" ON storage.objects FOR UPDATE USING (bucket_id = 'branding' AND (is_superadmin() OR is_any_tenant_admin()));
CREATE POLICY "Tenant admins can delete branding" ON storage.objects FOR DELETE USING (bucket_id = 'branding' AND (is_superadmin() OR is_any_tenant_admin()));

-- storage: events
CREATE POLICY "Tenant admins can upload event images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'events' AND (is_superadmin() OR is_any_tenant_admin()));
CREATE POLICY "Tenant admins can update event images" ON storage.objects FOR UPDATE USING (bucket_id = 'events' AND (is_superadmin() OR is_any_tenant_admin()));
CREATE POLICY "Tenant admins can delete event images" ON storage.objects FOR DELETE USING (bucket_id = 'events' AND (is_superadmin() OR is_any_tenant_admin()));
