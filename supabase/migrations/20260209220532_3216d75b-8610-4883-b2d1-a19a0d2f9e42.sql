
-- ============================================================
-- PI A2.1: Seed Inicial de Badges Canônicos
-- Popula tabela badges com catálogo simbólico para cada tenant.
-- Idempotente via ON CONFLICT DO NOTHING.
-- Zero funcionalidade ativa. Zero alteração em RLS/guards.
-- ============================================================

INSERT INTO public.badges (tenant_id, code, name, description)
SELECT
  t.id,
  b.code,
  b.name,
  b.description
FROM public.tenants t
CROSS JOIN (
  VALUES
    ('HEAD_COACH', 'Head Coach', 'Responsável técnico principal'),
    ('ASSISTANT_COACH', 'Assistant Coach', 'Apoio técnico'),
    ('INSTRUCTOR', 'Instructor', 'Instrutor autorizado'),
    ('REFEREE', 'Referee', 'Árbitro'),
    ('STAFF', 'Staff', 'Apoio administrativo'),
    ('ORGANIZER', 'Organizer', 'Organização de eventos')
) AS b(code, name, description)
ON CONFLICT (tenant_id, code) DO NOTHING;
