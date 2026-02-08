-- PI-D1-EX: Explicit Document States (Fixed)
-- Add status column to digital_cards for explicit lifecycle management

-- Create digital card status enum
DO $$ BEGIN
  CREATE TYPE digital_card_status AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add status column to digital_cards (if not exists)
DO $$ BEGIN
  ALTER TABLE digital_cards ADD COLUMN status digital_card_status NOT NULL DEFAULT 'ACTIVE';
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- Add revoked_at for first-class revocation tracking (if not exists)
DO $$ BEGIN
  ALTER TABLE digital_cards ADD COLUMN revoked_at TIMESTAMP WITH TIME ZONE;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- Add revoked_reason for audit trail (if not exists)
DO $$ BEGIN
  ALTER TABLE digital_cards ADD COLUMN revoked_reason TEXT;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- Create tenant_status enum (separate from existing text column)
DO $$ BEGIN
  CREATE TYPE tenant_lifecycle_status AS ENUM ('SETUP', 'ACTIVE', 'BLOCKED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add lifecycle_status column to tenants (explicit enum)
DO $$ BEGIN
  ALTER TABLE tenants ADD COLUMN lifecycle_status tenant_lifecycle_status NOT NULL DEFAULT 'ACTIVE';
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- Sync lifecycle_status from existing status column
UPDATE tenants 
SET lifecycle_status = CASE 
  WHEN status = 'SETUP' THEN 'SETUP'::tenant_lifecycle_status
  WHEN status = 'BLOCKED' OR status = 'SUSPENDED' THEN 'BLOCKED'::tenant_lifecycle_status
  ELSE 'ACTIVE'::tenant_lifecycle_status
END;

-- Add indexes for status queries
CREATE INDEX IF NOT EXISTS idx_digital_cards_status ON digital_cards(status);
CREATE INDEX IF NOT EXISTS idx_tenants_lifecycle_status ON tenants(lifecycle_status);

-- Comment for documentation
COMMENT ON COLUMN digital_cards.status IS 'Explicit lifecycle state: DRAFT (pending), ACTIVE (valid), SUSPENDED (temp hold), EXPIRED (time-based), REVOKED (permanent)';
COMMENT ON COLUMN digital_cards.revoked_at IS 'Timestamp of revocation - immutable once set';
COMMENT ON COLUMN tenants.lifecycle_status IS 'Explicit tenant lifecycle: SETUP (onboarding), ACTIVE (operational), BLOCKED (suspended/restricted)';