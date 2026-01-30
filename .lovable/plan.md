

# PRODUCT SCOPE — TATAME PRO

> **Version:** 1.0.0  
> **Status:** CANONICAL  
> **Last Updated:** 2026-01-30  
> **Authority:** This document governs all product decisions.

---

## 1. Purpose of This Document

This document defines, with zero ambiguity, what Tatame Pro IS and what it IS NOT.

It exists to:

- **Prevent scope creep** by establishing clear boundaries
- **Guide development priorities** by defining what matters
- **Align stakeholders** around a shared understanding of product value
- **Enable confident "no" decisions** when requests fall outside scope
- **Protect product integrity** during growth and evolution

All feature requests, roadmap discussions, and partnership evaluations MUST be validated against this document. Any change to this document requires explicit governance review.

---

## 2. Product Definition

**Tatame Pro is a certification and governance platform for sports organizations that need to maintain official, auditable, long-term athlete history.**

It provides formal sports entities with the institutional infrastructure to register athletes, certify progressions, issue official documents, and maintain a verified historical record that preserves organizational credibility and regulatory compliance.

---

## 3. Target Customer (In Scope)

Tatame Pro is built exclusively for:

**Organizações esportivas formais (federações, ligas e entidades gestoras)**

Specifically:

- **Sports Federations** — National, regional, or state-level governing bodies
- **Leagues** — Organized competitive circuits with formal athlete registration
- **Governing Bodies** — Entities responsible for athlete certification, ranking, or credentialing
- **Associations** — Formal member organizations that issue official athlete documentation

These organizations share common characteristics:

- They issue official credentials (cards, diplomas, certifications)
- They maintain long-term athlete records
- They require audit-ready documentation
- They face institutional risk if records are lost or compromised
- They need to verify athlete status publicly

---

## 4. Target Customer (Explicitly Out of Scope)

The following are NOT target customers, even if they could technically use the platform:

| Excluded Segment | Reason |
|------------------|--------|
| Individual athletes | Product is organization-mediated, not self-service |
| Independent gyms/academies | Unless operating under a formal federation structure |
| Personal trainers | No institutional certification authority |
| Fitness clubs | No grading/progression system requiring certification |
| Event organizers (standalone) | Unless part of a governing body structure |
| Recreational sports groups | No formal credentialing requirements |
| Schools with physical education programs | Unless formally affiliated with a sports federation |

**Rule:** If an entity does not issue official certifications or maintain long-term athlete records with institutional authority, they are out of scope.

---

## 5. Core Problems We Solve

Tatame Pro exists to address critical **INSTITUTIONAL RISKS** faced by sports organizations:

### Risk of Losing Control
- Athlete data scattered across spreadsheets, paper records, or personal devices
- Dependency on individuals (founders, secretaries) for critical information
- No centralized system of record

### Risk of Losing Traceability
- Inability to verify when an athlete was promoted or registered
- Missing historical records for graduations and certifications
- No audit trail for institutional decisions

### Risk of Losing Institutional Credibility
- Fraudulent certifications circulating without verification
- Inability to prove legitimacy of issued documents
- Disputes about athlete status with no authoritative source
- Regulatory non-compliance due to poor record-keeping

### Risk of Operational Fragility
- Key person dependency for all administrative processes
- Manual processes prone to error and inconsistency
- No disaster recovery for historical records

---

## 6. Core Value Proposition

**Tatame Pro delivers certified, auditable, long-term athlete history that protects institutional credibility.**

For sports organizations, this means:

| Value | Description |
|-------|-------------|
| **Certification Authority** | Issue official documents (cards, diplomas) that can be publicly verified |
| **Historical Integrity** | Maintain complete, tamper-evident records of athlete progression |
| **Institutional Independence** | Operate without dependency on individuals or external systems |
| **Public Verification** | Allow third parties to verify authenticity of any issued document |
| **Regulatory Readiness** | Provide audit-ready documentation at any time |

The unique differentiator is not convenience — it is **institutional legitimacy through verifiable records**.

---

## 7. Critical Value Flow (Canonical)

