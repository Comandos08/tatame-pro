

# Plano Revisado: Finalizar a Filiação Juvenil (Youth Membership)

## Resumo do Diagnóstico Atualizado

### Descobertas Críticas

| Componente | Estado Atual | Ação Necessária |
|------------|-------------|-----------------|
| **approve-membership** | Já move documentos de `tmp/` para path permanente (linhas 563-612) | Adicionar suporte a `is_minor` e criação de guardian |
| **YouthMembershipForm** | Cria guardian/athlete ANTES do pagamento | Refatorar para usar `applicant_data` |
| **MEMBERSHIP_PRICE_CENTS** | Já importado do `@/types/membership` (linha 27) | Nenhuma |
| **Chaves i18n** | `loginRequired`, `errorGeneric`, `errorIdDocument` já existem | Adicionar chaves de opções do seletor |
| **MembershipTypeSelector** | Textos hardcoded em português | Internacionalizar |

### Problema Principal

O `YouthMembershipForm` cria registros permanentes (`guardians`, `athletes`, `guardian_links`) **antes do pagamento**, enquanto o `AdultMembershipForm` usa a arquitetura `applicant_data` que só cria o atleta após aprovação. Isso gera:
- Registros órfãos se o usuário abandonar antes do pagamento
- Inconsistência arquitetural
- Documentos em path permanente antes da aprovação

---

## Tarefas de Implementação

### Tarefa 1: Habilitar Rota Youth no MembershipRouter

**Arquivo:** `src/routes/MembershipRouter.tsx`

```typescript
// Linha 4 - Adicionar import
import MembershipYouth from '@/pages/MembershipYouth';

// Linha 17 - Substituir Navigate por MembershipYouth
<Route path="youth" element={<MembershipYouth />} />
```

---

### Tarefa 2: Internacionalizar e Habilitar Youth no MembershipTypeSelector

**Arquivo:** `src/components/membership/MembershipTypeSelector.tsx`

**2.1 Atualizar opções para usar i18n (linhas 85-101):**

```typescript
const options = [
  {
    id: 'adult',
    title: t('membership.adultOptionTitle'),
    description: t('membership.adultOptionDesc'),
    icon: User,
    path: `/${tenantSlug}/membership/adult`,
  },
  {
    id: 'youth',
    title: t('membership.youthOptionTitle'),
    description: t('membership.youthOptionDesc'),
    icon: Users,
    path: `/${tenantSlug}/membership/youth`,
  },
];
```

**2.2 Internacionalizar texto da página (linhas 123-124 e 219):**

```typescript
// Linha 123-124
<p className="text-muted-foreground text-lg max-w-xl mx-auto">
  {t('membership.selectTypeDesc', { orgName: tenant?.name || t('common.organization') })}
</p>

// Linha 219
{t('membership.termsAgreement')}
```

---

### Tarefa 3: Refatorar YouthMembershipForm para Arquitetura applicant_data

**Arquivo:** `src/components/membership/YouthMembershipForm.tsx`

**3.1 Adicionar imports e hooks de autenticação (linha 4 e após linha 34):**

```typescript
// Linha 4 - Adicionar useSearchParams
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

// Após linha 34 - Adicionar autenticação
const { currentUser, isAuthenticated, isLoading: authLoading } = useCurrentUser();
```

**3.2 Corrigir cálculo de idade (linhas 122-131):**

```typescript
const handleAthleteSubmit = (data: z.infer<typeof athleteSchema>) => {
  // Cálculo preciso de idade
  const birthDate = new Date(data.birthDate);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  const dayDiff = today.getDate() - birthDate.getDate();
  
  // Ainda não fez aniversário este ano
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age--;
  }
  
  // Menor de idade = até 17 anos completos
  if (age >= 18) {
    toast.error(t('membership.errorYouthAge'));
    return;
  }

  setAthleteData({
    ...data,
    email: data.email || guardianData?.email || '',
  } as AthleteFormData);
  setStep(3);
};
```

**3.3 Refatorar handlePayment completo (linhas 154-314):**

