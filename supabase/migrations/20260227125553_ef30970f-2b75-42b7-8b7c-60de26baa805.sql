CREATE OR REPLACE FUNCTION public.get_tenant_dashboard_metrics(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_total_athletes integer;
  v_pending_approvals integer;
  v_upcoming_events integer;
  v_mrr_cents integer;
  v_memberships_by_month jsonb;
BEGIN
  -- Total atletas ativos (com membership ACTIVE)
  SELECT COUNT(DISTINCT a.id) INTO v_total_athletes
  FROM athletes a
  JOIN memberships m ON m.athlete_id = a.id
  WHERE a.tenant_id = p_tenant_id
    AND m.status = 'ACTIVE'
    AND m.end_date >= CURRENT_DATE;

  -- Filiações pendentes de aprovação
  SELECT COUNT(*) INTO v_pending_approvals
  FROM memberships
  WHERE tenant_id = p_tenant_id
    AND status = 'PENDING_REVIEW'
    AND payment_status = 'PAID';

  -- Eventos nos próximos 7 dias
  SELECT COUNT(*) INTO v_upcoming_events
  FROM events
  WHERE tenant_id = p_tenant_id
    AND start_date BETWEEN CURRENT_DATE AND CURRENT_DATE + interval '7 days';

  -- MRR (Monthly Recurring Revenue - soma de fees pagos nos últimos 30 dias)
  SELECT COALESCE(SUM(fee_amount_cents), 0) INTO v_mrr_cents
  FROM memberships
  WHERE tenant_id = p_tenant_id
    AND payment_status = 'PAID'
    AND fee_paid_at >= CURRENT_DATE - interval '30 days';

  -- Filiações por mês (últimos 6 meses)
  SELECT jsonb_agg(
    jsonb_build_object(
      'month', to_char(month, 'YYYY-MM'),
      'count', count
    ) ORDER BY month DESC
  ) INTO v_memberships_by_month
  FROM (
    SELECT 
      date_trunc('month', created_at) AS month,
      COUNT(*) AS count
    FROM memberships
    WHERE tenant_id = p_tenant_id
      AND created_at >= CURRENT_DATE - interval '6 months'
      AND status IN ('PENDING_REVIEW', 'APPROVED', 'ACTIVE')
    GROUP BY date_trunc('month', created_at)
  ) sub;

  -- Construir resultado
  v_result := jsonb_build_object(
    'total_athletes', v_total_athletes,
    'pending_approvals', v_pending_approvals,
    'upcoming_events', v_upcoming_events,
    'mrr_cents', v_mrr_cents,
    'memberships_by_month', COALESCE(v_memberships_by_month, '[]'::jsonb)
  );

  RETURN v_result;
END;
$$;

-- Privilégios
REVOKE EXECUTE ON FUNCTION public.get_tenant_dashboard_metrics(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_dashboard_metrics(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_tenant_dashboard_metrics IS 'Retorna métricas agregadas do dashboard do tenant (atletas, aprovações, eventos, receita)';