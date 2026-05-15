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

## 6. Connect (marketplace) webhook — SECOND endpoint

Tatame Pro uses Stripe Connect for tenant payouts. Connect account/payout
events are delivered to a **separate** endpoint with **its own signing
secret**, handled by the `stripe-connect-webhook` function (distinct from the
platform `stripe-webhook`).

### 6.1 Register the Connect endpoint

1. Stripe Dashboard → **Developers → Webhooks → Add endpoint**
2. URL: `https://<project-ref>.supabase.co/functions/v1/stripe-connect-webhook`
3. **CRITICAL:** under *Listen to events on*, select **Connected accounts**
   (not "Your account"). This is what makes Stripe deliver events with the
   `account` field set.
4. Select these events:
   - `account.updated`
   - `account.application.deauthorized`
   - `payout.paid`
   - `payout.failed`
   - `charge.refunded`
5. Copy the signing secret (`whsec_...`) → set `STRIPE_CONNECT_WEBHOOK_SECRET`
   in Supabase Edge Function secrets. **Do not reuse `STRIPE_WEBHOOK_SECRET`** —
   the two endpoints have different secrets.

### 6.2 What each event does

| Event | Effect |
|---|---|
| `account.updated` | Syncs `charges/payouts/details_submitted` into `tenants` |
| `account.application.deauthorized` | Flags tenant not-ready, CRITICAL alert |
| `payout.paid` | Audit trail of payout reaching the tenant bank |
| `payout.failed` | CRITICAL institutional event — money did NOT arrive |
| `charge.refunded` | Refund audit trail on the connected account |

---

## 7. Production Checklist

- [ ] Platform webhook endpoint registered (production mode, not test mode)
- [ ] Correct platform events selected (see §3)
- [ ] `STRIPE_WEBHOOK_SECRET` set in Supabase Edge Function secrets
- [ ] `STRIPE_SECRET_KEY` (live key) set in Supabase Edge Function secrets
- [ ] **Connect** endpoint registered with *Connected accounts* scope (§6.1)
- [ ] `STRIPE_CONNECT_WEBHOOK_SECRET` set (distinct from platform secret)
- [ ] Stripe Connect enabled, Express set as default account type
- [ ] At least one test event delivered successfully on BOTH endpoints
- [ ] Recent deliveries show 200 OK for the last 24h on BOTH endpoints
