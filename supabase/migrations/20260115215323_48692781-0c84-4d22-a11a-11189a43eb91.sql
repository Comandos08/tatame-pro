-- Remove the overly permissive SELECT policy that allows any authenticated user to view all documents
DROP POLICY IF EXISTS "Users can view own documents" ON storage.objects;

-- Create a restrictive policy that only allows service role access for the documents bucket
-- All user access will go through the get-document edge function which uses service role
CREATE POLICY "Service role can manage documents"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'documents')
  WITH CHECK (bucket_id = 'documents');

-- Note: The existing INSERT policies for authenticated and anon users remain unchanged
-- as they are needed for the public membership flow to upload documents