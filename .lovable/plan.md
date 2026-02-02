

# P0 — HARD FIXES FUNDACIONAIS (SAFE MODE)

## MODO DE EXECUÇÃO

- **SAFE MODE** — Zero Criatividade
- Zero Feature Nova
- Zero Alteração Fora do Escopo
- NÃO MUDAR CONTRATOS EXISTENTES, APENAS CORRIGIR ESCOPO
- NÃO QUEBRAR NENHUM FLUXO FUNCIONAL EXISTENTE
- SE ALGO NÃO ESTIVER CLARO: NÃO IMPLEMENTAR

---

## ANÁLISE ATUAL

### Descobertas após Exploração

| Item | Estado Atual | Status |
|------|--------------|--------|
| P0.1 - Approval Tenant-Scoped | **JÁ IMPLEMENTADO** - Queries filtram `tenant_id` | OK |
| P0.2 - QRCode Forte | **PARCIALMENTE** - Usa `membership_id` direto (UUID) | AJUSTE |
| P0.3 - Verificação Carteirinha | **JÁ EXISTE** - `VerifyMembership.tsx` funcional | OK |
| P0.4 - Verificação Diploma | **JÁ EXISTE** - `VerifyDiploma.tsx` funcional | OK |
| P0.5 - Formulário Organização | **DIVERGENTE** - Create/Edit têm campos diferentes | AJUSTE |
| P0.6 - Remover SHA-256 Label | **PARCIALMENTE** - Visível em alguns lugares | AJUSTE |

---

## P0.1 — MEMBERSHIP APROVADO POR TENANT

### Análise

**RESULTADO: JÁ IMPLEMENTADO CORRETAMENTE**

Verificação em `ApprovalsList.tsx` (linhas 88-91):
```tsx
.eq('tenant_id', tenant.id)
.eq('status', 'PENDING_REVIEW')
```

Verificação em `approve-membership/index.ts` (linhas 298-313):
```ts
const isTenantAdmin = roles?.some(r => 
  (r.role === "ADMIN_TENANT" || r.role === "STAFF_ORGANIZACAO") && 
  r.tenant_id === targetTenantId
);
```

**Conclusão**: O código atual já implementa corretamente o modelo federativo:
- Query filtra por `tenant_id` do tenant atual
- Backend valida role no tenant específico
- SuperAdmin precisa de impersonation válida

**NENHUMA AÇÃO NECESSÁRIA**

---

## P0.2 — QRCODE À PROVA DE BALAS

### Análise do Estado Atual

**QRCode atual**:
- `DigitalMembershipCard.tsx` (linha 48): 
  ```tsx
  const verificationUrl = `${window.location.origin}/${tenantSlug}/verify/membership/${membershipId}`;
  ```

**Problema**: Usa `membershipId` (UUID) diretamente na URL

**Solução Proposta na Spec**: Criar campo `membership_public_id` com hash SHA-256

### Avaliação Técnica

**RECOMENDAÇÃO: NÃO IMPLEMENTAR ESTE AJUSTE**

Razões:
1. UUID v4 já é criptograficamente seguro (122 bits de entropia)
2. Criar hash de `membership_id + tenant_id` apenas adiciona uma indireção sem ganho de segurança
3. A verificação já ocorre via view `membership_verification` que valida `tenant_slug` + `membership_id`
4. O UUID não expõe nenhum dado sensível

**Ganho de segurança: ZERO**
**Risco de regressão: MÉDIO** (IDs antigos deixariam de funcionar)
**Complexidade: ALTA** (migração de banco, edge function, UI)

**NENHUMA AÇÃO RECOMENDADA** - A implementação atual é segura

---

## P0.3 — PÁGINA DE VERIFICAÇÃO DE CARTEIRINHA

### Análise

**RESULTADO: JÁ IMPLEMENTADO**

`VerifyMembership.tsx` já existe e funciona:
- Usa view `membership_verification` (hardened, read-only)
- Retorna dados públicos com nome maskeado
- Mostra graduação vigente
- Valida status e validade

**NENHUMA AÇÃO NECESSÁRIA**

---

## P0.4 — PÁGINA DE VERIFICAÇÃO DE DIPLOMA

### Análise

**RESULTADO: JÁ IMPLEMENTADO**

`VerifyDiploma.tsx` já existe e funciona:
- Busca por ID do diploma
- Valida tenant via slug
- Máscara nome do atleta
- Verifica integridade via SHA-256
- Read-only, sem listagem

**NENHUMA AÇÃO NECESSÁRIA**

---

## P0.5 — FORMULÁRIO ORGANIZAÇÃO IDÊNTICO

### Análise

**DIVERGÊNCIA IDENTIFICADA**:

| Campo | CreateTenantDialog | EditTenantDialog |
|-------|-------------------|------------------|
| `SPORT_TYPES` | Array completo (10 itens) | Array reduzido (8 itens) |
| Format | `'Jiu-Jitsu'` | `'BJJ'` |
| Slug | Editável | Read-only |

**Problema**: Inconsistência nos valores de `SPORT_TYPES` entre os dois dialogs

### Ação Necessária

Unificar `SPORT_TYPES` em `EditTenantDialog.tsx`:

