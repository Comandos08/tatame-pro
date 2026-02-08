-- P4.2.A: Enable realtime for audit_logs (INSERT events only)
-- SAFE GOLD: Only INSERT events will be captured, no UPDATE/DELETE exposure

ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;

COMMENT ON TABLE public.audit_logs IS 'Audit log with realtime enabled for observability alerts (P4.2)';