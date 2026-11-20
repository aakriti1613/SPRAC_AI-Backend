import { useState, type FormEvent } from "react";
import type { CheckoutPaymentProps } from "@contracts";
import { Icon } from "@core/icons";
import { SparcLink } from "@core/link";
import { money } from "@core/money";
import { cn } from "@core/ui";
import { FieldShell, Section, SectionTitle } from "../_shared/basic";
import { useSkin } from "../_skins/context";

const GATEWAY = { razorpay: "Razorpay", stripe: "Stripe" } as const;

export default function CheckoutPaymentView({ heading, lines, currency, total, mode, onPay, paying, error, backHref }: CheckoutPaymentProps) {
  const s = useSkin();
  const [v, setV] = useState({ name: "", email: "", phone: "", address: "", cardNumber: "", cardExpiry: "", cardCvc: "" });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void onPay(mode === "test" ? v : { name: v.name, email: v.email, phone: v.phone, address: v.address });
  };
  return (
    <Section>
      <SectionTitle title={heading} />
      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <form onSubmit={submit} className={cn(s.card, "space-y-4 p-6")}>
          <FieldShell id="co-name" label="Full name" required>
            <input id="co-name" required className={s.input} value={v.name} onChange={set("name")} autoComplete="name" />
          </FieldShell>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldShell id="co-email" label="Email" required>
              <input id="co-email" type="email" required className={s.input} value={v.email} onChange={set("email")} autoComplete="email" />
            </FieldShell>
            <FieldShell id="co-phone" label="Phone" required>
              <input id="co-phone" type="tel" required className={s.input} value={v.phone} onChange={set("phone")} autoComplete="tel" />
            </FieldShell>
          </div>
          <FieldShell id="co-address" label="Delivery address" required>
            <textarea id="co-address" required rows={3} className={cn(s.input, "h-auto py-2")} value={v.address} onChange={set("address")} autoComplete="street-address" />
          </FieldShell>

          {mode === "test" ? (
            <fieldset className="space-y-4 rounded-sparc border border-border p-4">
              <legend className="px-1 text-sm font-medium text-fg">Card details</legend>
              <p className="rounded-sparc bg-primary-soft p-3 text-sm text-fg" role="note">
                <strong>Test mode:</strong> no real money is charged. Use card 4242 4242 4242 4242, any future date and any 3 digits. (4000 0000 0000 0002 is declined.)
              </p>
              <FieldShell id="co-card" label="Card number" required>
                <input id="co-card" required inputMode="numeric" className={s.input} value={v.cardNumber} onChange={set("cardNumber")} autoComplete="cc-number" placeholder="4242 4242 4242 4242" />
              </FieldShell>
              <div className="grid gap-4 sm:grid-cols-2">
                <FieldShell id="co-exp" label="Expiry (MM/YY)" required>
                  <input id="co-exp" required className={s.input} value={v.cardExpiry} onChange={set("cardExpiry")} autoComplete="cc-exp" placeholder="12/30" />
                </FieldShell>
                <FieldShell id="co-cvc" label="Security code" required>
                  <input id="co-cvc" required inputMode="numeric" className={s.input} value={v.cardCvc} onChange={set("cardCvc")} autoComplete="cc-csc" placeholder="123" />
                </FieldShell>
              </div>
            </fieldset>
          ) : (
            <p className="flex items-start gap-2 rounded-sparc bg-primary-soft p-3 text-sm text-fg" role="note">
              <Icon name="Lock" className="mt-0.5 h-4 w-4 shrink-0" /> Your payment is processed securely by {GATEWAY[mode]}. We never see your card details.
            </p>
          )}

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button type="submit" className={s.button("primary", "min-w-40")} disabled={paying || lines.length === 0}>
              {paying ? "Processing…" : `Pay ${money(total, currency)}`}
            </button>
            <SparcLink href={backHref} className={s.button("outline")}>
              Back to cart
            </SparcLink>
          </div>
        </form>

        <aside className={cn(s.card, "h-fit space-y-3 p-6")} aria-label="Order summary">
          <h3 className="font-semibold text-fg">Your order</h3>
          <ul className="space-y-2 text-sm">
            {lines.map((l) => (
              <li key={l.productId} className="flex justify-between gap-3 text-fg">
                <span>
                  {l.name} <span className="text-muted">× {l.qty}</span>
                </span>
                <span>{money(l.price * l.qty, currency)}</span>
              </li>
            ))}
          </ul>
          <p className="flex justify-between border-t border-border pt-3 font-semibold text-fg">
            <span>Total</span>
            <span>{money(total, currency)}</span>
          </p>
        </aside>
      </div>
    </Section>
  );
}
