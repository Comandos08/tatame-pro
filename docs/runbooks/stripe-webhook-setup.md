# Runbook: Stripe Webhook Setup

**Owner:** Engineering
**Last reviewed:** 2026-03-10

---

## Overview

Tatame Pro uses Stripe webhooks to confirm payments and update subscription state.
The Edge Function `stripe-webhook` handles all incoming Stripe events.

**Webhook endpoint:**
```
https://<project-ref>.supabase.co/functions/v1/stripe-webhook
```

---

## 1. Create the Webhook in Stripe Dashboard

1. Go to **Stripe Dashboard → Developers → Webhooks**
2. Click **Add endpoint**
3. Set endpoint URL:
   ```
   https://<project-ref>.supabase.co/functions/v1/stripe-webhook
   ```
4. Select the following events to listen to:

   **Checkout:**
   - `checkout.session.completed`
   - `checkout.session.expired`

   **Subscriptions:**
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.subscription.trial_will_end`

   **Invoices:**
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `invoice.finalized`

5. Click **Add endpoint**
6. Copy the **Signing secret** (starts with `whsec_`)

---

## 2. Configure the Webhook Secret in Supabase

The webhook secret must be available as an Edge Function secret:

```bash
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_<your-secret>
```

Or via Supabase Dashboard:
1. Go to **Settings → Edge Functions**
2. Add secret: `STRIPE_WEBHOOK_SECRET` = `whsec_...`

Also verify these secrets are set:
- `STRIPE_SECRET_KEY` = `sk_live_...`

---

## 3. Test the Webhook Locally

Install the Stripe CLI:
```bash
brew install stripe/stripe-cli/stripe
stripe login
```

Forward events to local Supabase:
```bash
stripe listen --forward-to http://127.0.0.1:54321/functions/v1/stripe-webhook
```

Trigger a test event:
```bash
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
stripe trigger invoice.payment_failed
```

Watch the output in the `stripe listen` terminal for success/failure.

---

## 4. Verify Webhook Health in Production

After deploying, verify recent events in Stripe Dashboard:
1. Go to **Stripe Dashboard → Developers → Webhooks → Your endpoint**
2. Check **Recent deliveries** — all should show `200 OK`
3. If you see failures, click the event to see the response body

Common failure reasons:
- `STRIPE_WEBHOOK_SECRET` not set or incorrect → signature verification fails → 400
- Edge Function cold start timeout → retry automatically by Stripe
- Database RLS blocking insert → check Edge Function logs in Supabase Dashboard

---

## 5. Webhook Retry Policy

Stripe retries failed webhook deliveries with exponential backoff over 3 days.

To manually retry a failed event:
1. Go to **Webhooks → Recent deliveries**
2. Click the failed event
3. Click **Resend**

---

## 6. Production Checklist

- [ ] Webhook endpoint registered in Stripe Dashboard (production mode, not test mode)
- [ ] Correct events selected (see list above)
- [ ] `STRIPE_WEBHOOK_SECRET` set in Supabase Edge Function secrets
- [ ] `STRIPE_SECRET_KEY` (live key) set in Supabase Edge Function secrets
- [ ] At least one test event delivered successfully
- [ ] Recent deliveries show 200 OK for the last 24h
