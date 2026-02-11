/**
 * 🔐 Grant Roles Schema — PI-A05 (SAFE GOLD)
 *
 * Zod schema for grant-roles Edge Function input.
 * Uses strict() — unknown fields produce 400.
 */
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import { zUUID, zTrimmedString } from "../sanitize.ts";

/**
 * Valid roles that can be granted.
 * Single source of truth — replaces the manual VALID_ROLES array.
 */
export const VALID_ROLES = [
  'ATLETA',
  'COACH_ASSISTENTE',
  'COACH_PRINCIPAL',
  'INSTRUTOR',
  'STAFF_ORGANIZACAO',
  'ADMIN_TENANT',
  'RECEPCAO',
] as const;

export type ValidRole = typeof VALID_ROLES[number];

/**
 * Grant Roles input schema.
 * strict() rejects any fields not defined here → 400.
 */
export const GrantRolesSchema = z.object({
  targetProfileId: zUUID(),
  tenantId: zUUID(),
  roles: z.array(z.enum(VALID_ROLES)).min(1).max(10),
  reason: zTrimmedString().max(500).optional(),
  impersonationId: zUUID().optional(),
}).strict();

export type GrantRolesInput = z.infer<typeof GrantRolesSchema>;
