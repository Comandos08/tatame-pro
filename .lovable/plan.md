

## P4.x-R1 — i18n SISTÊMICO (Admin, Control Tower, Billing)

### Resumo Executivo

Após auditoria completa do código, identifiquei **276+ textos hardcoded em português** distribuídos em 9 componentes críticos das áreas Admin Global, Control Tower e Billing. Este plano detalha a substituição completa por chaves i18n em pt-BR, en e es.

---

### Diagnóstico Quantitativo

| Arquivo | Textos Hardcoded | Prioridade |
|---------|------------------|------------|
| `src/pages/AdminDashboard.tsx` | ~45 strings | Alta |
| `src/pages/TenantControl.tsx` | ~65 strings | Alta |
| `src/components/admin/CreateTenantDialog.tsx` | ~25 strings | Média |
| `src/components/admin/EditTenantDialog.tsx` | ~20 strings | Média |
| `src/components/admin/ManageAdminsDialog.tsx` | ~35 strings | Média |
| `src/components/admin/TenantBillingDialog.tsx` | ~20 strings | Média |
| `src/components/admin/PlatformHealthCard.tsx` | ~30 strings | Média |
| `src/components/admin/CardDiagnosticsPanel.tsx` | ~25 strings | Média |
| `src/components/billing/TenantBlockedScreen.tsx` | ~15 strings | Média |
| **TOTAL** | **~276 strings** | |

---

### Novas Chaves i18n a Criar

Organizadas por namespace semântico:

#### `admin.*` — Painel Global

```text
admin.title                      → "TATAME Admin" / "TATAME Admin" / "TATAME Admin"
admin.globalPanel                → "Painel Global" / "Global Panel" / "Panel Global"
admin.globalAdminPanel           → "Painel de Administração Global" / "Global Admin Panel" / "Panel de Administración Global"
admin.globalAdminDesc            → "Gerencie todas as organizações de esportes..." / "Manage all combat sports..." / "Gestione todas las organizaciones..."
admin.activeOrgs                 → "Organizações Ativas" / "Active Organizations" / "Organizaciones Activas"
admin.totalUsers                 → "Usuários Totais" / "Total Users" / "Usuarios Totales"
admin.registeredAthletes         → "Atletas Cadastrados" / "Registered Athletes" / "Atletas Registrados"
admin.activeMemberships          → "Filiações Ativas" / "Active Memberships" / "Membresías Activas"
admin.organizations              → "Organizações" / "Organizations" / "Organizaciones"
admin.organizationsDesc          → "Gerencie todas as organizações da plataforma" / "Manage all platform organizations" / "Gestione todas las organizaciones..."
admin.update                     → "Atualizar" / "Refresh" / "Actualizar"
admin.noOrganizations            → "Nenhuma organização encontrada" / "No organizations found" / "Ninguna organización encontrada"
admin.tenantsInOverride          → "Tenants em Override Manual" / "Tenants in Manual Override" / "Tenants en Override Manual"
admin.tenantsInOverrideDesc      → "Tenants com billing controlado manualmente, fora do Stripe" / "Tenants with billing manually controlled, outside Stripe" / "Tenants con facturación controlada manualmente..."
admin.daysAgo                    → "há {days} dias" / "{days} days ago" / "hace {days} días"
admin.statusUpdated              → "Status da organização atualizado" / "Organization status updated" / "Estado de la organización actualizado"
admin.updateError                → "Erro ao atualizar organização" / "Error updating organization" / "Error al actualizar la organización"
```

#### `admin.table.*` — Cabeçalhos de Tabela

```text
admin.table.organization         → "Organização" / "Organization" / "Organización"
admin.table.slug                 → "Slug" / "Slug" / "Slug"
admin.table.modalities           → "Modalidades" / "Modalities" / "Modalidades"
admin.table.billing              → "Billing" / "Billing" / "Facturación"
admin.table.createdAt            → "Criado em" / "Created at" / "Creado en"
admin.table.status               → "Status" / "Status" / "Estado"
admin.table.actions              → "Ações" / "Actions" / "Acciones"
```

#### `admin.actions.*` — Menu de Ações

```text
admin.actions.openPortal         → "Abrir portal" / "Open portal" / "Abrir portal"
admin.actions.loginAsAdmin       → "Entrar como admin" / "Login as admin" / "Entrar como admin"
admin.actions.edit               → "Editar" / "Edit" / "Editar"
admin.actions.manageAdmins       → "Gerenciar admins" / "Manage admins" / "Gestionar admins"
admin.actions.configure          → "Configurar" / "Configure" / "Configurar"
```

