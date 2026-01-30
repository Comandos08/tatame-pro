# PRODUCT MATURITY MAP — TATAME PRO

> **Version:** 1.0.0  
> **Status:** CANONICAL  
> **Last Updated:** 2026-01-30  
> **Authority:** Subordinate to PRODUCT-SCOPE.md

---

## 1. Purpose of This Document

This document describes the **current maturity** of Tatame Pro across all product domains.

It exists to:

- **Set clear expectations** with customers, partners, and internal teams
- **Clarify what is stable** and what has known limitations
- **Prevent misaligned expectations** during sales and onboarding
- **Serve as a decision filter** for roadmap discussions
- **Reinforce scope boundaries** by explicitly stating what is not planned

This is not a roadmap. This is not a list of promises. This is a factual representation of current product state.

---

## 2. How to Read This Maturity Map

Capabilities are classified into four maturity levels:

| Level | Meaning |
|-------|---------|
| **CORE** | Stable, mature, non-negotiable. This is what Tatame Pro is built to do. These capabilities are fully supported, actively maintained, and central to product value. |
| **SUPPORTED** | Works as designed, but not a primary differentiation focus. Customers can rely on these capabilities, but they may receive less active development attention. |
| **EXPERIMENTAL** | Limited, controlled, or evolving. These capabilities exist but may have constraints, require specific configurations, or change without notice. Not recommended for critical workflows. |
| **NOT PLANNED** | Explicitly out of scope. These capabilities will not be built. Requests for them will be declined. This is intentional and aligned with product strategy. |

**Reading guidance:**

- If a capability is marked **CORE**, it is safe to depend on it for institutional operations.
- If a capability is marked **SUPPORTED**, it works but may not receive priority enhancements.
- If a capability is marked **EXPERIMENTAL**, proceed with awareness of limitations.
- If a capability is marked **NOT PLANNED**, do not expect it. Ever.

---

## 3. Maturity Levels Definition

### CORE

- Fully implemented and stable
- Covered by product safety invariants
- Actively maintained and monitored
- Central to the value proposition
- Changes require governance review

**Implication for customers:** You can build your institutional operations on these capabilities with confidence.

**Implication for internal teams:** These are protected. Changes require careful review and cannot compromise stability.

### SUPPORTED

- Implemented and functional
- Maintained but not prioritized for enhancement
- May have minor limitations or edge cases
- Works within defined boundaries

**Implication for customers:** These capabilities work as documented. Feature requests in this area will be evaluated but may not be prioritized.

**Implication for internal teams:** Fix bugs, maintain stability, but do not over-invest unless strategic priority changes.

### EXPERIMENTAL

- Available but with known constraints
- May require specific configuration or context
- Subject to change without deprecation notice
- Not recommended for mission-critical workflows

**Implication for customers:** Use with awareness. Do not build critical processes on experimental capabilities.

**Implication for internal teams:** Monitor usage, gather feedback, but do not promise stability.

### NOT PLANNED

- Explicitly excluded from product scope
- Will not be built regardless of demand
- Requests will be declined with reference to this document
- Aligned with PRODUCT-SCOPE.md exclusions

**Implication for customers:** This capability does not exist and will not exist. If this is critical to your needs, Tatame Pro may not be the right solution.

**Implication for internal teams:** Say no. Refer to scope governance.

---

## 4. Product Domains

### 4.1 Organization Management

| Capability | Maturity | Notes |
|------------|----------|-------|
| Multi-tenant architecture | CORE | Each organization operates independently with full data isolation |
| Tenant onboarding flow | CORE | Structured setup with mandatory configuration steps |
| Academy registration | CORE | Organizations can register and manage affiliated academies |
| Staff management | CORE | Coaches and administrative staff can be registered and assigned |
| Grading system configuration | CORE | Custom belt/rank systems per organization |
| Organization settings | SUPPORTED | Basic configuration options available |
| Custom branding | SUPPORTED | Logo upload only; no full white-labeling |
| Multi-organization management | NOT PLANNED | Users cannot manage multiple unrelated organizations from one account |

### 4.2 Athlete Registration & Membership

| Capability | Maturity | Notes |
|------------|----------|-------|
| Adult membership application | CORE | Complete registration flow with document submission |
| Youth membership application | CORE | Includes guardian information and consent |
| Document upload and storage | CORE | Secure storage with permanent archival upon approval |
| Membership approval workflow | CORE | Administrative review with approval/rejection actions |
| Membership renewal | CORE | Athletes can renew before expiration |
| Membership expiration handling | CORE | Automated status transitions with notifications |
| Membership rejection with reason | CORE | Rejections are recorded with explanation |
| Athlete profile management | SUPPORTED | Basic personal data visible to organization |
| Athlete self-registration | NOT PLANNED | Athletes register through organizations, never independently |
| Bulk athlete import | NOT PLANNED | No CSV or batch import functionality |

