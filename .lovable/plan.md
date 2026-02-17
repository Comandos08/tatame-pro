

# PI-MEMBERSHIP-LIFECYCLE-FIX-001
## Contract Clarification + Deterministic Resolution (PLAN ONLY)

---

## SECTION 1 -- RECOMMENDATION

### Decision: OPTION A -- APPROVED is the final operational state

**Justification:**

1. The system already treats APPROVED as operational in 7 out of 10 reference points (verify-digital-card, resolveAthletePostLoginRedirect, AthleteArea, MembershipTypeSelector, check-membership-renewal, TenantDashboard expiring count, MembershipStatus page).
2. No code path creates the APPROVED-to-ACTIVE transition. ACTIVE has never been set by any function in the membership domain.
3. Option B would require creating a new transition mechanism (RPC, cron, or auto-trigger), adding complexity with zero functional benefit since APPROVED already means "administratively approved + paid + athlete created + roles assigned."
4. Option A requires only alignment corrections (changing 4-5 queries that filter exclusively on ACTIVE to include APPROVED), which is strictly additive and non-breaking.

**Risk Classification: LOW**

---

## SECTION 2 -- COMPLETE IMPACT ANALYSIS

### 2.1 Edge Functions

| File | Line | Uses ACTIVE? | Uses APPROVED? | Classification | Impact Option A | Impact Option B |
|---|---|---|---|---|---|---|
| `approve-membership/index.ts` | 698 | No | YES (sets it) | Operational | None -- correct as-is | Must add APPROVED-to-ACTIVE transition after |
| `expire-memberships/index.ts` | 130, 179 | YES (only) | No | Cron | CHANGE: add APPROVED to filter | None -- ACTIVE would be set by then |
| `verify-digital-card/index.ts` | 260 | YES | YES (both) | External verification | None -- already correct | None -- already correct |
| `check-membership-renewal/index.ts` | 90 | YES | YES (both) | Cron | None -- already correct | None -- ACTIVE would be set by then |
| `pre-expiration-scheduler/index.ts` | 260 | YES (only) | No | Cron | CHANGE: add APPROVED to filter | None -- ACTIVE would be set by then |

### 2.2 Frontend Pages

| File | Line | Uses ACTIVE? | Uses APPROVED? | Classification | Impact Option A | Impact Option B |
|---|---|---|---|---|---|---|
| `TenantDashboard.tsx` | 88 | YES (only) | No | KPI (active count) | CHANGE: add APPROVED to filter | None |
| `TenantDashboard.tsx` | 94 | YES | YES (both) | KPI (expiring) | None -- already correct | None |
| `AdminDashboard.tsx` | 124 | YES (only) | No | KPI (superadmin) | CHANGE: add APPROVED to filter | None |
| `PublicRankings.tsx` | 64 | YES (only) | No | Visual (rankings) | CHANGE: add APPROVED to filter | None |
| `InternalRankings.tsx` | 93 | YES (only) | No | Visual (rankings) | CHANGE: add APPROVED to filter | None |
| `AthleteGradingsPage.tsx` | 119 | YES (only) | No | Operational (grading check) | CHANGE: add APPROVED to filter | None |
| `AthletePortal.tsx` | 236 | YES (only) | No | Visual (renewal reminder) | CHANGE: add APPROVED to condition | None |
| `AthleteArea.tsx` | 304 | YES | YES (both) | Operational (find active) | None -- already correct | None |
| `MembershipStatus.tsx` | 31 | YES | YES (both) | Visual (status page) | None -- already correct | None |
| `MembershipRenew.tsx` | 121 | YES | YES (via redirect fn) | Operational (renewal gate) | None -- already correct | None |
| `VerifyMembership.tsx` | 141 | YES | YES (both) | External verification | None -- already correct | None |

### 2.3 Components

| File | Line | Uses ACTIVE? | Uses APPROVED? | Classification | Impact Option A | Impact Option B |
|---|---|---|---|---|---|---|
| `DigitalMembershipCard.tsx` | 19 | YES | YES (type def) | Visual | None -- already correct | None |
| `DigitalCardSection.tsx` | 85 | YES (hardcoded) | No | Visual | Consider: should be dynamic | Same |
| `MembershipTypeSelector.tsx` | 55 | YES | YES (both) | Operational | None -- already correct | None |

### 2.4 Libraries and Types

| File | Line | Uses ACTIVE? | Uses APPROVED? | Classification | Impact Option A | Impact Option B |
|---|---|---|---|---|---|---|
| `resolveAthletePostLoginRedirect.ts` | 26-28 | YES | YES (both -> portal) | Routing | None -- already correct | None |
| `resolveMembershipNotification.ts` | 363, 443 | YES | YES (both) | Notification engine | None -- already correct | None |
| `types/membership.ts` | 3 | YES | YES (enum) | Type definition | Document ACTIVE as legacy | None |
| `statusUtils.ts` | 8 | YES | YES (both) | UI utilities | None -- already correct | None |
| `formatAuditEvent.ts` | 119 | No | YES (audit label) | Audit display | None | None |

