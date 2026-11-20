import type { CartProps } from "@contracts";
import { Icon } from "@core/icons";
import { SparcLink } from "@core/link";
import { money } from "@core/money";
import { cn } from "@core/ui";
import { Section, SectionTitle } from "../_shared/basic";
import { useSkin } from "../_skins/context";

export default function CartView({ heading, lines, currency, subtotal, onQty, onRemove, checkoutHref, shopHref }: CartProps) {
  const s = useSkin();
  if (lines.length === 0) {
    return (
      <Section>
        <SectionTitle title={heading} />
        <div className={cn(s.card, "flex flex-col items-center gap-4 p-10 text-center")}>
          <Icon name="ShoppingCart" className="h-10 w-10 text-muted" />
          <p className="text-fg">Your cart is empty.</p>
          <SparcLink href={shopHref} className={s.button("primary")}>
            Continue shopping
          </SparcLink>
        </div>
      </Section>
    );
  }
  return (
    <Section>
      <SectionTitle title={heading} />
      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <ul className="space-y-4">
          {lines.map((l) => (
            <li key={l.productId} className={cn(s.card, "flex flex-wrap items-center gap-4 p-4")}>
              {l.image ? (
                <img src={l.image} alt="" className="h-16 w-16 rounded-sparc object-cover" />
              ) : (
                <span className="flex h-16 w-16 items-center justify-center rounded-sparc bg-primary-soft text-primary" aria-hidden>
                  <Icon name="Package" className="h-6 w-6" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium text-fg">{l.name}</p>
                <p className="text-sm text-muted">{money(l.price, currency)} each</p>
              </div>
              <div className="flex items-center gap-2" role="group" aria-label={`Quantity of ${l.name}`}>
                <button type="button" className={s.button("outline", "h-9 w-9 px-0")} onClick={() => onQty(l.productId, l.qty - 1)} aria-label={`Decrease quantity of ${l.name}`}>
                  <Icon name="Minus" />
                </button>
                <span className="w-8 text-center text-fg" aria-live="polite">
                  {l.qty}
                </span>
                <button type="button" className={s.button("outline", "h-9 w-9 px-0")} onClick={() => onQty(l.productId, l.qty + 1)} aria-label={`Increase quantity of ${l.name}`}>
                  <Icon name="Plus" />
                </button>
              </div>
              <p className="w-24 text-right font-semibold text-fg">{money(l.price * l.qty, currency)}</p>
              <button type="button" className={s.button("ghost", "h-9 w-9 px-0 text-danger")} onClick={() => onRemove(l.productId)} aria-label={`Remove ${l.name} from cart`}>
                <Icon name="Trash2" />
              </button>
            </li>
          ))}
        </ul>
        <aside className={cn(s.card, "h-fit space-y-4 p-6")} aria-label="Order summary">
          <h3 className="font-semibold text-fg">Order summary</h3>
          <p className="flex justify-between text-fg">
            <span>Subtotal</span>
            <span className="font-semibold">{money(subtotal, currency)}</span>
          </p>
          <SparcLink href={checkoutHref} className={s.button("primary", "w-full")}>
            Go to checkout
          </SparcLink>
          <SparcLink href={shopHref} className={s.button("outline", "w-full")}>
            Continue shopping
          </SparcLink>
        </aside>
      </div>
    </Section>
  );
}
