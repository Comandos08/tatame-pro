-- View otimizada para graduação atual do atleta
-- SAFE MODE: Não substitui queries existentes. Uso futuro controlado.

CREATE OR REPLACE VIEW public.athlete_current_grading AS
SELECT DISTINCT ON (ag.athlete_id)
  ag.athlete_id,
  ag.tenant_id,
  ag.grading_level_id,
  ag.promotion_date,
  gl.display_name AS level_name,
  gl.code AS level_code,
  gl.order_index,
  gs.name AS scheme_name,
  gs.sport_type
FROM athlete_gradings ag
JOIN grading_levels gl ON gl.id = ag.grading_level_id
JOIN grading_schemes gs ON gs.id = gl.grading_scheme_id
ORDER BY ag.athlete_id, ag.promotion_date DESC, ag.created_at DESC;

COMMENT ON VIEW public.athlete_current_grading IS
'View otimizada para leitura da graduação atual do atleta.
Não substitui queries existentes. Uso futuro controlado.';

ALTER VIEW public.athlete_current_grading
SET (security_invoker = on);