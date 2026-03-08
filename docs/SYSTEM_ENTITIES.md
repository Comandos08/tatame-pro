SYSTEM_ENTITIES.md
Project: Tatame Pro
Status: Canonical Data Model Map
Purpose: Provide a conceptual map of the system entities that define the Tatame Pro platform.

---

# 1. PURPOSE

This document defines the conceptual entity model of Tatame Pro.

Claude must use this document to understand:

- system data structure
- entity relationships
- tenant boundaries
- critical data objects

This document represents a **conceptual map**, not an exhaustive schema dump.

The real schema always lives in the database migrations.

---

# 2. DATA MODEL PRINCIPLES

Tatame Pro data model follows these principles.

Multi-tenant isolation  
Relational integrity  
Traceability  
Auditability  
Immutable historical records  

Critical records must never be silently modified or destroyed.

---

# 3. TENANT-SCOPED DATA

Most entities in the system are tenant-scoped.

Tenant isolation is enforced by:

tenant_id

Every tenant-scoped entity must include tenant_id.

Cross-tenant queries must be prevented.

---

# 4. CORE IDENTITY ENTITIES

## tenants

Represents organizations operating inside the platform.

Examples:

federations  
associations  
governing bodies  

Primary relationships:

tenants → academies  
tenants → athletes  
tenants → memberships  
tenants → events  

---

## profiles

Represents authenticated user identities.

Each profile corresponds to a login identity.

Relationships:

profiles → user_roles  
profiles → athletes  
profiles → coaches  

---

## user_roles

Defines system permissions.

A profile may have multiple roles.

Examples:

SUPERADMIN_GLOBAL  
TENANT_ADMIN  
COACH  
ATHLETE  

Role permissions must always be validated at backend level.

---

# 5. ORGANIZATION ENTITIES

## academies

Represents martial arts schools associated with a tenant.

Relationships:

academies → athletes  
academies → coaches  

Academies are visible publicly in some contexts.

---

## coaches

Represents instructors or staff associated with academies.

Relationships:

coaches → academies  
coaches → graduations  

Coaches may hold certification roles.

---

# 6. ATHLETE DOMAIN

## athletes

Represents martial arts practitioners registered in the system.

Attributes typically include:

name  
birthdate  
academy  
graduation  

Relationships:

athletes → memberships  
athletes → gradings  
athletes → events  
athletes → rankings  

Athlete identity is central to the platform.

---

## guardians

Represents legal guardians for underage athletes.

Relationships:

guardians → athletes

This entity ensures youth compliance.

---

## guardian_links

Links guardians to youth athletes.

Used in youth membership workflows.

---

# 7. MEMBERSHIP DOMAIN

## memberships

Represents athlete affiliation with a governing organization.

Membership states may include:

pending  
active  
expired  
cancelled  

Membership status determines eligibility.

Relationships:

memberships → athletes  
memberships → tenants  

---

## membership_analytics

Stores aggregated membership statistics.

Used for reporting and observability.

---

# 8. GRADUATION DOMAIN

## grading_schemes

Defines belt progression systems.

Examples:

belt hierarchy  
ranking structure  

---

## grading_levels

Represents levels within a grading scheme.

Examples:

white belt  
blue belt  
purple belt  

---

## athlete_gradings

Represents graduation records for athletes.

Relationships:

athlete_gradings → athletes  
athlete_gradings → coaches  

Graduations must preserve historical lineage.

---

## diplomas

Represents issued certificates for promotions.

Diplomas must remain verifiable.

Relationships:

diplomas → athletes

---

# 9. DIGITAL IDENTITY

## digital_cards

Represents official digital athlete cards.

Contains:

identity  
membership status  
graduation  

Used for verification during events.

---

## documents

Represents issued official documents.

Examples:

certificates  
licenses  

Documents may be publicly verified.

---

## document_public_tokens

Represents verification tokens for public validation.

Used in public verification flows.

---

# 10. EVENTS DOMAIN

## events

Represents competitions or official events.

Relationships:

events → divisions  
events → registrations  
events → results  

---

## event_categories

Represents divisions inside events.

Examples:

weight class  
belt division  
age group  

---

## event_registrations

Represents athlete participation in events.

Relationships:

event_registrations → athletes  
event_registrations → events  

---

## event_results

Represents results of matches.

Results feed ranking calculations.

---

## event_brackets

Represents competition bracket structures.

---

## event_bracket_matches

Represents matches inside brackets.

---

# 11. RANKING DOMAIN

Rankings derive from event results.

Ranking calculations depend on:

competition results  
division categories  
scoring rules  

Ranking entities may be derived rather than stored.

---

# 12. FEDERATION GOVERNANCE

## federations

Represents governing bodies overseeing multiple tenants.

---

## federation_roles

Represents governance roles.

Examples:

president  
technical director  

---

## federation_tenants

Defines which tenants belong to a federation.

---

## councils

Represents decision-making bodies.

---

## council_members

Represents members of councils.

---

## council_decisions

Represents governance decisions.

---

# 13. BILLING DOMAIN

## tenant_billing

Represents subscription state for tenants.

Possible states:

trialing  
active  
past_due  
cancelled  

---

## tenant_invoices

Represents billing invoices.

---

## subscription_plans

Defines available subscription plans.

---

# 14. SECURITY AND AUDIT

## audit_logs

Stores audit records of critical operations.

---

## decision_logs

Stores recorded administrative decisions.

---

## security_events

Represents security-relevant system events.

---

# 15. OBSERVABILITY

Observability entities help diagnose system state.

Examples include:

alerts  
health checks  
membership analytics  

These entities support operational stability.

---

# 16. ENTITY CLASSIFICATION

Entities fall into four categories.

Identity entities  
Governance entities  
Operational entities  
Derived analytics entities  

Each category has different mutation rules.

---

# 17. IMMUTABLE RECORDS

Some records should be treated as immutable once issued.

Examples:

graduations  
diplomas  
competition results  

Corrections must occur via new records.

---

# 18. DATA SAFETY RULES

Claude and Lovable must never generate prompts that:

drop core tables  
truncate historical records  
remove tenant_id boundaries  

Database migrations must always be additive.

---

# 19. INTERPRETATION RULE

Claude must treat these entities as the conceptual backbone of Tatame Pro.

All prompts that modify the system must consider:

entity relationships  
tenant isolation  
historical integrity  

---

# END OF SYSTEM_ENTITIES.md