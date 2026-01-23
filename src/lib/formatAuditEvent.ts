// src/lib/formatAuditEvent.ts
// Human-readable audit event formatter for TATAME platform

export interface FormattedAuditEvent {
  title: string;
  description: string;
  before?: string;
  after?: string;
  meta?: string;
}

/**
 * Formats an audit event into a human-readable format.
 * Uses type guards to safely extract metadata values.
 */
export function formatAuditEvent(
  eventType: string,
  metadata: Record<string, unknown>  // Type-safe metadata
): FormattedAuditEvent {
  // Type guards para extrair valores com segurança
  const reason = typeof metadata.reason === 'string' ? metadata.reason : undefined;
  const previousStatus = typeof metadata.previous_status === 'string' ? metadata.previous_status : undefined;
  const newStatus = typeof metadata.new_status === 'string' ? metadata.new_status : undefined;
  const previousMode = typeof metadata.previous_mode === 'string' ? metadata.previous_mode : 'MANUAL';
  const days = typeof metadata.days === 'number' ? metadata.days : undefined;
  const athleteName = typeof metadata.athlete_name === 'string' ? metadata.athlete_name : undefined;
  const levelName = typeof metadata.level_name === 'string' ? metadata.level_name : undefined;
  const coachName = typeof metadata.coach_name === 'string' ? metadata.coach_name : undefined;
  const amountCents = typeof metadata.amount_cents === 'number' ? metadata.amount_cents : undefined;

  // Eventos de billing override (prefixo BILLING_OVERRIDE_)
  if (eventType.startsWith('BILLING_OVERRIDE_')) {
    switch (eventType) {
      case 'BILLING_OVERRIDE_RESET':
        return {
          title: 'Override Removido',
          description: 'Billing retornado ao controle do Stripe',
          before: previousMode,
          after: 'STRIPE',
          meta: reason ? `Motivo: ${reason}` : undefined,
        };
      case 'BILLING_OVERRIDE_EXTEND_TRIAL':
        return {
          title: 'Trial Estendido',
          description: days ? `Trial estendido por ${days} dias` : 'Trial estendido manualmente',
          before: previousStatus ?? '—',
          after: 'TRIALING',
          meta: reason ? `Motivo: ${reason}` : undefined,
        };
      case 'BILLING_OVERRIDE_MARK_PAID':
        return {
          title: 'Marcado como Pago',
          description: 'Billing marcado como pago manualmente',
          before: previousStatus ?? '—',
          after: 'ACTIVE',
          meta: reason ? `Motivo: ${reason}` : undefined,
        };
      case 'BILLING_OVERRIDE_BLOCK':
        return {
          title: 'Tenant Bloqueado',
          description: 'Acesso bloqueado manualmente',
          before: previousStatus ?? '—',
          after: 'PAST_DUE',  // Status técnico real (não "BLOCKED")
          meta: reason ? `Motivo: ${reason}` : undefined,
        };
      case 'BILLING_OVERRIDE_UNBLOCK':
        return {
          title: 'Tenant Desbloqueado',
          description: 'Acesso restaurado manualmente',
          before: 'PAST_DUE',
          after: newStatus ?? 'ACTIVE',  // Fallback correto para ACTIVE
          meta: reason ? `Motivo: ${reason}` : undefined,
        };
      default:
        return {
          title: 'Override de Billing',
          description: eventType.replace('BILLING_OVERRIDE_', '').replace(/_/g, ' '),
          before: previousStatus ?? '—',
          after: newStatus ?? '—',
          meta: reason ? `Motivo: ${reason}` : undefined,
        };
    }
  }

  // Eventos conhecidos (não-billing)
  switch (eventType) {
    case 'MEMBERSHIP_CREATED':
      return {
        title: 'Filiação Criada',
        description: athleteName ? `Atleta: ${athleteName}` : 'Nova filiação registrada',
      };
    case 'MEMBERSHIP_PAID': {
      const amount = amountCents !== undefined ? `R$ ${(amountCents / 100).toFixed(2)}` : '';
      return {
        title: 'Pagamento Confirmado',
        description: amount || 'Pagamento processado com sucesso',
      };
    }
    case 'MEMBERSHIP_APPROVED':
      return {
        title: 'Filiação Aprovada',
        description: athleteName ? `Atleta: ${athleteName}` : 'Filiação aprovada',
        before: 'PENDING_REVIEW',
        after: 'APPROVED',
      };
    case 'MEMBERSHIP_REJECTED':
      return {
        title: 'Filiação Rejeitada',
        description: reason ? `Motivo: ${reason}` : 'Filiação não aprovada',
        before: 'PENDING_REVIEW',
        after: 'REJECTED',
      };
    case 'MEMBERSHIP_EXPIRED':
      return {
        title: 'Filiação Expirada',
        description: 'Filiação expirou automaticamente',
        before: 'ACTIVE',
        after: 'EXPIRED',
      };
    case 'MEMBERSHIP_CANCELLED':
      return {
        title: 'Filiação Cancelada',
        description: reason ? `Motivo: ${reason}` : 'Filiação cancelada',
        before: previousStatus ?? 'ACTIVE',
        after: 'CANCELLED',
      };
    case 'MEMBERSHIP_ABANDONED_CLEANUP':
      return {
        title: 'Filiação Abandonada',
        description: 'Filiação removida por abandono',
      };
    case 'DIPLOMA_ISSUED':
      return {
        title: 'Diploma Emitido',
        description: levelName ? `Graduação: ${levelName}` : 'Novo diploma gerado',
      };
    case 'GRADING_RECORDED':
      return {
        title: 'Graduação Registrada',
        description: levelName ? `Nova graduação: ${levelName}` : 'Graduação registrada',
        meta: coachName ? `Por: ${coachName}` : undefined,
      };
    case 'GRADING_NOTIFICATION_SENT':
      return {
        title: 'Notificação de Graduação',
        description: 'Atleta notificado sobre nova graduação',
      };
    case 'LOGIN_SUCCESS':
      return {
        title: 'Login Realizado',
        description: 'Usuário autenticado com sucesso',
      };
    case 'LOGIN_FAILED':
      return {
        title: 'Login Falhou',
        description: reason ? `Motivo: ${reason}` : 'Tentativa de login sem sucesso',
      };
    case 'PASSWORD_RESET_REQUESTED':
      return {
        title: 'Reset de Senha Solicitado',
        description: 'Email de recuperação enviado',
      };
    case 'PASSWORD_RESET_COMPLETED':
      return {
        title: 'Senha Alterada',
        description: 'Senha redefinida com sucesso',
      };
    case 'TENANT_SETTINGS_UPDATED':
      return {
        title: 'Configurações Atualizadas',
        description: 'Configurações da organização alteradas',
      };
    case 'DIGITAL_CARD_GENERATED':
      return {
        title: 'Carteirinha Gerada',
        description: 'Nova carteirinha digital emitida',
      };
    case 'RENEWAL_REMINDER_SENT':
      return {
        title: 'Lembrete de Renovação',
        description: 'Email de renovação enviado ao atleta',
      };
    case 'TENANT_SUBSCRIPTION_CREATED':
      return {
        title: 'Assinatura Criada',
        description: 'Nova assinatura de plano iniciada',
      };
    case 'TENANT_SUBSCRIPTION_CANCELLED':
      return {
        title: 'Assinatura Cancelada',
        description: reason ? `Motivo: ${reason}` : 'Assinatura encerrada',
      };
    case 'TENANT_PAYMENT_SUCCEEDED':
      return {
        title: 'Pagamento Confirmado',
        description: amountCents !== undefined 
          ? `Valor: R$ ${(amountCents / 100).toFixed(2)}` 
          : 'Pagamento processado',
      };
    case 'TENANT_PAYMENT_FAILED':
      return {
        title: 'Pagamento Falhou',
        description: reason ? `Motivo: ${reason}` : 'Falha no processamento',
      };
    case 'TRIAL_END_NOTIFICATION_SENT':
      return {
        title: 'Aviso de Fim de Trial',
        description: 'Notificação de expiração do período de teste enviada',
      };
    default:
      // Fallback: humaniza o nome do evento
      return {
        title: eventType.replace(/_/g, ' '),
        description: '',
      };
  }
}
