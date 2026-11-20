# Payments in a SPARC shop

A generated store (`websiteType: "ecommerce"`) takes payment in one of three modes.
The mode lives in the site config: `store.payment`.

| Mode | What happens | Real money? |
|---|---|---|
| `test` (default) | The page checks a practice card itself. Nothing leaves the browser. | No |
| `razorpay` | The page asks **your server function** to take the payment. | Yes |
| `stripe` | Same, for Stripe. | Yes |

A new store always starts in `test` mode. Switching to a real gateway is a deliberate edit:

```json
"store": { "currency": "INR", "payment": { "mode": "razorpay", "endpoint": "https://YOUR-PROJECT.supabase.co/functions/v1/pay" } }
```

The config check refuses a real mode without an `endpoint`.

## Practice mode

| Card | Result |
|---|---|
| `4242 4242 4242 4242`, any future expiry, any 3 digits | Paid |
| `4000 0000 0000 0002` | Declined |
| A number that fails the card check, a past expiry, or a short code | Error message, nothing happens |

The checkout page shows these numbers, so a shopper cannot mistake it for a live store.

## The rule that keeps real payments safe

**The page never holds a secret key and never sees a card number in real modes.**
The page only sends the order and trusts only the server's answer.

## What the page sends (real modes)

`POST <store.payment.endpoint>` with JSON:

```json
{
  "gateway": "razorpay",
  "orderId": "ORD-7K3F9Q",
  "amount": 698,
  "currency": "INR",
  "customer": { "name": "...", "email": "...", "phone": "...", "address": "..." }
}
```

## What the server function must answer

Success, and only after the gateway has confirmed the payment:

```json
{ "ok": true, "paymentId": "pay_abc123" }
```

Anything else is a failure and the shopper is told they were not charged:

```json
{ "ok": false, "error": "Your bank declined the payment." }
```

The page treats a response as paid **only** when the HTTP status is 2xx, `ok` is exactly `true`, and `paymentId` is a non-empty string.

## What your server function must do

1. **Do not trust the `amount` from the page.** Look the products up on the server and work out the price again. The page only knows the cart, and a visitor can change it.
2. Create the payment with the gateway using your secret key (kept in the function's secrets, never in the website).
3. Wait for the gateway to confirm. For Razorpay check the payment signature (`HMAC-SHA256` of `order_id|payment_id` with your key secret). For Stripe check the webhook signature with `stripe.webhooks.constructEvent`.
4. Only then answer `{ "ok": true, "paymentId": ... }`.
5. Allow requests only from your site's address (CORS).

## What is tested, and what is not

Tested (automatic tests): the practice flow, the card and expiry checks, the cart maths, and how the page reacts to every kind of server answer (good, `ok:false`, missing `paymentId`, HTTP error, network down). A test also checks that card details are never sent to the server.

**Not tested: a real Razorpay or Stripe account.** The server function itself is not part of the generated site and has not been written or run here. Test it with the gateway's test keys before going live.

## After payment

The shell tells the shop about the paid order through the same form endpoint the contact form uses (`VITE_FORM_ENDPOINT`, kind `order`).
If that message fails, the shopper still sees their confirmation (they have paid, so it must not be undone) and the error is only logged.
For a real shop, make the server function also save the order, so the shop does not depend on the browser.
