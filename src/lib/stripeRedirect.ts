/**
 * Validates and performs a safe redirect to a Stripe URL.
 * Blocks redirects to non-Stripe domains to prevent open redirect attacks.
 *
 * @param url - URL to redirect to
 * @returns true if redirect was performed, false if blocked
 */
export function safeStripeRedirect(url: string | undefined | null): boolean {
  if (!url) return false;

  try {
    const parsed = new URL(url);
    const isStripe = parsed.hostname === "checkout.stripe.com"
      || parsed.hostname === "billing.stripe.com"
      || parsed.hostname.endsWith(".stripe.com");

    if (!isStripe) {
      console.error("[SECURITY] Blocked non-Stripe redirect:", parsed.hostname);
      return false;
    }

    if (parsed.protocol !== "https:") {
      console.error("[SECURITY] Blocked non-HTTPS Stripe redirect");
      return false;
    }

    window.location.href = url;
    return true;
  } catch {
    console.error("[SECURITY] Invalid redirect URL");
    return false;
  }
}
