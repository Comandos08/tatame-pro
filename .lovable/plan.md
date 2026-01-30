
# PROMPT 3/4 — Filiação de Menor (Youth): OPÇÃO B — OCULTAR COM SEGURANÇA

## DECISÃO

**OPÇÃO SELECIONADA: B — OCULTAR COM SEGURANÇA**

---

## JUSTIFICATIVA (Fatores Técnicos Objetivos)

| Fator | Status | Impacto |
|-------|--------|---------|
| Testes E2E existentes | ❌ Zero | Não validável |
| Dados de seed | ❌ Zero guardians no banco | Não testável |
| Consistência arquitetural | ❌ CRÍTICO | Youth cria athlete diretamente; Adult usa `applicant_data` |
| Fluxo de aprovação | ❌ Incompatível | `approve-membership` espera `applicant_data`, Youth não usa |
| RLS policies | ✅ Existem | — |
| Tabelas | ✅ Existem | — |

### Inconsistência Arquitetural Crítica

**AdultMembershipForm** (correto):
```
Step 1-3 → Dados em memória → Edge Function cria membership com applicant_data
         → Admin aprova → Athlete criado a partir de applicant_data
```

**YouthMembershipForm** (problemático):
```
Step 1-4 → Cria guardian DIRETAMENTE (linha 167-178)
         → Cria athlete DIRETAMENTE (linha 182-200)
         → Cria membership SEM applicant_data
         → Admin aprova → ??? (athlete já existe)
```

Esta inconsistência gera:
- Atleta órfão se pagamento falhar
- Dados duplicados se usuário refizer
- Incompatibilidade com o fluxo de aprovação existente

---

## ALTERAÇÕES EXATAS

### 1. `src/components/membership/MembershipTypeSelector.tsx`

**Ação:** Remover opção "Youth" do array de opções visíveis

**Local:** Linhas 85-99

```typescript
// ANTES:
const options = [
  {
    id: 'adult',
    title: 'Atleta Adulto',
    description: 'Para atletas com 18 anos ou mais...',
    icon: User,
    path: `/${tenantSlug}/membership/adult`,
  },
  {
    id: 'youth',
    title: 'Atleta Menor de Idade',
    description: 'Para atletas menores de 18 anos...',
    icon: Users,
    path: `/${tenantSlug}/membership/youth`,
  },
];

// DEPOIS:
const options = [
  {
    id: 'adult',
    title: 'Atleta Adulto',
    description: 'Para atletas com 18 anos ou mais...',
    icon: User,
    path: `/${tenantSlug}/membership/adult`,
  },
  // ⚠️ P3/4 — Youth membership hidden (pending E2E validation)
  // {
  //   id: 'youth',
  //   title: 'Atleta Menor de Idade',
  //   description: 'Para atletas menores de 18 anos...',
  //   icon: Users,
  //   path: `/${tenantSlug}/membership/youth`,
  // },
];
```

---

### 2. `src/routes/MembershipRouter.tsx`

**Ação:** Redirecionar rota `/youth` para `/new` (proteção de acesso direto)

**Local:** Linha 7

```typescript
// ANTES:
import MembershipYouth from '@/pages/MembershipYouth';

// Linha 13:
<Route path="youth" element={<MembershipYouth />} />

// DEPOIS:
import { Navigate } from 'react-router-dom';

// Linha 13 (redirecionar silenciosamente):
{/* ⚠️ P3/4 — Youth membership hidden (pending E2E validation) */}
<Route path="youth" element={<Navigate to="../new" replace />} />
```

---

## O QUE É PRESERVADO

| Item | Status |
|------|--------|
| `YouthMembershipForm.tsx` | ✅ Intacto |
| `MembershipYouth.tsx` | ✅ Intacto |
| Tabelas `guardians` e `guardian_links` | ✅ Intactas |
| RLS policies | ✅ Intactas |
| Edge functions | ✅ Intactas |
| Import de `Users` icon | ✅ Pode ser removido (opcional, não impacta) |

---

## PONTOS DE ENTRADA BLOQUEADOS

| Ponto | Antes | Depois |
|-------|-------|--------|
| Seletor de tipo | Visível | ❌ Oculto |
| URL direta `/membership/youth` | Renderiza form | ⮕ Redirect para `/membership/new` |
| Deep link externo | Acessível | ⮕ Redirect para `/membership/new` |

---

## VALIDAÇÃO

1. ✅ Página `/[tenant]/membership/new` exibe apenas "Atleta Adulto"
2. ✅ Acesso direto a `/[tenant]/membership/youth` redireciona para `/new`
3. ✅ Nenhum erro 404
4. ✅ Fluxo de filiação adulta continua funcionando
5. ✅ Nenhum componente deletado

---

## GARANTIAS

- **ZERO componentes deletados**
- **ZERO refactoring**
- **ZERO alteração de schema**
- **ZERO alteração de UX visual restante**
- **ZERO impacto em filiação adulta**
- **Feature invisível, não quebrada**
- **Código preservado para futura validação E2E**
