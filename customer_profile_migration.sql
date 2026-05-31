-- ============================================================
-- ASO CLO — Customer Profile Schema Update
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Add missing profile columns (safe — uses IF NOT EXISTS pattern)
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS governorate text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS detailed_address text;

-- 2. If 'name' column exists, populate 'full_name' from it, then drop
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'customers' AND column_name = 'name') THEN
    -- Migrate data
    UPDATE customers SET full_name = COALESCE(full_name, name) WHERE name IS NOT NULL;
    ALTER TABLE customers DROP COLUMN name;
  END IF;
END $$;

-- 3. Enable RLS on customers (if not already)
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- 4. Policies: users can only read/update their own row
DROP POLICY IF EXISTS "users_read_own_profile" ON customers;
CREATE POLICY "users_read_own_profile"
  ON customers FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "users_update_own_profile" ON customers;
CREATE POLICY "users_update_own_profile"
  ON customers FOR UPDATE
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "users_insert_own_profile" ON customers;
CREATE POLICY "users_insert_own_profile"
  ON customers FOR INSERT
  WITH CHECK (auth.uid() = id);

-- 5. Service role bypass (for OAuth callback route handler)
DROP POLICY IF EXISTS "service_role_full_access_customers" ON customers;
CREATE POLICY "service_role_full_access_customers"
  ON customers USING (true) WITH CHECK (true);

-- 6. Enable realtime for customers table
-- (Run manually: Supabase Dashboard → Database → Replication → Toggle 'customers')
