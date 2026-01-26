
## P4.x-R2 — UI TEXT HARDENING (SAFE GOLD)

### Resumo Executivo

Após auditoria completa, identifiquei **~180+ textos hardcoded** ainda presentes em botões, diálogos, menus e feedbacks (toast). Este plano detalha a eliminação sistemática de todos eles, garantindo que 100% da UI responda às mudanças de idioma (PT/EN/ES).

---

### Diagnóstico Quantitativo

| Categoria | Arquivos Afetados | Strings Hardcoded |
|-----------|-------------------|-------------------|
| **Admin Dialogs** | 4 | ~60 |
| **CRUD Pages (Coaches/Academies)** | 2 | ~45 |
| **Tenant CRUD (Create/Edit)** | 2 | ~30 |
| **Events Registration** | 1 | ~12 |
| **Grading/Athletes** | 2 | ~20 |
| **Hooks (useSecureDocument)** | 1 | ~6 |
| **Membership List** | 1 | ~10 |
| **TOTAL** | **13** | **~183** |

---

### Arquivos a Modificar

#### Fase 1: Admin Dialogs (Alta Prioridade)

| Arquivo | Ações |
|---------|-------|
| `src/components/admin/TenantBillingDialog.tsx` | Substituir ~15 toasts e labels por `t()` |
| `src/components/admin/ManageAdminsDialog.tsx` | Substituir ~25 labels, toasts e textos de diálogo |
| `src/components/admin/EditTenantDialog.tsx` | Substituir ~15 labels e botões |
| `src/components/admin/CreateTenantDialog.tsx` | Substituir ~20 labels e botões |

#### Fase 2: CRUD Pages (Média Prioridade)

| Arquivo | Ações |
|---------|-------|
| `src/pages/AcademiesList.tsx` | Substituir ~25 toasts, labels e botões |
| `src/pages/CoachesList.tsx` | Substituir ~30 toasts, labels e botões |
| `src/pages/GradingSchemesList.tsx` | Substituir ~12 toasts e labels |
| `src/pages/AthleteGradingsPage.tsx` | Substituir ~8 toasts |

#### Fase 3: Events & Memberships

| Arquivo | Ações |
|---------|-------|
| `src/components/events/EventRegistrationButton.tsx` | Remover fallbacks hardcoded, usar chaves i18n |
| `src/pages/MembershipList.tsx` | Substituir ~10 labels e empty states |
| `src/pages/AthletesList.tsx` | Substituir ~8 labels de filtros |

#### Fase 4: Hooks & Utilities

| Arquivo | Ações |
|---------|-------|
| `src/hooks/useSecureDocumentDownload.ts` | Substituir ~6 mensagens de erro |
| `src/components/settings/BrandingUploadSection.tsx` | Substituir ~8 toasts |

---

### Novas Chaves i18n a Criar

#### `common.*` — Extensões

```text
common.create              → "Criar" / "Create" / "Crear"
common.update              → "Atualizar" / "Update" / "Actualizar"
common.close               → "Fechar" / "Close" / "Cerrar"
common.confirm             → "Confirmar" / "Confirm" / "Confirmar"
common.remove              → "Remover" / "Remove" / "Eliminar"
common.yes                 → "Sim" / "Yes" / "Sí"
common.no                  → "Não" / "No" / "No"
common.saving              → "Salvando..." / "Saving..." / "Guardando..."
common.creating            → "Criando..." / "Creating..." / "Creando..."
common.processing          → "Processando..." / "Processing..." / "Procesando..."
common.required            → "Obrigatório" / "Required" / "Obligatorio"
common.optional            → "Opcional" / "Optional" / "Opcional"
common.statusUpdated       → "Status atualizado" / "Status updated" / "Estado actualizado"
common.statusUpdateError   → "Erro ao atualizar status" / "Error updating status" / "Error al actualizar estado"
```

#### `academies.*` — Gestão de Academias

