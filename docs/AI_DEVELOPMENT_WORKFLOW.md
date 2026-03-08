AI_DEVELOPMENT_WORKFLOW.md
Project: Tatame Pro
Purpose: Deterministic AI-Assisted Engineering Workflow

---

# 1. PURPOSE

This document defines the **official development workflow for Tatame Pro** when using AI-assisted development tools such as:

- Claude Code
- Lovable
- GitHub
- Supabase

The objective is to ensure that AI-assisted development remains:

- deterministic
- safe
- auditable
- scalable

AI must accelerate development **without compromising system integrity**.

---

# 2. DEVELOPMENT PHILOSOPHY

Tatame Pro development follows the philosophy:

Security > Stability > Determinism > Speed

AI tools must be treated as **assistive systems**, not autonomous developers.

Human oversight remains mandatory.

---

# 3. CORE DEVELOPMENT STACK

Tatame Pro development relies on:

Frontend
- React
- TypeScript

Backend
- Supabase
- Edge Functions

Infrastructure
- PostgreSQL
- Row Level Security (RLS)

AI tooling
- Claude Code
- Lovable

Version control
- GitHub

GitHub remains the **source of truth** for the codebase.

---

# 4. DEVELOPMENT ROLES

The AI-assisted development process defines the following roles.

### Human Architect

Responsible for:

- defining product goals
- approving critical architectural decisions
- validating AI output

### Claude (Architecture & Prompt Compiler)

Responsible for:

- repository analysis
- architecture validation
- risk detection
- deterministic prompt generation

Claude never modifies code directly.

### Lovable (Execution Engine)

Responsible for:

- implementing prompts
- generating code
- modifying system components

Lovable must only execute **deterministic prompts** generated via Claude.

---

# 5. DEVELOPMENT CYCLE

Every feature follows the same cycle.

Step 1  
Human describes feature intent.

Step 2  
Claude analyzes the repository.

Step 3  
Claude performs impact analysis.

Step 4  
Claude compiles deterministic prompt.

Step 5  
Human reviews prompt.

Step 6  
Prompt sent to Lovable.

Step 7  
Lovable executes implementation.

Step 8  
Changes synchronized to GitHub.

Step 9  
Claude audits implementation.

Step 10  
Human approves or requests correction.

---

# 6. FEATURE DEVELOPMENT PROTOCOL

Every new feature must follow the sequence.

### Phase 1 — Discovery

Claude must identify:

- existing system capabilities
- related modules
- data dependencies
- architectural constraints

Claude produces a **context report**.

---

### Phase 2 — Impact Analysis

Claude evaluates:

- modules affected
- database impact
- security implications
- tenant isolation

Claude identifies:

risk level  
regression probability  
affected components

---

### Phase 3 — Prompt Compilation

Claude generates a structured Lovable prompt including:

objective  
current state  
implementation plan  
constraints  
acceptance criteria  
tests  
risk mitigation

Prompt must follow PROMPT_COMPILER.md.

---

### Phase 4 — Implementation

Lovable implements the prompt.

Implementation must respect:

ENGINEERING_GUARDRAILS.md  
SYSTEM_MAP.md  

---

### Phase 5 — Verification

Claude compares the new code with:

expected architecture  
prompt specification  

Claude verifies:

security  
tenant isolation  
role authorization  
data integrity  

---

### Phase 6 — Stabilization

If issues are detected:

Claude generates a **corrective prompt**.

Small fixes must be preferred over refactors.

---

# 7. CHANGE TYPES

Changes must be classified.

### Minor Change

UI improvements  
Non-breaking enhancements  

### Moderate Change

New feature  
New service  
New database table  

### Critical Change

Authentication logic  
Tenant isolation  
Database schema changes  

Critical changes require **phased implementation**.

---

# 8. PROMPT GENERATION RULES

Claude must generate prompts that are:

specific  
deterministic  
minimal  
structured  

Prompts must never be vague.

Prompts must never rely on assumptions.

Prompts must explicitly define:

scope  
constraints  
acceptance criteria  

---

# 9. SAFE FEATURE DELIVERY

Safe feature development follows this pattern.

Step 1  
Backend support

Step 2  
API layer

Step 3  
Frontend integration

Step 4  
Testing and validation

Step 5  
Performance evaluation

---

# 10. DATABASE CHANGE WORKFLOW

Database changes must follow strict rules.

Step 1  
Add new schema elements

Step 2  
Update application logic

Step 3  
Backfill data if needed

Step 4  
Deprecate old structures

Never remove schema elements prematurely.

---

# 11. TENANT SAFETY VALIDATION

Every new feature must validate:

tenant_id propagation  
tenant filtering in queries  
cross-tenant data protection  

Tenant isolation violations are considered critical defects.

---

# 12. AUTHORIZATION VALIDATION

All actions requiring permissions must verify:

authenticated user  
role  
tenant scope  

Authorization must never rely on frontend validation.

---

# 13. TESTING STRATEGY

Every feature must validate:

role permissions  
tenant isolation  
data integrity  
edge cases  

Critical modules require integration tests.

---

# 14. POST-IMPLEMENTATION REVIEW

Claude must perform a review including:

architecture alignment  
security verification  
query validation  
API contract stability  

If inconsistencies are detected Claude must propose corrective prompts.

---

# 15. ERROR MANAGEMENT

Errors must be:

explicit  
logged  
traceable  

User-facing errors must not expose sensitive data.

---

# 16. INCIDENT RESPONSE

If a regression occurs:

Step 1  
Identify affected module.

Step 2  
Isolate feature.

Step 3  
Generate corrective prompt.

Step 4  
Deploy minimal fix.

Avoid large emergency refactors.

---

# 17. DOCUMENTATION REQUIREMENTS

All significant features must update:

SYSTEM_MAP.md if domain logic changes.

Architecture documentation if new modules are introduced.

---

# 18. AI DEVELOPMENT SAFETY RULES

AI tools must never:

drop tables  
break API contracts  
disable security checks  
bypass tenant isolation  

Claude must block prompt generation when these risks appear.

---

# 19. REFACTORING POLICY

Refactoring must be incremental.

Large refactors must be split into:

analysis phase  
migration phase  
cleanup phase  

Never combine feature development with major refactoring.

---

# 20. WORKFLOW SUMMARY

Tatame Pro development pipeline:

Human defines goal  
Claude analyzes repository  
Claude compiles deterministic prompt  
Lovable executes implementation  
GitHub synchronizes code  
Claude audits changes  
Human validates release

---

# END OF AI_DEVELOPMENT_WORKFLOW.md