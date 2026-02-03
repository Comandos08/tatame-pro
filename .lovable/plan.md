

# P0.1 — ENCERRAMENTO FORMAL
## STATUS: ⏸️ PAUSADO (CRITÉRIO DE PARADA TÉCNICO)

---

## DECLARAÇÃO DE ENCERRAMENTO

| Item | Status |
|------|--------|
| PRÉ-CHECK executado | ✅ Completo |
| Impedimento técnico validado | ✅ RLS não suporta "lookup-only" sem discriminador |
| SQL aplicado | ❌ ZERO (conforme esperado) |
| Policies alteradas | ❌ ZERO |
| Escopo respeitado | ✅ Somente digital_cards analisado |

### Motivo Técnico do Impedimento

PostgreSQL RLS avalia policies **linha-a-linha**, não **query-a-query**. Não há como:
- Permitir `SELECT ... WHERE id = 'X'` (1 resultado)
- Bloquear `SELECT *` (todos os resultados)

...usando apenas `USING(...)` sem um discriminador adicional.

### Risco Remanescente

A policy `Public can verify digital cards` com `qual: true` permanece ativa, permitindo enumeração total dos cards por qualquer usuário anônimo.

---

# P1 — VERIFICAÇÃO PÚBLICA SEGURA
## Edge Function `verify-digital-card`

---

## OBJETIVO

Eliminar a exposição pública de `digital_cards` movendo a verificação para uma Edge Function que:
1. Recebe `cardId` como parâmetro
2. Usa `service_role` para lookup interno
3. Retorna dados mascarados/públicos
4. Permite remoção da policy `qual: true`

---

## ARQUIVOS A CRIAR

| Arquivo | Descrição |
|---------|-----------|
| `supabase/functions/verify-digital-card/index.ts` | Edge Function de verificação pública |

---

## ARQUIVOS A MODIFICAR

| Arquivo | Mudanças |
|---------|----------|
| `src/pages/VerifyCard.tsx` | Chamar Edge Function em vez de PostgREST direto |

---

## MIGRATIONS A EXECUTAR

| Operação | SQL |
|----------|-----|
| DROP POLICY | `DROP POLICY "Public can verify digital cards" ON public.digital_cards;` |

---

## FASE 1 — CRIAR EDGE FUNCTION

### `supabase/functions/verify-digital-card/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VerifyRequest {
  cardId: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { cardId }: VerifyRequest = await req.json();

    if (!cardId || typeof cardId !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid cardId" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Validar formato UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(cardId)) {
      return new Response(
        JSON.stringify({ error: "Invalid card ID format" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Lookup por ID específico (service_role bypassa RLS)
    const { data: card, error } = await supabase
      .from("digital_cards")
      .select(`
        id,
        valid_until,
        content_hash_sha256,
        created_at,
        membership:memberships(
          id,
          status,
          start_date,
          end_date,
          athlete:athletes(
            id,
            full_name
          )
        ),
        tenant:tenants(
          id,
          name,
          slug,
          logo_url
        )
      `)
      .eq("id", cardId)
      .maybeSingle();

    if (error) {
      console.error("Database error:", error);
      return new Response(
        JSON.stringify({ error: "Verification failed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    if (!card) {
      return new Response(
        JSON.stringify({ found: false, message: "Card not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // Mascarar nome do atleta para LGPD
    const maskName = (name: string): string => {
      const parts = name.split(" ");
      if (parts.length > 1) {
        return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
      }
      return parts[0];
    };

    // Resposta pública mascarada
    const publicResponse = {
      found: true,
      card: {
        id: card.id,
        validUntil: card.valid_until,
        contentHash: card.content_hash_sha256,
        issuedAt: card.created_at,
      },
      membership: card.membership ? {
        status: card.membership.status,
        startDate: card.membership.start_date,
        endDate: card.membership.end_date,
      } : null,
      athlete: card.membership?.athlete ? {
        displayName: maskName(card.membership.athlete.full_name),
      } : null,
      organization: card.tenant ? {
        name: card.tenant.name,
        slug: card.tenant.slug,
        logoUrl: card.tenant.logo_url,
      } : null,
    };

    return new Response(
      JSON.stringify(publicResponse),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("Error verifying card:", error);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
```

---

## FASE 2 — ATUALIZAR FRONTEND

### `src/pages/VerifyCard.tsx`

**Mudança**: Substituir query PostgREST por chamada à Edge Function.

```typescript
// DE (atual):
const { data: card } = await supabase
  .from("digital_cards")
  .select("...")
  .eq("id", cardId)
  .maybeSingle();

// PARA:
const response = await supabase.functions.invoke("verify-digital-card", {
  body: { cardId },
});

if (response.error || !response.data?.found) {
  // Card não encontrado
}

const { card, membership, athlete, organization } = response.data;
```

---

## FASE 3 — REMOVER POLICY PÚBLICA

### Migration SQL

```sql
-- Remove policy que expõe todos os cards
DROP POLICY IF EXISTS "Public can verify digital cards" ON public.digital_cards;
```

---

## ORDEM DE EXECUÇÃO (CRÍTICA)

1. **Criar** Edge Function `verify-digital-card`
2. **Deploy** Edge Function (automático)
3. **Testar** Edge Function via curl/Postman
4. **Atualizar** `VerifyCard.tsx` para usar Edge Function
5. **Testar** fluxo E2E (QR code → verificação)
6. **Executar** migration (DROP POLICY)
7. **Validar** que `SELECT * FROM digital_cards` retorna vazio para anon

---

## CRITÉRIOS DE ACEITE

| Critério | Verificação |
|----------|-------------|
| Edge Function responde com dados mascarados | ✅ Nome do atleta truncado |
| Verificação pública funciona | ✅ QR code → página → dados corretos |
| Policy `qual: true` removida | ✅ DROP POLICY executado |
| Listagem pública bloqueada | ✅ `SELECT *` retorna 0 rows para anon |
| Fluxos autenticados preservados | ✅ Tenant admin e atleta continuam OK |

---

## GARANTIAS DE SEGURANÇA

| Garantia | Como Garantido |
|----------|----------------|
| Sem enumeração | Edge Function aceita apenas 1 cardId por request |
| UUID validado | Regex antes de query |
| Dados mascarados | Nome do atleta truncado (LGPD) |
| Rate limit | Pode ser adicionado posteriormente |
| Audit trail | Logs nativos da Edge Function |

---

## RESULTADO ESPERADO

```text
P1 — VERIFICAÇÃO PÚBLICA SEGURA
STATUS: ✅ CONCLUÍDO
RESULTADO: 
  - Policy pública removida
  - Edge Function implementada
  - Zero exposição de dados
  - Verificação pública preservada
```

