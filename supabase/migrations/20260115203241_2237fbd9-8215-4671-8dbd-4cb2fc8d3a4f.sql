-- Add description column to tenants table
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS description text;

-- Add comment for documentation
COMMENT ON COLUMN public.tenants.description IS 'Brief description of the tenant/organization for the public landing page';