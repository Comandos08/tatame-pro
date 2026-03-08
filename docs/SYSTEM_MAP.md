SYSTEM_MAP.md
Project: Tatame Pro
Purpose: Architectural Map for Claude Code
System Type: Multi-Tenant SaaS for Martial Arts Ecosystem

---

# 1. SYSTEM OVERVIEW

Tatame Pro is a **multi-tenant SaaS platform** designed to support the management of martial arts ecosystems including:

- Federations
- Academies
- Athletes
- Memberships
- Certifications
- Competitions
- Rankings
- Digital identity cards

The platform provides:

Operational management  
Athlete identity management  
Competition organization  
Ranking systems  
Certification and lineage tracking  

Tatame Pro must operate as a **secure and deterministic platform for sports governance**.

---

# 2. ARCHITECTURE PRINCIPLES

Tatame Pro follows these architectural principles.

## Multi-Tenant First

Every entity belongs to a tenant.

Examples of tenants:

Federation  
Academy network  
Organization  

Rules:

- Every record must respect tenant boundaries
- Cross-tenant access is forbidden unless explicitly authorized
- Tenant isolation is critical for security

---

## Deterministic Business Logic

The system must avoid hidden state.

All business logic must be explicit.

Prefer:

Explicit state machines  
Clear transitions  
Logged mutations  

Avoid:

Implicit transitions  
Side effects  
Hidden dependencies  

---

## Domain-Centered Design

Tatame Pro is organized into logical domains.

Main domains include:

Identity  
Membership  
Graduation  
Competition  
Ranking  
Certification  

---

# 3. CORE DOMAINS

## Identity Domain

Responsible for identifying all participants.

Entities:

Users  
Athletes  
Coaches  
Officials  

Responsibilities:

User authentication  
Identity management  
Role attribution  

Key Rules:

Users may hold multiple roles.  
Roles must respect tenant scope.

---

## Athlete Domain

Represents individuals practicing martial arts.

Entity: Athlete

Attributes include:

Name  
Birth date  
Gender  
Academy  
Graduation belt  
Registration status  

Relationships:

Athlete → Academy  
Athlete → Graduation history  
Athlete → Competitions  

Key Rules:

Athletes must belong to a tenant.  
Athlete records must preserve historical integrity.

---

## Academy Domain

Represents martial arts schools.

Entity: Academy

Attributes:

Name  
Location  
Affiliated federation  
Responsible coach  

Relationships:

Academy → Athletes  
Academy → Coaches  
Academy → Federation  

Key Rules:

Academies operate under a tenant.

---

## Membership Domain

Represents active registration inside an organization.

Entity: Membership

Attributes:

Status  
Start date  
Expiration date  
Federation affiliation  

Relationships:

Membership → Athlete  
Membership → Federation  

Possible States:

Pending  
Active  
Suspended  
Expired  

Key Rules:

Membership defines eligibility for competition and certification.

---

## Graduation Domain

Represents belt promotions.

Entity: Graduation

Attributes:

Belt  
Date  
Instructor  
Certification  

Relationships:

Graduation → Athlete  
Graduation → Academy  
Graduation → Instructor  

Key Rules:

Graduation history must be immutable once confirmed.

---

## Competition Domain

Represents tournaments and events.

Entities:

Competition  
Division  
Match  
Bracket  

Attributes:

Competition name  
Date  
Location  
Category  

Relationships:

Competition → Athletes  
Division → Competitors  
Match → Results  

Key Rules:

Competition logic must preserve result integrity.

---

## Ranking Domain

Responsible for calculating athlete rankings.

Entities:

Ranking table  
Ranking entry  

Attributes:

Points  
Position  
Competition results  

Relationships:

Ranking → Athlete  
Ranking → Competition  

Key Rules:

Ranking calculations must be deterministic.

---

## Certification Domain

Responsible for validating achievements.

Entities:

Certificates  
Instructor validation  

Examples:

Belt promotion certificate  
Instructor certification  

Key Rules:

Certificates must be verifiable and immutable.

---

## Digital Identity Domain

Responsible for athlete identity cards.

Entity: Digital Card

Attributes:

Athlete identity  
Graduation  
Membership status  

Purpose:

Provide verifiable athlete identity.

---

# 4. CORE SYSTEM ENTITIES

Primary entities expected in the system include:

Tenant  
User  
Role  
Academy  
Athlete  
Membership  
Graduation  
Competition  
Division  
Match  
Ranking  
Certificate  
DigitalCard  

Claude must assume relationships exist between these entities.

---

# 5. ROLE MODEL

Tatame Pro uses role-based access control.

Examples of roles include:

SUPERADMIN_GLOBAL  
ADMIN_TENANT  
FEDERATION_ADMIN  
COACH  
ATHLETE  
STAFF  

Rules:

Roles must respect tenant scope.  
Privilege escalation must be prevented.

---

# 6. TENANT ISOLATION

Tenant isolation is critical.

Rules:

All queries must respect tenant_id.  
Data leakage between tenants is forbidden.

Exceptions:

SUPERADMIN_GLOBAL may access multiple tenants.

---

# 7. SYSTEM MODULES

Major modules include:

Authentication  
Athlete Management  
Academy Management  
Membership Management  
Graduation Management  
Competition Management  
Ranking Engine  
Certification  
Digital Identity  

Each module must remain loosely coupled.

---

# 8. CRITICAL SYSTEM FLOWS

## Athlete Registration Flow

1 Athlete created  
2 Membership requested  
3 Membership approved  
4 Athlete becomes eligible

---

## Belt Promotion Flow

1 Instructor validates athlete  
2 Graduation record created  
3 Certificate issued  

---

## Competition Flow

1 Competition created  
2 Divisions defined  
3 Athletes registered  
4 Matches generated  
5 Results recorded  
6 Ranking updated  

---

# 9. DATA INTEGRITY RULES

The system must enforce:

Referential integrity  
Tenant isolation  
Historical preservation  

Certain records must be immutable after confirmation.

Examples:

Competition results  
Graduation records  
Certificates  

---

# 10. SECURITY REQUIREMENTS

Tatame Pro must enforce:

Authentication  
Authorization  
Tenant isolation  
Auditability  

Sensitive data must never be exposed improperly.

---

# 11. SYSTEM EVOLUTION PRINCIPLES

Changes must follow:

Backward compatibility  
Minimal surface impact  
Explicit migrations  

Large refactors must be broken into phases.

---

# 12. CLAUDE INTERPRETATION RULES

Claude must interpret the system as:

A deterministic governance platform for martial arts.

Claude must prioritize:

Security  
Integrity  
Traceability  

Claude must avoid speculative architecture.

Claude must derive insights from the repository.

---

# END OF SYSTEM_MAP.md