#### `admin.status.*` — Status

```text
admin.status.active              → "Ativo" / "Active" / "Activo"
admin.status.inactive            → "Inativo" / "Inactive" / "Inactivo"
admin.status.yes                 → "Sim" / "Yes" / "Sí"
admin.status.no                  → "Não" / "No" / "No"
admin.status.manual              → "MANUAL" / "MANUAL" / "MANUAL"
admin.status.noRecord            → "Sem registro" / "No record" / "Sin registro"
```

#### `controlTower.*` — Control Tower

```text
controlTower.title               → "Control Tower" / "Control Tower" / "Torre de Control"
controlTower.tenantNotFound      → "Tenant não encontrado" / "Tenant not found" / "Tenant no encontrado"
controlTower.currentStatus       → "Status Atual" / "Current Status" / "Estado Actual"
controlTower.billingInfo         → "Informações de billing do tenant" / "Tenant billing information" / "Información de facturación..."
controlTower.status              → "Status" / "Status" / "Estado"
controlTower.plan                → "Plano" / "Plan" / "Plan"
controlTower.tenantActive        → "Tenant Ativo" / "Tenant Active" / "Tenant Activo"
controlTower.periodStart         → "Período Início" / "Period Start" / "Período Inicio"
controlTower.periodEnd           → "Período Fim" / "Period End" / "Período Fin"
controlTower.controlMode         → "Modo de Controle" / "Control Mode" / "Modo de Control"
controlTower.stripeCustomer      → "Stripe Customer" / "Stripe Customer" / "Cliente Stripe"
controlTower.stripeSubscription  → "Stripe Subscription" / "Stripe Subscription" / "Suscripción Stripe"

controlTower.overrideActions     → "Ações de Override" / "Override Actions" / "Acciones de Override"
controlTower.overrideActionsDesc → "Controles manuais para gerenciar o status de billing..." / "Manual controls to manage tenant billing status..." / "Controles manuales para gestionar el estado de facturación..."
controlTower.trialLimit          → "Trial máx. {days} dias" / "Trial max. {days} days" / "Trial máx. {days} días"
controlTower.paidLimit           → "Pagamento máx. {months} meses" / "Payment max. {months} months" / "Pago máx. {months} meses"

controlTower.extendTrial         → "Estender Trial" / "Extend Trial" / "Extender Prueba"
controlTower.extendTrialDesc     → "Adiciona dias extras ao período de trial do tenant" / "Adds extra days to tenant trial period" / "Añade días extra al período de prueba..."
controlTower.markAsPaid          → "Marcar como Pago" / "Mark as Paid" / "Marcar como Pagado"
controlTower.markAsPaidDesc      → "Força o status ACTIVE até a data especificada" / "Forces ACTIVE status until specified date" / "Fuerza el estado ACTIVO hasta la fecha..."
controlTower.blockTenant         → "Bloquear Tenant" / "Block Tenant" / "Bloquear Tenant"
controlTower.blockTenantDesc     → "Força o status PAST_DUE, bloqueando novas filiações" / "Forces PAST_DUE status, blocking new memberships" / "Fuerza el estado PAST_DUE..."
controlTower.unblockTenant       → "Desbloquear Tenant" / "Unblock Tenant" / "Desbloquear Tenant"
controlTower.unblockTenantDesc   → "Remove o bloqueio e define ACTIVE por 30 dias" / "Removes block and sets ACTIVE for 30 days" / "Elimina el bloqueo y define ACTIVO por 30 días"
controlTower.resetToStripe       → "Retornar ao Stripe" / "Return to Stripe" / "Volver a Stripe"
controlTower.resetToStripeDesc   → "Remove todos os overrides manuais e sincroniza com o Stripe" / "Removes all manual overrides and syncs with Stripe" / "Elimina todos los overrides manuales..."
controlTower.requiresConfirm     → "Requer confirmação" / "Requires confirmation" / "Requiere confirmación"
controlTower.forcePastDue        → "Forçar PAST_DUE" / "Force PAST_DUE" / "Forzar PAST_DUE"
controlTower.plus30DaysActive    → "+30 dias ACTIVE" / "+30 days ACTIVE" / "+30 días ACTIVO"
controlTower.sync                → "Sincronizar" / "Sync" / "Sincronizar"

controlTower.overrideHistory     → "Histórico de Overrides" / "Override History" / "Historial de Overrides"
controlTower.overrideHistoryDesc → "Registro de todas as ações manuais realizadas neste tenant" / "Record of all manual actions performed on this tenant" / "Registro de todas las acciones manuales..."
controlTower.noOverrideActions   → "Nenhuma ação de override registrada" / "No override actions recorded" / "Ninguna acción de override registrada"
controlTower.reason              → "Motivo" / "Reason" / "Motivo"
controlTower.reasonRequired      → "Motivo (obrigatório)" / "Reason (required)" / "Motivo (obligatorio)"
controlTower.reasonPlaceholder   → "Descreva o motivo desta ação..." / "Describe the reason for this action..." / "Describa el motivo de esta acción..."
controlTower.daysToAdd           → "Dias a adicionar" / "Days to add" / "Días a añadir"
controlTower.validUntil          → "Válido até" / "Valid until" / "Válido hasta"
controlTower.previousStatus      → "Status anterior" / "Previous status" / "Estado anterior"
controlTower.newStatus           → "Novo status" / "New status" / "Nuevo estado"
controlTower.days                → "Dias" / "Days" / "Días"
controlTower.until               → "Até" / "Until" / "Hasta"

controlTower.manualOverrideWarning       → "STATUS SOB OVERRIDE MANUAL" / "STATUS UNDER MANUAL OVERRIDE" / "ESTADO BAJO OVERRIDE MANUAL"
controlTower.manualOverrideWarningDesc   → "Este tenant está com status sobrescrito manualmente. O Stripe não está controlando o billing." / "This tenant has its status manually overridden. Stripe is not controlling billing." / "Este tenant tiene su estado sobrescrito manualmente..."
controlTower.overrideAppliedAt           → "Override aplicado em" / "Override applied at" / "Override aplicado en"
controlTower.overrideBy                  → "Por" / "By" / "Por"

controlTower.confirmationNeeded          → "Confirmação Necessária" / "Confirmation Needed" / "Confirmación Necesaria"
controlTower.confirmBlockActive          → "Você está prestes a BLOQUEAR um tenant com status ACTIVE. Isso impedirá a criação de novas filiações." / "You are about to BLOCK a tenant with ACTIVE status. This will prevent new memberships." / "Está a punto de BLOQUEAR un tenant con estado ACTIVO..."
controlTower.confirmMarkPaid             → "Você está prestes a forçar o status ACTIVE manualmente, sobrescrevendo qualquer controle do Stripe." / "You are about to force ACTIVE status manually, overriding any Stripe control." / "Está a punto de forzar el estado ACTIVO manualmente..."
controlTower.confirmAction               → "Confirmar Ação" / "Confirm Action" / "Confirmar Acción"
controlTower.continue                    → "Continuar..." / "Continue..." / "Continuar..."
controlTower.confirm                     → "Confirmar" / "Confirm" / "Confirmar"
```

