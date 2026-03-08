CORE_SYSTEM_FLOWS.md
Project: Tatame Pro
Status: Canonical System Flow Map
Purpose: Define the critical operational flows that govern system behavior.

---

# 1. PURPOSE

This document defines the core operational flows of Tatame Pro.

A system flow describes:

- user actions
- system validations
- service operations
- state transitions
- side effects

Claude must use this document to understand how the platform behaves in real operation.

These flows represent the **behavioral backbone** of the system.

---

# 2. FLOW DESIGN PRINCIPLES

All system flows follow these principles.

Deterministic state transitions  
Tenant isolation enforcement  
Backend validation authority  
Auditability of critical decisions  

Frontend actions must always be validated by backend services.

---

# 3. TENANT ONBOARDING FLOW

Purpose:
Create and activate a new organization on the platform.

Actors:

- new tenant admin
- system backend

Flow:

1. Admin creates account.
2. Identity wizard collects identity information.
3. Tenant onboarding process begins.
4. Backend creates tenant record.
5. Admin is assigned tenant_admin role.
6. Tenant billing state initialized.
7. Trial period begins.

Possible states:

trialing  
active  
expired  
pending_delete  

Edge functions involved:

complete-tenant-onboarding  
create-tenant-admin  
expire-trials  

Entities involved:

profiles  
tenants  
user_roles  
tenant_billing  

---

# 4. ATHLETE AFFILIATION FLOW

Purpose:
Register a new athlete and associate them with a tenant.

Actors:

- athlete
- tenant admin
- system backend

Flow:

1. Athlete submits affiliation request.
2. Applicant data is stored.
3. Membership status becomes "pending".
4. Admin reviews application.
5. Admin approves or rejects membership.
6. If approved:
   - athlete record created
   - membership activated
7. Athlete receives confirmation.

Edge functions involved:

join-federation  
approve-membership  
reject-membership  

Entities involved:

athletes  
memberships  
profiles  

Possible membership states:

pending_review  
approved  
rejected  
active  

---

# 5. MEMBERSHIP PAYMENT FLOW

Purpose:
Handle payment for athlete affiliation.

Actors:

- athlete
- payment gateway
- system backend

Flow:

1. Athlete initiates membership checkout.
2. Payment session created.
3. Athlete completes payment.
4. Payment confirmation webhook received.
5. Backend validates payment.
6. Membership status updated.

Edge functions involved:

create-membership-checkout  
confirm-membership-payment  
retry-membership-payment  

Entities involved:

memberships  
tenant_invoices  
billing records  

Failure handling:

- pending payment
- retry allowed
- abandoned checkout cleanup

---

# 6. MEMBERSHIP RENEWAL FLOW

Purpose:
Extend an athlete's membership validity.

Flow:

1. System detects upcoming expiration.
2. Renewal eligibility validated.
3. Athlete initiates renewal payment.
4. Renewal payment processed.
5. Membership expiration date extended.

Edge functions involved:

check-membership-renewal  
expire-memberships  

Entities involved:

memberships  

Renewal must preserve historical records.

---

# 7. YOUTH ATHLETE TRANSITION FLOW

Purpose:
Handle transition from youth membership to adult membership.

Actors:

- system automation
- backend services

Flow:

1. System detects athlete reaching adulthood.
2. Guardian-linked membership reviewed.
3. Membership type updated.
4. Guardian relationship archived.
5. Athlete receives updated membership status.

Edge functions involved:

transition-youth-to-adult  

Entities involved:

athletes  
guardians  
guardian_links  
memberships  

---

# 8. GRADUATION FLOW

Purpose:
Record athlete belt promotion.

Actors:

- coach
- federation
- system backend

Flow:

1. Coach submits graduation event.
2. Graduation record created.
3. Graduation validated.
4. Diploma generated.
5. Notification sent to athlete.

Edge functions involved:

generate-diploma  
notify-new-grading  

Entities involved:

athlete_gradings  
grading_levels  
diplomas  

Graduation records must remain immutable.

---

# 9. DIGITAL IDENTITY FLOW

Purpose:
Generate verifiable digital credentials.

Actors:

- athlete
- external verifier
- backend system

Flow:

1. Athlete digital card generated.
2. Card stored in digital_cards table.
3. Verification token created.
4. Public verification endpoint exposed.
5. External verification requests resolved.

Edge functions involved:

generate-digital-card  
verify-digital-card  
verify-document  

Entities involved:

digital_cards  
documents  
document_public_tokens  

Verification must not expose private data.

---

# 10. EVENT REGISTRATION FLOW

Purpose:
Register athletes into competitions.

Actors:

- athlete
- event organizer

Flow:

1. Event published.
2. Athlete registers.
3. Registration validated.
4. Athlete added to division.

Entities involved:

events  
event_categories  
event_registrations  

---

# 11. MATCH RESULT FLOW

Purpose:
Record competition outcomes.

Actors:

- event official
- system backend

Flow:

1. Match occurs.
2. Official records result.
3. Result stored.
4. Ranking updated.

Edge functions involved:

record-match-result  

Entities involved:

event_results  
event_bracket_matches  

Results must remain immutable once confirmed.

---

# 12. RANKING UPDATE FLOW

Purpose:
Calculate athlete rankings based on competition outcomes.

Flow:

1. Event results recorded.
2. Ranking calculation triggered.
3. Ranking tables updated.
4. Rankings displayed publicly.

Entities involved:

event_results  
ranking entities  

Ranking must be deterministic.

---

# 13. PUBLIC VERIFICATION FLOW

Purpose:
Allow third parties to verify athlete credentials.

Actors:

- external user
- verification endpoint

Flow:

1. User scans QR code or token.
2. Verification request sent.
3. Backend validates document token.
4. Document returned for validation.

Edge functions involved:

verify-document  
verify-diploma  

Entities involved:

documents  
document_public_tokens  

Public verification must only expose non-sensitive data.

---

# 14. TENANT BILLING FLOW

Purpose:
Manage tenant subscription lifecycle.

Flow:

1. Tenant signs up.
2. Trial period begins.
3. Subscription activated.
4. Billing invoices generated.
5. Failed payment triggers grace period.
6. Expired tenant may be disabled.

Edge functions involved:

create-tenant-subscription  
stripe-webhook  
expire-trials  
expire-grace-period  

Entities involved:

tenant_billing  
tenant_invoices  
subscription_plans  

---

# 15. ADMIN OBSERVABILITY FLOW

Purpose:
Allow superadmin to monitor system health.

Actors:

- superadmin

Flow:

1. Admin accesses system dashboard.
2. System health metrics loaded.
3. Security events displayed.
4. Audit logs available.

Entities involved:

audit_logs  
decision_logs  
security_events  

---

# 16. SYSTEM FLOW CLASSIFICATION

Flows can be categorized as:

Identity flows  
Affiliation flows  
Certification flows  
Competition flows  
Governance flows  
Billing flows  

Each category must maintain deterministic behavior.

---

# 17. FAILURE HANDLING

All flows must support failure detection.

Examples include:

payment failure  
invalid identity  
expired membership  
duplicate registration  

Failures must never corrupt system state.

---

# 18. CLAUDE INTERPRETATION RULE

Claude must treat these flows as canonical system behavior.

Any prompt generated for Lovable must respect these flows.

If a proposed change breaks a core flow, the change must be rejected.

---

# END OF CORE_SYSTEM_FLOWS.md