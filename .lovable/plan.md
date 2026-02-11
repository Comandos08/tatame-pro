
# PI-A05 — Edge Validation Layer (SAFE GOLD) — EXECUTION PLAN v3

## Summary

Create institutional server-side validation infrastructure using Zod, then retrofit `grant-roles` as pilot. All 3 micro-adjustments incorporated.

---

## Files to CREATE

### 1. `supabase/functions/_shared/validation/validate.ts`

Core utilities:

**`parseRequestBody(req, corsHeaders, maxBytes?)`**
- Read body via `req.text()` (NOT `req.json()`)
- Check size using `new TextEncoder().encode(text).length` (bytes, not characters -- adjustment #2)
- Default limit: 50,000 bytes
- `JSON.parse` wrapped in explicit `try/catch` returning `MALFORMED_JSON` on failure (adjustment #1)
- Returns `{ success: true, data }` or `{ success: false, response: Response }`

**`validateInput<T>(schema, raw)`**
- Zod `safeParse` -- never throws
- Returns typed `{ success: true, data: T }` or `{ success: false, error: ValidationError }`

**`validationErrorResponse(error, corsHeaders)`**
- Produces institutional Error Envelope:
```text
{
  ok: false,
  code: "VALIDATION_ERROR" | "PAYLOAD_TOO_LARGE" | "MALFORMED_JSON",
  messageKey: "validation.invalid_payload" | ...,
  retryable: false,
  timestamp: "<ISO 8601>",
  details?: string[]
}
```
- HTTP 400 for validation/malformed, 413 for payload size

### 2. `supabase/functions/_shared/validation/sanitize.ts`

Reusable Zod primitives:
- `zTrimmedString()` -- `z.string().trim()`
- `zNormalizedEmail()` -- `z.string().trim().toLowerCase().email()`
- `zUUID()` -- `z.string().uuid()`

### 3. `supabase/functions/_shared/validation/schemas/grant-roles.ts`

Zod schema for `grant-roles` input:
- `targetProfileId`: `zUUID()` required
- `tenantId`: `zUUID()` required
- `roles`: `z.array(z.enum([...VALID_ROLES])).min(1).max(10)` (adjustment #3 preserved)
- `reason`: `zTrimmedString().max(500).optional()`
- `impersonationId`: `zUUID().optional()`
- Schema uses `.strict()` -- unknown fields produce 400

---

## File to MODIFY

### 4. `supabase/functions/grant-roles/index.ts`

**Remove** (lines 46-62): `VALID_ROLES` array, `ValidRole` type, `GrantRolesRequest` interface

**Replace** (lines 118-146): Manual parsing and validation block

**With**: 
```text
const bodyResult = await parseRequestBody(req, corsHeaders);
if (!bodyResult.success) return bodyResult.response;

const parsed = validateInput(GrantRolesSchema, bodyResult.data);
if (!parsed.success) return validationErrorResponse(parsed.error, corsHeaders);

const { targetProfileId, tenantId, roles, reason } = parsed.data;
```

**Downstream unchanged**: `impersonationId` extraction, role check, billing check, grant logic -- all untouched.

---

## 3 Micro-Adjustments Applied

| # | Adjustment | Implementation |
|---|---|---|
| 1 | JSON.parse in try/catch | `parseRequestBody` wraps `JSON.parse` in try/catch, returns MALFORMED_JSON envelope |
| 2 | Byte-based size check | `new TextEncoder().encode(text).length` instead of `text.length` |
| 3 | max 10 roles | `z.array().max(10)` in schema |

---

## Acceptance Criteria

- Payloads over 50KB rejected BEFORE JSON parsing (413)
- Malformed JSON returns structured MALFORMED_JSON error (400)
- Unknown fields in payload produce 400 (strict mode)
- All error responses include ISO 8601 `timestamp`
- `grant-roles` behavior identical: same HTTP codes, same field names, same downstream flow
- Deploy and test via curl
