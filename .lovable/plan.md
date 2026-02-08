
# PI-POL-001D — Autorizacao Institucional Explicita (Cortesia/Override)

## Resumo Executivo

Este PI separa a acao de "Registrar Graduacao" (fato esportivo) da acao de "Emitir Diploma Oficial" (ato institucional), mantendo o enforcement fail-closed do PI-POL-001B mas adicionando um mecanismo de override explicito, auditavel e governado para emissao de diploma por cortesia administrativa.

---

## Estado Atual (Diagnostico)

| Componente | Status Atual |
|------------|--------------|
| Edge Function `generate-diploma` | Bloqueia se !ACTIVE (PI-POL-001B). Sem mecanismo de override |
| Frontend `AthleteGradingsPage` | Botao unico "Registrar e Gerar Diploma" |
| Insercao direta em `athlete_gradings` | NAO EXISTE na UI (apenas via edge function) |
| Mecanismo de override | NAO EXISTE |
| Chaves i18n de override | NAO EXISTEM |

---

## Arquitetura da Solucao

```text
FLUXO ATUAL (PI-POL-001B)
-------------------------------------------------
ADMIN -> "Registrar Graduacao"
            |
            v
      Edge Function
            |
     +------+------+
     |             |
     v             v
   ACTIVE       !ACTIVE
     |             |
     v             v
  Diploma      BLOQUEADO
  Grading     (sem saida)
  is_official=true


FLUXO PROPOSTO (PI-POL-001D)
-------------------------------------------------
ADMIN -> Escolhe acao:

OPCAO A: "Registrar Graduacao"
     |
     v
  INSERT direto em athlete_gradings
  diploma_id = null
  is_official = false
     |
     v
  Toast "Graduacao registrada"
  (sem diploma)


OPCAO B: "Registrar e Gerar Diploma"
     |
     v
  Edge Function generate-diploma
     |
     +-------+-------+
     |               |
     v               v
   ACTIVE        !ACTIVE
     |               |
     v               +-------+-------+
  Diploma                    |       |
  Grading                    v       v
  is_official=true      override?  sem override
                             |       |
                             v       v
                         valida   BLOQUEADO
                         motivo   (MEMBERSHIP_REQUIRED)
                         role
                             |
                         +---+---+
                         |       |
                         v       v
                       OK     FORBIDDEN
                         |       |
                         v       v
                     Diploma   BLOQUEADO
                     Grading   (OFFICIALITY_OVERRIDE_FORBIDDEN)
                     is_official=true
                     + audit log
```

---

## Escopo de Modificacoes (5 arquivos)

### 1. Edge Function — `supabase/functions/generate-diploma/index.ts`

#### 1.1 Atualizar interface `GenerateDiplomaRequest`

Adicionar campo opcional `officiality_override`:

```typescript
interface GenerateDiplomaRequest {
  athleteId: string;
  gradingLevelId: string;
  academyId?: string;
  coachId?: string;
  promotionDate: string;
  notes?: string;
  officiality_override?: {
    enabled: boolean;
    reason: string;
    granted_by_profile_id: string;
  };
}
```

#### 1.2 Modificar logica PI-POL-001B para aceitar override

**Localizacao:** Apos linha 192 (onde `hasActiveMembership` e determinado)

Substituir o bloco de bloqueio por logica condicional:

