

# PI-POL-001B — Enforcement Backend (Edge Function)

## Resumo Executivo

Este PI implementa a **enforcement** da regra canonica de oficialidade no backend. A Edge Function `generate-diploma` passara a validar obrigatoriamente a existencia de membership ACTIVE antes de emitir qualquer diploma, bloqueando a operacao com audit log quando a condicao nao for atendida.

---

## Estado Atual (Diagnostico)

| Aspecto | Status |
|---------|--------|
| Query do atleta inclui `profile_id` | NAO (linha 64: `id, full_name, tenant_id`) |
| Validacao de membership ACTIVE | NAO EXISTE |
| Audit log de bloqueio | NAO EXISTE |
| Campo `is_official` na insercao de diploma | NAO (linha 386-401) |
| Campo `is_official` na insercao de grading | NAO (linha 416-424) |

---

## Arquitetura do Gate de Membership

```text
FLUXO ATUAL                           FLUXO APOS PI-POL-001B
------------------------------------  ------------------------------------
Request                               Request
    |                                     |
    v                                     v
Validar params                        Validar params
    |                                     |
    v                                     v
Buscar athlete                        Buscar athlete + profile_id  <-- NOVO
    |                                     |
    v                                     v
Buscar grading_level                  Buscar grading_level
    |                                     |
    v                                     v
Validar tenant                        Validar tenant
    |                                     |
    v                                     v
Billing check                         Billing check
    |                                     |
    v                                     v
[nenhum gate]                         PI-POL-001B GATE  <-- NOVO
                                          |
                                      +---+---+
                                      |       |
                                      v       v
                                    ACTIVE   NO ACTIVE
                                      |       |
                                      v       v
                                  continua  BLOQUEIO + Audit
                                      |       |
    v                                 v       v
Gerar PDF                         Gerar PDF  HTTP 200 + error
    |                                 |
    v                                 v
Insert diploma                    Insert diploma + is_official=true
    |                                 |
    v                                 v
Insert grading                    Insert grading + is_official=true
    |                                 |
    v                                 v
Response success                  Response success
```

---

## Mudancas Obrigatorias

### 1. Atualizar SELECT do atleta para incluir `profile_id`

**Localizacao:** Linha 64

**De:**
```typescript
.select('id, full_name, tenant_id')
```

**Para:**
```typescript
.select('id, full_name, tenant_id, profile_id')
```

---

### 2. Inserir bloco PI-POL-001B apos billing check

**Localizacao:** Apos linha 133 (depois do log "Billing status OK")

**Codigo a inserir:**

```typescript
// ─────────────────────────────────────────────────────────────
// PI-POL-001B — MEMBERSHIP REQUIRED (OFFICIAL DIPLOMA)
// Contract: HTTP 200 always. Fail-closed.
// ─────────────────────────────────────────────────────────────

const profileId = athlete?.profile_id ?? null;

// Case 1: Athlete has no profile_id (fail-closed)
if (!profileId) {
  console.log("[GENERATE-DIPLOMA][PI-POL-001B] Blocked: athlete.profile_id is null");
  
  await supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    event_type: 'DIPLOMA_BLOCKED_NO_ACTIVE_MEMBERSHIP',
    category: 'GRADING',
    level: 'WARN',
    metadata: {
      athlete_id: athleteId,
      profile_id: null,
      grading_level_id: gradingLevelId,
      rule: 'MEMBERSHIP_REQUIRED',
      decision: 'BLOCKED',
      reason: 'ATHLETE_PROFILE_ID_NULL'
    }
  });

  return new Response(
    JSON.stringify({
      success: false,
      error: 'MEMBERSHIP_REQUIRED',
      message: 'Official diploma requires ACTIVE membership.'
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Case 2: Check for ACTIVE membership
let hasActiveMembership = false;

try {
  const { data: activeMembership, error: membershipErr } = await supabase
    .from('memberships')
    .select('id')
    .eq('applicant_profile_id', profileId)
    .eq('tenant_id', tenantId)
    .eq('status', 'ACTIVE')
    .maybeSingle();

  if (membershipErr) {
    console.error('[GENERATE-DIPLOMA][PI-POL-001B] membership lookup error:', membershipErr);
    hasActiveMembership = false; // fail-closed
  } else {
    hasActiveMembership = !!activeMembership;
  }
} catch (e) {
  console.error('[GENERATE-DIPLOMA][PI-POL-001B] membership lookup exception:', e);
  hasActiveMembership = false; // fail-closed
}

if (!hasActiveMembership) {
  console.log("[GENERATE-DIPLOMA][PI-POL-001B] Blocked: no ACTIVE membership for profile", profileId);
  
  await supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    event_type: 'DIPLOMA_BLOCKED_NO_ACTIVE_MEMBERSHIP',
    category: 'GRADING',
    level: 'WARN',
    metadata: {
      athlete_id: athleteId,
      profile_id: profileId,
      grading_level_id: gradingLevelId,
      rule: 'MEMBERSHIP_REQUIRED',
      decision: 'BLOCKED',
      reason: 'NO_ACTIVE_MEMBERSHIP'
    }
  });

  return new Response(
    JSON.stringify({
      success: false,
      error: 'MEMBERSHIP_REQUIRED',
      message: 'Official diploma requires ACTIVE membership.'
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

console.log("[GENERATE-DIPLOMA][PI-POL-001B] Membership check OK - proceeding with official diploma");
```

