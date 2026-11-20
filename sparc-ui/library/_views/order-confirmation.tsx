import type { OrderConfirmationProps } from "@contracts";
import { Icon } from "@core/icons";
import { SparcLink } from "@core/link";
import { money } from "@core/money";
import { cn } from "@core/ui";
import { Section } from "../_shared/basic";
import { useSkin } from "../_skins/context";

export default function OrderConfirmationView({ heading, orderId, total, currency, email, lines, continueHref }: OrderConfirmationProps) {
  const s = useSkin();
  return (
    <Section>
      <s.Reveal>
        <div className={cn(s.card, "mx-auto max-w-xl space-y-5 p-8 text-center")} role="status">
          <Icon name="CircleCheck" className="mx-auto h-12 w-12 text-success" />
          <h1 className={s.heading}>{heading}</h1>
          <p className="text-fg">
            Your order number is <strong>{orderId}</strong>.
          </p>
          {email && <p className="text-sm text-muted">A receipt will be sent to {email}.</p>}
          <ul className="space-y-2 border-t border-border pt-4 text-left text-sm">
            {lines.map((l) => (
              <li key={l.productId} className="flex justify-between gap-3 text-fg">
                <span>
                  {l.name} <span className="text-muted">× {l.qty}</span>
                </span>
                <span>{money(l.price * l.qty, currency)}</span>
              </li>
            ))}
          </ul>
          <p className="flex justify-between border-t border-border pt-4 text-left font-semibold text-fg">
            <span>Paid</span>
            <span>{money(total, currency)}</span>
          </p>
          <SparcLink href={continueHref} className={s.button("primary")}>
            Continue shopping
          </SparcLink>
        </div>
      </s.Reveal>
    </Section>
  );
}
