CREATE OR REPLACE FUNCTION public.get_tenant_revenue_metrics_v1(p_tenant_id uuid)
RETURNS TABLE (
  total_memberships integer,
  total_fee_paid integer,
  total_fee_pending integer,
  revenue_cents bigint,
  conversion_rate numeric
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_total_memberships integer;
  v_total_fee_paid integer;
  v_revenue_cents bigint;
  v_conversion_rate numeric;
  v_is_authorized boolean;
BEGIN
  -- ============================================================
  -- TENANT ACCESS GUARD
  -- Only ADMIN_TENANT of this tenant or SUPERADMIN_GLOBAL
  -- ============================================================
  SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    WHERE ur.user_id = auth.uid()
      AND (
        (ur.role = 'SUPERADMIN_GLOBAL')
        OR
        (ur.role = 'ADMIN_TENANT' AND ur.tenant_id = p_tenant_id)
      )
  )
  INTO v_is_authorized;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'FORBIDDEN'
      USING ERRCODE = 'P0001';
  END IF;

  -- ============================================================
  -- TOTAL MEMBERSHIPS (source: memberships)
  -- ============================================================
  SELECT COALESCE(COUNT(*)::integer, 0)
  INTO v_total_memberships
  FROM memberships
  WHERE tenant_id = p_tenant_id;

  -- ============================================================
  -- TOTAL PAID (source: membership_fees)
  -- ============================================================
  SELECT COALESCE(COUNT(*)::integer, 0)
  INTO v_total_fee_paid
  FROM membership_fees
  WHERE tenant_id = p_tenant_id
    AND paid_at IS NOT NULL;

  -- ============================================================
  -- REVENUE (source: membership_fees)
  -- ============================================================
  SELECT COALESCE(SUM(amount_cents)::bigint, 0)
  INTO v_revenue_cents
  FROM membership_fees
  WHERE tenant_id = p_tenant_id
    AND paid_at IS NOT NULL;

  -- ============================================================
  -- CONVERSION RATE
  -- ============================================================
  IF v_total_memberships = 0 THEN
    v_conversion_rate := 0;
  ELSE
    v_conversion_rate :=
      ROUND(
        (v_total_fee_paid::numeric / v_total_memberships::numeric) * 100,
        2
      );
  END IF;

  RETURN QUERY
  SELECT
    v_total_memberships,
    v_total_fee_paid,
    GREATEST(v_total_memberships - v_total_fee_paid, 0),
    v_revenue_cents,
    v_conversion_rate;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_tenant_revenue_metrics_v1(uuid)
FROM public, anon;

GRANT EXECUTE ON FUNCTION public.get_tenant_revenue_metrics_v1(uuid)
TO authenticated;

COMMENT ON FUNCTION public.get_tenant_revenue_metrics_v1
IS 'Revenue metrics v1: memberships from memberships table, revenue from membership_fees. SECURITY INVOKER with tenant guard and zero-null guarantee.';