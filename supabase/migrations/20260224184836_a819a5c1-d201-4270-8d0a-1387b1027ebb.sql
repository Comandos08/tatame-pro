DO $$
BEGIN
  ALTER TABLE document_public_tokens
    ADD CONSTRAINT document_public_tokens_document_unique
    UNIQUE (document_type, document_id);
EXCEPTION
  WHEN duplicate_object THEN
    -- Constraint already exists, do nothing
    NULL;
END $$;