
-- Add review fields to memberships for Phase 2a
ALTER TABLE public.memberships
ADD COLUMN IF NOT EXISTS review_notes TEXT,
ADD COLUMN IF NOT EXISTS reviewed_by_profile_id UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Create index for review lookups
CREATE INDEX IF NOT EXISTS idx_memberships_reviewed_by ON public.memberships(reviewed_by_profile_id);
CREATE INDEX IF NOT EXISTS idx_memberships_status ON public.memberships(status);

-- Create storage bucket for digital cards
INSERT INTO storage.buckets (id, name, public) 
VALUES ('cards', 'cards', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for cards bucket (public read, authenticated write)
CREATE POLICY "Public can view cards"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'cards');

CREATE POLICY "Service role can manage cards"
  ON storage.objects FOR ALL
  USING (bucket_id = 'cards')
  WITH CHECK (bucket_id = 'cards');
