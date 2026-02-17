
-- PI-002D: Auditability & Drift Detection (SAFE GOLD)
-- View de drift detection
CREATE OR REPLACE VIEW public.role_governance_audit_v1 AS
WITH admin_roles AS (
  SELECT ur.id AS user_roles_id, ur.user_id AS profile_id, ur.tenant_id, ur.role, ur.created_at
  FROM public.user_roles ur
  WHERE ur.role = 'ADMIN_TENANT'::public.app_role
),
admin_grants AS (
  SELECT al.id AS audit_id, al.tenant_id, al.profile_id,
    (al.metadata->>'user_roles_id')::uuid AS user_roles_id,
    al.created_at, al.metadata
  FROM public.audit_logs al
  WHERE al.event_type = 'ADMIN_TENANT_ROLE_GRANTED'
),
p0_missing_audit AS (
  SELECT 'P0' AS severity, 'ADMIN_ROLE_MISSING_AUDIT' AS issue_code,
    ar.tenant_id, ar.profile_id, ar.user_roles_id,
    jsonb_build_object('role','ADMIN_TENANT','user_roles_created_at',ar.created_at) AS details,
    now() AS detected_at
  FROM admin_roles ar
  LEFT JOIN admin_grants ag ON ag.user_roles_id = ar.user_roles_id
  WHERE ag.user_roles_id IS NULL
),
p0_orphan_audit AS (
  SELECT 'P0' AS severity, 'AUDIT_POINTS_TO_MISSING_ROLE' AS issue_code,
    ag.tenant_id, ag.profile_id, ag.user_roles_id,
    jsonb_build_object('audit_id',ag.audit_id,'audit_created_at',ag.created_at,'metadata',ag.metadata) AS details,
    now() AS detected_at
  FROM admin_grants ag
  LEFT JOIN public.user_roles ur ON ur.id = ag.user_roles_id
  WHERE ur.id IS NULL
),
p1_no_membership AS (
  SELECT 'P1' AS severity, 'ADMIN_ROLE_WITHOUT_APPROVED_MEMBERSHIP' AS issue_code,
    ar.tenant_id, ar.profile_id, ar.user_roles_id,
    jsonb_build_object('role','ADMIN_TENANT','note','Membership may have been bypassed') AS details,
    now() AS detected_at
  FROM admin_roles ar
  LEFT JOIN public.memberships m
    ON m.applicant_profile_id = ar.profile_id AND m.tenant_id = ar.tenant_id AND m.status = 'APPROVED'
  WHERE m.id IS NULL
)
SELECT * FROM p0_missing_audit
UNION ALL SELECT * FROM p0_orphan_audit
UNION ALL SELECT * FROM p1_no_membership;

-- Funcao de verificacao
CREATE OR REPLACE FUNCTION public.check_role_governance_v1()
RETURNS TABLE (
  severity text, issue_code text, tenant_id uuid,
  profile_id uuid, user_roles_id uuid, details jsonb, detected_at timestamptz
)
LANGUAGE sql STABLE SET search_path TO 'public'
AS $$ SELECT * FROM public.role_governance_audit_v1; $$;