#### `admin.dialogs.*` — Diálogos de Admin

```text
admin.dialogs.editOrganization           → "Editar Organização" / "Edit Organization" / "Editar Organización"
admin.dialogs.editOrganizationDesc       → "Altere os dados da organização" / "Change organization data" / "Modifique los datos de la organización"
admin.dialogs.slugCannotChange           → "O slug não pode ser alterado após a criação." / "Slug cannot be changed after creation." / "El slug no puede cambiarse después de la creación."
admin.dialogs.organizationStatus         → "Status da organização" / "Organization status" / "Estado de la organización"
admin.dialogs.organizationActiveDesc     → "A organização está ativa e acessível." / "Organization is active and accessible." / "La organización está activa y accesible."
admin.dialogs.organizationInactiveDesc   → "A organização está desativada." / "Organization is deactivated." / "La organización está desactivada."
admin.dialogs.saving                     → "Salvando..." / "Saving..." / "Guardando..."
admin.dialogs.saveChanges                → "Salvar Alterações" / "Save Changes" / "Guardar Cambios"
admin.dialogs.updateSuccess              → "Organização atualizada com sucesso!" / "Organization updated successfully!" / "¡Organización actualizada con éxito!"
admin.dialogs.updateError                → "Erro ao atualizar organização" / "Error updating organization" / "Error al actualizar la organización"
admin.dialogs.createSuccess              → "Organização criada com sucesso!" / "Organization created successfully!" / "¡Organización creada con éxito!"

admin.dialogs.administrators             → "Administradores" / "Administrators" / "Administradores"
admin.dialogs.administratorsDesc         → "Gerencie os administradores da organização" / "Manage organization administrators" / "Gestione los administradores de la organización"
admin.dialogs.currentAdmins              → "Administradores atuais" / "Current administrators" / "Administradores actuales"
admin.dialogs.noAdmins                   → "Nenhum admin cadastrado ainda." / "No admins registered yet." / "Ningún admin registrado todavía."
admin.dialogs.noName                     → "Sem nome" / "No name" / "Sin nombre"
admin.dialogs.existingUser               → "Usuário existente" / "Existing user" / "Usuario existente"
admin.dialogs.createNewUser              → "Criar novo usuário" / "Create new user" / "Crear nuevo usuario"
admin.dialogs.addAdmin                   → "Adicionar Admin" / "Add Admin" / "Añadir Admin"
admin.dialogs.removeAdmin                → "Remover administrador?" / "Remove administrator?" / "¿Eliminar administrador?"
admin.dialogs.removeAdminDesc            → "Tem certeza que deseja remover {email} como administrador de {org}? Esta ação pode ser revertida." / "Are you sure you want to remove {email} as administrator of {org}? This action can be reversed." / "¿Está seguro que desea eliminar {email} como administrador de {org}?"
admin.dialogs.remove                     → "Remover" / "Remove" / "Eliminar"
admin.dialogs.adminAdded                 → "Admin adicionado com sucesso!" / "Admin added successfully!" / "¡Admin añadido con éxito!"
admin.dialogs.adminRemoved               → "Admin removido com sucesso" / "Admin removed successfully" / "Admin eliminado con éxito"
admin.dialogs.adminAlreadyExists         → "Este usuário já é admin desta organização." / "This user is already an admin of this organization." / "Este usuario ya es admin de esta organización."
admin.dialogs.newAdminCredentials        → "Credenciais do novo admin" / "New admin credentials" / "Credenciales del nuevo admin"
admin.dialogs.temporaryPassword          → "Senha temporária" / "Temporary password" / "Contraseña temporal"
admin.dialogs.credentialsHint            → "Envie estas credenciais para o admin." / "Send these credentials to the admin." / "Envíe estas credenciales al admin."
admin.dialogs.leavePasswordEmpty         → "Se deixar vazio, uma senha aleatória será gerada." / "Leave empty to generate a random password." / "Deje vacío para generar una contraseña aleatoria."
admin.dialogs.close                      → "Fechar" / "Close" / "Cerrar"

admin.dialogs.billingTitle               → "Billing" / "Billing" / "Facturación"
admin.dialogs.billingDesc                → "Gerencie a assinatura e faturamento da organização" / "Manage organization subscription and billing" / "Gestione la suscripción y facturación..."
admin.dialogs.plan                       → "Plano" / "Plan" / "Plan"
admin.dialogs.currentPeriod              → "Período atual" / "Current period" / "Período actual"
admin.dialogs.cancelsAt                  → "Cancela em" / "Cancels at" / "Cancela en"
admin.dialogs.stripeId                   → "ID Stripe" / "Stripe ID" / "ID Stripe"
admin.dialogs.openStripePortal           → "Abrir portal Stripe" / "Open Stripe portal" / "Abrir portal Stripe"
admin.dialogs.reactivateSubscription     → "Reativar assinatura" / "Reactivate subscription" / "Reactivar suscripción"
admin.dialogs.noActiveSubscription       → "Sem assinatura ativa" / "No active subscription" / "Sin suscripción activa"
admin.dialogs.choosePlan                 → "Escolha o plano para esta organização" / "Choose the plan for this organization" / "Elija el plan para esta organización"
admin.dialogs.monthlyPlan                → "Plano Mensal" / "Monthly Plan" / "Plan Mensual"
admin.dialogs.monthlyPlanDesc            → "Cobrança mensal, cancele quando quiser" / "Monthly billing, cancel anytime" / "Facturación mensual, cancele cuando quiera"
admin.dialogs.annualPlan                 → "Plano Anual" / "Annual Plan" / "Plan Anual"
admin.dialogs.annualPlanDesc             → "Economia com cobrança anual" / "Save with annual billing" / "Ahorre con facturación anual"
admin.dialogs.createSubscription         → "Criar assinatura" / "Create subscription" / "Crear suscripción"
admin.dialogs.subscriptionCreated        → "Assinatura criada com sucesso!" / "Subscription created successfully!" / "¡Suscripción creada con éxito!"
admin.dialogs.completePayment            → "O tenant precisará completar o pagamento para ativar a assinatura." / "The tenant will need to complete payment to activate." / "El tenant necesitará completar el pago para activar."
```