---

### 3. Adicionar `is_official: true` na insercao de diploma

**Localizacao:** Linha 386-401 (insert em `diplomas`)

**Adicionar campo:**
```typescript
is_official: true,
```

**Posicao:** Apos `content_hash_sha256: contentHash,`

---

### 4. Adicionar `is_official: true` na insercao de grading

**Localizacao:** Linha 416-424 (insert em `athlete_gradings`)

**Adicionar campo:**
```typescript
is_official: true,
```

**Posicao:** Apos `diploma_id: diploma.id,`

---

## Arquivo Modificado

| Arquivo | Tipo | Descricao |
|---------|------|-----------|
| `supabase/functions/generate-diploma/index.ts` | MODIFY | Gate de membership + audit + is_official=true |

---

## Invariantes SAFE GOLD Garantidas

| Invariante | Como e Atendida |
|------------|-----------------|
| HTTP 200 sempre | Todos os returns usam status: 200 |
| Fail-closed | profile_id null = bloqueia, erro na query = bloqueia |
| Zero efeitos colaterais no bloqueio | Return antes de qualquer insert |
| Audit obrigatorio | Dois pontos de audit (profile null e no membership) |
| is_official = true | Campos adicionados em ambos os inserts |
| Mensagem padronizada | "Official diploma requires ACTIVE membership." |
| Error code estavel | "MEMBERSHIP_REQUIRED" |

---

## Contrato de Erros

**Quando bloqueado:**
```json
{
  "success": false,
  "error": "MEMBERSHIP_REQUIRED",
  "message": "Official diploma requires ACTIVE membership."
}
```

**Quando sucesso:**
```json
{
  "success": true,
  "diploma": { ... },
  "grading": { ... }
}
```

---

## Criterios de Aceitacao

### Caminho Permitido
Dado atleta com `profile_id` e membership ACTIVE no tenant:
- Diploma e emitido com `is_official = true`
- Grading e criado com `is_official = true`
- Resposta `success: true`

### Caminho Bloqueado
Atleta sem `profile_id` OU sem membership ACTIVE:
- Nenhuma escrita ocorre
- Audit log e inserido (`DIPLOMA_BLOCKED_NO_ACTIVE_MEMBERSHIP`)
- Resposta HTTP 200 com `success: false` e `error: MEMBERSHIP_REQUIRED`

### Fail-Closed
Se query do membership falhar:
- Bloqueia
- Audita
- Retorna `MEMBERSHIP_REQUIRED`

---

## Ordem de Execucao

1. Editar `supabase/functions/generate-diploma/index.ts`
   - Linha 64: adicionar `profile_id` ao select
   - Apos linha 133: inserir bloco PI-POL-001B
   - Linha ~400: adicionar `is_official: true` no diploma
   - Linha ~424: adicionar `is_official: true` no grading
2. Deploy automatico da Edge Function
3. Teste manual:
   - Atleta sem profile_id → `MEMBERSHIP_REQUIRED`
   - Atleta com profile_id mas sem ACTIVE → `MEMBERSHIP_REQUIRED`
   - Atleta com ACTIVE → diploma emitido com `is_official = true`