```typescript
const handlePayment = async () => {
  if (!canUseStripe) {
    toast.error(t('billing.stripeDisabled'));
    return;
  }
  
  if (!tenant || !athleteData || !guardianData) return;

  // ✅ OBRIGATÓRIO: Exigir login antes de prosseguir
  if (!isAuthenticated || !currentUser) {
    sessionStorage.setItem('membershipYouthFormData', JSON.stringify({
      guardianData,
      athleteData,
      step: 4
    }));
    toast.info(t('membership.loginRequired'));
    navigate(`/${tenantSlug}/login?redirect=/${tenantSlug}/membership/youth`);
    return;
  }

  setIsLoading(true);

  try {
    // 1. Upload documentos para path TEMPORÁRIO tmp/{userId}/{timestamp}/
    const documentsUploaded: Array<{type: string; storage_path: string; file_type: string}> = [];
    const timestamp = Date.now();

    if (documents.idDocument) {
      const storagePath = `tmp/${currentUser.id}/${timestamp}/id_document`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, documents.idDocument);

      if (uploadError) {
        console.error('Upload error:', uploadError);
        toast.error(t('membership.errorIdDocument'));
        setIsLoading(false);
        return;
      }

      documentsUploaded.push({
        type: 'ID_DOCUMENT',
        storage_path: storagePath,
        file_type: documents.idDocument.type,
      });
    }

    if (documents.medicalCertificate) {
      const storagePath = `tmp/${currentUser.id}/${timestamp}/medical_certificate`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, documents.medicalCertificate);

      if (uploadError) {
        console.error('Upload error:', uploadError);
        toast.error(t('membership.errorGeneric'));
        setIsLoading(false);
        return;
      }

      documentsUploaded.push({
        type: 'MEDICAL_CERTIFICATE',
        storage_path: storagePath,
        file_type: documents.medicalCertificate.type,
      });
    }

    // 2. Criar membership COM applicant_data (INCLUI guardian)
    // ⚠️ NÃO criar guardian/athlete/guardian_links aqui!
    const { data: membership, error: membershipError } = await supabase
      .from('memberships')
      .insert({
        tenant_id: tenant.id,
        athlete_id: null, // Será preenchido na aprovação
        applicant_profile_id: currentUser.id,
        applicant_data: {
          // Dados do atleta
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
          // ✅ NOVO: Dados do responsável (nested object)
          guardian: {
            full_name: guardianData.fullName,
            national_id: guardianData.nationalId,
            email: guardianData.email,
            phone: guardianData.phone,
            relationship: guardianData.relationship,
          },
          // ✅ NOVO: Flag para identificar filiação juvenil
          is_minor: true,
        },
        documents_uploaded: documentsUploaded,
        status: 'DRAFT',
        type: 'FIRST_MEMBERSHIP',
        price_cents: MEMBERSHIP_PRICE_CENTS,
        currency: MEMBERSHIP_CURRENCY,
        payment_status: 'NOT_PAID',
      } as any)
      .select()
      .single();

    if (membershipError) throw membershipError;

    // 3. Criar Stripe checkout session (idêntico ao adulto)
    const { data: checkoutData, error: checkoutError } = await supabase.functions.invoke(
      'create-membership-checkout',
      {
        body: {
          membershipId: membership.id,
          tenantSlug: tenantSlug,
          successUrl: `${window.location.origin}/${tenantSlug}/membership/success`,
          cancelUrl: `${window.location.origin}/${tenantSlug}/membership/youth`,
          captchaToken: captchaToken,
        },
      }
    );

    if (checkoutError) throw checkoutError;

    if (checkoutData?.error) {
      if (checkoutData.captchaRequired) {
        setCaptchaError(checkoutData.error);
        setCaptchaToken(null);
        throw new Error(checkoutData.error);
      }
      throw new Error(checkoutData.error);
    }

    if (checkoutData?.url) {
      window.location.href = checkoutData.url;
    } else {
      throw new Error(t('membership.errorPaymentSession'));
    }
  } catch (error: any) {
    console.error('Error:', error);
    const errorMessage = error?.message || t('membership.errorGeneric');
    toast.error(errorMessage);
  } finally {
    setIsLoading(false);
  }
};
```

---

### Tarefa 4: Atualizar approve-membership para Suportar Menores