#### `platformHealth.*` — Saúde da Plataforma

```text
platformHealth.title                     → "Saúde da Plataforma" / "Platform Health" / "Salud de la Plataforma"
platformHealth.operational               → "Operacional" / "Operational" / "Operacional"
platformHealth.attentionNeeded           → "Atenção Necessária" / "Attention Needed" / "Atención Necesaria"
platformHealth.checking                  → "Verificando" / "Checking" / "Verificando"
platformHealth.statusDesc                → "Status dos jobs automáticos e métricas de erros." / "Status of automatic jobs and error metrics." / "Estado de los jobs automáticos y métricas de errores."
platformHealth.technicalNote             → "Nota: Ausência de eventos indica possível problema técnico nos jobs, não impacto direto nos usuários." / "Note: Absence of events indicates possible technical issue in jobs, not direct user impact." / "Nota: La ausencia de eventos indica un posible problema técnico en los jobs..."

platformHealth.automaticJobs             → "Jobs Automáticos" / "Automatic Jobs" / "Jobs Automáticos"
platformHealth.expireMemberships         → "Expirar Filiações" / "Expire Memberships" / "Expirar Membresías"
platformHealth.cleanAbandoned            → "Limpar Abandonados" / "Clean Abandoned" / "Limpiar Abandonados"
platformHealth.checkTrials               → "Checar Trials" / "Check Trials" / "Verificar Trials"
platformHealth.neverRan                  → "Nunca executou" / "Never ran" / "Nunca ejecutó"
platformHealth.lessThan1h                → "Há menos de 1h" / "Less than 1h ago" / "Hace menos de 1h"
platformHealth.hoursAgo                  → "Há {h}h" / "{h}h ago" / "Hace {h}h"
platformHealth.ok                        → "OK" / "OK" / "OK"
platformHealth.delayed                   → "Atrasado" / "Delayed" / "Atrasado"
platformHealth.error                     → "Erro" / "Error" / "Error"
platformHealth.noDataTooltip             → "Nenhuma execução registrada. Verifique se os cron jobs estão configurados." / "No execution recorded. Check if cron jobs are configured." / "Ninguna ejecución registrada. Verifique si los cron jobs están configurados."
platformHealth.okTooltip                 → "Job executado nas últimas 24h. Funcionando normalmente." / "Job executed in last 24h. Running normally." / "Job ejecutado en las últimas 24h. Funcionando normalmente."
platformHealth.delayedTooltip            → "Job não executou há mais de 24h. Investigar cron/pg_net." / "Job hasn't run for over 24h. Investigate cron/pg_net." / "Job no ejecutó hace más de 24h. Investigar cron/pg_net."
platformHealth.errorTooltip              → "Job não executou há mais de 48h. Ação técnica necessária." / "Job hasn't run for over 48h. Technical action needed." / "Job no ejecutó hace más de 48h. Acción técnica necesaria."

platformHealth.metrics7d                 → "Métricas (7 dias)" / "Metrics (7 days)" / "Métricas (7 días)"
platformHealth.expiredMemberships        → "Filiações expiradas" / "Expired memberships" / "Membresías expiradas"
platformHealth.abandonedCleaned          → "Abandonados limpos" / "Abandoned cleaned" / "Abandonados limpiados"
platformHealth.webhookErrors24h          → "Erros webhook (24h)" / "Webhook errors (24h)" / "Errores webhook (24h)"
platformHealth.paymentFailures           → "Falhas pagamento" / "Payment failures" / "Fallos de pago"
platformHealth.in24h                     → "({n} em 24h)" / "({n} in 24h)" / "({n} en 24h)"

platformHealth.tenantsWithIssues         → "Tenants com Problemas" / "Tenants with Issues" / "Tenants con Problemas"
platformHealth.blocked                   → "bloqueados" / "blocked" / "bloqueados"
platformHealth.latePayment               → "com pagamento atrasado" / "with late payment" / "con pago atrasado"
platformHealth.loadError                 → "Erro ao carregar métricas de saúde" / "Error loading health metrics" / "Error al cargar métricas de salud"
```

