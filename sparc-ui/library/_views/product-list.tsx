import type { ProductListProps } from "@contracts";
import { Icon } from "@core/icons";
import { SparcLink } from "@core/link";
import { money } from "@core/money";
import { cn } from "@core/ui";
import { Section, SectionTitle } from "../_shared/basic";
import { useSkin } from "../_skins/context";

export default function ProductListView({ heading, subtitle, products, currency, productHref, onAdd }: ProductListProps) {
  const s = useSkin();
  return (
    <Section>
      <SectionTitle title={heading} subtitle={subtitle} />
      <s.List className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => {
          const soldOut = p.inStock === false;
          return (
            <s.Item key={p.id} className="h-full">
              <s.Hover className="h-full">
                <div className={cn(s.cardInteractive, "flex h-full flex-col overflow-hidden")}>
                  <SparcLink href={productHref(p.id)} className="block" ariaLabel={`View ${p.name}`}>
                    {p.image ? (
                      <img src={p.image} alt={p.name} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                    ) : (
                      <span className="flex aspect-[4/3] w-full items-center justify-center bg-primary-soft text-primary" aria-hidden>
                        <Icon name="Package" className="h-10 w-10" />
                      </span>
                    )}
                  </SparcLink>
                  <div className="flex flex-1 flex-col p-5">
                    {(p.badge || p.category) && (
                      <p className="mb-2 flex flex-wrap gap-2 text-xs">
                        {p.badge && <span className="rounded-sparc bg-primary px-2 py-0.5 text-primary-foreground">{p.badge}</span>}
                        {p.category && <span className="text-muted">{p.category}</span>}
                      </p>
                    )}
                    <h3 className="font-semibold text-fg">
                      <SparcLink href={productHref(p.id)}>{p.name}</SparcLink>
                    </h3>
                    {p.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{p.description}</p>}
                    <p className="mt-3 flex items-baseline gap-2">
                      <span className="text-lg font-bold text-fg">{money(p.price, currency)}</span>
                      {p.compareAtPrice !== undefined && p.compareAtPrice > p.price && (
                        <span className="text-sm text-muted line-through">{money(p.compareAtPrice, currency)}</span>
                      )}
                    </p>
                    <button
                      type="button"
                      className={s.button("primary", "mt-4 w-full")}
                      disabled={soldOut}
                      onClick={() => onAdd(p.id)}
                      aria-label={soldOut ? `Sold out: ${p.name}` : `Add to cart: ${p.name}`}
                    >
                      <Icon name="ShoppingCart" /> {soldOut ? "Sold out" : "Add to cart"}
                    </button>
                  </div>
                </div>
              </s.Hover>
            </s.Item>
          );
        })}
      </s.List>
    </Section>
  );
}
