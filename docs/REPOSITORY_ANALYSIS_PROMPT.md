REPOSITORY_ANALYSIS_PROMPT.md
Project: Tatame Pro
Purpose: Deterministic Repository Understanding Protocol

---

# 1. PURPOSE

This document defines the **mandatory analysis protocol Claude must execute before generating any development prompt for Lovable**.

Claude must treat the repository as the **single source of architectural truth**.

Claude must **never generate prompts without first analyzing the repository**.

This protocol exists to prevent:

- hallucinated architecture
- breaking changes
- incorrect assumptions
- unsafe AI-generated modifications

---

# 2. OPERATING PRINCIPLE

Claude must behave like a **system reverse engineer** before acting as a prompt compiler.

Claude must first understand:

- system architecture
- module boundaries
- domain models
- API contracts
- database schema
- security constraints

Only after this analysis Claude may generate prompts.

---

# 3. ANALYSIS PIPELINE

Claude must execute the following pipeline in order.

Step 1 — Repository Structure Mapping  
Step 2 — Domain Identification  
Step 3 — Dependency Mapping  
Step 4 — Data Model Extraction  
Step 5 — Security Model Identification  
Step 6 — Critical Flow Mapping  
Step 7 — Architectural Risk Identification  

Claude must not skip steps.

---

# 4. STEP 1 — REPOSITORY STRUCTURE MAPPING

Claude must scan the repository and identify:

Root folders  
Application modules  
Infrastructure layers  
Configuration files  
Documentation  

Claude must produce a structural overview.

Example output:

System Layers:

Frontend  
Backend  
Database  
Infrastructure  
Documentation  

Claude must identify which technologies are used in each layer.

---

# 5. STEP 2 — DOMAIN IDENTIFICATION

Claude must map domain modules.

Expected domains include:

Identity  
Athlete Management  
Academy Management  
Membership  
Graduation  
Competition  
Ranking  
Certification  
Digital Identity  

Claude must determine where each domain is implemented.

Claude must identify domain boundaries.

---

# 6. STEP 3 — DEPENDENCY MAPPING

Claude must analyze how modules interact.

Claude must identify:

service dependencies  
API calls  
database interactions  
shared utilities  

Claude must detect:

tight coupling  
circular dependencies  
cross-domain mutations  

Claude must highlight architectural risks.

---

# 7. STEP 4 — DATA MODEL EXTRACTION

Claude must inspect the database layer.

Claude must identify:

core tables  
relationships  
foreign keys  
tenant references  
indexes  

Claude must determine:

which entities are tenant scoped  
which entities are immutable  
which entities are state-driven  

Claude must produce a conceptual entity map.

---

# 8. STEP 5 — SECURITY MODEL IDENTIFICATION

Claude must identify:

authentication logic  
authorization checks  
role model  
tenant isolation logic  

Claude must confirm:

tenant_id propagation  
role validation  
privileged operations  

Claude must highlight any missing safeguards.

---

# 9. STEP 6 — CRITICAL FLOW MAPPING

Claude must identify core business flows.

Expected flows include:

Athlete Registration  
Membership Approval  
Belt Promotion  
Competition Lifecycle  
Ranking Calculation  
Certificate Issuance  

Claude must determine how these flows are implemented.

Claude must identify state transitions.

---

# 10. STEP 7 — ARCHITECTURAL RISK IDENTIFICATION

Claude must evaluate the architecture and detect:

fragile modules  
missing validations  
potential regressions  
performance risks  
security gaps  

Claude must explicitly report risks.

---

# 11. ANALYSIS OUTPUT STRUCTURE

Claude must produce the following sections.

## Repository Structure

High-level directory and layer map.

---

## Domain Architecture

Mapping of business domains to system modules.

---

## Data Model Summary

Description of core entities and relationships.

---

## Security Model

Explanation of authentication, authorization and tenant isolation.

---

## Critical System Flows

Description of core workflows.

---

## Architectural Risks

Potential weaknesses in the current implementation.

---

# 12. CONFIDENCE LEVEL

After analysis Claude must state confidence level.

Example:

Repository Understanding Confidence: HIGH / MEDIUM / LOW

If confidence is LOW Claude must request more information.

---

# 13. PROMPT GENERATION GATE

Claude must not generate prompts unless:

repository structure is understood  
domain architecture is mapped  
security model is identified  

If any element is missing Claude must respond:

Repository analysis incomplete. Prompt generation blocked.

---

# 14. PROMPT CONTEXT SUMMARY

Before generating any Lovable prompt Claude must summarize:

Relevant modules  
Relevant database entities  
Relevant system flows  

This ensures prompts are grounded in real architecture.

---

# 15. REPOSITORY ANALYSIS FREQUENCY

Claude must re-run repository analysis when:

major features are added  
database schema changes  
core modules are modified  
architecture evolves  

Claude must not rely on outdated analysis.

---

# 16. ANALYSIS PHILOSOPHY

Claude must follow these principles.

Prefer evidence over assumption.  
Prefer explicit architecture over inference.  
Prefer minimal safe change over broad refactors.  

The repository defines reality.

---

# END OF REPOSITORY_ANALYSIS_PROMPT.md