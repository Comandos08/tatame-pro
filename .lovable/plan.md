

# Plano: P3.YOUTH.FINAL.HARDENING (SAFE GOLD)

## Resumo do Diagnóstico

### Verificação do Enum no Banco (Confirmado)

```sql
SELECT t.typname, e.enumlabel FROM pg_type t ...
-- Resultado:
-- guardian_relationship: PARENT, GUARDIAN, OTHER
```

### Estado Atual dos Enums (100% Alinhados)

| Camada | Valores | Status |
|--------|---------|--------|
| **Banco (pg_enum)** | `PARENT`, `GUARDIAN`, `OTHER` | ✅ Fonte da Verdade |
| **Supabase Types** | `"PARENT" \| "GUARDIAN" \| "OTHER"` | ✅ Alinhado |
| **src/types/membership.ts** | `'PARENT' \| 'GUARDIAN' \| 'OTHER'` | ✅ Alinhado |
| **approve-membership** | `'PARENT' \| 'GUARDIAN' \| 'OTHER'` | ✅ Alinhado |
| **YouthMembershipForm.tsx** | `z.enum(['PARENT', 'GUARDIAN', 'OTHER'])` | ✅ Alinhado |

### Problema Identificado

O único gap técnico é o uso de `as any` em dois arquivos:
- `YouthMembershipForm.tsx` (linha 297)
- `AdultMembershipForm.tsx` (linha 302)

O enum `GuardianRelationship` já está **corretamente** definido em `src/types/membership.ts`, e NÃO precisa ser movido para um arquivo separado `src/types/guardian.ts` — isso apenas fragmentaria o código sem benefício.

---

## Tarefas de Implementação

### Tarefa 1: Criar Tipos de Inserção Explícitos

**Arquivo:** `src/types/membership-insert.ts` (NOVO)

```typescript
import type { GenderType, GuardianRelationship } from './membership';

/**
 * Estrutura de applicant_data para filiações adultas
 */
export interface AdultApplicantData {
  full_name: string;
  birth_date: string;
  national_id: string;
  gender: GenderType;
  email: string;
  phone: string;
  address_line1: string;
  address_line2?: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

/**
 * Estrutura de applicant_data para filiações juvenis
 */
export interface YouthApplicantData extends AdultApplicantData {
  is_minor: true;
  national_id: string | null;
  guardian: {
    full_name: string;
    national_id: string;
    email: string;
    phone: string;
    relationship: GuardianRelationship;
  };
}

/**
 * Estrutura de documento uploaded
 */
export interface DocumentUploaded {
  type: 'ID_DOCUMENT' | 'MEDICAL_CERTIFICATE';
  storage_path: string;
  file_type: string;
}

/**
 * Payload de inserção para membership (adulto)
 */
export interface AdultMembershipInsert {
  tenant_id: string;
  athlete_id: null;
  applicant_profile_id: string;
  applicant_data: AdultApplicantData;
  documents_uploaded: DocumentUploaded[];
  status: 'DRAFT';
  type: 'FIRST_MEMBERSHIP';
  price_cents: number;
  currency: string;
  payment_status: 'NOT_PAID';
}

/**
 * Payload de inserção para membership (juvenil)
 */
export interface YouthMembershipInsert {
  tenant_id: string;
  athlete_id: null;
  applicant_profile_id: string;
  applicant_data: YouthApplicantData;
  documents_uploaded: DocumentUploaded[];
  status: 'DRAFT';
  type: 'FIRST_MEMBERSHIP';
  price_cents: number;
  currency: string;
  payment_status: 'NOT_PAID';
}
```

---

### Tarefa 2: Substituir `as any` no YouthMembershipForm.tsx

**Arquivo:** `src/components/membership/YouthMembershipForm.tsx`

**2.1 Adicionar import (linha 30):**

```typescript
import type { YouthMembershipInsert, DocumentUploaded } from '@/types/membership-insert';
```

**2.2 Tipar o array de documentos (linha 215):**

```typescript
const documentsUploaded: DocumentUploaded[] = [];
```

**2.3 Substituir o insert (linhas 260-299):**

```typescript
// 2. Create membership WITH applicant_data (includes guardian data)
const membershipPayload: YouthMembershipInsert = {
  tenant_id: tenant.id,
  athlete_id: null,
  applicant_profile_id: currentUser.id,
  applicant_data: {
    full_name: athleteData.fullName,
    birth_date: athleteData.birthDate,
    national_id: athleteData.nationalId || null,
    gender: athleteData.gender,
    email: athleteData.email || guardianData.email,
    phone: athleteData.phone || guardianData.phone,
    address_line1: athleteData.addressLine1,
    address_line2: athleteData.addressLine2 || null,
    city: athleteData.city,
    state: athleteData.state,
    postal_code: athleteData.postalCode,
    country: athleteData.country,
    is_minor: true,
    guardian: {
      full_name: guardianData.fullName,
      national_id: guardianData.nationalId,
      email: guardianData.email,
      phone: guardianData.phone,
      relationship: guardianData.relationship,
    },
  },
  documents_uploaded: documentsUploaded,
  status: 'DRAFT',
  type: 'FIRST_MEMBERSHIP',
  price_cents: MEMBERSHIP_PRICE_CENTS,
  currency: MEMBERSHIP_CURRENCY,
  payment_status: 'NOT_PAID',
};

const { data: membership, error: membershipError } = await supabase
  .from('memberships')
  .insert(membershipPayload as any) // Type assertion for JSONB fields
  .select()
  .single();
```

