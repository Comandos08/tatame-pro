-- get_tenant_with_billing: Single RPC for TenantContext (P2-05)
-- Replaces 2 sequential queries with 1 atomic call
CREATE OR REPLACE FUNCTION public.get_tenant_with_billing(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'tenant', jsonb_build_object(
      'id', t.id,
      'name', t.name,
      'slug', t.slug,
      'status', t.status,
      'lifecycle_status', t.lifecycle_status,
      'is_active', t.is_active,
      'onboarding_completed', t.onboarding_completed,
      'sport_types', t.sport_types,
      'primary_color', t.primary_color,
      'logo_url', t.logo_url,
      'stripe_customer_id', t.stripe_customer_id,
      'created_at', t.created_at
    ),
    'billing', CASE
      WHEN tb.id IS NOT NULL THEN jsonb_build_object(
        'status', tb.status,
        'stripe_customer_id', tb.stripe_customer_id,
        'scheduled_delete_at', tb.scheduled_delete_at,
        'trial_expires_at', tb.trial_expires_at
      )
      ELSE NULL
    END
  ) INTO v_result
  FROM tenants t
  LEFT JOIN tenant_billing tb ON tb.tenant_id = t.id
  WHERE t.slug = p_slug
  LIMIT 1;

  RETURN v_result;
END;
$$;