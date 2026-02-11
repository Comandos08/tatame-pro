/**
 * 🛡️ Institutional Validation Layer — PI-A05 (SAFE GOLD)
 *
 * Core utilities for server-side input validation.
 * - parseRequestBody: payload guard (size + JSON parsing) BEFORE any logic
 * - validateInput: Zod-based schema validation (never throws)
 * - validationErrorResponse: institutional Error Envelope
 */
import { z, ZodSchema, ZodError } from "https://deno.land/x/zod@v3.23.8/mod.ts";

// ============================================================================
// TYPES
// ============================================================================

export interface ValidationError {
  code: "VALIDATION_ERROR" | "PAYLOAD_TOO_LARGE" | "MALFORMED_JSON";
  messageKey: string;
  details?: string[];
}

export interface ValidationSuccess<T> {
  success: true;
  data: T;
}

export interface ValidationFailure {
  success: false;
  error: ValidationError;
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

export interface ParseBodySuccess {
  success: true;
  data: unknown;
}

export interface ParseBodyFailure {
  success: false;
  response: Response;
}

export type ParseBodyResult = ParseBodySuccess | ParseBodyFailure;

// ============================================================================
// ERROR ENVELOPE
// ============================================================================

function buildErrorEnvelope(
  code: ValidationError["code"],
  messageKey: string,
  details?: string[],
) {
  return {
    ok: false,
    code,
    messageKey,
    retryable: false,
    timestamp: new Date().toISOString(),
    ...(details && details.length > 0 ? { details } : {}),
  };
}

// ============================================================================
// PARSE REQUEST BODY (runs BEFORE any business logic)
// ============================================================================

const DEFAULT_MAX_BYTES = 50_000;

/**
 * Reads the raw request body, enforces byte-size limit, and parses JSON.
 * Must be called BEFORE req.json() — uses req.text() to control parsing.
 *
 * Returns { success: true, data } or { success: false, response: Response }.
 */
export async function parseRequestBody(
  req: Request,
  corsHeaders: Record<string, string>,
  maxBytes: number = DEFAULT_MAX_BYTES,
): Promise<ParseBodyResult> {
  // 1. Read raw text
  const text = await req.text();

  // 2. Byte-size guard (not character count — prevents multi-byte bypass)
  const byteLength = new TextEncoder().encode(text).length;
  if (byteLength > maxBytes) {
    const envelope = buildErrorEnvelope(
      "PAYLOAD_TOO_LARGE",
      "validation.payload_too_large",
      [`Payload size ${byteLength} bytes exceeds limit of ${maxBytes} bytes`],
    );
    return {
      success: false,
      response: new Response(JSON.stringify(envelope), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }

  // 3. JSON parse with explicit try/catch (adjustment #1)
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    const envelope = buildErrorEnvelope(
      "MALFORMED_JSON",
      "validation.malformed_json",
    );
    return {
      success: false,
      response: new Response(JSON.stringify(envelope), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }

  return { success: true, data: raw };
}

// ============================================================================
// VALIDATE INPUT (Zod safeParse — never throws)
// ============================================================================

/**
 * Validates raw input against a Zod schema.
 * Uses safeParse — never throws exceptions.
 * Returns typed success or structured error.
 */
export function validateInput<T>(
  schema: ZodSchema<T>,
  raw: unknown,
): ValidationResult<T> {
  const result = schema.safeParse(raw);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const details = result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "_root";
    return `${path}: ${issue.message}`;
  });

  return {
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      messageKey: "validation.invalid_payload",
      details,
    },
  };
}

// ============================================================================
// VALIDATION ERROR RESPONSE (institutional envelope → HTTP Response)
// ============================================================================

/**
 * Converts a ValidationError into an HTTP Response with the institutional envelope.
 */
export function validationErrorResponse(
  error: ValidationError,
  corsHeaders: Record<string, string>,
): Response {
  const status = error.code === "PAYLOAD_TOO_LARGE" ? 413 : 400;
  const envelope = buildErrorEnvelope(error.code, error.messageKey, error.details);

  return new Response(JSON.stringify(envelope), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