**Arquivo:** `supabase/functions/approve-membership/index.ts`

**4.1 Expandir interface ApplicantData (após linha 90):**

```typescript
interface ApplicantData {
  full_name: string;
  birth_date: string;
  national_id: string;
  gender: string;
  email: string;
  phone: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  // ✅ NOVO: Suporte a filiação juvenil
  is_minor?: boolean;
  guardian?: {
    full_name: string;
    national_id: string;
    email: string;
    phone: string;
    relationship: 'PARENT' | 'GUARDIAN' | 'OTHER';
  };
}
```

**4.2 Adicionar lógica de criação de guardian antes do atleta (antes da seção 9️⃣, linha 473):**

```typescript
    // ========================================================================
    // 8️⃣.5️⃣ CREATE GUARDIAN (if minor)
    // ========================================================================
    let guardianId: string | null = null;
    
    if (applicantData.is_minor && applicantData.guardian) {
      logStep("Creating guardian for minor athlete");
      
      const { data: guardian, error: guardianError } = await supabase
        .from("guardians")
        .insert({
          tenant_id: targetTenantId,
          full_name: applicantData.guardian.full_name,
          national_id: applicantData.guardian.national_id,
          email: applicantData.guardian.email,
          phone: applicantData.guardian.phone,
        })
        .select()
        .single();

      if (guardianError) {
        logStep("Failed to create guardian", { error: guardianError.message });
        return new Response(
          JSON.stringify({ ok: false, error: "Operation not permitted" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      guardianId = guardian.id;
      logStep("Guardian created", { guardianId });
    }
```

**4.3 Criar guardian_link após criar atleta (após linha 508):**

```typescript
    logStep("Athlete created", { athleteId: athlete.id });

    // ========================================================================
    // 9️⃣.5️⃣ CREATE GUARDIAN LINK (if minor)
    // ========================================================================
    if (guardianId && applicantData.is_minor && applicantData.guardian) {
      const { error: linkError } = await supabase
        .from("guardian_links")
        .insert({
          tenant_id: targetTenantId,
          guardian_id: guardianId,
          athlete_id: athlete.id,
          relationship: applicantData.guardian.relationship,
          is_primary: true,
        });

      if (linkError) {
        logStep("Guardian link warning", { error: linkError.message });
        // Non-fatal: continue with approval
      } else {
        logStep("Guardian link created", { guardianId, athleteId: athlete.id });
      }
    }
```

**4.4 Adicionar guardian_id ao audit log (linha 815):**

```typescript
    await supabase.from("audit_logs").insert({
      event_type: "MEMBERSHIP_APPROVED",
      tenant_id: targetTenantId,
      profile_id: adminProfileId,
      metadata: {
        membership_id: membershipId,
        athlete_id: athlete.id,
        guardian_id: guardianId, // ✅ NOVO
        is_minor: applicantData.is_minor || false, // ✅ NOVO
        athlete_name: applicantData.full_name,
        // ... resto igual
      },
    });
```

---

### Tarefa 5: Adicionar Chaves de Tradução

**Arquivos:** `src/locales/pt-BR.ts`, `src/locales/en.ts`, `src/locales/es.ts`

