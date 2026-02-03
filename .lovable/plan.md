

# P3 — DOCUMENTAÇÃO FORMAL: RLS vs Edge Functions

---

## STATUS

| Item | Estado |
|------|--------|
| Modo | SAFE MODE |
| Tipo | Documentação apenas |
| Execução SQL | PROIBIDA |
| Edge Functions novas | PROIBIDO |
| Impacto em produção | ZERO |

---

## ARTEFATO A CRIAR

**Arquivo único:** `docs/security/rls-vs-edge-functions.md`

Este documento passará a fazer parte da hierarquia constitucional do projeto, subordinado ao SSF-CONSTITUTION.md.

---

## ESTRUTURA DO DOCUMENTO

### 1. CONTEXTO

- Arquitetura Supabase utilizada no TATAME PRO
- Explicação do modelo RLS + PostgREST
- Explicação do modelo Edge Functions + service_role
- Motivação histórica:
  - **P0.1 (digital_cards)**: Policy `qual: true` permitia enumeração pública
  - **P0.2 (memberships)**: UPDATE sem WITH CHECK permitia alteração cross-tenant

### 2. DEFINIÇÕES CANÔNICAS

| Termo | Definição |
|-------|-----------|
| **RLS** | Row-Level Security do PostgreSQL. Controla acesso linha-a-linha baseado em `auth.uid()` e funções auxiliares (`is_tenant_admin`, `is_superadmin`, `has_role`). |
| **Edge Function** | Backend confiável com acesso `service_role`. Bypass completo de RLS. Usado para operações que exigem controle fino ou exposição pública controlada. |
| **PostgREST** | Canal HTTP direto para o PostgreSQL, sujeito 100% às policies RLS. Cliente autenticado usa seu JWT. |
| **Superadmin** | Papel `SUPERADMIN_GLOBAL` com `tenant_id = NULL`. Acesso irrestrito via `is_superadmin()`. |
| **Impersonation** | Contexto lógico frontend. NÃO confiável para RLS. Validado APENAS em Edge Functions via `requireImpersonationIfSuperadmin`. |

### 3. MATRIZ DE DECISÃO

| Caso de Uso | RLS | Edge Function | Motivo |
|-------------|:---:|:-------------:|--------|
| CRUD interno tenant-scoped | ✅ | ❌ | RLS garante isolamento via `tenant_id` |
| SELECT público de dados ativos | ✅ | ❌ | RLS com `is_active = true` (sem dados sensíveis) |
| Verificação pública (QR Code) | ❌ | ✅ | Lookup unitário, mascaramento LGPD, sem enumeração |
| Operação com impersonation | ❌ | ✅ | Header `x-impersonation-id` não é acessível em RLS |
| Escrita sensível (aprovação, rejeição) | ❌ | ✅ | Audit trail, validação de negócio, rate limiting |
| Integração Stripe/pagamento | ❌ | ✅ | Webhooks externos, secret keys |
| Reset de senha | ❌ | ✅ | Sem autenticação, rate limiting obrigatório |
| Leitura pública com dados parciais | ❌ | ✅ | Mascaramento de nomes, campos sensíveis |
| Enumeração de registros públicos | ❌ | ❌ | **PROIBIDO** — Nenhum canal deve permitir |

### 4. REGRAS DE OURO (IMUTÁVEIS)

#### PROIBIÇÕES ABSOLUTAS

| Regra | Descrição |
|-------|-----------|
| ❌ `qual: true` para dados sensíveis | Permite enumeração total da tabela |
| ❌ UUID como "segurança" | UUIDs são descobríveis e não são secrets |
| ❌ Confiar em headers dentro de RLS | RLS não tem acesso a headers HTTP |
| ❌ Impersonation via RLS | `x-impersonation-id` é invisível para PostgreSQL |
| ❌ Lookup público via PostgREST | Edge Function é obrigatória para verificação pública |
| ❌ UPDATE sem WITH CHECK | Permite alteração de campos protegidos |
| ❌ Detectar filtros de query em RLS | RLS não sabe o que o cliente está filtrando |

#### OBRIGAÇÕES ABSOLUTAS

