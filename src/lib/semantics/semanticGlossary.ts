/**
 * ⚠️ FROZEN SEMANTIC CONTRACT (PI U2)
 *
 * SEMANTIC GLOSSARY — SINGLE SOURCE OF TRUTH
 *
 * This file defines the canonical meaning of concepts used across:
 * - Code
 * - UX copy
 * - Database
 * - Events
 * - Observability
 *
 * No logic. No permissions. No behavior.
 * Meaning only.
 *
 * - New concepts MUST be added here first
 * - Renaming concepts requires a new PI
 * - Code may reference, but never redefine meaning
 *
 * Status: FROZEN
 */

export interface SemanticTerm {
  term: string;
  definition: string;
  notes?: string[];
  related?: string[];
  forbiddenUsages?: string[];
}

export const SEMANTIC_GLOSSARY: Record<string, SemanticTerm> = {
  TENANT: {
    term: 'Tenant',
    definition:
      'An organizational boundary representing a legal or institutional entity within the platform.',
    notes: [
      'A tenant may represent a federation, school network, or organization.',
      'A tenant is not an academy.',
      'Tenant lifecycle is governed by TenantLifecycleStatus.',
    ],
    related: ['ACADEMY', 'ATHLETE', 'ROLE'],
    forbiddenUsages: ['School', 'Org', 'Company', 'Club'],
  },

  ACADEMY: {
    term: 'Academy',
    definition:
      'A physical or virtual training unit operating under a tenant.',
    notes: [
      'Academies belong to exactly one tenant.',
      'Academies do not have identity roles.',
      'An academy is not a tenant.',
    ],
    related: ['TENANT', 'COACH_BADGE', 'ATHLETE'],
  },

  ATHLETE: {
    term: 'Athlete',
    definition:
      'An individual person enrolled in the system, regardless of rank or recognition.',
    notes: [
      'Athlete is an identity role (ATLETA).',
      'Badges do not change athlete permissions.',
      'An athlete may hold badges but remains ATLETA.',
    ],
    related: ['BADGE', 'MEMBERSHIP', 'ROLE'],
  },

  BADGE: {
    term: 'Badge',
    definition:
      'A visual recognition assigned to an athlete indicating contextual status, honor, or symbolic role.',
    notes: [
      'Badges never grant permissions.',
      'Badges are contextual and revocable.',
      'Correct phrasing: "You hold the Coach badge", not "You are a Coach".',
    ],
    related: ['ATHLETE', 'BADGE_SURFACE'],
    forbiddenUsages: ['Role', 'Permission', 'Access Level'],
  },

  ROLE: {
    term: 'Role',
    definition:
      'An identity-level access scope used exclusively for authorization.',
    notes: [
      'Exactly three roles exist: SUPERADMIN_GLOBAL, ADMIN_TENANT, ATLETA.',
      'Roles are enforced by RLS, triggers, and the AppRole type.',
      'Non-canonical roles result in deny-by-default.',
    ],
    related: ['ATHLETE', 'TENANT'],
    forbiddenUsages: ['Coach', 'Professor', 'Staff', 'Instructor'],
  },

  MEMBERSHIP: {
    term: 'Membership',
    definition:
      'A time-bound enrollment of an athlete within a tenant, governing access to services.',
    notes: [
      'Lifecycle: PENDING → ACTIVE → EXPIRED | SUSPENDED | CANCELLED.',
      'Membership status is distinct from subscription/billing status.',
    ],
    related: ['ATHLETE', 'TENANT', 'SUBSCRIPTION'],
  },

  SUBSCRIPTION: {
    term: 'Subscription',
    definition:
      'The billing/payment state of a tenant, governing financial standing.',
    notes: [
      'Lifecycle: INCOMPLETE → TRIAL → ACTIVE → PAST_DUE → SUSPENDED → CANCELLED.',
      'Subscription status does not directly determine membership status.',
    ],
    related: ['TENANT', 'MEMBERSHIP', 'BILLING'],
  },

  BILLING: {
    term: 'Billing',
    definition:
      'The financial layer tracking a tenant\'s payment obligations and history.',
    notes: [
      'Billing is aligned with Stripe but abstracted.',
      'BillingStatus: TRIALING, ACTIVE, PAST_DUE, CANCELED, UNPAID, INCOMPLETE.',
    ],
    related: ['SUBSCRIPTION', 'TENANT'],
    forbiddenUsages: ['Payment Plan', 'Pricing Tier'],
  },

  FEATURE_FLAG: {
    term: 'Feature Flag',
    definition:
      'An institutional governance control for progressive enablement or kill-switch of features.',
    notes: [
      'Flags complement but never replace can(), RLS, or entity state.',
      'Usage pattern: can(feature) && flags.isEnabled(flag).',
      'Default: false (fail-closed).',
      'Resolved exclusively via Edge Function.',
    ],
    related: ['TENANT'],
    forbiddenUsages: ['Toggle', 'Switch', 'A/B Test'],
  },

  INSTITUTIONAL_EVENT: {
    term: 'Institutional Event',
    definition:
      'An append-only audit record capturing critical system occurrences for governance.',
    notes: [
      'Domains: AUTH, IDENTITY, BILLING, SECURITY, GOVERNANCE, SYSTEM, FEATURE_FLAG.',
      'Persisted in institutional_events table.',
      'No UPDATE or DELETE allowed.',
    ],
    related: ['OBSERVABILITY', 'HEALTH'],
  },

  HEALTH: {
    term: 'Health',
    definition:
      'The operational status of a system component or the platform as a whole.',
    notes: [
      'Values: OK, DEGRADED, CRITICAL, UNKNOWN.',
      'Health is observed, not set — derived from signals.',
      'Accessible to SUPERADMIN_GLOBAL only.',
    ],
    related: ['OBSERVABILITY', 'STATE'],
  },

  STATE: {
    term: 'State',
    definition:
      'An explicit, finite classification governing entity behavior at a given moment.',
    notes: [
      'States are defined in stateDefinitions.ts (PI U3).',
      'All behavioral decisions derive from explicit state sets.',
      'Booleans must not be used for state control.',
    ],
    related: ['STATUS', 'HEALTH'],
    forbiddenUsages: ['Flag', 'Mode'],
  },

  STATUS: {
    term: 'Status',
    definition:
      'A specific value within a State set, representing the current classification of an entity.',
    notes: [
      'Status is always a member of a defined State enum.',
      '"State" is the concept; "Status" is the value.',
      'Example: MembershipStatus = ACTIVE (a status within MembershipState).',
    ],
    related: ['STATE'],
  },

  OBSERVABILITY: {
    term: 'Observability',
    definition:
      'The platform\'s ability to expose internal behavior through structured events, logs, and health signals.',
    notes: [
      'Three pillars: Audit Events, Error Codes, Health Signals.',
      'Log severity (INFO/WARN/ERROR/CRITICAL) is distinct from event severity (LOW/MEDIUM/HIGH/CRITICAL).',
    ],
    related: ['HEALTH', 'INSTITUTIONAL_EVENT'],
  },

  FEDERATION: {
    term: 'Federation',
    definition:
      'A governing body that oversees multiple tenants, providing institutional authority and coordination.',
    notes: [
      'Federations have their own roles (federation_role enum).',
      'Tenants may join or leave a federation.',
    ],
    related: ['TENANT', 'COUNCIL'],
  },

  COUNCIL: {
    term: 'Council',
    definition:
      'A deliberative body within a federation responsible for institutional decisions.',
    notes: [
      'Councils make decisions tracked in council_decisions.',
      'Members have roles: PRESIDENT, SECRETARY, MEMBER.',
    ],
    related: ['FEDERATION'],
  },

  COACH_BADGE: {
    term: 'Coach Badge',
    definition:
      'A badge variant signifying coaching recognition within an academy context.',
    notes: [
      'Coach is NOT a role — it is a badge.',
      'Coach badge does not grant any permission.',
    ],
    related: ['BADGE', 'ACADEMY'],
    forbiddenUsages: ['Coach Role', 'Instructor Role'],
  },

  BADGE_SURFACE: {
    term: 'Badge Surface',
    definition:
      'An authorized UI location where badges may be rendered.',
    notes: [
      'Allowed: ATHLETE_PROFILE, ATHLETE_CARD, BADGE_TIMELINE, BADGE_MODAL, BADGE_CHIP.',
      'Any other rendering point is implicitly forbidden.',
    ],
    related: ['BADGE'],
  },
};