### 4.3 Certification & Progression

| Capability | Maturity | Notes |
|------------|----------|-------|
| Grading record creation | CORE | Date, evaluator, location, and level recorded |
| Belt/rank progression history | CORE | Complete chronological record maintained |
| Multiple grading schemes | CORE | Organizations can define sport-specific systems |
| Grading audit trail | CORE | Every progression creates immutable record |
| Diploma generation per grading | CORE | Official document issued with verification |
| Grading notifications | SUPPORTED | Email notifications on new gradings |
| Performance metrics | NOT PLANNED | No tracking of training performance or statistics |
| Skill assessments | NOT PLANNED | No competency or technique evaluations |

### 4.4 Official Documents (Cards & Diplomas)

| Capability | Maturity | Notes |
|------------|----------|-------|
| Digital membership card | CORE | Generated upon membership approval |
| Graduation diploma | CORE | Generated upon grading record |
| QR code verification | CORE | Every document includes verification mechanism |
| PDF generation | CORE | Documents available as downloadable PDF |
| Document validity dates | CORE | Cards reflect membership period; diplomas are permanent |
| SHA-256 integrity hash | CORE | Tamper-evident document verification |
| Physical card printing | NOT PLANNED | No print fulfillment or physical card production |
| Custom document templates | NOT PLANNED | Organizations cannot modify document layouts |

### 4.5 Public Verification

| Capability | Maturity | Notes |
|------------|----------|-------|
| Membership verification page | CORE | Third parties can verify athlete status via URL |
| Diploma verification page | CORE | Third parties can verify graduation authenticity |
| QR code scanning | CORE | Direct link to verification from document |
| Masked athlete data | CORE | Privacy-preserving display (first name + last initial) |
| Verification without login | CORE | Publicly accessible without authentication |
| Verification API | NOT PLANNED | No programmatic verification endpoints for third parties |
| Bulk verification | NOT PLANNED | No batch verification functionality |

### 4.6 Governance & Auditability

| Capability | Maturity | Notes |
|------------|----------|-------|
| Audit log for administrative actions | CORE | All significant actions recorded with actor and timestamp |
| Decision logging | CORE | Security and access decisions logged with reason codes |
| Immutable log architecture | CORE | Logs cannot be modified or deleted by any user |
| SHA-256 hash chain integrity | CORE | Tamper-evident log verification |
| Security event tracking | CORE | Anomalies and failures recorded |
| Audit log export | SUPPORTED | Export available through admin interface |
| Security timeline view | SUPPORTED | Read-only dashboard for security events |
| Custom retention policies | NOT PLANNED | Standard retention applies to all organizations |

### 4.7 Billing & Subscription

| Capability | Maturity | Notes |
|------------|----------|-------|
| Organization subscription | CORE | Monthly and annual billing via Stripe |
| Trial period | CORE | 7-day trial for new organizations |
| Trial expiration handling | CORE | Automated status transitions and access restrictions |
| Subscription lifecycle management | CORE | Active, past due, canceled states handled |
| Billing-restricted access | CORE | Sensitive actions blocked when billing is invalid |
| Manual billing override | SUPPORTED | Superadmins can extend trials or mark as paid |
| Customer portal access | SUPPORTED | Organizations can manage payment methods |
| Multiple payment methods | NOT PLANNED | Stripe credit card only |
| Per-athlete pricing | NOT PLANNED | Flat subscription pricing only |
| Invoicing for athlete fees | NOT PLANNED | Organizations handle their own athlete billing |

### 4.8 Access Control & Roles

| Capability | Maturity | Notes |
|------------|----------|-------|
| Role-based access control | CORE | Deny-by-default architecture |
| Tenant Admin role | CORE | Full organization management |
| Staff role | CORE | Limited administrative access |
| Athlete role | CORE | Portal access only |
| Superadmin role | CORE | Platform-level administration |
| Impersonation for support | CORE | Time-limited, audited tenant access |
| Role assignment audit | CORE | All role changes logged |
| Custom role creation | NOT PLANNED | Fixed role structure only |
| Fine-grained permissions | NOT PLANNED | No per-feature permission toggles |

### 4.9 Diagnostics & Observability

