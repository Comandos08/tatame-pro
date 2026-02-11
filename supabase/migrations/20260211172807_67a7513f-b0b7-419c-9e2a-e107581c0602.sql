
-- PI-A08: RPC to audit public/anon access patterns
-- READ-ONLY, no side effects, SUPERADMIN_GLOBAL only via Edge Function

CREATE OR REPLACE FUNCTION public.audit_public_access_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Collect: tables with anon policies, their commands, and expressions
  SELECT jsonb_agg(
    jsonb_build_object(
      'schemaname', p.schemaname,
      'tablename', p.tablename,
      'policyname', p.policyname,
      'cmd', p.cmd,
      'permissive', p.permissive,
      'roles', p.roles::text[],
      'qual', p.qual,
      'with_check', p.with_check
    )
  )
  INTO result
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND (
      p.roles::text[] && ARRAY['anon']
      OR p.roles::text[] && ARRAY['{anon}']
      OR 'anon' = ANY(p.roles::text[])
    );
  
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;