```text
academies.title               → "Academias" / "Academies" / "Academias"
academies.subtitle            → "Gerencie as academias da organização" / "Manage organization academies" / "Gestione las academias"
academies.create              → "Criar Academia" / "Create Academy" / "Crear Academia"
academies.edit                → "Editar Academia" / "Edit Academy" / "Editar Academia"
academies.createDesc          → "Adicione uma nova academia à organização" / "Add a new academy to the organization" / "Añada una nueva academia"
academies.editDesc            → "Atualize as informações da academia" / "Update academy information" / "Actualice la información"
academies.createSuccess       → "Academia criada com sucesso" / "Academy created successfully" / "Academia creada con éxito"
academies.createError         → "Erro ao criar academia" / "Error creating academy" / "Error al crear academia"
academies.updateSuccess       → "Academia atualizada com sucesso" / "Academy updated successfully" / "Academia actualizada"
academies.updateError         → "Erro ao atualizar academia" / "Error updating academy" / "Error al actualizar"
academies.nameRequired        → "Nome é obrigatório" / "Name is required" / "El nombre es obligatorio"
```

#### `coaches.*` — Gestão de Coaches

```text
coaches.title                 → "Professores" / "Coaches" / "Profesores"
coaches.subtitle              → "Gerencie os professores da organização" / "Manage organization coaches" / "Gestione los profesores"
coaches.create                → "Cadastrar Coach" / "Register Coach" / "Registrar Profesor"
coaches.createDesc            → "Adicione um novo coach à organização" / "Add a new coach to the organization" / "Añada un nuevo profesor"
coaches.edit                  → "Editar Coach" / "Edit Coach" / "Editar Profesor"
coaches.editDesc              → "Atualize as informações do coach" / "Update coach information" / "Actualice la información"
coaches.createSuccess         → "Coach cadastrado com sucesso" / "Coach registered successfully" / "Profesor registrado"
coaches.createError           → "Erro ao criar coach" / "Error creating coach" / "Error al crear profesor"
coaches.updateSuccess         → "Coach atualizado com sucesso" / "Coach updated successfully" / "Profesor actualizado"
coaches.updateError           → "Erro ao atualizar coach" / "Error updating coach" / "Error al actualizar"
coaches.linkAcademy           → "Vincular à Academia" / "Link to Academy" / "Vincular a Academia"
coaches.linkAcademyDesc       → "Vincule {name} a uma academia" / "Link {name} to an academy" / "Vincule {name} a una academia"
coaches.linkSuccess           → "Coach vinculado à academia" / "Coach linked to academy" / "Profesor vinculado"
coaches.linkError             → "Erro ao vincular coach" / "Error linking coach" / "Error al vincular"
coaches.alreadyLinked         → "Coach já está vinculado a esta academia" / "Coach is already linked to this academy" / "Ya está vinculado"
coaches.nameRequired          → "Nome é obrigatório" / "Name is required" / "El nombre es obligatorio"
coaches.selectAcademy         → "Selecione uma academia" / "Select an academy" / "Seleccione una academia"
```

#### `tenants.*` — CRUD de Organizações

