-- Update membership to ACTIVE/PAID for testing digital card generation
UPDATE public.memberships 
SET 
  status = 'ACTIVE',
  payment_status = 'PAID',
  start_date = CURRENT_DATE,
  end_date = CURRENT_DATE + INTERVAL '1 year',
  updated_at = now()
WHERE id = '1b4a510c-6656-48fe-9a1e-43a09ae50c1a';