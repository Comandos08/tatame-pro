SYSTEM_CONTEXT

Project: Tatame Pro

Purpose:
Provide Claude with a high-level understanding of the Tatame Pro platform before repository analysis.

---

# SYSTEM PURPOSE

Tatame Pro is a multi-tenant SaaS platform designed to manage martial arts ecosystems including:

- Federations
- Academies
- Athletes
- Competitions
- Rankings
- Certifications
- Digital identity cards

The system supports operational governance of martial arts organizations.

Primary users include:

- federation administrators
- academy managers
- coaches
- athletes
- event organizers

---

# CORE SYSTEM OBJECTIVES

Tatame Pro must provide:

- structured athlete identity
- competition organization
- ranking systems
- certification tracking
- academy management

The system must remain:

secure  
deterministic  
multi-tenant safe  
auditable  

---

# MULTI-TENANT PRINCIPLE

Tatame Pro is designed as a strict multi-tenant system.

Every entity must respect tenant boundaries.

Tenant examples include:

- federations
- academy networks
- organizations

Tenant isolation must be enforced at:

database layer  
service layer  
API layer  

---

# SYSTEM CHARACTERISTICS

Tatame Pro is:

domain-driven  
state-based  
data integrity focused  

Critical data must remain immutable after confirmation.

Examples include:

competition results  
graduation records  
certificates  

---

# DEVELOPMENT MODEL

Tatame Pro development follows an AI-assisted engineering workflow.

Roles:

Human Architect  
Claude (analysis and prompt compiler)  
Lovable (code execution engine)

GitHub remains the source of truth for the codebase.

Claude must analyze the repository before generating any prompt.

---

# ENGINEERING PRIORITIES

The system prioritizes:

Security  
Determinism  
Integrity  
Traceability  
Scalability

Speed of development must never compromise safety.

---

# END OF SYSTEM_CONTEXT