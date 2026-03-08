PRODUCT_MODULES.md
Project: Tatame Pro
Status: Canonical Product Module Map
Purpose: Define the real product modules that currently exist in Tatame Pro based on repository analysis.

---

# 1. PRODUCT DEFINITION

Tatame Pro is a multi-tenant SaaS platform for sports governance, athlete affiliation, certification, document issuance, institutional billing, and public verification.

The system is designed for formal sports organizations that require:

- athlete registration and affiliation lifecycle
- academy and staff governance
- belt progression and diploma issuance
- digital identity and public verification
- secure multi-tenant operation
- institutional billing and trial lifecycle
- auditability and traceability

Tatame Pro is not a generic gym software.
Tatame Pro is not a class scheduling system.
Tatame Pro is not a training content platform.

Tatame Pro is an institutional governance platform.

---

# 2. PRODUCT MODULE MAP

Tatame Pro currently contains the following product modules.

## 2.1 Institutional Platform Module

Purpose:
Manage the institutional surface of the platform and public-facing organizational presence.

Includes:
- landing page
- about/help pages
- public tenant landing
- public academies listing
- public rankings
- public events
- platform landing configuration
- partners configuration
- institutional events
- institutional feature flags

Primary repository evidence:
- src/pages/Landing.tsx
- src/pages/TenantLanding.tsx
- src/pages/PublicAcademies.tsx
- src/pages/PublicRankings.tsx
- src/pages/PublicEventsList.tsx
- src/pages/PublicEventDetails.tsx
- src/pages/AdminLandingSettings.tsx
- supabase/migrations/*platform_landing_config*
- supabase/migrations/*platform_partners*
- supabase/migrations/*institutional_events*
- supabase/migrations/*institutional_feature_flags*

Classification:
Core support module

---

## 2.2 Identity and Access Module

Purpose:
Handle authentication, password recovery, role attribution, identity completion and access gates.

Includes:
- login
- signup
- forgot/reset password
- auth callback
- identity wizard
- role validation
- feature access control
- identity troubleshooting contracts
- access gates for tenant and athlete areas

Primary repository evidence:
- src/pages/Login.tsx
- src/pages/SignUp.tsx
- src/pages/ForgotPassword.tsx
- src/pages/ResetPassword.tsx
- src/pages/AuthCallback.tsx
- src/pages/IdentityWizard.tsx
- src/components/identity/*
- src/components/auth/*
- src/lib/auth/*
- src/lib/identity/*
- supabase/functions/resolve-identity-wizard
- supabase/functions/request-password-reset
- supabase/functions/reset-password
- supabase/functions/grant-roles
- supabase/functions/revoke-roles
- supabase/migrations/*profiles*
- supabase/migrations/*user_roles*
- supabase/migrations/*feature_access*

Classification:
Core foundation module

---

## 2.3 Tenant Governance Module

Purpose:
Manage tenant lifecycle, tenant context, onboarding, diagnostics and operational access boundaries.

Includes:
- tenant creation and control
- tenant dashboard
- tenant settings
- tenant onboarding
- tenant help
- tenant diagnostics
- tenant layout and routing
- tenant boundary validation
- tenant activation/blocking logic

Primary repository evidence:
- src/pages/TenantDashboard.tsx
- src/pages/TenantSettings.tsx
- src/pages/TenantOnboarding.tsx
- src/pages/TenantHelp.tsx
- src/pages/TenantDiagnostics.tsx
- src/pages/TenantControl.tsx
- src/layouts/TenantLayout.tsx
- src/domain/tenant/*
- src/hooks/tenant/*
- supabase/functions/complete-tenant-onboarding
- supabase/functions/create-tenant-admin
- supabase/functions/mark-pending-delete
- supabase/functions/cleanup-expired-tenants
- supabase/functions/tenant-customer-portal
- supabase/functions/_shared/tenant-boundary.ts
- supabase/migrations/*tenants*
- supabase/migrations/*deleted_tenants*

Classification:
Core foundation module

---

## 2.4 Billing and Subscription Module

Purpose:
Manage organizational subscription lifecycle, trial, grace period, expiration, reactivation and billing observability.

Includes:
- tenant billing page
- billing gates
- subscription lifecycle
- trialing / trial expired / pending delete / active
- invoices
- plans
- Stripe integration
- billing analytics and observability
- billing consistency audits

Primary repository evidence:
- src/pages/TenantBilling.tsx
- src/components/billing/*
- src/domain/billing/*
- src/domain/payments/*
- src/lib/billing/*
- supabase/functions/create-tenant-subscription
- supabase/functions/admin-billing-control
- supabase/functions/tenant-customer-portal
- supabase/functions/stripe-webhook
- supabase/functions/stripe-test
- supabase/functions/expire-trials
- supabase/functions/expire-grace-period
- supabase/functions/check-trial-ending
- supabase/functions/audit-billing-consistency
- supabase/functions/send-billing-email
- supabase/migrations/*tenant_billing*
- supabase/migrations/*tenant_invoices*
- supabase/migrations/*billing_environment_config*
- supabase/migrations/*subscription_plans*

Classification:
Core monetization module

---

## 2.5 Academy Management Module

Purpose:
Manage academies linked to a tenant and their public/institutional representation.

Includes:
- academies listing
- academy governance
- public academies
- academy relationships with coaches and athletes

Primary repository evidence:
- src/pages/AcademiesList.tsx
- src/pages/PublicAcademies.tsx
- src/components/tenant/*
- src/components/admin/*
- supabase/functions/list-public-academies
- supabase/migrations/*academies*

Classification:
Core business module

---

## 2.6 Coach and Staff Module

Purpose:
Manage instructors, coaches and organization staff that operate the tenant.

Includes:
- coaches list
- federation/tenant staff relationships
- staff access to app routes
- coach relationships to academies

Primary repository evidence:
- src/pages/CoachesList.tsx
- src/components/auth/RequireRoles.tsx
- src/routes/AppRouter.tsx
- supabase/migrations/*coaches*
- supabase/migrations/*academy_coaches*
- supabase/migrations/*federation_roles*

Classification:
Core governance module

---

## 2.7 Athlete Registry Module

Purpose:
Maintain institutional athlete records and operational athlete administration.

Includes:
- athlete listing
- athlete creation through affiliation approval
- athlete area
- athlete portal
- youth/adult distinctions
- athlete badges
- athlete email and communication support

Primary repository evidence:
- src/pages/AthletesList.tsx
- src/pages/AthleteArea.tsx
- src/pages/AthletePortal.tsx
- src/components/athlete/*
- src/domain/athlete-portal/*
- src/domain/youth/*
- supabase/functions/send-athlete-email
- supabase/functions/assign-athlete-badge
- supabase/functions/revoke-athlete-badge
- supabase/functions/toggle-badge-active
- supabase/functions/update-badge-metadata
- supabase/migrations/*athletes*
- supabase/migrations/*badges*
- supabase/migrations/*athlete_badges*

Classification:
Core business module

---

## 2.8 Membership and Affiliation Module

Purpose:
Manage the athlete affiliation lifecycle with the organization.

Includes:
- new membership
- adult membership
- youth membership
- membership renewal
- checkout
- status page
- approval and rejection
- cancellation and reactivation
- expiration flows
- renewal checks
- payment confirmation
- applicant data and document workflow

Primary repository evidence:
- src/pages/MembershipNew.tsx
- src/pages/MembershipAdult.tsx
- src/pages/MembershipYouth.tsx
- src/pages/MembershipRenew.tsx
- src/pages/MembershipCheckout.tsx
- src/pages/MembershipStatus.tsx
- src/pages/MembershipList.tsx
- src/pages/MembershipDetails.tsx
- src/pages/ApprovalsList.tsx
- src/pages/ApprovalDetails.tsx
- src/components/membership/*
- src/domain/onboarding/*
- src/lib/membership/*
- supabase/functions/join-federation
- supabase/functions/leave-federation
- supabase/functions/approve-membership
- supabase/functions/reject-membership
- supabase/functions/create-membership-checkout
- supabase/functions/create-membership-fee-checkout
- supabase/functions/confirm-membership-payment
- supabase/functions/retry-membership-payment
- supabase/functions/cancel-membership-manual
- supabase/functions/reactivate-membership-manual
- supabase/functions/check-membership-renewal
- supabase/functions/cleanup-abandoned-memberships
- supabase/functions/cleanup-pending-payment-memberships
- supabase/functions/expire-memberships
- supabase/functions/transition-youth-to-adult
- supabase/migrations/*memberships*
- supabase/migrations/*membership_analytics*

Classification:
Core business module

---

## 2.9 Guardian and Youth Compliance Module

Purpose:
Handle minor athlete flows with guardian relationships and age-based lifecycle rules.

Includes:
- guardian capture in youth flow
- guardian links
- youth-specific applicant structure
- automatic transition from minor to adult
- preservation of legal history

Primary repository evidence:
- src/pages/MembershipYouth.tsx
- src/domain/youth/*
- supabase/functions/transition-youth-to-adult
- supabase/migrations/*guardians*
- supabase/migrations/*guardian_links*

Classification:
Core specialized module

---

## 2.10 Grading and Graduation Module

Purpose:
Manage grading schemes, level structures, athlete gradings and diploma issuance.

Includes:
- grading schemes
- grading levels
- athlete gradings
- diploma generation
- diploma verification
- grading notifications

Primary repository evidence:
- src/pages/GradingSchemesList.tsx
- src/pages/GradingLevelsList.tsx
- src/pages/AthleteGradingsPage.tsx
- supabase/functions/generate-diploma
- supabase/functions/verify-diploma
- supabase/functions/notify-new-grading
- supabase/migrations/*grading_schemes*
- supabase/migrations/*grading_levels*
- supabase/migrations/*athlete_gradings*
- supabase/migrations/*diplomas*

Classification:
Core business module

---

## 2.11 Digital Identity and Verification Module

Purpose:
Issue and publicly verify official athlete documents and credentials.

Includes:
- digital card generation
- diploma verification
- membership verification
- generic document verification
- public verification token flow
- QR/token-based trust surface

Primary repository evidence:
- src/pages/VerifyCard.tsx
- src/pages/VerifyDiploma.tsx
- src/pages/VerifyMembership.tsx
- src/pages/PublicVerifyDocument.tsx
- src/pages/PortalCard.tsx
- src/components/card/*
- src/components/trust/*
- supabase/functions/generate-digital-card
- supabase/functions/verify-digital-card
- supabase/functions/verify-diploma
- supabase/functions/verify-document
- supabase/functions/get-document
- supabase/migrations/*documents*
- supabase/migrations/*digital_cards*
- supabase/migrations/*document_public_tokens*

Classification:
Core differentiation module

---

## 2.12 Events Module

Purpose:
Manage institutional events and athlete event participation.

Includes:
- event list
- event details
- public events
- event categories
- event registrations
- event bracket generation
- bracket publishing
- match result recording

Primary repository evidence:
- src/pages/EventsList.tsx
- src/pages/EventDetails.tsx
- src/pages/PublicEventsList.tsx
- src/pages/PublicEventDetails.tsx
- src/pages/PortalEvents.tsx
- src/components/events/*
- src/domain/events/*
- supabase/functions/generate-event-bracket
- supabase/functions/publish-event-bracket
- supabase/functions/record-match-result
- supabase/migrations/*events*
- supabase/migrations/*event_categories*
- supabase/migrations/*event_registrations*
- supabase/migrations/*event_results*
- supabase/migrations/*event_brackets*
- supabase/migrations/*event_bracket_matches*

Classification:
Important adjacent module

Note:
This module exists in code and database. However, from a strategic product-positioning standpoint, it must remain subordinate to the institutional certification/governance core.

---

## 2.13 Rankings Module

Purpose:
Expose institutional ranking visibility.

Includes:
- public rankings
- internal rankings
- event-result-derived ranking logic surface
- ranking-related presentation

Primary repository evidence:
- src/pages/InternalRankings.tsx
- src/pages/PublicRankings.tsx
- src/components/dashboard/*
- src/domain/analytics/*
- docs/BUSINESS-FLOWS.md
- docs/PRODUCT-SCOPE.md

Classification:
Important adjacent module

Note:
Ranking is present as a product surface, but it should remain a derivative institutional module, not the primary product identity.

---

## 2.14 Federation and Council Governance Module

Purpose:
Support federation-level structure, council decisions and governance relationships between federations and tenants.

Includes:
- federations
- federation_tenants
- federation_roles
- councils
- council members
- council decisions

Primary repository evidence:
- supabase/migrations/*federations*
- supabase/migrations/*federation_roles*
- supabase/migrations/*federation_tenants*
- supabase/migrations/*councils*
- supabase/migrations/*council_members*
- supabase/migrations/*council_decisions*

Classification:
Advanced governance module

---

## 2.15 Admin, Security and Observability Module

Purpose:
Provide superadmin control, diagnostics, auditability, security oversight and health monitoring.

Includes:
- admin dashboard
- system health
- admin audit log
- security dashboard
- diagnostics
- membership observability
- security timeline
- decision logs
- health checks
- alerting and critical notifications
- audit of RLS and billing consistency

Primary repository evidence:
- src/pages/AdminDashboard.tsx
- src/pages/admin/SystemHealth.tsx
- src/pages/admin/AuditLog.tsx
- src/pages/admin/SecurityDashboard.tsx
- src/pages/AdminDiagnostics.tsx
- src/pages/admin/MembershipObservability.tsx
- src/pages/SecurityTimeline.tsx
- src/components/observability/*
- src/components/security/*
- src/domain/security/*
- src/domain/health/*
- src/domain/audit/*
- src/lib/observability/*
- src/lib/errors/*
- supabase/functions/health-check
- supabase/functions/audit-rls
- supabase/functions/notify-critical-alert
- supabase/functions/emit-institutional-event
- supabase/migrations/*audit_logs*
- supabase/migrations/*decision_logs*
- supabase/migrations/*security_events*
- supabase/migrations/*observability_dismissed_alerts*

Classification:
Core operational module

---

## 2.16 Impersonation and Support Operations Module

Purpose:
Allow superadmin-level support operation inside tenant context with validation and traceability.

Includes:
- impersonation start
- impersonation end
- impersonation validation
- support-safe superadmin operations

Primary repository evidence:
- src/components/impersonation/*
- src/domain/impersonation/*
- supabase/functions/start-impersonation
- supabase/functions/end-impersonation
- supabase/functions/validate-impersonation
- supabase/migrations/*superadmin_impersonations*

Classification:
Operational support module

---

## 2.17 Export, Reporting and Analytics Module

Purpose:
Provide administrative visibility, membership analytics, exports and management insight.

Includes:
- membership analytics
- reports
- exports
- dashboard indicators
- administrative data surfaces

Primary repository evidence:
- src/domain/analytics/*
- src/domain/reports/*
- src/domain/exports/*
- src/components/export/*
- src/pages/admin/AdminMembershipAnalytics.tsx
- supabase/migrations/*membership_analytics*

Classification:
Support intelligence module

---

# 3. MODULE PRIORITY HIERARCHY

The current module hierarchy of Tatame Pro should be interpreted as follows.

## Tier A — Product Core
These modules define Tatame Pro identity.

- Identity and Access
- Tenant Governance
- Billing and Subscription
- Athlete Registry
- Membership and Affiliation
- Guardian and Youth Compliance
- Grading and Graduation
- Digital Identity and Verification
- Admin, Security and Observability

## Tier B — Governance Expansion
These modules strengthen institutional governance.

- Academy Management
- Coach and Staff
- Federation and Council Governance
- Export, Reporting and Analytics
- Institutional Platform

## Tier C — Adjacent Capability
These modules are valuable, but must not redefine the product center.

- Events
- Rankings
- Athlete Portal convenience surfaces

---

# 4. CANONICAL PRODUCT CENTER

The canonical center of Tatame Pro is:

institutional registration  
affiliation lifecycle  
official progression record  
document issuance  
public verification  
audit-ready history  
multi-tenant governance  

This is the center that must guide roadmap, prompt generation and scope decisions.

---

# 5. EXPLICITLY NON-CANONICAL CENTERS

Tatame Pro must NOT drift into the following primary identities:

- generic gym ERP
- scheduling/class management platform
- social athlete community
- generic event software
- pure competition-first platform
- training content/LMS platform
- finance/accounting ERP

These may appear as adjacent utilities, but they are not the product core.

---

# 6. PRODUCT DECISION RULE

Every new feature request must answer:

1. Which existing module does this belong to?
2. Does it strengthen the canonical product center?
3. Does it preserve multi-tenant safety, institutional trust and auditability?
4. Is it core, governance expansion or adjacent?

If a request cannot be mapped clearly, it must not be implemented until reclassified.

---

# 7. CLAUDE INTERPRETATION RULE

Claude must interpret Tatame Pro as:

a sports governance and certification platform with strong institutional controls,
not as a generic academy app.

All future prompts must preserve this interpretation.

---

# END OF PRODUCT_MODULES.md