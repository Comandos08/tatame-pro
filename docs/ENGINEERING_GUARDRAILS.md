ENGINEERING_GUARDRAILS.md
Project: Tatame Pro
Purpose: Engineering Safety Protocol
Scope: All code generated or modified via Lovable or AI systems

---

# 1. PURPOSE

This document defines **non-negotiable engineering rules** for Tatame Pro.

These guardrails exist to ensure:

- architectural integrity
- security
- deterministic behavior
- long-term maintainability

All AI-generated changes must comply with these rules.

Claude must enforce these guardrails when generating prompts for Lovable.

---

# 2. GENERAL ENGINEERING PRINCIPLES

Tatame Pro prioritizes:

1. Security
2. Determinism
3. Data Integrity
4. Backward Compatibility
5. Explicit Logic

The system must avoid:

- implicit state
- silent breaking changes
- destructive migrations
- hidden dependencies
- unbounded side effects

---

# 3. CHANGE CLASSIFICATION

All proposed changes must be classified as one of the following types.

### SAFE CHANGE
Minor UI updates  
Non-breaking API improvements  
Internal refactors with no behavior change  

### CONTROLLED CHANGE
New features  
Database schema additions  
New API routes  

### CRITICAL CHANGE
Database schema modifications  
Authentication logic changes  
Tenant isolation changes  
Role permission changes  

Critical changes require explicit analysis and phased implementation.

---

# 4. DATABASE SAFETY RULES

Tatame Pro relies heavily on data integrity.

The following rules are mandatory.

### Forbidden Operations

Never automatically:

- drop tables
- drop columns
- truncate data
- overwrite historical records

### Migration Principles

Database changes must follow:

1. Additive migrations first
2. Data backfill if required
3. Deprecation phase
4. Removal phase (only if safe)

### Example Safe Migration Flow

Step 1  
Add new column  

Step 2  
Populate data  

Step 3  
Update logic  

Step 4  
Deprecate old column

Never perform destructive migrations in a single step.

---

# 5. TENANT ISOLATION GUARDRAILS

Multi-tenant safety is critical.

Every query must:

- include tenant scope
- validate tenant_id
- prevent cross-tenant exposure

Forbidden:

- global queries without tenant filtering
- cross-tenant joins unless explicitly required

SUPERADMIN_GLOBAL may bypass tenant filtering only in controlled contexts.

---

# 6. ROLE AUTHORIZATION GUARDRAILS

Role-based access control must always be enforced.

Before executing any privileged action the system must verify:

- authenticated user
- assigned role
- tenant scope
- permission level

Roles must never be implicitly trusted.

Authorization must be explicit.

---

# 7. API CONTRACT PROTECTION

Existing API contracts must remain stable.

Breaking changes must follow this sequence.

Step 1  
Introduce new endpoint version

Step 2  
Maintain backward compatibility

Step 3  
Deprecate old endpoint

Step 4  
Remove old endpoint only after validation

Never silently change API response formats.

---

# 8. STATE MACHINE RULES

Critical flows must behave like state machines.

Example flows:

Membership lifecycle  
Competition lifecycle  
Graduation lifecycle  

State transitions must be explicit.

Example Membership States:

Pending  
Active  
Suspended  
Expired  

Invalid transitions must be blocked.

---

# 9. IMMUTABLE RECORDS

Certain records must become immutable after confirmation.

Examples include:

Competition results  
Graduation records  
Certificates  

After confirmation these records must not be modified.

Corrections must be handled via audit entries.

---

# 10. AUDITABILITY REQUIREMENTS

Critical operations must be auditable.

Examples:

membership approvals  
belt promotions  
competition results  
certificate issuance  

Audit logs should record:

timestamp  
actor  
action  
affected entity  

Auditability ensures traceability.

---

# 11. MODULE BOUNDARY RULES

Modules must remain loosely coupled.

Domains must not create circular dependencies.

Allowed interaction pattern:

Domain → Service → Persistence

Forbidden pattern:

Domain → Domain direct mutation

Each domain must expose controlled interfaces.

---

# 12. FRONTEND SAFETY RULES

Frontend must follow these constraints.

Never duplicate business logic already present in backend.

Frontend responsibilities:

- UI rendering
- input validation
- user feedback

Backend responsibilities:

- authorization
- business rules
- data integrity

---

# 13. PERFORMANCE GUARDRAILS

Avoid queries that may grow unbounded.

Rules:

always paginate large lists  
avoid N+1 queries  
prefer indexed queries  

Heavy operations must be asynchronous where possible.

---

# 14. FEATURE IMPLEMENTATION PROTOCOL

All new features must follow this structure.

Step 1  
Backend support

Step 2  
API integration

Step 3  
Frontend interface

Step 4  
Validation and testing

Large features must be split into incremental phases.

---

# 15. TESTING REQUIREMENTS

Every feature must include validation for:

tenant isolation  
role authorization  
data integrity  
edge cases  

Critical flows require integration tests.

---

# 16. ERROR HANDLING

The system must never fail silently.

Errors must be:

explicit  
logged  
traceable  

User-facing errors must remain safe and informative.

---

# 17. BREAKING CHANGE POLICY

Breaking changes are strongly discouraged.

If unavoidable:

1. document change
2. provide compatibility layer
3. notify stakeholders
4. remove old logic only after migration

---

# 18. AI-SPECIFIC GUARDRAILS

AI-generated code must:

respect architecture  
avoid speculative refactors  
minimize change surface  
maintain backward compatibility  

Claude must reject prompts that violate guardrails.

---

# 19. FAILURE CONDITIONS

Claude must refuse to generate prompts when:

repository context is insufficient  
requested change violates guardrails  
architecture conflict is detected  

Claude must explicitly explain the reason.

---

# 20. ENGINEERING PHILOSOPHY

Tatame Pro engineering philosophy:

Safety over speed  
Clarity over cleverness  
Determinism over magic  

AI must assist engineering, not replace discipline.

---

# END OF ENGINEERING_GUARDRAILS.md