```typescript
// ─────────────────────────────────────────────────────────────
// PI-POL-001D — OFFICIALITY OVERRIDE (COURTESY)
// Contract: HTTP 200 always. Override requires ADMIN role + valid reason.
// ─────────────────────────────────────────────────────────────

const override = officiality_override;
let overrideApplied = false;

if (!hasActiveMembership) {
  // Check if override is being requested
  if (override?.enabled === true) {
    // Validate override parameters
    const overrideReason = (override.reason || '').trim();
    const grantedBy = override.granted_by_profile_id;

    if (!grantedBy || overrideReason.length < 8) {
      console.log("[GENERATE-DIPLOMA][PI-POL-001D] Override rejected: invalid parameters");
      
      await supabase.from('audit_logs').insert({
        tenant_id: tenantId,
        event_type: 'DIPLOMA_OVERRIDE_BLOCKED_FORBIDDEN',
        category: 'GRADING',
        level: 'WARN',
        metadata: {
          athlete_id: athleteId,
          profile_id: profileId,
          grading_level_id: gradingLevelId,
          rule: 'OFFICIALITY_OVERRIDE',
          decision: 'BLOCKED',
          reason: 'INVALID_OVERRIDE_PARAMETERS',
          override_reason_length: overrideReason.length,
          granted_by: grantedBy || null
        }
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: 'OFFICIALITY_OVERRIDE_FORBIDDEN',
          message: 'Override requires valid reason (min 8 chars) and grantor ID.'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate role of grantor (ADMIN_TENANT or SUPERADMIN_GLOBAL)
    const roleCheck = await requireTenantRole(
      supabase,
      req.headers.get('Authorization'),
      tenantId,
      ['ADMIN_TENANT', 'STAFF_ORGANIZACAO']
    );

    if (!roleCheck.allowed && !roleCheck.isGlobalSuperadmin) {
      console.log("[GENERATE-DIPLOMA][PI-POL-001D] Override rejected: insufficient permissions");
      
      await supabase.from('audit_logs').insert({
        tenant_id: tenantId,
        event_type: 'DIPLOMA_OVERRIDE_BLOCKED_FORBIDDEN',
        category: 'GRADING',
        level: 'WARN',
        metadata: {
          athlete_id: athleteId,
          profile_id: profileId,
          grading_level_id: gradingLevelId,
          rule: 'OFFICIALITY_OVERRIDE',
          decision: 'BLOCKED',
          reason: 'INSUFFICIENT_PERMISSIONS',
          grantor_id: grantedBy,
          user_roles: roleCheck.roles
        }
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: 'OFFICIALITY_OVERRIDE_FORBIDDEN',
          message: 'Override requires ADMIN or SUPERADMIN permissions.'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Override approved
    console.log("[GENERATE-DIPLOMA][PI-POL-001D] Override approved - proceeding with official diploma");
    overrideApplied = true;

  } else {
    // No override requested - apply standard MEMBERSHIP_REQUIRED block
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
}
```

#### 1.3 Adicionar import do `requireTenantRole`

**Localizacao:** Topo do arquivo (apos linha 10)

```typescript
import { requireTenantRole } from "../_shared/requireTenantRole.ts";
```

#### 1.4 Registrar audit log de sucesso com override

Antes de retornar sucesso (apos insercao do diploma), se `overrideApplied === true`:

```typescript
// Log override success
if (overrideApplied) {
  await supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    event_type: 'DIPLOMA_ISSUED_OFFICIAL_OVERRIDE',
    category: 'GRADING',
    level: 'INFO',
    metadata: {
      athlete_id: athleteId,
      profile_id: profileId,
      diploma_id: diploma.id,
      grading_level_id: gradingLevelId,
      override_reason: officiality_override?.reason,
      granted_by_profile_id: officiality_override?.granted_by_profile_id,
      decision: 'ALLOWED_VIA_OVERRIDE'
    }
  });
}
```

---

### 2. Frontend Admin — `src/pages/AthleteGradingsPage.tsx`

#### 2.1 Adicionar imports necessarios

```typescript
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/contexts/AuthContext';
```

#### 2.2 Atualizar estado do form

Adicionar campos para override e acao separada:

```typescript
const [overrideEnabled, setOverrideEnabled] = useState(false);
const [overrideReason, setOverrideReason] = useState('');
```

#### 2.3 Obter currentUser para profile_id

```typescript
const { currentUser } = useAuth();
```

#### 2.4 Criar funcao para registrar apenas graduacao

```typescript
const handleRegisterGradingOnly = async () => {
  if (!formData.grading_level_id || !athleteId || !tenant?.id) {
    toast.error('Selecione um nivel de graduacao');
    return;
  }

  setIsGenerating(true);
  try {
    const { error } = await supabase
      .from('athlete_gradings')
      .insert({
        tenant_id: tenant.id,
        athlete_id: athleteId,
        grading_level_id: formData.grading_level_id,
        academy_id: formData.academy_id || null,
        coach_id: formData.coach_id || null,
        promotion_date: formData.promotion_date,
        notes: formData.notes || null,
        diploma_id: null,
        is_official: false,
      });

    if (error) throw error;

    queryClient.invalidateQueries({ queryKey: ['athlete-gradings', athleteId] });
    toast.success(t('grading.registerOnly.success'));
    setIsDialogOpen(false);
    // Reset form...
  } catch (error) {
    toast.error(t('common.error'));
  } finally {
    setIsGenerating(false);
  }
};
```

