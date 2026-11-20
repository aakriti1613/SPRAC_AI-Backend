// Shop logic, written once for every style level: the cart and the order total.
// Pure functions (no React, no browser) so they are easy to test. Money is
// counted in whole paise/cents inside the maths to avoid 0.1 + 0.2 problems.
import type { CartLine, Product } from "@contracts";

export type Cart = Record<string, number>; // productId -> quantity

export const MAX_QTY = 20;

const toMinor = (n: number) => Math.round(n * 100);

export function addToCart(cart: Cart, productId: string, products: Product[]): Cart {
  const p = products.find((x) => x.id === productId);
  if (!p || p.inStock === false) return cart; // unknown or sold-out: nothing changes
  return { ...cart, [productId]: Math.min(MAX_QTY, (cart[productId] ?? 0) + 1) };
}

/** Set a quantity. 0 (or less) removes the line; more than MAX_QTY is capped. */
export function setQty(cart: Cart, productId: string, qty: number): Cart {
  const next = { ...cart };
  const q = Math.min(MAX_QTY, Math.floor(qty));
  if (!(q > 0)) delete next[productId];
  else if (productId in cart) next[productId] = q;
  return next;
}

export function removeFromCart(cart: Cart, productId: string): Cart {
  const next = { ...cart };
  delete next[productId];
  return next;
}

/** Cart lines in product-list order; products that no longer exist are dropped. */
export function cartLines(cart: Cart, products: Product[]): CartLine[] {
  return products
    .filter((p) => (cart[p.id] ?? 0) > 0)
    .map((p) => ({ productId: p.id, name: p.name, price: p.price, qty: cart[p.id], image: p.image }));
}

export function cartCount(cart: Cart): number {
  return Object.values(cart).reduce((n, q) => n + q, 0);
}

export function subtotal(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + toMinor(l.price) * l.qty, 0) / 100;
}

/** Order number like "ORD-7K3F9Q": easy to read out loud. */
export function newOrderId(random: () => number = Math.random): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
  let out = "";
  for (let i = 0; i < 6; i += 1) out += chars[Math.floor(random() * chars.length)];
  return `ORD-${out}`;
}

export interface Order {
  orderId: string;
  paymentId: string;
  lines: CartLine[];
  total: number;
  currency: string;
  customer: { name: string; email: string; phone: string; address: string };
  createdAt: string;
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/** What we remember between pages (cart and last order). Never throws. */
export function loadJson<T>(key: string, fallback: T, storage: Pick<Storage, "getItem"> | undefined = safeStorage()): T {
  try {
    const raw = storage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJson(key: string, value: unknown, storage: Pick<Storage, "setItem"> | undefined = safeStorage()): void {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or full: the page still works, it just forgets */
  }
}

/** Keeps only valid {productId: positive integer} pairs from whatever was stored. */
export function cleanCart(raw: unknown, products: Product[]): Cart {
  const out: Cart = {};
  if (!raw || typeof raw !== "object") return out;
  for (const p of products) {
    const q = (raw as Record<string, unknown>)[p.id];
    if (typeof q === "number" && Number.isInteger(q) && q > 0) out[p.id] = Math.min(MAX_QTY, q);
  }
  return out;
}
