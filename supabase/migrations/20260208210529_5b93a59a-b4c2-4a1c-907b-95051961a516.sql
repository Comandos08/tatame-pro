-- ============================================================
-- PI-D3-DOCS1.0: Document Public Tokens for Public Verification
-- ============================================================

-- Create enum for institutional document types (different from athlete document_type)
CREATE TYPE institutional_document_type AS ENUM ('digital_card', 'diploma');

-- Create table for opaque public tokens
CREATE TABLE public.document_public_tokens (
  token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type institutional_document_type NOT NULL,
  document_id UUID NOT NULL,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

-- Index for fast lookups by document
CREATE INDEX idx_document_public_tokens_document 
  ON public.document_public_tokens(document_type, document_id);

-- Index for tenant queries
CREATE INDEX idx_document_public_tokens_tenant 
  ON public.document_public_tokens(tenant_id);

-- Enable RLS
ALTER TABLE public.document_public_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: Tenant admins can view tokens in their tenant
CREATE POLICY "Tenant admins can view tokens"
  ON public.document_public_tokens
  FOR SELECT
  USING (
    public.is_tenant_admin(tenant_id) 
    OR public.is_superadmin()
  );

-- Policy: Only system (service role) can insert tokens
-- Tokens are generated programmatically via Edge Functions
CREATE POLICY "Service role can insert tokens"
  ON public.document_public_tokens
  FOR INSERT
  WITH CHECK (false);

-- Policy: Only system can revoke tokens
CREATE POLICY "Service role can update tokens"
  ON public.document_public_tokens
  FOR UPDATE
  USING (false);

-- Function to generate token for a document (to be called from Edge Functions)
CREATE OR REPLACE FUNCTION public.generate_document_token(
  p_document_type institutional_document_type,
  p_document_id UUID,
  p_tenant_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_token UUID;
BEGIN
  -- Check if token already exists for this document
  SELECT token INTO v_token
  FROM document_public_tokens
  WHERE document_type = p_document_type
    AND document_id = p_document_id
    AND revoked_at IS NULL;
  
  IF v_token IS NOT NULL THEN
    RETURN v_token;
  END IF;
  
  -- Generate new token
  INSERT INTO document_public_tokens (document_type, document_id, tenant_id)
  VALUES (p_document_type, p_document_id, p_tenant_id)
  RETURNING token INTO v_token;
  
  RETURN v_token;
END;
$$;

-- Function to revoke a token
CREATE OR REPLACE FUNCTION public.revoke_document_token(
  p_token UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE document_public_tokens
  SET revoked_at = now()
  WHERE token = p_token
    AND revoked_at IS NULL;
  
  RETURN FOUND;
END;
$$;

-- Add comments for documentation
COMMENT ON TABLE public.document_public_tokens IS 
  'Opaque public tokens for institutional document verification. Part of PI-D3-DOCS1.0.';

COMMENT ON FUNCTION public.generate_document_token IS 
  'Generates or returns existing opaque token for a document. Idempotent.';

COMMENT ON FUNCTION public.revoke_document_token IS 
  'Revokes a document token, making it immediately invalid for public verification.';