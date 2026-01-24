-- Fix: Set search_path para função RPC
CREATE OR REPLACE FUNCTION public.find_memberships_by_tmp_storage_path(
  p_storage_path text
)
RETURNS TABLE (
  id uuid,
  status text
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT m.id, m.status::text
  FROM public.memberships m
  WHERE jsonb_path_exists(
    m.documents_uploaded,
    format(
      '$[*] ? (@.storage_path == "%s")',
      p_storage_path
    )::jsonpath
  );
$$;