```text
tenants.create                → "Criar Nova Organização" / "Create New Organization" / "Crear Nueva Organización"
tenants.createDesc            → "Preencha os dados para criar uma nova organização" / "Fill in the details to create a new organization" / "Complete los datos"
tenants.edit                  → "Editar Organização" / "Edit Organization" / "Editar Organización"
tenants.editDesc              → "Altere os dados da organização" / "Change organization data" / "Modifique los datos"
tenants.organizationName      → "Nome da organização" / "Organization name" / "Nombre de la organización"
tenants.slugUrl               → "Slug (URL)" / "Slug (URL)" / "Slug (URL)"
tenants.slugCannotChange      → "O slug não pode ser alterado após a criação" / "Slug cannot be changed after creation" / "El slug no puede cambiarse"
tenants.modalities            → "Modalidades" / "Modalities" / "Modalidades"
tenants.defaultLanguage       → "Idioma padrão" / "Default language" / "Idioma predeterminado"
tenants.primaryColor          → "Cor primária" / "Primary color" / "Color primario"
tenants.description           → "Descrição" / "Description" / "Descripción"
tenants.descriptionOptional   → "Descrição (opcional)" / "Description (optional)" / "Descripción (opcional)"
tenants.organizationStatus    → "Status da organização" / "Organization status" / "Estado de la organización"
tenants.activeDesc            → "A organização está ativa e acessível" / "Organization is active and accessible" / "Activa y accesible"
tenants.inactiveDesc          → "A organização está desativada" / "Organization is deactivated" / "Organización desactivada"
tenants.saveChanges           → "Salvar Alterações" / "Save Changes" / "Guardar Cambios"
tenants.createOrganization    → "Criar Organização" / "Create Organization" / "Crear Organización"
tenants.createSuccess         → "Organização criada com sucesso!" / "Organization created successfully!" / "¡Organización creada!"
tenants.createError           → "Erro ao criar organização" / "Error creating organization" / "Error al crear"
tenants.updateSuccess         → "Organização atualizada com sucesso!" / "Organization updated successfully!" / "¡Organización actualizada!"
tenants.updateError           → "Erro ao atualizar organização" / "Error updating organization" / "Error al actualizar"
tenants.nameRequired          → "Nome e slug são obrigatórios" / "Name and slug are required" / "Nombre y slug obligatorios"
tenants.modalityRequired      → "Selecione pelo menos uma modalidade" / "Select at least one modality" / "Seleccione al menos una"
tenants.slugInUse             → "Este slug já está em uso" / "This slug is already in use" / "Este slug ya está en uso"
tenants.newOrganization       → "Nova Organização" / "New Organization" / "Nueva Organización"
tenants.accessUrl             → "URL de acesso" / "Access URL" / "URL de acceso"
```

#### `billing.*` — Extensões de Billing Dialog

```text
billing.billingTitle          → "Billing - {name}" / "Billing - {name}" / "Facturación - {name}"
billing.manageBilling         → "Gerencie a assinatura e faturamento" / "Manage subscription and billing" / "Gestione suscripción y facturación"
billing.plan                  → "Plano" / "Plan" / "Plan"
billing.currentPeriod         → "Período atual" / "Current period" / "Período actual"
billing.cancelsAt             → "Cancela em" / "Cancels at" / "Cancela en"
billing.stripeId              → "ID Stripe" / "Stripe ID" / "ID Stripe"
billing.openStripePortal      → "Abrir portal Stripe" / "Open Stripe portal" / "Abrir portal Stripe"
billing.reactivate            → "Reativar assinatura" / "Reactivate subscription" / "Reactivar suscripción"
billing.noActiveSubscription  → "Sem assinatura ativa" / "No active subscription" / "Sin suscripción activa"
billing.choosePlan            → "Escolha o plano para esta organização" / "Choose the plan for this organization" / "Elija el plan"
billing.monthlyPlan           → "Plano Mensal" / "Monthly Plan" / "Plan Mensual"
billing.monthlyPlanDesc       → "Cobrança mensal, cancele quando quiser" / "Monthly billing, cancel anytime" / "Mensual, cancele cuando quiera"
billing.annualPlan            → "Plano Anual" / "Annual Plan" / "Plan Anual"
billing.annualPlanDesc        → "Economia com cobrança anual" / "Save with annual billing" / "Ahorre con facturación anual"
billing.createSubscription    → "Criar assinatura" / "Create subscription" / "Crear suscripción"
billing.subscriptionCreated   → "Assinatura criada com sucesso!" / "Subscription created successfully!" / "¡Suscripción creada!"
billing.subscriptionError     → "Erro ao criar assinatura" / "Error creating subscription" / "Error al crear suscripción"
billing.completePayment       → "O tenant precisará completar o pagamento" / "Tenant will need to complete payment" / "El tenant necesitará completar el pago"
billing.noStripeCustomer      → "Este tenant não possui cliente Stripe" / "This tenant has no Stripe customer" / "Este tenant no tiene cliente Stripe"
billing.portalUrlError        → "URL do portal não retornada" / "Portal URL not returned" / "URL del portal no retornada"
billing.stripePortalError     → "Erro ao abrir portal Stripe" / "Error opening Stripe portal" / "Error al abrir portal Stripe"
```

