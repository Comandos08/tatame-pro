# PI-D3-DOCS1.0 — Validação Pública & Carteirinha Institucional

## Status: ✅ IMPLEMENTADO

## Resumo

Este PI transforma documentos internos em prova institucional pública, garantindo que:
- A validade seja verificável por qualquer pessoa
- Nenhum dado sensível seja exposto
- A Regra de Ouro governe 100% das respostas públicas
- A carteirinha comunique autoridade institucional

---

## Bloco 1 — Token Público (PROVA)

### Estrutura de dados

Tabela `document_public_tokens`:

```sql
CREATE TABLE document_public_tokens (
  token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type institutional_document_type NOT NULL,
  document_id UUID NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
```

### Regras implementadas:
- ✅ Token é opaco (UUID v4)
- ✅ IDs internos não são expostos publicamente
- ✅ `revoked_at` invalida o token imediatamente
- ✅ Token é gerado no momento da emissão do documento
- ✅ 1 token por documento
- ✅ Token não muda (revogação invalida)

### Funções RPC:
- `generate_document_token(p_document_type, p_document_id, p_tenant_id)` → UUID
- `revoke_document_token(p_token)` → BOOLEAN

---

## Bloco 2 — Edge Function `verify-document`

### Endpoint público
```
POST /functions/v1/verify-document
Body: { "token": "uuid" }
```

### Fluxo implementado:
1. ✅ Buscar token em `document_public_tokens`
2. ✅ Resolver documento + tenant
3. ✅ Aplicar Regra de Ouro
4. ✅ Retornar payload mínimo

### Payload de resposta:

**Válido:**
```typescript
{
  valid: true;
  document_type: 'digital_card' | 'diploma';
  holder_name: string;      // Mascarado: "João S."
  issuer_name: string;      // Nome do tenant
  status_label: 'VALID';
  issued_at: string;
  sport_type?: string;
  grading_level?: string;
  valid_until?: string;
}
```

**Inválido:**
```typescript
{
  valid: false;
  status_label: 'INVALID' | 'REVOKED' | 'NOT_FOUND';
}
```

### Regras de segurança:
- ❌ Nunca retorna IDs internos
- ❌ Nunca retorna billing status
- ❌ Nunca retorna tenant_id
- ✅ Erro = resposta neutra (NOT_FOUND)
- ✅ LGPD: Nomes mascarados (ex: "João S.")

---

## Bloco 3 — Página Pública `/verify/:token`

### Arquivo: `src/pages/PublicVerifyDocument.tsx`

### Estados de UI implementados:
- ✅ **VALID** - Selo verde, dados do documento
- ✅ **INVALID** - Selo vermelho, mensagem neutra
- ✅ **REVOKED** - Selo laranja, mensagem de revogação
- ✅ **NOT_FOUND** - Selo cinza, mensagem de não encontrado

### Conteúdo exibido (VALID):
- Selo visual de validade
- Nome do portador (mascarado)
- Instituição emissora
- Modalidade esportiva
- Data de emissão
- Data de validade
- Texto: "Documento válido conforme registros oficiais."

### Rota configurada em `App.tsx`:
```tsx
<Route path="/verify/:token" element={<PublicVerifyDocument />} />
```

---

## Bloco 4 — Carteirinha (Layout Institucional)

### Arquivo: `src/components/card/DigitalMembershipCard.tsx`

### Atualização:
- Nova prop `publicToken?: string | null`
- QR Code aponta para `/verify/{publicToken}` quando disponível
- Fallback para URL legada quando token não existe

### Campos obrigatórios no layout:
- ✅ Nome do portador
- ✅ Foto (se existir)
- ✅ Instituição emissora
- ✅ Status visível
- ✅ QR Code → `/verify/{token}`

### Geração do token:
- Token é gerado automaticamente em `generate-digital-card` Edge Function
- Token é buscado e passado via `AthletePortal.tsx` → `DigitalCardSection` → `DigitalMembershipCard`

---

## Checklist de Validação

Execute manualmente:

| Cenário | Status Esperado |
|---------|-----------------|
| Token inexistente | NOT_FOUND |
| Tenant BLOCKED | INVALID |
| Billing PAST_DUE | INVALID |
| Documento REVOKED | REVOKED |
| Tenant ACTIVE + Billing TRIALING + Doc ACTIVE | VALID |

---

## Arquivos Criados/Modificados

### Criados:
- `supabase/functions/verify-document/index.ts`
- `src/pages/PublicVerifyDocument.tsx`
- `src/hooks/usePublicToken.ts`
- `docs/SAFE_GOLD/D3-public-verification.md`

### Modificados:
- `src/App.tsx` - Rota `/verify/:token`
- `src/components/card/DigitalMembershipCard.tsx` - Prop `publicToken`
- `src/components/portal/DigitalCardSection.tsx` - Interface atualizada
- `src/components/identity/IdentityGate.tsx` - Rota `/verify/:token` adicionada à whitelist pública
- `src/pages/AthletePortal.tsx` - Busca do token público
- `supabase/functions/generate-digital-card/index.ts` - Geração do token

### Migration:
- `institutional_document_type` enum
- `document_public_tokens` table
- `generate_document_token()` function
- `revoke_document_token()` function

---

## Critério de Conclusão

> "PI-D3-DOCS1.0 aplicado. Validação pública ativa e carteirinha institucional pronta."
