/**
 * SAFE GOLD - Email Templates Index
 * Central export for all membership email templates
 */

// Base layout utilities
export { wrapInLayout, createButton, createInfoBox, type EmailLayoutData } from "./base.ts";

// Membership templates
export { getMembershipApprovedTemplate, type MembershipApprovedData } from "./membership/approved.ts";
export { getMembershipRejectedTemplate, type MembershipRejectedData } from "./membership/rejected.ts";
export { getMembershipExpiringTemplate, type MembershipExpiringData } from "./membership/expiring.ts";
export { getMembershipRenewedTemplate, type MembershipRenewedData } from "./membership/renewed.ts";
