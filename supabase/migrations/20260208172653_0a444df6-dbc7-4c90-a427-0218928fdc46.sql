-- PI-ONB-001: Índice de idempotência para memberships
-- Garante que um usuário não pode ter múltiplas solicitações ativas/pendentes no mesmo tenant

CREATE UNIQUE INDEX IF NOT EXISTS uq_membership_applicant_active_or_pending
ON public.memberships (tenant_id, applicant_profile_id)
WHERE status IN ('PENDING_REVIEW', 'ACTIVE', 'APPROVED');

-- Comentário para documentação
COMMENT ON INDEX uq_membership_applicant_active_or_pending IS 
'PI-ONB-001: Previne duplicação de solicitações de entrada em tenant. Um usuário pode ter no máximo uma solicitação PENDING_REVIEW, ACTIVE ou APPROVED por tenant.';