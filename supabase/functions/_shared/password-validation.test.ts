/**
 * P1-14 — Password Complexity Validation Tests
 *
 * Contract tests for validatePasswordComplexity. This helper sits in every
 * auth flow (signup, reset, admin-create-user), so a regression here either
 * lets weak passwords through or rejects legitimate ones at scale.
 */
import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validatePasswordComplexity } from "./password-validation.ts";

// ============================================================================
// Acceptance — strong passwords pass with no errors
// ============================================================================

Deno.test("validatePasswordComplexity: accepts a strong 12-char password", () => {
  const result = validatePasswordComplexity("CorrectHorse9");
  assertEquals(result.valid, true);
  assertEquals(result.errors, []);
});

Deno.test("validatePasswordComplexity: accepts minimum-length password (exactly 8)", () => {
  const result = validatePasswordComplexity("Abcdef12");
  assert(result.valid, `expected valid, got errors: ${result.errors.join(", ")}`);
});

Deno.test("validatePasswordComplexity: accepts maximum-length password (exactly 72)", () => {
  // bcrypt's hard limit. 72 chars: 70 letters + "1A"
  const password = "a".repeat(35) + "B".repeat(35) + "1A";
  assertEquals(password.length, 72);
  const result = validatePasswordComplexity(password);
  assert(result.valid);
});

Deno.test("validatePasswordComplexity: accepts password with special chars", () => {
  const result = validatePasswordComplexity("Abc123!@#$%^");
  assert(result.valid);
});

// ============================================================================
// Length boundaries
// ============================================================================

Deno.test("validatePasswordComplexity: rejects 7-char password", () => {
  const result = validatePasswordComplexity("Abc1234");
  assertFalse(result.valid);
  assert(
    result.errors.some((e) => e.includes("pelo menos 8")),
    "expected length error",
  );
});

Deno.test("validatePasswordComplexity: rejects 73-char password", () => {
  const password = "A1" + "a".repeat(71);
  assertEquals(password.length, 73);
  const result = validatePasswordComplexity(password);
  assertFalse(result.valid);
  assert(result.errors.some((e) => e.includes("no máximo 72")));
});

// ============================================================================
// Character-class requirements
// ============================================================================

Deno.test("validatePasswordComplexity: rejects when missing uppercase", () => {
  const result = validatePasswordComplexity("abcdef12");
  assertFalse(result.valid);
  assert(result.errors.some((e) => e.includes("maiúscula")));
});

Deno.test("validatePasswordComplexity: rejects when missing lowercase", () => {
  const result = validatePasswordComplexity("ABCDEF12");
  assertFalse(result.valid);
  assert(result.errors.some((e) => e.includes("minúscula")));
});

Deno.test("validatePasswordComplexity: rejects when missing digit", () => {
  const result = validatePasswordComplexity("Abcdefgh");
  assertFalse(result.valid);
  assert(result.errors.some((e) => e.includes("número")));
});

Deno.test("validatePasswordComplexity: collects multiple errors at once", () => {
  // Only lowercase letters, too short, no digit, no uppercase.
  const result = validatePasswordComplexity("abc");
  assertFalse(result.valid);
  // Must surface length + uppercase + digit (three rules violated)
  assert(result.errors.length >= 3);
});

// ============================================================================
// Weak-pattern detection
// ============================================================================

Deno.test("validatePasswordComplexity: rejects passwords containing 'password' (case-insensitive)", () => {
  const result = validatePasswordComplexity("MyPassword1");
  assertFalse(result.valid);
  assert(result.errors.some((e) => e.toLowerCase().includes("fraca")));
});

Deno.test("validatePasswordComplexity: rejects passwords containing '12345678'", () => {
  const result = validatePasswordComplexity("Abc12345678");
  assertFalse(result.valid);
});

Deno.test("validatePasswordComplexity: rejects 'qwerty' substring", () => {
  const result = validatePasswordComplexity("QwertyAbc1");
  assertFalse(result.valid);
});

Deno.test("validatePasswordComplexity: rejects 'iloveyou' substring", () => {
  const result = validatePasswordComplexity("Iloveyou123");
  assertFalse(result.valid);
});

Deno.test("validatePasswordComplexity: rejects 'admin123' substring (case-insensitive)", () => {
  const result = validatePasswordComplexity("MyAdmin123A");
  assertFalse(result.valid);
});

// ============================================================================
// Defensive — non-string / empty inputs
// ============================================================================

Deno.test("validatePasswordComplexity: rejects empty string with a single error", () => {
  const result = validatePasswordComplexity("");
  assertFalse(result.valid);
  assertEquals(result.errors.length, 1);
  assert(result.errors[0].includes("obrigatória"));
});

Deno.test("validatePasswordComplexity: rejects null / undefined as obrigatória", () => {
  // The function signature is `string` but callers (req.json()) may pass
  // anything. The runtime check must hold.
  // deno-lint-ignore no-explicit-any
  const result1 = validatePasswordComplexity(null as any);
  assertFalse(result1.valid);
  // deno-lint-ignore no-explicit-any
  const result2 = validatePasswordComplexity(undefined as any);
  assertFalse(result2.valid);
});

Deno.test("validatePasswordComplexity: rejects non-string types", () => {
  // deno-lint-ignore no-explicit-any
  const result = validatePasswordComplexity(12345678 as any);
  assertFalse(result.valid);
});
