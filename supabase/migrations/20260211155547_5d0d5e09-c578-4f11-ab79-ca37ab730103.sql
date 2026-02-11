-- ============================================================================
-- PI-A06: Institutional Audit Snapshot Functions (SAFE GOLD)
-- READ-ONLY catalog inspection. Zero mutations. Zero side effects.
-- ============================================================================

-- 1️⃣ RLS Policies Snapshot
CREATE OR REPLACE FUNCTION public.audit_rls_snapshot()
RETURNS TABLE (
  schemaname text,
  tablename text,
  policyname text,
  permissive text,
  roles text[],
  cmd text,
  qual text,
  with_check text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    n.nspname AS schemaname,
    cls.relname AS tablename,
    pol.polname AS policyname,
    CASE WHEN pol.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
    ARRAY(
      SELECT rolname FROM pg_roles WHERE oid = ANY(pol.polroles)
    ) AS roles,
    CASE pol.polcmd
      WHEN 'r' THEN 'SELECT'
      WHEN 'a' THEN 'INSERT'
      WHEN 'w' THEN 'UPDATE'
      WHEN 'd' THEN 'DELETE'
      WHEN '*' THEN 'ALL'
    END,
    pg_get_expr(pol.polqual, pol.polrelid),
    pg_get_expr(pol.polwithcheck, pol.polrelid)
  FROM pg_policy pol
  JOIN pg_class cls ON pol.polrelid = cls.oid
  JOIN pg_namespace n ON cls.relnamespace = n.oid
  WHERE n.nspname = 'public'
  ORDER BY cls.relname, pol.polname;
$$;

COMMENT ON FUNCTION public.audit_rls_snapshot()
IS 'Institutional audit function — read-only RLS policy catalog inspection. No mutations. PI-A06 SAFE GOLD.';

-- 2️⃣ SECURITY DEFINER Functions Snapshot
CREATE OR REPLACE FUNCTION public.audit_security_definer_snapshot()
RETURNS TABLE (
  schema text,
  function_name text,
  definition text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    n.nspname,
    p.proname,
    pg_get_functiondef(p.oid)
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE p.prosecdef = true
    AND n.nspname = 'public'
  ORDER BY p.proname;
$$;

COMMENT ON FUNCTION public.audit_security_definer_snapshot()
IS 'Institutional audit function — read-only SECURITY DEFINER catalog inspection. No mutations. PI-A06 SAFE GOLD.';

-- 3️⃣ Tables Without RLS
CREATE OR REPLACE FUNCTION public.audit_tables_without_rls()
RETURNS TABLE (
  tablename text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.relname
  FROM pg_class c
  JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relrowsecurity = false
  ORDER BY c.relname;
$$;

COMMENT ON FUNCTION public.audit_tables_without_rls()
IS 'Institutional audit function — read-only detection of tables without RLS. No mutations. PI-A06 SAFE GOLD.';