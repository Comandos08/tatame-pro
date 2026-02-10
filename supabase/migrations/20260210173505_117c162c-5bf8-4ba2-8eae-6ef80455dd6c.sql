
-- =====================================================
-- PI U7.F2 — RLS HARDENING: Remove Public Enumeration
-- =====================================================
-- Removes 4 public SELECT policies that allow cross-tenant enumeration
-- Public data access migrated to Edge Functions

-- F2.E1: academies — remove global public read
DROP POLICY IF EXISTS "Public can view active academies" ON public.academies;

-- F2.E2: grading_schemes — remove global public read
DROP POLICY IF EXISTS "Public can view active grading schemes" ON public.grading_schemes;

-- F2.E3: grading_levels — remove global public read
DROP POLICY IF EXISTS "Public can view active grading levels" ON public.grading_levels;

-- F2.E4: coaches — remove public enumeration via diploma check
DROP POLICY IF EXISTS "Public can view coach via diploma verification" ON public.coaches;
