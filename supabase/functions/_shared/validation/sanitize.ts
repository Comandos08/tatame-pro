/**
 * 🧹 Institutional Sanitization Primitives — PI-A05 (SAFE GOLD)
 *
 * Reusable Zod-native transforms for consistent input sanitization.
 * Import these in schema files instead of repeating transforms.
 */
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";

/**
 * Trimmed string — removes leading/trailing whitespace.
 */
export function zTrimmedString() {
  return z.string().trim();
}

/**
 * Normalized email — trimmed, lowercased, validated as email format.
 */
export function zNormalizedEmail() {
  return z.string().trim().toLowerCase().email();
}

/**
 * UUID string — validates UUID v4 format.
 */
export function zUUID() {
  return z.string().uuid();
}