| Regra | Descrição |
|-------|-----------|
| ✅ Toda policy UPDATE | DEVE ter `WITH CHECK = USING` |
| ✅ Verificação pública | Via Edge Function com `service_role` |
| ✅ Escrita sensível | Via Edge Function com audit trail |
| ✅ Operações de Superadmin em tenant | Via Edge Function com `requireImpersonationIfSuperadmin` |
| ✅ Dados públicos mascarados | Nomes, emails, documentos → mascarar antes de retornar |
| ✅ Rate limiting em endpoints públicos | Obrigatório para evitar abuso |

### 5. PADRÕES APROVADOS (BASELINE ATUAL)

#### 5.1. memberships UPDATE

```sql
CREATE POLICY "Staff and admins can update memberships"
ON public.memberships
FOR UPDATE
USING (
  is_superadmin() 
  OR is_tenant_admin(tenant_id) 
  OR has_role(auth.uid(), 'STAFF_ORGANIZACAO', tenant_id) 
  OR is_head_coach_of_academy(academy_id)
)
WITH CHECK (
  is_superadmin() 
  OR is_tenant_admin(tenant_id) 
  OR has_role(auth.uid(), 'STAFF_ORGANIZACAO', tenant_id) 
  OR is_head_coach_of_academy(academy_id)
);
```

**Por que está correto:** `WITH CHECK` = `USING` impede alteração de `tenant_id` ou `athlete_id` para valores fora do escopo.

#### 5.2. digital_cards Verificação Pública

```typescript
// verify-digital-card Edge Function
const supabase = createClient(url, SERVICE_ROLE_KEY);
const { data: card } = await supabase
  .from("digital_cards")
  .select("...")
  .eq("id", cardId)
  .maybeSingle();
```

**Por que está correto:** 
- Bypass de RLS controlado
- Lookup unitário por ID
- Mascaramento de nome do atleta (`João Silva` → `João S.`)
- Validação de UUID regex antes da query

#### 5.3. Superadmin com Impersonation

```typescript
// Em Edge Functions que manipulam dados de tenant
const impersonationCheck = await requireImpersonationIfSuperadmin(
  supabaseAdmin,
  userId,
  targetTenantId,
  extractImpersonationId(req, body)
);

if (!impersonationCheck.valid) {
  return forbiddenResponse(impersonationCheck.error);
}
```

**Por que está correto:** Superadmin não pode operar em tenant sem sessão de impersonação ativa e válida.

#### 5.4. Audit Trail em Edge Functions

```typescript
await supabaseAdmin.from('audit_logs').insert({
  event_type: 'MEMBERSHIP_APPROVED',
  actor_user_id: userId,
  tenant_id: tenantId,
  target_entity_type: 'membership',
  target_entity_id: membershipId,
  metadata: { ... }
});
```

**Por que está correto:** Registro imutável de ações sensíveis (RLS bloqueia UPDATE/DELETE em `audit_logs`).

### 6. PADRÕES PROIBIDOS (COM EXEMPLOS)

#### 6.1. Policy pública genérica

```sql
-- ❌ PROIBIDO
CREATE POLICY "Anyone can read"
ON public.digital_cards
FOR SELECT
USING (true);
```

**Por que é proibido:** Permite `SELECT * FROM digital_cards` retornando todos os registros.

#### 6.2. UUID como segurança

```sql
-- ❌ PROIBIDO (pensamento)
-- "Se o usuário não souber o UUID, não consegue acessar"
```

**Por que é proibido:** UUIDs podem ser enumerados, vazados em logs, ou adivinhados.

#### 6.3. RLS tentando detectar filtros

```sql
-- ❌ PROIBIDO
CREATE POLICY "Public if filtered by id"
ON public.memberships
FOR SELECT
USING (
  -- Impossível: RLS não sabe se cliente está filtrando por id
  true
);
```

**Por que é proibido:** RLS não tem contexto da query do cliente.

#### 6.4. Exposição sem mascaramento