The canonical value flow that every feature must support:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  1. ORGANIZATION SETUP                                                  │
│     └─ Entity registers on platform                                     │
│     └─ Configures academies, staff, grading system                      │
│                                                                         │
│  2. ATHLETE REGISTRATION                                                │
│     └─ Athlete applies for membership (adult or minor)                  │
│     └─ Documents submitted and verified                                 │
│     └─ Organization approves registration                               │
│                                                                         │
│  3. CERTIFICATION OF PROGRESSIONS                                       │
│     └─ Gradings recorded with date, evaluator, location                 │
│     └─ Belt/rank progressions tracked with full history                 │
│     └─ Each progression creates immutable audit record                  │
│                                                                         │
│  4. OFFICIAL DOCUMENT ISSUANCE                                          │
│     └─ Digital membership card generated                                │
│     └─ Graduation diplomas issued                                       │
│     └─ Documents contain verification QR code                           │
│                                                                         │
│  5. LONG-TERM AUDIT-READY HISTORY                                       │
│     └─ Complete athlete history preserved                               │
│     └─ Public verification available to third parties                   │
│     └─ Institutional credibility maintained over time                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Every feature must demonstrably contribute to this flow. Features that do not support this flow are out of scope.**

---

## 8. What Tatame Pro IS

Tatame Pro IS:

- ✅ A **certification platform** for athlete registration and progression
- ✅ A **document issuance system** for official cards and diplomas
- ✅ A **verification infrastructure** for public credential validation
- ✅ A **historical record system** for long-term athlete data
- ✅ An **organizational governance tool** for managing staff, academies, and athletes
- ✅ A **membership management system** for athlete affiliation lifecycle
- ✅ A **multi-tenant platform** where each organization operates independently
- ✅ A **billing-integrated solution** for organization subscriptions
- ✅ An **audit-ready system** with decision logging and traceability

---

## 9. What Tatame Pro IS NOT

Tatame Pro IS NOT:

| Exclusion | Rationale |
|-----------|-----------|
| ❌ A training management platform | We do not track workouts, sessions, or training plans |
| ❌ A performance analytics system | We do not measure athlete performance metrics |
| ❌ A financial/accounting system | We handle subscription billing only, not organizational finances |
| ❌ A generic CRM | We are purpose-built for certification, not general customer management |
| ❌ A scheduling/class management tool | We do not manage academy calendars or class bookings |
| ❌ A social network for athletes | We do not facilitate social interaction or community features |
| ❌ An e-commerce platform | We do not sell merchandise or process arbitrary transactions |
| ❌ An athlete self-service platform | Athletes access via organization mediation, not independently |
| ❌ A competition management system | We do not manage brackets, scoring, or event logistics |
| ❌ A video platform | We do not host or stream training content |
| ❌ A communication tool | We do not provide messaging, forums, or notifications beyond transactional |

**Rule:** If a feature primarily serves individual athlete convenience rather than institutional governance, it is likely out of scope.

---

## 10. Product Success Metrics

### North Star Metric

**Number of active organizations with certified athletes per month**

An "active organization" is defined as:
- Has at least one approved athlete membership in the current period
- OR has issued at least one official document (card/diploma) in the current period

### Supporting Metrics (Maximum 3)

| Metric | Definition | Why It Matters |
|--------|------------|----------------|
| **Document Verification Rate** | % of issued documents that are verified publicly | Indicates trust and adoption of verification system |
| **Athlete Retention Rate** | % of athletes who renew membership | Indicates value delivered to organizations |
| **Organization Onboarding Completion** | % of new organizations that complete setup | Indicates product-market fit and usability |

---

## 11. Design & Product Principles

These principles guide all product decisions:

### 1. Institutional Credibility Over Convenience
When forced to choose between making something easier and maintaining institutional authority, we choose authority. Official documents must be official.

### 2. Auditability Over Flexibility
Every significant action must be traceable. We prefer structured workflows over freeform flexibility because certification requires accountability.

### 3. Governance Before Scale
We will not compromise governance features to grow faster. An organization with 10 athletes and perfect records is more valuable than one with 10,000 athletes and questionable data.

