
-- PI-MEMBERSHIP-OBSERVABILITY-001
-- Operational Observability Layer (READ-ONLY)
-- Creates: VIEW + STABLE FUNCTION. Zero mutations. Zero triggers. Zero SECURITY DEFINER.

CREATE OR REPLACE VIEW public.membership_operational_metrics_v1 AS
WITH base AS (
  SELECT
    id,
    tenant_id,
    status,
    payment_status,
    created_at,
    updated_at,
    reviewed_at,
    start_date,
    end_date
  FROM public.memberships
)
SELECT
  -- A) Volume por status
  COUNT(*) FILTER (WHERE status = 'DRAFT')              AS draft_count,
  COUNT(*) FILTER (WHERE status = 'PENDING_PAYMENT')    AS pending_payment_count,
  COUNT(*) FILTER (WHERE status = 'PENDING_REVIEW')     AS pending_review_count,
  COUNT(*) FILTER (WHERE status = 'APPROVED')           AS approved_count,
  COUNT(*) FILTER (WHERE status = 'EXPIRED')            AS expired_count,
  COUNT(*) FILTER (WHERE status = 'CANCELLED')          AS cancelled_count,
  COUNT(*) FILTER (WHERE status = 'REJECTED')           AS rejected_count,
  COUNT(*)                                               AS total_count,

  -- C) Aging Buckets
  COUNT(*) FILTER (
    WHERE status = 'DRAFT'
      AND now() - created_at > interval '24 hours'
  ) AS draft_over_24h,

  COUNT(*) FILTER (
    WHERE status = 'PENDING_PAYMENT'
      AND now() - updated_at > interval '24 hours'
  ) AS pending_payment_over_24h,

  COUNT(*) FILTER (
    WHERE status = 'PENDING_REVIEW'
      AND now() - updated_at > interval '48 hours'
  ) AS pending_review_over_48h,

  -- D) Anomalias Operacionais
  COUNT(*) FILTER (
    WHERE status = 'PENDING_REVIEW'
      AND now() - updated_at > interval '7 days'
  ) AS p0_long_pending_review,

  COUNT(*) FILTER (
    WHERE status = 'DRAFT'
      AND now() - created_at > interval '3 days'
  ) AS p1_long_draft,

  COUNT(*) FILTER (
    WHERE status = 'PENDING_PAYMENT'
      AND now() - updated_at > interval '24 hours'
  ) AS p1_payment_stuck,

  -- B) Tempo médio entre etapas (onde dados disponíveis)
  AVG(
    CASE WHEN status IN ('PENDING_PAYMENT','PENDING_REVIEW','APPROVED','EXPIRED','CANCELLED','REJECTED')
         AND updated_at > created_at
    THEN EXTRACT(EPOCH FROM (updated_at - created_at))
    ELSE NULL END
  ) AS avg_seconds_to_first_transition,

  AVG(
    CASE WHEN reviewed_at IS NOT NULL AND updated_at IS NOT NULL
         AND reviewed_at > created_at
    THEN EXTRACT(EPOCH FROM (reviewed_at - created_at))
    ELSE NULL END
  ) AS avg_seconds_to_review

FROM base;

-- STABLE check function (no SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.check_membership_operational_metrics_v1()
RETURNS TABLE (
  draft_count bigint,
  pending_payment_count bigint,
  pending_review_count bigint,
  approved_count bigint,
  expired_count bigint,
  cancelled_count bigint,
  rejected_count bigint,
  total_count bigint,
  draft_over_24h bigint,
  pending_payment_over_24h bigint,
  pending_review_over_48h bigint,
  p0_long_pending_review bigint,
  p1_long_draft bigint,
  p1_payment_stuck bigint,
  avg_seconds_to_first_transition double precision,
  avg_seconds_to_review double precision
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT * FROM public.membership_operational_metrics_v1;
$$;
