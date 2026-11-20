// Payment, written once. The page never holds secret keys.
//   mode "test"      practice cards only, checked here. Nothing real is charged.
//   mode "razorpay"  the page asks YOUR server function (store.payment.endpoint)
//   mode "stripe"    to create and confirm the payment, and trusts only its answer.
// The server function must check the gateway's webhook signature before it
// says ok:true. The contract is described in docs/PAYMENTS.md.
export type PaymentMode = "test" | "razorpay" | "stripe";

export interface PayRequest {
  orderId: string;
  amount: number;
  currency: string;
  customer: { name: string; email: string; phone: string; address: string };
  card?: { number: string; expiry: string; cvc: string };
}
export type PayResult = { ok: true; paymentId: string } | { ok: false; error: string };

/** Practice card numbers, shown to the shopper in test mode. */
export const TEST_CARDS = {
  success: "4242 4242 4242 4242",
  declined: "4000 0000 0000 0002",
} as const;

export function luhnValid(digits: string): boolean {
  const d = digits.replace(/\D/g, "");
  if (d.length < 12) return false;
  let sum = 0;
  for (let i = 0; i < d.length; i += 1) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

/** "MM/YY" that is still in the future. */
export function expiryValid(text: string, now = new Date()): boolean {
  const m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(text.trim());
  if (!m) return false;
  const month = Number(m[1]);
  const year = 2000 + Number(m[2]);
  if (month < 1 || month > 12) return false;
  return year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1);
}

export function checkDetails(req: PayRequest): string | null {
  const c = req.customer;
  if (!c.name.trim()) return "Please enter your name.";
  if (!/^\S+@\S+\.\S+$/.test(c.email)) return "Please enter a valid email.";
  if (c.phone.replace(/\D/g, "").length < 7) return "Please enter a valid phone number.";
  if (!c.address.trim()) return "Please enter your delivery address.";
  if (!(req.amount > 0)) return "Your cart is empty.";
  return null;
}

/** Practice payment: no network, no real money. */
export async function payInTestMode(req: PayRequest): Promise<PayResult> {
  const bad = checkDetails(req);
  if (bad) return { ok: false, error: bad };
  const card = req.card;
  if (!card || !luhnValid(card.number)) return { ok: false, error: "That card number is not valid. In test mode use 4242 4242 4242 4242." };
  if (!expiryValid(card.expiry)) return { ok: false, error: "The card expiry must be a future date like 12/30." };
  if (!/^\d{3,4}$/.test(card.cvc.trim())) return { ok: false, error: "Please enter the 3-digit security code." };
  if (card.number.replace(/\D/g, "") === TEST_CARDS.declined.replace(/\s/g, "")) {
    return { ok: false, error: "Your card was declined (test card). Try 4242 4242 4242 4242." };
  }
  return { ok: true, paymentId: `test_${req.orderId.toLowerCase()}` };
}

/** Real gateway: the server function does the work and answers { ok, paymentId } or { ok:false, error }. */
export async function payViaServer(
  req: PayRequest,
  mode: Exclude<PaymentMode, "test">,
  endpoint: string,
  fetchFn: typeof fetch = fetch
): Promise<PayResult> {
  const bad = checkDetails(req);
  if (bad) return { ok: false, error: bad };
  try {
    const res = await fetchFn(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ gateway: mode, orderId: req.orderId, amount: req.amount, currency: req.currency, customer: req.customer }),
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; paymentId?: string; error?: string };
    if (res.ok && body.ok === true && typeof body.paymentId === "string" && body.paymentId) return { ok: true, paymentId: body.paymentId };
    return { ok: false, error: body.error || "The payment did not go through. You have not been charged." };
  } catch {
    return { ok: false, error: "Could not reach the payment service. You have not been charged." };
  }
}

export function pay(req: PayRequest, opts: { mode: PaymentMode; endpoint?: string; fetchFn?: typeof fetch }): Promise<PayResult> {
  if (opts.mode === "test") return payInTestMode(req);
  if (!opts.endpoint) return Promise.resolve({ ok: false, error: "Payments are not set up for this store yet." });
  return payViaServer(req, opts.mode, opts.endpoint, opts.fetchFn);
}
