# Data Retention Policy — Tatame Pro

**Version:** 1.0
**Last Updated:** 2026-03-11
**Legal Basis:** LGPD (Lei 13.709/2018)

---

## 1. Overview

This document defines retention periods for all data categories in Tatame Pro, covering personal data (PII), financial records, audit logs, and operational data.

## 2. Retention Periods by Data Category

### 2.1 Personal Data (Athletes, Coaches, Guardians)

| Data Type | Retention Period | Legal Basis | Deletion Method |
|---|---|---|---|
| Profile data (name, email, phone) | Active membership + 6 months | Contract execution (Art. 7, V) | Anonymization |
| National ID (CPF) | Active membership + 5 years | Legal obligation (Art. 7, II) | Hard delete |
| Birth date | Active membership + 6 months | Contract execution | Anonymization |
| Guardian data (minors) | Until athlete turns 18 + 1 year | Child protection (Art. 14) | Hard delete |
| Photos/avatars | Active membership + 30 days | Consent (Art. 7, I) | Hard delete from storage |

### 2.2 Financial Data

| Data Type | Retention Period | Legal Basis | Deletion Method |
|---|---|---|---|
| Payment records | 5 years from transaction | Tax obligation (CTN Art. 173) | Archive then delete |
| Stripe references | 5 years from transaction | Tax obligation | Archive then delete |
| Billing state transitions | 5 years from transaction | Legal obligation | Archive then delete |
| Invoice data | 5 years from issuance | Tax obligation | Archive then delete |

### 2.3 Audit & Security Logs

| Data Type | Retention Period | Legal Basis | Deletion Method |
|---|---|---|---|
| Audit logs (`audit_logs`) | 2 years | Legitimate interest + compliance | Archive to cold storage |
| Decision logs (`decision_logs`) | 1 year | Legitimate interest | Archive then delete |
| Login attempts | 24 hours | Legitimate interest | Auto-cleanup |
| Webhook events | 90 days | Operational | Hard delete |
| Institutional events | 2 years | Compliance | Archive to cold storage |

### 2.4 Operational Data

| Data Type | Retention Period | Legal Basis | Deletion Method |
|---|---|---|---|
| Membership records | Active + 2 years after expiration | Contract execution | Anonymization |
| Event records | 3 years after event date | Legitimate interest | Archive |
| Digital cards | Active membership + 30 days | Contract execution | Hard delete |
| Diplomas | Indefinite (sports credential) | Legitimate interest | Retained |
| Gradings | Indefinite (sports record) | Legitimate interest | Retained |

## 3. Data Subject Rights (LGPD Art. 18)

### 3.1 Right to Erasure

When an athlete or member requests data erasure:

1. **Immediate** (within 48h): Remove from active queries, anonymize display name
2. **Within 15 days**: Delete PII from profiles, digital cards, photos
3. **Within 30 days**: Complete anonymization of all related records
4. **Retained** (legal obligation): Financial records (5 years), audit logs (de-identified)

### 3.2 Right to Portability

Athletes can export their data via the Athlete Portal:
- Personal profile data (JSON/CSV)
- Membership history
- Event participation records
- Grading history
- Diploma records

### 3.3 Right to Access

All personal data is accessible via:
- Athlete Portal > Privacy & Data section
- Data export request (automated)
- Manual request to organization admin

## 4. Deletion Process

### 4.1 Automated Deletion

| Process | Schedule | Target |
|---|---|---|
| Login attempts cleanup | Every 24h | Records older than 24h |
| Expired session cleanup | Every 6h | Expired auth sessions |
| Webhook events cleanup | Monthly | Records older than 90 days |
| Temporary documents cleanup | Daily | Uploads older than 24h |

### 4.2 Manual Deletion (Data Subject Request)

1. Request received via portal or organization admin
2. Identity verification
3. Scope assessment (what can be deleted vs. legally retained)
4. Execution with audit log entry
5. Confirmation to data subject within 15 days

## 5. Audit Trail

All data retention operations are logged in `audit_logs` with:
- Action: `DELETE` or `EXPORT`
- Entity type and ID
- Actor (who initiated)
- Timestamp
- Reason (data subject request, automated cleanup, legal obligation)

## 6. Cross-Tenant Isolation

Each tenant's data is isolated via Row Level Security (RLS). Retention policies apply independently per tenant. A tenant's deletion does not affect other tenants' data.

## 7. Third-Party Data Processors

| Processor | Data Shared | Retention by Processor | DPA Status |
|---|---|---|---|
| Supabase | All database records | Per our retention policy | Required |
| Stripe | Payment data | Per Stripe's retention policy | In place |
| Resend | Email addresses | Transient (send only) | Required |
| Sentry | Error context (no PII) | 90 days | Not required |

## 8. Review Schedule

This policy is reviewed:
- Annually (mandatory)
- When LGPD regulations change
- When new data categories are introduced
- When new third-party processors are added

---

*This document is part of Tatame Pro's LGPD compliance framework.*