### 4. Organization-Mediated Experience
Athletes interact with the system through their organization. We do not build direct athlete self-service that bypasses organizational authority.

### 5. Explicit Over Implicit
No silent failures, no hidden states, no assumed permissions. Every decision and state must be observable and diagnosable.

### 6. Long-Term Preservation Over Short-Term Convenience
We optimize for records that remain valid and verifiable in 10+ years, not just for today's workflow efficiency.

### 7. Verification as First-Class Feature
The ability to verify any issued document is not an afterthought — it is core to product value.

---

## 12. Scope Governance Rules

### How New Features Are Evaluated

Every proposed feature must pass these gates:

1. **Canonical Flow Test:** Does it directly support the Critical Value Flow (Section 7)?
2. **Customer Fit Test:** Does it serve the Target Customer (Section 3), not excluded segments?
3. **Problem Fit Test:** Does it address a Core Problem (Section 5)?
4. **Exclusion Check:** Does it conflict with "What Tatame Pro IS NOT" (Section 9)?
5. **Principle Alignment:** Does it align with Design Principles (Section 11)?

**If any gate fails, the feature is rejected or deferred.**

### What Automatically Disqualifies a Feature

- Primarily serves individual athletes without organizational mediation
- Requires building generic functionality unrelated to certification
- Compromises auditability for convenience
- Introduces scope outside sports governance domain
- Requires significant infrastructure for non-core capability

### Authority to Change This Document

Changes to this document require:

1. Written proposal with justification
2. Review by product leadership
3. Impact assessment on existing features and roadmap
4. Explicit version increment and changelog entry

Minor clarifications may be made without full review. Substantive scope changes require governance approval.

---

## 13. Non-Negotiables

These rules will NEVER be violated:

| Rule | Description |
|------|-------------|
| **No Silent States** | Every blocked or loading state must have explicit user feedback |
| **No Unverifiable Documents** | Every issued document must have a verification mechanism |
| **No Data Without Attribution** | Every record must have timestamp, actor, and context |
| **No Athlete Self-Registration** | Athletes register through organizations, never independently |
| **No Billing Bypass** | Organizations must have valid billing status to perform sensitive actions |
| **No Retroactive Tampering** | Historical records cannot be silently modified |
| **No Implicit Permissions** | Every action requires explicit role-based authorization |

---

## 14. Relationship With Other Documents

This document is the **primary authority** for product scope decisions.

| Document | Relationship |
|----------|--------------|
| `docs/PRODUCT-SAFETY.md` | Defines safety invariants that protect user experience within this scope |
| `docs/IDENTITY-CONTRACT.md` | Defines identity resolution rules that implement organizational governance |
| `docs/SECURITY-AUTH-CONTRACT.md` | Defines security boundaries that protect institutional data |
| `docs/BUSINESS-FLOWS.md` | Documents operational flows that implement this scope |
| `docs/SSF-CONSTITUTION.md` | Defines technical governance that ensures scope is implemented correctly |

### Hierarchy

```text
PRODUCT-SCOPE.md (What we build)
       │
       ├── PRODUCT-SAFETY.md (How we protect users)
       │
       ├── IDENTITY-CONTRACT.md (How we manage access)
       │
       └── SSF-CONSTITUTION.md (How we build it)
```

When documents conflict, this scope document takes precedence for product decisions. Technical implementation documents take precedence for how those decisions are executed.

---

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2026-01-30 | Initial canonical scope definition |

---

*This document governs all product decisions for Tatame Pro. Deviations require explicit governance approval.*

---

## File to Create

| File | Action |
|------|--------|
| `docs/PRODUCT-SCOPE.md` | CREATE with content above |

## Confirmations

- ✅ Target Customer explicitly defined as "Organizações esportivas formais (federações, ligas e entidades gestoras)"
- ✅ Core Problems framed as INSTITUTIONAL RISKS
- ✅ No technical jargon or implementation details
- ✅ No future promises unless marked
- ✅ Strict exclusions defined
- ✅ North Star Metric established
- ✅ Governance rules for scope changes defined

