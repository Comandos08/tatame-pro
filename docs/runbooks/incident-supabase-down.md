# Runbook: Supabase Incident Response

**Severity:** P1 (platform unavailable)
**Owner:** On-call engineer
**Last reviewed:** 2026-03-10

---

## 1. Detection

Signs that Supabase is down:
- Auth endpoints returning 5xx
- Database queries timing out
- Edge Functions returning 503
- Users unable to log in

**First check:** https://status.supabase.com

---

## 2. Immediate Actions (< 5 min)

1. **Confirm the incident** — verify status.supabase.com shows an active incident for your region
2. **Do NOT restart Edge Functions or rotate secrets** — this rarely helps and wastes time
3. **Communicate to team** via Slack/WhatsApp: "Supabase incident in progress — monitoring"
4. **Set a status page update** if you have Betterstack/UptimeRobot:
   - Status: "Degraded — investigating"
   - Message: "Our infrastructure provider is experiencing issues. We are monitoring."

---

## 3. During the Incident

### What to monitor
- [ ] Supabase status page for updates
- [ ] Your project dashboard — check if RLS is still enforced (it should be)
- [ ] Error rate in your observability tool (Sentry)

### What NOT to do
- Do NOT apply database migrations during an incident
- Do NOT rotate API keys or secrets
- Do NOT redeploy Edge Functions unless explicitly requested by Supabase support

### Read-only fallback (if partial availability)
If the frontend loads but auth fails:
- The Vite SPA serves static assets from CDN (Vercel/Netlify) — frontend stays accessible
- Display a maintenance banner if API errors exceed a threshold

---

## 4. Recovery Verification (after Supabase resolves)

Run these checks in order:

```bash
# 1. Verify auth is working
curl -X POST https://<project-ref>.supabase.co/auth/v1/token?grant_type=password \
  -H "apikey: <anon-key>" \
  -d '{"email":"test@example.com","password":"test"}'

# 2. Verify database connectivity
curl https://<project-ref>.supabase.co/rest/v1/tenants?select=id&limit=1 \
  -H "apikey: <anon-key>" \
  -H "Authorization: Bearer <service-role-key>"

# 3. Verify Edge Functions
curl https://<project-ref>.supabase.co/functions/v1/audit-rls \
  -H "Authorization: Bearer <service-role-key>"
```

- [ ] Auth login works
- [ ] Database queries return data
- [ ] Edge Functions respond (check any health-check endpoint)
- [ ] Stripe webhooks are not backed up (check Stripe Dashboard → Webhooks → Recent deliveries)
- [ ] Scheduled jobs (cron) have not missed critical windows

---

## 5. Post-Incident

Within 24 hours:
- [ ] Update status page to "Operational"
- [ ] Write incident post-mortem (5 min): what broke, duration, user impact, prevention
- [ ] Check if any cron jobs need manual trigger (e.g., `check-membership-renewal`)
- [ ] Verify no Stripe webhooks were dropped (retry failed events from Stripe Dashboard)

---

## Contacts

- Supabase Support: https://supabase.com/dashboard/support
- Supabase Status: https://status.supabase.com
- Stripe Status: https://www.stripestatus.com