---

### Tarefa 3: Substituir `as any` no AdultMembershipForm.tsx

**Arquivo:** `src/components/membership/AdultMembershipForm.tsx`

**3.1 Adicionar import (após linha 23):**

```typescript
import type { AdultMembershipInsert, DocumentUploaded } from '@/types/membership-insert';
```

**3.2 Tipar o array de documentos:**

```typescript
const documentsUploaded: DocumentUploaded[] = [];
```

**3.3 Substituir o insert (linhas 276-304):**

```typescript
// 2. Criar membership COM applicant_data (SEM athlete_id)
const membershipPayload: AdultMembershipInsert = {
  tenant_id: tenant.id,
  athlete_id: null,
  applicant_profile_id: currentUser.id,
  applicant_data: {
    full_name: athleteData.fullName,
    birth_date: athleteData.birthDate,
    national_id: athleteData.nationalId,
    gender: athleteData.gender,
    email: athleteData.email,
    phone: athleteData.phone,
    address_line1: athleteData.addressLine1,
    address_line2: athleteData.addressLine2 || null,
    city: athleteData.city,
    state: athleteData.state,
    postal_code: athleteData.postalCode,
    country: athleteData.country,
  },
  documents_uploaded: documentsUploaded,
  status: 'DRAFT',
  type: 'FIRST_MEMBERSHIP',
  price_cents: MEMBERSHIP_PRICE_CENTS,
  currency: MEMBERSHIP_CURRENCY,
  payment_status: 'NOT_PAID',
};

const { data: membership, error: membershipError } = await supabase
  .from('memberships')
  .insert(membershipPayload as any) // Type assertion for JSONB fields
  .select()
  .single();
```

---

### Tarefa 4: Atualizar Exportações (Opcional mas Recomendado)

**Arquivo:** `src/types/membership.ts`

Adicionar reexport no final do arquivo para centralização:

```typescript
// Reexport insert types for convenience
export type { 
  AdultApplicantData,
  YouthApplicantData,
  DocumentUploaded,
  AdultMembershipInsert,
  YouthMembershipInsert,
} from './membership-insert';
```

---

## Nota Técnica: Por que manter `as any` no insert final

O Supabase Client tipifica `applicant_data` e `documents_uploaded` como `Json | null`, que é um tipo genérico que não aceita interfaces específicas sem type assertion. 

A estratégia SAFE GOLD adotada:

1. **Tipagem explícita no payload**: O objeto `membershipPayload` é 100% tipado via interface
2. **Type assertion mínima no insert**: O `as any` é necessário apenas porque o schema do Supabase usa `Json` genérico
3. **Validação em compile-time**: Erros de tipagem serão detectados ANTES do `as any`

**Alternativa (não recomendada para SAFE GOLD)**: Alterar o arquivo `types.ts` gerado pelo Supabase - isso seria sobrescrito na próxima sincronização e criaria regressões.

---

## Arquivos Modificados

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `src/types/membership-insert.ts` | **CRIAR** | Interfaces tipadas para insert |
| `src/components/membership/YouthMembershipForm.tsx` | **MODIFICAR** | Usar YouthMembershipInsert |
| `src/components/membership/AdultMembershipForm.tsx` | **MODIFICAR** | Usar AdultMembershipInsert |
| `src/types/membership.ts` | **MODIFICAR** | Reexport de tipos (opcional) |

---

## Critérios de Aceitação

- [ ] Interfaces `YouthMembershipInsert` e `AdultMembershipInsert` criadas
- [ ] Payload de membership explicitamente tipado em ambos os forms
- [ ] Enum `GuardianRelationship` permanece em `src/types/membership.ts` (já alinhado)
- [ ] Build TypeScript passa sem warnings
- [ ] E2E existente continua passando
- [ ] ZERO mudanças comportamentais
- [ ] SAFE GOLD preservado

---

## Seção Técnica

### Enum Canônico (Já Definido Corretamente)

```typescript
// src/types/membership.ts (linha 2)
export type GuardianRelationship = 'PARENT' | 'GUARDIAN' | 'OTHER';
```

Este tipo já está:
- ✅ Alinhado com o banco (`guardian_relationship` enum)
- ✅ Importado no `YouthMembershipForm.tsx` (linha 27)
- ✅ Usado no `approve-membership/index.ts` (linhas 92-98)

**NÃO** é necessário criar `src/types/guardian.ts` separado — isso fragmentaria o código sem benefício.

### Estrutura Final do Insert Tipado

```text
YouthMembershipInsert
├── tenant_id: string
├── athlete_id: null
├── applicant_profile_id: string
├── applicant_data: YouthApplicantData
│   ├── full_name, birth_date, gender, email, phone...
│   ├── is_minor: true
│   └── guardian: { full_name, national_id, email, phone, relationship }
├── documents_uploaded: DocumentUploaded[]
├── status: 'DRAFT'
├── type: 'FIRST_MEMBERSHIP'
├── price_cents: number
├── currency: string
└── payment_status: 'NOT_PAID'
```