#### `cardDiagnostics.*` — Diagnóstico de Carteirinhas

```text
cardDiagnostics.title                    → "Diagnóstico de Carteirinhas" / "Card Diagnostics" / "Diagnóstico de Tarjetas"
cardDiagnostics.pending                  → "pendentes" / "pending" / "pendientes"
cardDiagnostics.description              → "Monitoramento de memberships pagas sem carteirinha digital" / "Monitoring paid memberships without digital card" / "Monitoreo de membresías pagadas sin tarjeta digital"
cardDiagnostics.paidMemberships          → "Memberships Pagas" / "Paid Memberships" / "Membresías Pagadas"
cardDiagnostics.cardsGenerated           → "Carteirinhas Geradas" / "Cards Generated" / "Tarjetas Generadas"
cardDiagnostics.withoutCard              → "Sem Carteirinha" / "Without Card" / "Sin Tarjeta"
cardDiagnostics.inconsistencyRate        → "Taxa de Inconsistência" / "Inconsistency Rate" / "Tasa de Inconsistencia"
cardDiagnostics.cardCoverage             → "Cobertura de Carteirinhas" / "Card Coverage" / "Cobertura de Tarjetas"
cardDiagnostics.membershipsWithoutCard   → "Memberships Sem Carteirinha" / "Memberships Without Card" / "Membresías Sin Tarjeta"
cardDiagnostics.generateAll              → "Gerar Todas" / "Generate All" / "Generar Todas"
cardDiagnostics.generateCard             → "Gerar carteirinha" / "Generate card" / "Generar tarjeta"
cardDiagnostics.cardGenerated            → "Carteirinha gerada com sucesso!" / "Card generated successfully!" / "¡Tarjeta generada con éxito!"
cardDiagnostics.cardError                → "Erro ao gerar carteirinha" / "Error generating card" / "Error al generar tarjeta"
cardDiagnostics.batchComplete            → "Processamento concluído: {success} geradas, {failed} falhas" / "Processing complete: {success} generated, {failed} failures" / "Procesamiento completado: {success} generadas, {failed} fallos"
cardDiagnostics.batchError               → "Erro no processamento em lote" / "Batch processing error" / "Error en el procesamiento por lotes"
cardDiagnostics.athlete                  → "Atleta" / "Athlete" / "Atleta"
cardDiagnostics.organization             → "Organização" / "Organization" / "Organización"
cardDiagnostics.createdAt                → "Criado em" / "Created at" / "Creado en"
cardDiagnostics.action                   → "Ação" / "Action" / "Acción"
```