#### `gradings.*` — Gestão de Graduações

```text
gradings.schemeCreated        → "Esquema de graduação criado!" / "Grading scheme created!" / "¡Esquema de graduación creado!"
gradings.schemeUpdated        → "Esquema atualizado!" / "Scheme updated!" / "¡Esquema actualizado!"
gradings.schemeCreateError    → "Erro ao criar esquema" / "Error creating scheme" / "Error al crear esquema"
gradings.schemeUpdateError    → "Erro ao atualizar esquema" / "Error updating scheme" / "Error al actualizar"
gradings.newScheme            → "Novo Esquema de Graduação" / "New Grading Scheme" / "Nuevo Esquema"
gradings.editScheme           → "Editar Esquema" / "Edit Scheme" / "Editar Esquema"
gradings.schemeDesc           → "Configure um sistema de graduação" / "Configure a grading system" / "Configure un sistema de graduación"
gradings.selectLevel          → "Selecione um nível de graduação" / "Select a grading level" / "Seleccione un nivel"
gradings.diplomaGenerated     → "Graduação registrada e diploma gerado!" / "Grading recorded and diploma generated!" / "¡Graduación registrada!"
gradings.diplomaError         → "Erro ao gerar diploma" / "Error generating diploma" / "Error al generar diploma"
```

#### `upload.*` — Upload de Arquivos

```text
upload.unsupportedType        → "Tipo de arquivo não suportado. Use PNG, JPG ou WebP" / "Unsupported file type. Use PNG, JPG or WebP" / "Tipo no soportado. Use PNG, JPG o WebP"
upload.fileTooLarge           → "Arquivo muito grande. Máximo 5MB" / "File too large. Maximum 5MB" / "Archivo muy grande. Máximo 5MB"
upload.success                → "Imagem enviada com sucesso!" / "Image uploaded successfully!" / "¡Imagen subida!"
upload.error                  → "Erro ao enviar imagem" / "Error uploading image" / "Error al subir imagen"
upload.removeSuccess          → "Imagem removida" / "Image removed" / "Imagen eliminada"
upload.removeError            → "Erro ao remover imagem" / "Error removing image" / "Error al eliminar imagen"
```

#### `events.*` — Extensões de Eventos

```text
events.registrationSuccess    → "Inscrição realizada com sucesso!" / "Registration successful!" / "¡Inscripción exitosa!"
events.registrationError      → "Erro ao realizar inscrição" / "Error registering" / "Error al inscribirse"
events.alreadyRegistered      → "Você já está inscrito nesta categoria" / "You are already registered in this category" / "Ya está inscrito"
events.cancelRegistration     → "Cancelar Inscrição" / "Cancel Registration" / "Cancelar Inscripción"
events.confirmCancellation    → "Confirmar Cancelamento" / "Confirm Cancellation" / "Confirmar Cancelación"
events.cancellationWarning    → "Tem certeza que deseja cancelar? Esta ação não pode ser desfeita." / "Are you sure? This action cannot be undone." / "¿Está seguro? No se puede deshacer."
events.confirmCancel          → "Sim, cancelar" / "Yes, cancel" / "Sí, cancelar"
events.cancellationSuccess    → "Inscrição cancelada" / "Registration cancelled" / "Inscripción cancelada"
events.cancellationError      → "Erro ao cancelar inscrição" / "Error cancelling registration" / "Error al cancelar"
events.statusUpdated          → "Status atualizado!" / "Status updated!" / "¡Estado actualizado!"
events.statusUpdateError      → "Erro ao atualizar status" / "Error updating status" / "Error al actualizar"
```