| Capability | Maturity | Notes |
|------------|----------|-------|
| Tenant diagnostics dashboard | SUPPORTED | Read-only view of tenant health indicators |
| Platform diagnostics | SUPPORTED | Superadmin view of system-wide metrics |
| Identity resolution diagnostics | SUPPORTED | Debug information for access issues |
| Billing state visibility | SUPPORTED | Current billing status and history visible |
| Identity telemetry | EXPERIMENTAL | 10% sampling for production monitoring |
| Real-time alerting | NOT PLANNED | No automated alerts or notifications to admins |
| Custom dashboards | NOT PLANNED | Fixed diagnostic views only |

### 4.10 Events (Limited Scope)

| Capability | Maturity | Notes |
|------------|----------|-------|
| Event creation | SUPPORTED | Basic event definition with dates and location |
| Event categories | SUPPORTED | Simple category structure |
| Athlete registration for events | SUPPORTED | Athletes can register for organization events |
| Event status workflow | SUPPORTED | Draft → Published → Completed → Archived |
| Event results recording | SUPPORTED | Position-based results with immutability |
| Public event listing | SUPPORTED | Organizations can publish events publicly |
| Competition brackets | NOT PLANNED | No tournament management |
| Scoring systems | NOT PLANNED | No real-time scoring or judging |
| Event payments | NOT PLANNED | No payment processing for event registration |

---

## 5. What Tatame Pro Is Actively Improving

The following areas receive ongoing attention aligned with CORE capabilities:

| Focus Area | Description |
|------------|-------------|
| **Certification integrity** | Ensuring documents remain verifiable and tamper-evident over time |
| **Audit trail completeness** | Expanding coverage of logged decisions and actions |
| **Identity resolution reliability** | Reducing edge cases and improving error recovery |
| **Membership workflow robustness** | Handling all lifecycle states gracefully |
| **Verification trust** | Strengthening public verification experience |

These are focus areas, not features. Improvements in these areas are continuous and incremental.

---

## 6. What Tatame Pro Is Explicitly NOT Improving

The following areas are intentionally deprioritized or excluded:

| Area | Reason |
|------|--------|
| Training and class management | Out of scope per PRODUCT-SCOPE.md |
| Athlete self-service features | Product is organization-mediated |
| Performance analytics | Not aligned with certification focus |
| Social and communication features | Beyond transactional notifications |
| Payment processing for athletes | Organizations handle their own billing |
| Multi-organization accounts | Architectural constraint, not planned |
| Custom document templates | Standardization ensures verification integrity |
| Advanced event management | Events are SUPPORTED, not CORE |

Requests for improvements in these areas will be declined.

---

## 7. How This Maturity Map Is Used

### In Product Decisions

- New feature requests are evaluated against this map
- CORE capabilities receive priority for bug fixes and stability
- NOT PLANNED requests are declined without further analysis
- Maturity level upgrades require demonstrated stability and adoption

### In Sales Conversations

- This document sets honest expectations with prospects
- CORE capabilities can be confidently promised
- SUPPORTED capabilities should be demonstrated, not oversold
- NOT PLANNED capabilities should be stated clearly as exclusions

### In Partnership Discussions

- Partners should understand product boundaries
- Integration requests outside scope are declined
- CORE capabilities define integration surface area

### In Roadmap Governance

- Roadmap items must align with CORE or SUPPORTED domains
- EXPERIMENTAL capabilities require clear graduation criteria
- NOT PLANNED items remain excluded from consideration

---

## 8. Non-Negotiable Product Postures

These statements are absolute and non-negotiable:

| Posture | Statement |
|---------|-----------|
| **1** | We will not build features that serve individual athletes over organizational governance. |
| **2** | We will not compromise audit integrity for convenience or speed. |
| **3** | We will not issue documents that cannot be publicly verified. |
| **4** | We will not allow athletes to register without organization mediation. |
| **5** | We will not bypass billing enforcement for any user role. |
| **6** | We will not add features outside the Critical Value Flow defined in PRODUCT-SCOPE.md. |
| **7** | We will say "no" clearly and refer to this document when declining requests. |

---

## Relationship With Other Documents

| Document | Relationship |
|----------|--------------|
| `docs/PRODUCT-SCOPE.md` | **Primary authority.** This maturity map is subordinate and must not contradict scope definitions. |
| `docs/PRODUCT-SAFETY.md` | Defines safety invariants that CORE capabilities must respect. |
| `docs/IDENTITY-CONTRACT.md` | Governs identity resolution, which is a CORE capability. |
| `docs/SSF-CONSTITUTION.md` | Technical governance that ensures CORE capabilities are implemented correctly. |

---

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2026-01-30 | Initial maturity map definition |

---

*This document describes current product state, not future intentions. It is updated as capabilities mature or scope changes through governance.*