#### `blocked.*` — Tela de Bloqueio

```text
blocked.inactiveSubscription             → "Assinatura Inativa" / "Inactive Subscription" / "Suscripción Inactiva"
blocked.accessSuspended                  → "O acesso ao sistema administrativo está suspenso devido a pendências no pagamento da assinatura." / "Access to the admin system is suspended due to pending subscription payment." / "El acceso al sistema administrativo está suspendido debido a pendencias en el pago de la suscripción."
blocked.toRegularize                     → "Para regularizar:" / "To regularize:" / "Para regularizar:"
blocked.updatePaymentMethod              → "Atualize seu método de pagamento" / "Update your payment method" / "Actualice su método de pago"
blocked.makePendingPayment               → "Efetue o pagamento pendente" / "Make the pending payment" / "Realice el pago pendiente"
blocked.contactSupport                   → "Ou entre em contato com nosso suporte" / "Or contact our support" / "O contacte con nuestro soporte"
blocked.manageSubscription               → "Gerenciar Assinatura" / "Manage Subscription" / "Gestionar Suscripción"
blocked.contactSupportBtn                → "Contatar Suporte" / "Contact Support" / "Contactar Soporte"
blocked.afterRegularization              → "Após a regularização, o acesso será restaurado automaticamente." / "After regularization, access will be automatically restored." / "Después de la regularización, el acceso será restaurado automáticamente."
blocked.temporarilyUnavailable           → "Temporariamente Indisponível" / "Temporarily Unavailable" / "Temporalmente No Disponible"
blocked.orgTemporarilyUnavailable        → "Esta organização está temporariamente indisponível." / "This organization is temporarily unavailable." / "Esta organización está temporalmente no disponible."
blocked.tryLaterOrContact                → "Por favor, tente novamente mais tarde ou entre em contato com o administrador da sua organização." / "Please try again later or contact your organization's administrator." / "Por favor, intente de nuevo más tarde o contacte al administrador de su organización."
blocked.tryAgain                         → "Tentar novamente" / "Try again" / "Intentar de nuevo"
blocked.portalError                      → "Erro ao abrir portal de pagamento. Entre em contato com o suporte." / "Error opening payment portal. Contact support." / "Error al abrir el portal de pago. Contacte con soporte."
```