#### 2.5 Modificar `handleSubmit` para enviar override

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!formData.grading_level_id || !athleteId) {
    toast.error('Selecione um nivel de graduacao');
    return;
  }

  setIsGenerating(true);
  try {
    const body: any = {
      athleteId,
      gradingLevelId: formData.grading_level_id,
      academyId: formData.academy_id || undefined,
      coachId: formData.coach_id || undefined,
      promotionDate: formData.promotion_date,
      notes: formData.notes || undefined,
    };

    // PI-POL-001D: Include override if enabled
    if (overrideEnabled && !hasActiveMembership) {
      body.officiality_override = {
        enabled: true,
        reason: overrideReason.trim(),
        granted_by_profile_id: currentUser?.id,
      };
    }

    const response = await supabase.functions.invoke('generate-diploma', { body });

    if (response.error) throw new Error(response.error.message);

    const result = response.data;
    if (!result.success) {
      if (result.error === 'MEMBERSHIP_REQUIRED') {
        toast.error(t('grading.membershipRequired'));
        return;
      }
      if (result.error === 'OFFICIALITY_OVERRIDE_FORBIDDEN') {
        toast.error(t('grading.override.forbidden'));
        return;
      }
      throw new Error(result.error || 'Erro ao gerar diploma');
    }

    // Reset state and close dialog...
  } catch (error) {
    // error handling...
  } finally {
    setIsGenerating(false);
  }
};
```

#### 2.6 Modificar DialogFooter com 2 botoes

```tsx
<DialogFooter className="flex flex-col sm:flex-row gap-2">
  {/* Botao A: Registrar apenas graduacao */}
  <Button
    type="button"
    variant="outline"
    onClick={handleRegisterGradingOnly}
    disabled={isGenerating || !formData.grading_level_id}
  >
    {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
    {t('grading.registerOnly')}
  </Button>

  {/* Botao B: Registrar e gerar diploma */}
  <Button
    type="submit"
    disabled={
      isGenerating ||
      !formData.grading_level_id ||
      (!hasActiveMembership && !overrideEnabled) ||
      (!hasActiveMembership && overrideEnabled && overrideReason.trim().length < 8)
    }
  >
    {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
    {t('grading.registerAndIssue')}
  </Button>
</DialogFooter>
```

#### 2.7 Adicionar secao de override no form (quando !hasActiveMembership)

Inserir apos o banner de governanca existente, dentro do Dialog:

```tsx
{/* PI-POL-001D: Override section */}
{hasActiveMembership === false && (
  <div className="space-y-4 p-4 rounded-lg bg-muted/50 border">
    <div className="flex items-center justify-between">
      <div>
        <Label htmlFor="override-switch" className="font-medium">
          {t('grading.override.title')}
        </Label>
        <p className="text-sm text-muted-foreground mt-1">
          {t('grading.override.desc')}
        </p>
      </div>
      <Switch
        id="override-switch"
        checked={overrideEnabled}
        onCheckedChange={setOverrideEnabled}
      />
    </div>

    {overrideEnabled && (
      <div className="space-y-2">
        <Label htmlFor="override-reason">
          {t('grading.override.reasonLabel')} *
        </Label>
        <Textarea
          id="override-reason"
          value={overrideReason}
          onChange={(e) => setOverrideReason(e.target.value)}
          placeholder={t('grading.override.reasonPlaceholder')}
          rows={3}
          className={overrideReason.trim().length > 0 && overrideReason.trim().length < 8 ? 'border-destructive' : ''}
        />
        {overrideReason.trim().length > 0 && overrideReason.trim().length < 8 && (
          <p className="text-sm text-destructive">
            {t('grading.override.reasonTooShort')}
          </p>
        )}
      </div>
    )}
  </div>
)}
```

---

### 3. Locales — Chaves i18n

#### pt-BR.ts (apos linha 312)

```typescript
// PI-POL-001D — Override (Courtesy)
'grading.registerOnly': 'Registrar Graduacao',
'grading.registerOnly.success': 'Graduacao registrada com sucesso',
'grading.registerAndIssue': 'Registrar e Gerar Diploma',
'grading.override.title': 'Autorizar como oficial (cortesia)',
'grading.override.desc': 'Conceder oficialidade administrativa mesmo sem filiacao ativa',
'grading.override.reasonLabel': 'Motivo da cortesia',
'grading.override.reasonPlaceholder': 'Descreva o motivo para a autorizacao...',
'grading.override.forbidden': 'Permissao insuficiente para autorizar cortesia',
'grading.override.reasonTooShort': 'Motivo deve ter pelo menos 8 caracteres',
```

#### en.ts (apos linha 309)

```typescript
// PI-POL-001D — Override (Courtesy)
'grading.registerOnly': 'Register Grading',
'grading.registerOnly.success': 'Grading registered successfully',
'grading.registerAndIssue': 'Register and Issue Diploma',
'grading.override.title': 'Authorize as official (courtesy)',
'grading.override.desc': 'Grant administrative officiality even without active membership',
'grading.override.reasonLabel': 'Courtesy reason',
'grading.override.reasonPlaceholder': 'Describe the reason for authorization...',
'grading.override.forbidden': 'Insufficient permission to authorize courtesy',
'grading.override.reasonTooShort': 'Reason must be at least 8 characters',
```

#### es.ts (apos linha 309)

```typescript
// PI-POL-001D — Override (Courtesy)
'grading.registerOnly': 'Registrar Graduacion',
'grading.registerOnly.success': 'Graduacion registrada exitosamente',
'grading.registerAndIssue': 'Registrar y Emitir Diploma',
'grading.override.title': 'Autorizar como oficial (cortesia)',
'grading.override.desc': 'Otorgar oficialidad administrativa incluso sin afiliacion activa',
'grading.override.reasonLabel': 'Motivo de la cortesia',
'grading.override.reasonPlaceholder': 'Describa el motivo de la autorizacion...',
'grading.override.forbidden': 'Permiso insuficiente para autorizar cortesia',
'grading.override.reasonTooShort': 'El motivo debe tener al menos 8 caracteres',
```

---

## Arquivos Modificados (Resumo)

| Arquivo | Tipo | Descricao |
|---------|------|-----------|
| `supabase/functions/generate-diploma/index.ts` | MODIFY | Override gate + audit logs |
| `src/pages/AthleteGradingsPage.tsx` | MODIFY | 2 botoes + secao override + insert direto |
| `src/locales/pt-BR.ts` | MODIFY | Chaves de override |
| `src/locales/en.ts` | MODIFY | Chaves de override |
| `src/locales/es.ts` | MODIFY | Chaves de override |

---

## Eventos de Auditoria (Novos)

| Evento | Quando | Level |
|--------|--------|-------|
| `DIPLOMA_ISSUED_OFFICIAL_OVERRIDE` | Diploma emitido via override | INFO |
| `DIPLOMA_OVERRIDE_BLOCKED_FORBIDDEN` | Override rejeitado (parametros ou permissao) | WARN |

---

## Invariantes SAFE GOLD Garantidas

| Invariante | Como e Atendida |
|------------|-----------------|
| HTTP 200 sempre | Todos os returns mantidos com status 200 |
| Fail-closed | Override invalido = bloqueio |
| Zero side effects no bloqueio | Return antes de qualquer insert |
| Audit obrigatorio | 3 pontos de audit (sucesso, parametros, permissao) |
| Erro code estavel | `MEMBERSHIP_REQUIRED`, `OFFICIALITY_OVERRIDE_FORBIDDEN` |
| Determinismo | Mesmos inputs = mesma decisao |

---

## Matriz de Permissoes (Contrato Final)

| Cenario | Registrar Graduacao | Diploma Oficial |
|---------|---------------------|-----------------|
| ACTIVE membership | SIM (is_official via diploma) | SIM (is_official=true) |
| Sem ACTIVE, sem override | SIM (is_official=false, diploma_id=null) | NAO (MEMBERSHIP_REQUIRED) |
| Sem ACTIVE, com override valido | SIM (is_official=true via diploma) | SIM (is_official=true + audit) |
| Sem ACTIVE, override invalido | SIM (is_official=false) | NAO (OFFICIALITY_OVERRIDE_FORBIDDEN) |

---

## Criterios de Aceitacao (Teste Manual)

### 1. Atleta sem ACTIVE — Registrar apenas graduacao
- Botao "Registrar Graduacao" funciona
- Cria `athlete_gradings` com `is_official=false` e `diploma_id=null`
- Toast de sucesso exibido

### 2. Atleta sem ACTIVE — Override por ADMIN
- Switch de override visivel
- Textarea de motivo obrigatorio (min 8 chars)
- Botao "Registrar e Gerar Diploma" habilitado quando switch ON + motivo valido
- Diploma emitido com `is_official=true`
- Audit log `DIPLOMA_ISSUED_OFFICIAL_OVERRIDE` criado

### 3. Override sem permissao
- Retorna `OFFICIALITY_OVERRIDE_FORBIDDEN` (HTTP 200)
- Audit log `DIPLOMA_OVERRIDE_BLOCKED_FORBIDDEN` criado
- Toast amigavel exibido

### 4. Atleta com ACTIVE
- Fluxo padrao do PI-POL-001B permanece intacto
- Override nao e necessario

---

## Ordem de Execucao (Deterministica)

1. Atualizar `src/locales/pt-BR.ts`
2. Atualizar `src/locales/en.ts`
3. Atualizar `src/locales/es.ts`
4. Atualizar `supabase/functions/generate-diploma/index.ts`
5. Deploy Edge Function
6. Atualizar `src/pages/AthleteGradingsPage.tsx`
7. Teste manual dos 4 cenarios