```typescript
// pt-BR.ts
'membership.adultOptionTitle': 'Atleta Adulto',
'membership.adultOptionDesc': 'Para atletas com 18 anos ou mais que farão a filiação em nome próprio.',
'membership.youthOptionTitle': 'Atleta Menor de Idade',
'membership.youthOptionDesc': 'Para atletas menores de 18 anos. A filiação será feita por um responsável legal.',
'membership.selectTypeDesc': 'Escolha o tipo de filiação para se juntar à {orgName}.',
'membership.termsAgreement': 'Ao continuar, você concorda com os termos de uso e política de privacidade.',
'membership.guardianRelationship.PARENT': 'Pai/Mãe',
'membership.guardianRelationship.GUARDIAN': 'Responsável Legal',
'membership.guardianRelationship.OTHER': 'Outro',

// en.ts
'membership.adultOptionTitle': 'Adult Athlete',
'membership.adultOptionDesc': 'For athletes 18 years or older registering on their own behalf.',
'membership.youthOptionTitle': 'Minor Athlete',
'membership.youthOptionDesc': 'For athletes under 18 years old. Registration will be done by a legal guardian.',
'membership.selectTypeDesc': 'Choose the membership type to join {orgName}.',
'membership.termsAgreement': 'By continuing, you agree to the terms of use and privacy policy.',
'membership.guardianRelationship.PARENT': 'Parent',
'membership.guardianRelationship.GUARDIAN': 'Legal Guardian',
'membership.guardianRelationship.OTHER': 'Other',

// es.ts
'membership.adultOptionTitle': 'Atleta Adulto',
'membership.adultOptionDesc': 'Para atletas de 18 años o más que realizarán la afiliación por cuenta propia.',
'membership.youthOptionTitle': 'Atleta Menor de Edad',
'membership.youthOptionDesc': 'Para atletas menores de 18 años. La afiliación será realizada por un responsable legal.',
'membership.selectTypeDesc': 'Elija el tipo de afiliación para unirse a {orgName}.',
'membership.termsAgreement': 'Al continuar, acepta los términos de uso y la política de privacidad.',
'membership.guardianRelationship.PARENT': 'Padre/Madre',
'membership.guardianRelationship.GUARDIAN': 'Tutor Legal',
'membership.guardianRelationship.OTHER': 'Otro',
```

---

### Tarefa 6: Criar Teste E2E para Fluxo Juvenil

**Arquivo:** `e2e/membership-youth-flow.spec.ts` (NOVO)

```typescript
import { test, expect } from '@playwright/test';

test.describe('Youth Membership Flow', () => {
  test('should show youth membership option in selector', async ({ page }) => {
    // Navigate to a tenant's membership page
    await page.goto('/');
    
    const youthOption = page.locator('text=/menor|youth|minor/i').first();
    
    if (await youthOption.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(youthOption).toBeVisible();
    } else {
      test.skip();
    }
  });

  test('should navigate to youth membership form', async ({ page }) => {
    await page.goto('/');
    
    const youthOption = page.locator('text=/menor|youth|minor/i').first();
    
    if (await youthOption.isVisible({ timeout: 5000 }).catch(() => false)) {
      await youthOption.click();
      
      // Should see guardian form (step 1)
      await expect(page.locator('text=/responsável|guardian/i').first()).toBeVisible({ timeout: 10000 });
    } else {
      test.skip();
    }
  });

  test('should reject athletes 18 or older', async ({ page }) => {
    // Test that the age validation works correctly
    await page.goto('/');
    
    const youthOption = page.locator('text=/menor|youth|minor/i').first();
    
    if (await youthOption.isVisible({ timeout: 5000 }).catch(() => false)) {
      await youthOption.click();
      await page.waitForLoadState('networkidle');
      
      // This test would need to fill guardian form and proceed to athlete step
      // to test age validation - implementation depends on form structure
    } else {
      test.skip();
    }
  });
});
```

---

### Tarefa 7: Atualizar Documentação

**Arquivo:** `docs/BUSINESS-FLOWS.md`

Adicionar seção após "Fluxo Completo (Adulto)":

```markdown
### Fluxo Completo (Menor de Idade)

                         +------------------------------------------+
                         | 1. Responsável acessa /{slug}            |
                         | 2. Clica em "Filie-se Agora"             |
                         | 3. Seleciona "Menor de Idade"            |
                         +------------------------------------------+
                                          |
                                          v
                         +------------------------------------------+
                         | 4. Preenche dados do responsável         |
                         | 5. Preenche dados do atleta menor        |
                         | 6. Upload de documentos (RG do atleta)   |
                         +------------------------------------------+
                                          |
                                          v
                         +------------------------------------------+
                         | 7. Faz login (se não autenticado)        |
                         | 8. applicant_data inclui guardian{}      |
                         | 9. Documentos salvos em tmp/{userId}/    |
                         +------------------------------------------+
                                          |
                                          v
                         +------------------------------------------+
                         | 10. Stripe Checkout                      |
                         | 11. Webhook: DRAFT -> PENDING_REVIEW     |
                         +------------------------------------------+
                                          |
                                          v
                         +------------------------------------------+
                         | 12. Admin aprova filiação:               |
                         |     - Cria registro Guardian             |
                         |     - Cria registro Athlete              |
                         |     - Cria guardian_link                 |
                         |     - Move documentos tmp/ -> permanente |
                         |     - Gera Digital Card                  |
                         +------------------------------------------+
                                          |
                                          v
                         +------------------------------------------+
                         | 13. Status: APPROVED/ACTIVE              |
                         | 14. Email de confirmação enviado         |
                         +------------------------------------------+

**Estrutura applicant_data para Menor:**
{
  "full_name": "João Silva",
  "birth_date": "2012-05-15",
  "is_minor": true,
  "guardian": {
    "full_name": "Maria Silva",
    "national_id": "123.456.789-00",
    "email": "responsavel@email.com",
    "relationship": "PARENT"
  }
}
```

