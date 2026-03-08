ARCHITECTURE_CONTEXT

Purpose:
Provide Claude with architectural expectations before inspecting the repository.

---

# SYSTEM ARCHITECTURE

Tatame Pro follows a layered architecture.

Layers include:

Frontend  
Backend services  
Database layer  
Infrastructure

---

# FRONTEND

Expected technologies:

React  
TypeScript

Responsibilities:

UI rendering  
User interaction  
Client validation

Frontend must not contain core business logic.

---

# BACKEND

Backend services handle:

business rules  
authorization  
data validation  
state transitions

Backend must enforce:

tenant isolation  
role permissions  
data integrity

---

# DATABASE

Database uses PostgreSQL.

Database must enforce:

foreign keys  
tenant_id relationships  
indexed queries

Critical tables include:

tenants  
users  
athletes  
memberships  
competitions  
rankings

---

# SECURITY MODEL

Tatame Pro enforces:

authentication  
role-based authorization  
tenant isolation

Security checks must exist at backend layer.

Frontend validation alone is insufficient.

---

# STATEFUL DOMAINS

Some domains behave as state machines.

Examples:

Membership lifecycle  
Competition lifecycle  
Graduation lifecycle

State transitions must be explicit.

---

# IMMUTABILITY RULES

Certain records become immutable after confirmation.

Examples include:

competition results  
graduations  
certificates

Changes must occur through audit entries.

---

# SYSTEM BOUNDARIES

Modules must remain loosely coupled.

Direct cross-domain mutation is discouraged.

Interaction must occur via service layer.

---

# END OF ARCHITECTURE_CONTEXT