---

## SECTION 3 -- CONSOLIDATED CHANGES REQUIRED (Option A)

### Files requiring modification (7 files, 8 changes):

1. **`supabase/functions/expire-memberships/index.ts`** (lines 130, 179)
   - Change `.eq("status", "ACTIVE")` to `.in("status", ["ACTIVE", "APPROVED"])`
   - Both the query and the race-condition guard

2. **`supabase/functions/pre-expiration-scheduler/index.ts`** (line 260)
   - Change `.eq("status", "ACTIVE")` to `.in("status", ["ACTIVE", "APPROVED"])`

3. **`src/pages/TenantDashboard.tsx`** (line 88)
   - Change `.eq('status', 'ACTIVE')` to `.in('status', ['ACTIVE', 'APPROVED'])`

4. **`src/pages/AdminDashboard.tsx`** (line 124)
   - Change `.eq('status', 'ACTIVE')` to `.in('status', ['ACTIVE', 'APPROVED'])`

5. **`src/pages/PublicRankings.tsx`** (line 64)
   - Change `.eq('status', 'ACTIVE')` to `.in('status', ['ACTIVE', 'APPROVED'])`

6. **`src/pages/InternalRankings.tsx`** (line 93)
   - Change `.eq('status', 'ACTIVE')` to `.in('status', ['ACTIVE', 'APPROVED'])`

7. **`src/pages/AthleteGradingsPage.tsx`** (line 119)
   - Change `.eq('status', 'ACTIVE')` to `.in('status', ['ACTIVE', 'APPROVED'])`

8. **`src/pages/AthletePortal.tsx`** (line 236)
   - Change `membershipStatus === "ACTIVE"` to `(membershipStatus === "ACTIVE" || membershipStatus === "APPROVED")`

### Files already correct (no changes needed): 13 files

These already handle both APPROVED and ACTIVE: verify-digital-card, check-membership-renewal, AthleteArea, MembershipStatus, VerifyMembership, MembershipTypeSelector, resolveAthletePostLoginRedirect, resolveMembershipNotification, DigitalMembershipCard, TenantDashboard (expiring count).

---

## SECTION 4 -- CONSISTENCY VERIFICATION MATRIX

After Option A is applied, all references will use the same operational definition:

| Criterion | Current State | After Fix |
|---|---|---|
| Dashboard "Active Memberships" count | ACTIVE only (misses APPROVED) | ACTIVE + APPROVED |
| Expiration cron | ACTIVE only (misses APPROVED) | ACTIVE + APPROVED |
| Pre-expiration scheduler | ACTIVE only (misses APPROVED) | ACTIVE + APPROVED |
| Digital card verification | ACTIVE + APPROVED | ACTIVE + APPROVED (unchanged) |
| Renewal reminders | ACTIVE + APPROVED | ACTIVE + APPROVED (unchanged) |
| Athlete portal access | ACTIVE + APPROVED | ACTIVE + APPROVED (unchanged) |
| Rankings | ACTIVE only (misses APPROVED) | ACTIVE + APPROVED |
| Post-login redirect | ACTIVE + APPROVED | ACTIVE + APPROVED (unchanged) |

---

## SECTION 5 -- CANONICAL CONTRACT (Post-Fix)

```text
DRAFT
  -> PENDING_PAYMENT
    -> PENDING_REVIEW (payment confirmed)
      -> APPROVED (admin approval -- final operational state)
        -> EXPIRED (cron or manual)
        -> CANCELLED (admin action)
      -> REJECTED (admin rejection)
```

- **APPROVED** = fully operational membership (paid, reviewed, athlete created, roles assigned)
- **ACTIVE** = legacy alias, treated identically to APPROVED in all queries
- The enum value ACTIVE remains in the database but is never written by any current code path
- Future PI may formally deprecate ACTIVE from the enum (breaking change, deferred)

---

## SECTION 6 -- EXECUTION PLAN FOR NEXT PI

**PI-MEMBERSHIP-LIFECYCLE-ALIGN-001** (execution PI, pending approval):

1. Modify 2 Edge Functions (expire-memberships, pre-expiration-scheduler)
2. Modify 5 frontend files (TenantDashboard, AdminDashboard, PublicRankings, InternalRankings, AthleteGradingsPage, AthletePortal)
3. Add code comment documenting APPROVED as canonical operational state
4. Create drift detection view for membership status consistency (optional, separate PI)
5. Zero migrations, zero enum changes, zero RLS changes

**Risk: LOW** -- All changes are additive (expanding filters), no deletions, no state transitions altered.

---

## SECTION 7 -- PROHIBITIONS COMPLIANCE

| Prohibition | Status |
|---|---|
| No migration created | Confirmed |
| No enum altered | Confirmed |
| No gatekeeper created | Confirmed |
| No cron altered | Confirmed (plan only) |
| No Edge Functions altered | Confirmed (plan only) |
| No RLS altered | Confirmed |
| No privileges altered | Confirmed |

