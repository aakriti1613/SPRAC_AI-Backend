import type { ProductPageProps } from "@contracts";
import { Icon } from "@core/icons";
import { SparcLink } from "@core/link";
import { money } from "@core/money";
import { cn } from "@core/ui";
import { Section } from "../_shared/basic";
import { useSkin } from "../_skins/context";

export default function ProductPageView({ product: p, currency, inCart, onAdd, backHref, cartHref }: ProductPageProps) {
  const s = useSkin();
  const soldOut = p.inStock === false;
  return (
    <Section>
      <SparcLink href={backHref} className="mb-6 inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <Icon name="ChevronLeft" /> Back to all products
      </SparcLink>
      <s.Reveal>
        <div className="grid gap-10 md:grid-cols-2">
          {p.image ? (
            <img src={p.image} alt={p.name} className={cn(s.card, "aspect-square w-full object-cover")} />
          ) : (
            <span className={cn(s.card, "flex aspect-square w-full items-center justify-center bg-primary-soft text-primary")} aria-hidden>
              <Icon name="Package" className="h-16 w-16" />
            </span>
          )}
          <div>
            {(p.badge || p.category) && (
              <p className="mb-3 flex flex-wrap gap-2 text-xs">
                {p.badge && <span className="rounded-sparc bg-primary px-2 py-0.5 text-primary-foreground">{p.badge}</span>}
                {p.category && <span className="text-muted">{p.category}</span>}
              </p>
            )}
            <h1 className={s.heading}>{p.name}</h1>
            <p className="mt-4 flex items-baseline gap-3">
              <span className="text-3xl font-bold text-fg">{money(p.price, currency)}</span>
              {p.compareAtPrice !== undefined && p.compareAtPrice > p.price && (
                <span className="text-lg text-muted line-through">{money(p.compareAtPrice, currency)}</span>
              )}
            </p>
            {p.description && <p className="mt-6 text-muted">{p.description}</p>}
            <p className="mt-4 text-sm text-fg">{soldOut ? "Currently sold out." : "In stock."}</p>
            <button type="button" className={s.button("primary", "mt-6")} disabled={soldOut} onClick={() => onAdd(p.id)}>
              <Icon name="ShoppingCart" /> {soldOut ? "Sold out" : "Add to cart"}
            </button>
            {inCart > 0 && (
              <p className="mt-4 text-sm text-fg" role="status">
                {inCart} in your cart.{" "}
                <SparcLink href={cartHref} className="text-primary underline">
                  View cart
                </SparcLink>
              </p>
            )}
          </div>
        </div>
      </s.Reveal>
    </Section>
  );
}
