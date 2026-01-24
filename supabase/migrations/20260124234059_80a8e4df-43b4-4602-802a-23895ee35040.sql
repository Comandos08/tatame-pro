-- Função RPC para lookup seguro de memberships por storage_path
-- Usa jsonb_path_exists para evitar operadores frágeis (cs, @>, LIKE)
CREATE OR REPLACE FUNCTION public.find_memberships_by_tmp_storage_path(
  p_storage_path text
)
RETURNS TABLE (
  id uuid,
  status text
)
LANGUAGE sql
STABLE
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