// Shop shell (dhaancha) for the "ecommerce" website type.
// Pages: home (products), product, cart, checkout + payment, order confirmation.
// The cart and the payment are handled here once; every style level only draws them.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import type { NavLink, Product, RoomId } from "@contracts";
import { enabledRooms, roomsOnPage } from "@core/blueprint";
import { addToCart, cartCount, cartLines, cleanCart, loadJson, newOrderId, removeFromCart, saveJson, setQty, subtotal, type Cart, type Order } from "@core/commerce";
import type { SiteConfig } from "@core/config";
import { pay } from "@core/payment";
import { Slot, SlotsProvider, type SlotRegistry } from "@core/slots";
import type { SubmitFn } from "./forms";
import { FooterSlot, NavbarSlot, NotFoundSlot, useSiteChrome } from "./shared";

const CART_KEY = "sparc.cart";
const ORDER_KEY = "sparc.lastOrder";

type Blueprint = Parameters<typeof enabledRooms>[0];

function Page({ config, links, children }: { config: SiteConfig; links: NavLink[]; children: ReactNode }) {
  return (
    <>
      <NavbarSlot config={config} links={links} />
      {children}
      <FooterSlot config={config} />
    </>
  );
}

export function StoreApp({ config, blueprint, registry, submit }: { config: SiteConfig; blueprint: Blueprint; registry: SlotRegistry; submit: SubmitFn }) {
  useSiteChrome(config);
  const navigate = useNavigate();
  const store = config.store!;
  const currency = store.currency;
  const products: Product[] = useMemo(() => config.sections["product-list"]?.products ?? [], [config]);

  const [cart, setCart] = useState<Cart>(() => cleanCart(loadJson<unknown>(CART_KEY, {}), products));
  useEffect(() => saveJson(CART_KEY, cart), [cart]);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string>();
  // Once paid, the cart is empty on purpose: do not bounce the shopper back to the cart page.
  const justPaid = useRef(false);

  const lines = useMemo(() => cartLines(cart, products), [cart, products]);
  const total = subtotal(lines);
  const count = cartCount(cart);

  const enabled = useMemo(() => enabledRooms(blueprint, config.rooms.enabled), [blueprint, config.rooms.enabled]);
  const homeRooms = useMemo(() => roomsOnPage(blueprint, "home", enabled), [blueprint, enabled]);

  const links = (active: string): NavLink[] => [
    { label: "Shop", href: "/", active: active === "home" },
    { label: count > 0 ? `Cart (${count})` : "Cart", href: "/cart", active: active === "cart" },
  ];

  const add = (id: string) => setCart((c) => addToCart(c, id, products));

  async function onPay(details: Record<string, string | undefined>) {
    setPaying(true);
    setPayError(undefined);
    const orderId = newOrderId();
    const customer = { name: details.name ?? "", email: details.email ?? "", phone: details.phone ?? "", address: details.address ?? "" };
    const result = await pay(
      {
        orderId,
        amount: total,
        currency,
        customer,
        card: details.cardNumber ? { number: details.cardNumber, expiry: details.cardExpiry ?? "", cvc: details.cardCvc ?? "" } : undefined,
      },
      { mode: store.payment.mode, endpoint: store.payment.endpoint }
    );
    setPaying(false);
    if (!result.ok) return setPayError(result.error);
    const order: Order = { orderId, paymentId: result.paymentId, lines, total, currency, customer, createdAt: new Date().toISOString() };
    saveJson(ORDER_KEY, order);
    justPaid.current = true;
    setCart({});
    // The shopper has paid: telling the shop must never undo that, so a failure here is only logged.
    submit("order", { orderId, paymentId: result.paymentId, total: String(total), currency, ...customer, items: JSON.stringify(lines) }).catch((e) =>
      console.error("[sparc] could not send the order to the shop:", e)
    );
    navigate("/order-confirmation");
  }

  return (
    <SlotsProvider registry={registry}>
      <Routes>
        <Route
          path="/"
          element={
            <>
              {homeRooms.map((room) => {
                switch (room) {
                  case "navbar":
                    return <NavbarSlot key={room} config={config} links={links("home")} />;
                  case "footer":
                    return <FooterSlot key={room} config={config} />;
                  case "product-list": {
                    const c = config.sections["product-list"]!;
                    return (
                      <Slot
                        key={room}
                        room="product-list"
                        id="products"
                        className="block scroll-mt-20"
                        props={{ heading: c.heading, subtitle: c.subtitle, products, currency, productHref: (id) => `/product/${id}`, onAdd: add }}
                      />
                    );
                  }
                  case "newsletter":
                    return (
                      <Slot
                        key={room}
                        room="newsletter"
                        id="newsletter"
                        className="block scroll-mt-20"
                        props={{
                          heading: config.sections.newsletter?.heading ?? "Stay in the loop",
                          text: config.sections.newsletter?.text,
                          submitting: false,
                          done: false,
                          onSubscribe: (email) => submit("newsletter", { email }),
                        }}
                      />
                    );
                  default: {
                    const props = config.sections[room as keyof SiteConfig["sections"]];
                    if (!props) return null;
                    return <Slot key={room} room={room as RoomId} id={room} className="block scroll-mt-20" props={props as never} />;
                  }
                }
              })}
            </>
          }
        />
        <Route path="/product/:id" element={<ProductRoute config={config} products={products} currency={currency} cart={cart} add={add} links={links("product")} />} />
        <Route
          path="/cart"
          element={
            <Page config={config} links={links("cart")}>
              <Slot
                room="cart"
                props={{
                  heading: "Your cart",
                  lines,
                  currency,
                  subtotal: total,
                  onQty: (id, qty) => setCart((c) => setQty(c, id, qty)),
                  onRemove: (id) => setCart((c) => removeFromCart(c, id)),
                  checkoutHref: "/checkout",
                  shopHref: "/",
                }}
              />
            </Page>
          }
        />
        <Route
          path="/checkout"
          element={
            lines.length === 0 && !paying && !justPaid.current ? (
              <Navigate to="/cart" replace />
            ) : (
              <Page config={config} links={links("checkout")}>
                <Slot
                  room="checkout-payment"
                  props={{ heading: "Checkout", lines, currency, total, mode: store.payment.mode, onPay, paying, error: payError, backHref: "/cart" }}
                />
              </Page>
            )
          }
        />
        <Route path="/order-confirmation" element={<ConfirmationRoute config={config} links={links("none")} />} />
        <Route path="*" element={<NotFoundSlot config={config} />} />
      </Routes>
    </SlotsProvider>
  );
}

function ProductRoute({ config, products, currency, cart, add, links }: { config: SiteConfig; products: Product[]; currency: string; cart: Cart; add: (id: string) => void; links: NavLink[] }) {
  const { id } = useParams();
  const product = products.find((p) => p.id === id);
  if (!product) return <NotFoundSlot config={config} />;
  return (
    <Page config={config} links={links}>
      <Slot room="product-page" props={{ product, currency, inCart: cart[product.id] ?? 0, onAdd: add, backHref: "/", cartHref: "/cart" }} />
    </Page>
  );
}

function ConfirmationRoute({ config, links }: { config: SiteConfig; links: NavLink[] }) {
  const order = loadJson<Order | null>(ORDER_KEY, null);
  if (!order) return <Navigate to="/" replace />;
  return (
    <Page config={config} links={links}>
      <Slot
        room="order-confirmation"
        props={{ heading: "Thank you for your order!", orderId: order.orderId, total: order.total, currency: order.currency, email: order.customer.email, lines: order.lines, continueHref: "/" }}
      />
    </Page>
  );
}
