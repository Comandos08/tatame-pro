

# PROMPT 1/4 — Persistência de Estado no Formulário de Filiação Adulto

## RESUMO

| Métrica | Valor |
|---------|-------|
| Arquivo a MODIFICAR | 1 (`AdultMembershipForm.tsx`) |
| Linhas adicionadas | ~50 |
| Layout/UX alterados | ZERO |
| Novos componentes | ZERO |
| Risco de regressão | Baixo |

---

## DIAGNÓSTICO

**Estado atual:**
- Linhas 39-44: Estado gerenciado via `useState` (volátil)
- Linha 134-137: Existe persistência parcial APENAS para redirect de login
- **Não existe restauração de estado no mount**

**Resultado:** Refresh em step 2 ou 3 reinicia o formulário.

---

## SOLUÇÃO TÉCNICA

### Estratégia
1. Persistir estado em `sessionStorage` a cada mudança de step
2. Restaurar estado no mount do componente
3. Limpar storage após submissão bem-sucedida

### Chave de Storage
```
tatame.membership.adult.draft
```

### Dados Persistidos
```typescript
interface MembershipDraft {
  step: number;
  athleteData: AthleteFormData | null;
  documentsMeta: {
    idDocumentName?: string;
    medicalCertificateName?: string;
  };
  tenantSlug: string;
  savedAt: string;
}
```

> **Nota:** Arquivos (`File`) não podem ser serializados em JSON. Apenas metadados (nomes) serão persistidos. Os uploads precisarão ser refeitos, mas o usuário permanece no step correto.

---

## ALTERAÇÕES EXATAS

### 1. Adicionar constante de storage key (após linha 29)

```typescript
const STORAGE_KEY = 'tatame.membership.adult.draft';
```

### 2. Adicionar interface de draft (após linha 29)

```typescript
interface MembershipDraft {
  step: number;
  athleteData: AthleteFormData | null;
  documentsMeta: {
    idDocumentName?: string;
    medicalCertificateName?: string;
  };
  tenantSlug: string;
  savedAt: string;
}
```

### 3. Adicionar função de persistência (após STORAGE_KEY)

```typescript
function saveDraft(draft: MembershipDraft): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Silent fail — storage não disponível
  }
}

function loadDraft(tenantSlug: string): MembershipDraft | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as MembershipDraft;
    // Validar que é do mesmo tenant
    if (draft.tenantSlug !== tenantSlug) return null;
    return draft;
  } catch {
    return null;
  }
}

function clearDraft(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Silent fail
  }
}
```

### 4. Adicionar useEffect de restauração (após linha 45, antes do stepOneSchema)

```typescript
// ✅ P1/4 — Restaurar draft do sessionStorage no mount
useEffect(() => {
  if (!tenantSlug) return;
  
  const draft = loadDraft(tenantSlug);
  if (!draft) return;

  // Restaurar step
  if (draft.step > 1) {
    setStep(draft.step);
  }

  // Restaurar athleteData
  if (draft.athleteData) {
    setAthleteData(draft.athleteData);
    // Também popular o form para step 1
    form.reset(draft.athleteData);
  }

  // Nota: Arquivos (File) não podem ser restaurados
  // Usuário verá o step correto, mas precisará re-uploadar documentos
}, [tenantSlug]); // eslint-disable-line react-hooks/exhaustive-deps
```

### 5. Adicionar useEffect de persistência (após o useEffect de restauração)

```typescript
// ✅ P1/4 — Persistir draft a cada mudança de step ou dados
useEffect(() => {
  if (!tenantSlug) return;
  // Só persistir se já passou do step 1
  if (step === 1 && !athleteData) return;

  saveDraft({
    step,
    athleteData,
    documentsMeta: {
      idDocumentName: documents.idDocument?.name,
      medicalCertificateName: documents.medicalCertificate?.name,
    },
    tenantSlug,
    savedAt: new Date().toISOString(),
  });
}, [step, athleteData, documents, tenantSlug]);
```

### 6. Limpar draft após sucesso do pagamento (linha 250, após redirect)

```typescript
if (checkoutData?.url) {
  clearDraft(); // ✅ P1/4 — Limpar draft antes de redirect
  window.location.href = checkoutData.url;
}
```

---

## COMPORTAMENTO ESPERADO

| Cenário | Antes | Depois |
|---------|-------|--------|
| Step 1 → Step 2 → Refresh | Volta para Step 1 | Continua no Step 2 |
| Step 2 → Step 3 → Refresh | Volta para Step 1 | Continua no Step 3 |
| Submissão com sucesso | — | Draft limpo |
| Novo fluxo após submissão | — | Começa limpo |
| Trocar de tenant | — | Draft ignorado (validação de tenantSlug) |

---

## LIMITAÇÕES CONHECIDAS

1. **Arquivos não são restaurados**: `File` objects não podem ser serializados em JSON
   - Usuário verá o step correto, mas campos de upload estarão vazios
   - Validação no step 2 exigirá re-upload do documento de identidade

2. **sessionStorage por aba**: Se usuário abrir nova aba, não verá o draft

---

## VALIDAÇÃO

```bash
npm run typecheck
```

**Testes manuais:**
1. Step 1 → Step 2 → F5 → Verifica se continua no Step 2
2. Step 2 → Step 3 → F5 → Verifica se continua no Step 3
3. Submissão final → Verifica se storage foi limpo
4. Novo fluxo → Verifica se começa do Step 1

---

## GARANTIAS

- **ZERO alterações de layout**
- **ZERO alterações de UX visual**
- **ZERO novos componentes**
- **ZERO alterações no fluxo de pagamento**
- **ZERO alterações em validações**