#### `athletes.*` — Lista de Atletas

```text
athletes.title                → "Atletas" / "Athletes" / "Atletas"
athletes.subtitle             → "Gerencie os atletas cadastrados" / "Manage registered athletes" / "Gestione los atletas"
athletes.allAcademies         → "Todas academias" / "All academies" / "Todas las academias"
athletes.allStatus            → "Todos status" / "All status" / "Todos los estados"
athletes.statusActive         → "Ativa" / "Active" / "Activa"
athletes.statusPendingReview  → "Aguardando Aprovação" / "Pending Review" / "Pendiente de Aprobación"
athletes.statusPendingPayment → "Aguardando Pagamento" / "Pending Payment" / "Pendiente de Pago"
athletes.statusExpired        → "Expirada" / "Expired" / "Expirada"
athletes.searchPlaceholder    → "Buscar por nome..." / "Search by name..." / "Buscar por nombre..."
```

#### `memberships.*` — Lista de Filiações

```text
memberships.myMemberships     → "Minhas Filiações" / "My Memberships" / "Mis Membresías"
memberships.trackStatus       → "Acompanhe o status das suas filiações" / "Track your membership status" / "Siga el estado de sus membresías"
memberships.newMembership     → "Nova Filiação" / "New Membership" / "Nueva Membresía"
memberships.noMemberships     → "Nenhuma filiação encontrada" / "No memberships found" / "Ninguna membresía encontrada"
memberships.noMembershipsDesc → "Você ainda não possui filiações registradas" / "You have no registered memberships yet" / "Aún no tiene membresías"
memberships.joinNow           → "Fazer minha filiação" / "Join now" / "Unirse ahora"
```

---

### Ordem de Implementação

1. **Fase 1:** Adicionar todas as chaves i18n nos 3 arquivos de tradução (~70 novas chaves)
2. **Fase 2:** Refatorar Admin Dialogs (4 arquivos)
3. **Fase 3:** Refatorar CRUD Pages (4 arquivos)
4. **Fase 4:** Refatorar Events, Memberships e Hooks (5 arquivos)
5. **Fase 5:** Validação final

---

### Padrão de Refatoração

**Antes (ERRADO):**
```typescript
toast.success('Academia criada com sucesso');
<Button>Salvar</Button>
<DialogTitle>Editar Academia</DialogTitle>
```

**Depois (CORRETO):**
```typescript
toast.success(t('academies.createSuccess'));
<Button>{t('common.save')}</Button>
<DialogTitle>{t('academies.edit')}</DialogTitle>
```

---

### Garantias SAFE GOLD

| Restrição | Status |
|-----------|--------|
| Auth inalterado | Garantido |
| Stripe / Billing logic inalterada | Garantido |
| RLS inalterado | Garantido |
| Edge Functions inalteradas | Garantido |
| Routing inalterado | Garantido |
| Estrutura I18nProvider inalterada | Garantido |
| Nenhum `as any` | Garantido |

---

### Critérios de Aceite (Bloqueantes)

- Idioma EN: nenhuma palavra em português aparece
- Idioma ES: nenhuma palavra em português aparece
- Build sem warnings de i18n
- Nenhum fallback hardcoded (`|| 'Texto em PT'`)
- Nenhum `as any` para mascarar ausência de chave
- SAFE GOLD 100% preservado

---

### Resultado Esperado

```text
P4.x-R2 — UI TEXT HARDENING CONCLUÍDO
├── Nenhum texto literal em botões
├── Nenhum texto literal em diálogos
├── Nenhum texto literal em menus
├── Todos os feedbacks (toast) traduzidos
├── EN / ES 100% limpos
├── ~70 novas chaves i18n criadas
├── 13 arquivos refatorados
└── SAFE GOLD preservado
```