#### Chaves Comuns Adicionais

```text
common.back                              → "Voltar" / "Back" / "Volver"
common.close                             → "Fechar" / "Close" / "Cerrar"
common.logout                            → "Sair" / "Logout" / "Salir"
common.required                          → "Obrigatório" / "Required" / "Obligatorio"
common.optional                          → "Opcional" / "Optional" / "Opcional"
common.max                               → "máx." / "max." / "máx."
status.active                            → "Ativo" / "Active" / "Activo"
status.inactive                          → "Inativo" / "Inactive" / "Inactivo"
status.pending                           → "Pendente" / "Pending" / "Pendiente"
status.blocked                           → "Bloqueado" / "Blocked" / "Bloqueado"
```

---

### Arquivos a Modificar

| Arquivo | Ação |
|---------|------|
| `src/locales/pt-BR.ts` | Adicionar ~130 novas chaves |
| `src/locales/en.ts` | Adicionar ~130 novas chaves (traduzidas) |
| `src/locales/es.ts` | Adicionar ~130 novas chaves (traduzidas) |
| `src/pages/AdminDashboard.tsx` | Substituir textos hardcoded por `t()` |
| `src/pages/TenantControl.tsx` | Substituir textos hardcoded por `t()` |
| `src/components/admin/CreateTenantDialog.tsx` | Substituir textos hardcoded por `t()` |
| `src/components/admin/EditTenantDialog.tsx` | Substituir textos hardcoded por `t()` |
| `src/components/admin/ManageAdminsDialog.tsx` | Substituir textos hardcoded por `t()` |
| `src/components/admin/TenantBillingDialog.tsx` | Substituir textos hardcoded por `t()` |
| `src/components/admin/PlatformHealthCard.tsx` | Substituir textos hardcoded por `t()` |
| `src/components/admin/CardDiagnosticsPanel.tsx` | Substituir textos hardcoded por `t()` |
| `src/components/billing/TenantBlockedScreen.tsx` | Substituir textos hardcoded por `t()` |

---

### Ordem de Implementação

1. **Fase 1:** Adicionar todas as chaves i18n nos 3 arquivos de tradução
2. **Fase 2:** Refatorar `AdminDashboard.tsx` e `TenantControl.tsx`
3. **Fase 3:** Refatorar componentes `admin/*`
4. **Fase 4:** Refatorar `TenantBlockedScreen.tsx`
5. **Fase 5:** Validação final

---

### Garantias SAFE GOLD

| Restrição | Status |
|-----------|--------|
| Auth inalterado | ✅ Garantido |
| Stripe inalterado | ✅ Garantido |
| Billing logic inalterada | ✅ Garantido |
| RLS inalterado | ✅ Garantido |
| Edge Functions inalteradas | ✅ Garantido |
| Routing inalterado | ✅ Garantido |
| Regras de negócio inalteradas | ✅ Garantido |

---

### Critérios de Aceite

- ✅ Trocar idioma PT → EN → ES muda 100% dos textos em Admin, Control Tower e Billing
- ✅ Nenhuma string em português aparece quando idioma = EN ou ES
- ✅ Nenhuma chave técnica aparece na UI
- ✅ Nenhum `as any` para mascarar ausência de chave
- ✅ Build sem warnings de i18n
- ✅ Admin, Control Tower e Billing totalmente consistentes

---

### Resultado Esperado

```text
P4.x-R1 — i18n SISTÊMICO CONCLUÍDO
├── Admin Global: 100% internacionalizado
├── Control Tower: 100% internacionalizado  
├── Billing: 100% internacionalizado
├── ~130 novas chaves criadas (PT/EN/ES)
├── 9 arquivos refatorados
├── Nenhum texto hardcoded restante
└── SAFE GOLD 100% preservado
```

