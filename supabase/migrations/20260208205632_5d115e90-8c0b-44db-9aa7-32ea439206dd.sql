-- GOLDEN RULE — Institutional Document Validity (Database Function)
-- This function provides a single source of truth for document validity.

CREATE OR REPLACE FUNCTION public.is_institutional_document_valid(
  p_tenant_status text,
  p_billing_status text,
  p_document_status text,
  p_revoked_at timestamp with time zone DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT 
    p_tenant_status = 'ACTIVE'
    AND p_billing_status IN ('ACTIVE', 'TRIALING')
    AND p_document_status IN ('ACTIVE', 'ISSUED')
    AND p_revoked_at IS NULL
$$;

COMMENT ON FUNCTION public.is_institutional_document_valid IS 'Golden Rule for institutional document validity. Returns true only when: tenant is ACTIVE, billing is ACTIVE or TRIALING, document is ACTIVE or ISSUED, and not revoked.';