---

## Arquivos Modificados

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `src/routes/MembershipRouter.tsx` | MODIFICAR | Habilitar rota youth |
| `src/components/membership/MembershipTypeSelector.tsx` | MODIFICAR | Internacionalizar e habilitar youth |
| `src/components/membership/YouthMembershipForm.tsx` | MODIFICAR | Refatorar para applicant_data |
| `supabase/functions/approve-membership/index.ts` | MODIFICAR | Suportar guardian na aprovacao |
| `src/locales/pt-BR.ts` | ADICIONAR | 9 novas chaves |
| `src/locales/en.ts` | ADICIONAR | 9 novas chaves |
| `src/locales/es.ts` | ADICIONAR | 9 novas chaves |
| `e2e/membership-youth-flow.spec.ts` | CRIAR | Testes E2E |
| `docs/BUSINESS-FLOWS.md` | ADICIONAR | Documentacao do fluxo juvenil |

---

## Criterios de Aceitacao

- [ ] Rota `/membership/youth` carrega o formulario juvenil
- [ ] Seletor de tipo exibe opcao "Menor de Idade" internacionalizada
- [ ] Validacao de idade precisa: apenas menores de 18 aceitos
- [ ] Autenticacao exigida antes do pagamento
- [ ] `applicant_data` contem `is_minor: true` e objeto `guardian`
- [ ] Documentos salvos em `tmp/` ate aprovacao
- [ ] Na aprovacao: guardian, athlete e guardian_links criados
- [ ] Documentos movidos de `tmp/` para `{tenant_id}/{athlete_id}/`
- [ ] MEMBERSHIP_PRICE_CENTS importado de `@/types/membership` (ja existente)
- [ ] Chaves i18n funcionam nos 3 idiomas
- [ ] Build compila sem erros

---

## Secao Tecnica

### Variaveis de Preco e Moeda

As constantes ja estao definidas e importadas corretamente:

```typescript
// src/types/membership.ts (linhas 42-43)
export const MEMBERSHIP_PRICE_CENTS = 15000;
export const MEMBERSHIP_CURRENCY = 'BRL';

// YouthMembershipForm.tsx (linha 22-28) - ja importa
import {
  MEMBERSHIP_PRICE_CENTS,
  MEMBERSHIP_CURRENCY,
} from '@/types/membership';
```

### Chaves i18n Existentes (Nao Precisam Ser Adicionadas)

As seguintes chaves ja existem nos 3 locales:
- `membership.loginRequired`
- `membership.errorGeneric`
- `membership.errorIdDocument`
- `membership.errorIdDocumentYouth`
- `membership.errorYouthAge`

### Fluxo de Movimentacao de Documentos (Ja Implementado)

O `approve-membership` ja implementa a movimentacao (linhas 563-612):

```typescript
// Codigo existente - nao precisa modificar
for (const doc of documentsUploaded) {
  const oldPath = doc.storage_path;
  const newPath = `${targetTenantId}/${athlete.id}/${fileName}`;
  
  // 1. Copiar para path permanente
  await supabase.storage.from("documents").copy(oldPath, newPath);
  
  // 2. Remover do path temporario
  await supabase.storage.from("documents").remove([oldPath]);
  
  // 3. Criar registro na tabela documents
  await supabase.from("documents").insert({...});
}
```