**Arquivo**: `src/components/admin/EditTenantDialog.tsx`

**Linha 28** (atual):
```ts
const SPORT_TYPES = ['BJJ', 'Judo', 'MuayThai', 'Wrestling', 'Karate', 'Taekwondo', 'Boxing', 'MMA'];
```

**Substituir por**:
```ts
const SPORT_TYPES = ['Jiu-Jitsu', 'Judo', 'Muay Thai', 'Wrestling', 'Karate', 'Taekwondo', 'Boxing', 'MMA', 'Sambo', 'Krav Maga'];
```

**Impacto**: Zero - apenas corrige inconsistência visual

---

## P0.6 — REMOVER LABEL "SHA-256" DA CARTEIRINHA

### Análise

**Locais onde "SHA-256:" aparece**:

1. `DigitalMembershipCard.tsx` (linha 240):
   ```tsx
   <span>SHA-256:</span>
   ```

2. `VerifyCard.tsx` (linha 396):
   ```tsx
   <p className="text-xs text-muted-foreground mt-1">
     SHA-256: {verification.storedHash.substring(0, 16)}...
   </p>
   ```

3. `VerifyMembership.tsx` (linha 328):
   ```tsx
   <span className="font-mono">SHA-256: {data.content_hash_sha256.substring(0, 12)}...</span>
   ```

### Ação Necessária

Substituir "SHA-256:" por "ID:" em todos os locais acima

---

## RESUMO DE ALTERAÇÕES

| Arquivo | Ação | Linhas |
|---------|------|--------|
| `EditTenantDialog.tsx` | EDITAR | Linha 28: unificar SPORT_TYPES |
| `DigitalMembershipCard.tsx` | EDITAR | Linha 240: SHA-256 → ID |
| `VerifyCard.tsx` | EDITAR | Linha 396: SHA-256 → ID |
| `VerifyMembership.tsx` | EDITAR | Linha 328: SHA-256 → ID |

**Total**: 4 arquivos, ~8 linhas alteradas

---

## DETALHES TÉCNICOS

### 1. EditTenantDialog.tsx - Linha 28

**De**:
```ts
const SPORT_TYPES = ['BJJ', 'Judo', 'MuayThai', 'Wrestling', 'Karate', 'Taekwondo', 'Boxing', 'MMA'];
```

**Para**:
```ts
const SPORT_TYPES = ['Jiu-Jitsu', 'Judo', 'Muay Thai', 'Wrestling', 'Karate', 'Taekwondo', 'Boxing', 'MMA', 'Sambo', 'Krav Maga'];
```

### 2. DigitalMembershipCard.tsx - Linhas 238-244

**De**:
```tsx
{contentHash && (
  <div className="mt-6 pt-4 border-t">
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Shield className="h-3 w-3" />
      <span>SHA-256:</span>
      <code className="font-mono text-[10px] truncate flex-1">
        {contentHash}
      </code>
    </div>
  </div>
)}
```

**Para**:
```tsx
{contentHash && (
  <div className="mt-6 pt-4 border-t">
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Shield className="h-3 w-3" />
      <span>ID:</span>
      <code className="font-mono text-[10px] truncate flex-1">
        {contentHash}
      </code>
    </div>
  </div>
)}
```

### 3. VerifyCard.tsx - Linhas 394-398

**De**:
```tsx
<p className="text-xs text-muted-foreground mt-1">
  SHA-256: {verification.storedHash.substring(0, 16)}...
</p>
```

**Para**:
```tsx
<p className="text-xs text-muted-foreground mt-1">
  ID: {verification.storedHash.substring(0, 16)}...
</p>
```

### 4. VerifyMembership.tsx - Linhas 327-329

**De**:
```tsx
{data.content_hash_sha256 && (
  <div className="text-center text-xs text-muted-foreground">
    <span className="font-mono">SHA-256: {data.content_hash_sha256.substring(0, 12)}...</span>
  </div>
)}
```

**Para**:
```tsx
{data.content_hash_sha256 && (
  <div className="text-center text-xs text-muted-foreground">
    <span className="font-mono">ID: {data.content_hash_sha256.substring(0, 12)}...</span>
  </div>
)}
```

---

## FORA DE ESCOPO (CONFIRMADO)

- P0.1: Já implementado corretamente
- P0.2: Não implementar (UUID é seguro, hash não adiciona proteção)
- P0.3: Já existe
- P0.4: Já existe
- Eventos de domínio
- Automações
- Analytics
- Stripe
- Auth

---

## CRITÉRIOS DE ACEITE

| Item | Critério | Esperado |
|------|----------|----------|
| P0.5 | SPORT_TYPES idêntico Create/Edit | OK |
| P0.6 | Nenhum "SHA-256" visível na UI | OK |
| Regressão | Nenhuma funcionalidade quebrada | OK |
| QR Codes | Continuam funcionando | OK |
| Verificação | Páginas funcionais | OK |

---

## RESULTADO ESPERADO

Após P0:
- Consistência nos formulários de organização
- UX institucional limpa (sem exposição técnica)
- Modelo federativo validado (já estava correto)
- Verificação funcional (já estava implementada)
- Sistema pronto para P1