```typescript
// ❌ PROIBIDO
return new Response(JSON.stringify({
  athleteName: athlete.full_name,  // Nome completo exposto
  email: athlete.email,            // Email exposto
  cpf: athlete.cpf                 // CPF exposto
}));
```

**Por que é proibido:** Violação de LGPD e exposição de dados sensíveis.

#### 6.5. Escrita via PostgREST sem validação

```typescript
// ❌ PROIBIDO para operações sensíveis
await supabase
  .from('memberships')
  .update({ status: 'APPROVED' })
  .eq('id', membershipId);
```

**Por que é proibido:** Sem audit trail, sem validação de negócio, sem rate limiting.

### 7. CHECKLIST DE PR (OBRIGATÓRIO)

Todo PR que toque em backend (RLS, Edge Functions, queries) DEVE responder:

| Pergunta | Se SIM |
|----------|--------|
| Usa PostgREST direto? | Verificar se RLS é suficiente |
| É operação pública? | Edge Function obrigatória |
| Pode enumerar dados? | **PR BLOQUEADO** — redesenhar |
| Usa impersonation? | Edge Function com `requireImpersonationIfSuperadmin` |
| É UPDATE policy? | WITH CHECK obrigatório |
| É escrita sensível? | Edge Function com audit trail |
| Retorna dados de pessoa? | Mascaramento obrigatório |
| Endpoint sem autenticação? | Rate limiting obrigatório |

**Se qualquer resposta indicar insegurança → PR BLOQUEADO até redesenho.**

### 8. CRITÉRIOS DE NÃO-RETORNO (FREEZE)

Este modelo de segurança **NÃO será alterado**, exceto se:

1. Supabase mudar fundamentalmente o modelo de RLS
2. Backend migrar para outra stack (não-Supabase)
3. Exigência legal/regulatória obrigatória
4. Decisão formal de arquitetura (ADR documentado e aprovado)

**Qualquer outro motivo → NÃO é válido para alterar este contrato.**

### 9. HIERARQUIA DOCUMENTAL

```text
┌─────────────────────────────────────────────────────────┐
│              SSF CONSTITUTION (Precedência Máxima)       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │         SECURITY-AUTH-CONTRACT.md               │   │
│  │         (Auth State Machine, Security Boundary) │   │
│  └─────────────────────────────────────────────────┘   │
│                           │                             │
│  ┌─────────────────────────────────────────────────┐   │
│  │     security/rls-vs-edge-functions.md           │   │
│  │     (ESTE DOCUMENTO)                            │   │
│  └─────────────────────────────────────────────────┘   │
│                           │                             │
│  ┌─────────────────────────────────────────────────┐   │
│  │              HARDENING.md                       │   │
│  │              (Patterns, Utilities)              │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 10. DECLARAÇÃO FINAL

Este documento substitui qualquer interpretação verbal, mensagem de chat ou decisão implícita.

A partir de sua criação, RLS e Edge Functions no TATAME PRO seguem **EXCLUSIVAMENTE** este contrato.

---

## AÇÕES DE IMPLEMENTAÇÃO

1. **Criar diretório** `docs/security/` (se não existir)
2. **Criar arquivo** `docs/security/rls-vs-edge-functions.md` com conteúdo completo
3. **Atualizar** `.lovable/plan.md` com status do P3

---

## CRITÉRIOS DE ACEITE

| Critério | Verificação |
|----------|-------------|
| Documento único criado | ✅ docs/security/rls-vs-edge-functions.md |
| Nenhuma ambiguidade | ✅ Decisões explícitas |
| Matriz de decisão | ✅ Tabela clara |
| Exemplos positivos e negativos | ✅ Incluídos |
| Checklist de PR | ✅ Incluído |
| Critérios de não-retorno | ✅ Documentados |
| Zero impacto em produção | ✅ Apenas documentação |

---

## RESULTADO ESPERADO

```text
P3 — DOCUMENTAÇÃO RLS vs EDGE FUNCTIONS
STATUS: ✅ CONCLUÍDO
IMPACTO: PREVENTIVO
SEGURANÇA: CONGELADA
DÍVIDA TÉCNICA: ZERO
RISCO FUTURO: MITIGADO
```

