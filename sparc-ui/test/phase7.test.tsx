// Phase 7: the shop and the booking site. Logic (cart, payment, slots), the config
// checks, and the two whole journeys through the real shells.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { Product } from "@contracts";
import { dateRange, firstFreeDay, isOpenDay, parseIsoDate, slotsFor, type Availability } from "@core/booking";
import { addToCart, cartCount, cartLines, cleanCart, newOrderId, removeFromCart, setQty, subtotal, MAX_QTY } from "@core/commerce";
import { checkSiteConfig } from "@core/config";
import { expiryValid, luhnValid, pay, TEST_CARDS } from "@core/payment";
import { BookingApp } from "../shells/site-shell/src/BookingApp";
import { StoreApp } from "../shells/site-shell/src/StoreApp";
import { registry } from "../shells/site-shell/src/registries/good";
import bookingConfig from "../shells/site-shell/src/configs/booking.json";
import storeConfig from "../shells/site-shell/src/configs/store.json";

const clone = <T,>(v: T): T => structuredClone(v);
const products: Product[] = [
  { id: "a", name: "A", price: 0.1 },
  { id: "b", name: "B", price: 20 },
  { id: "c", name: "C", price: 5, inStock: false },
];

describe("cart logic", () => {
  it("adds, caps, sets and removes quantities", () => {
    let cart = addToCart({}, "a", products);
    cart = addToCart(cart, "a", products);
    expect(cart).toEqual({ a: 2 });
    expect(setQty(cart, "a", 5)).toEqual({ a: 5 });
    expect(setQty(cart, "a", 0)).toEqual({});
    expect(setQty(cart, "a", 999).a).toBe(MAX_QTY);
    expect(setQty(cart, "missing", 3)).toEqual(cart); // cannot invent a line
    expect(removeFromCart(cart, "a")).toEqual({});
  });

  it("ignores unknown and sold-out products", () => {
    expect(addToCart({}, "nope", products)).toEqual({});
    expect(addToCart({}, "c", products)).toEqual({});
  });

  it("adds money without floating-point drift", () => {
    const lines = cartLines({ a: 3, b: 1 }, products);
    expect(subtotal(lines)).toBe(20.3); // 0.1 * 3 + 20, not 20.300000000000004
    expect(cartCount({ a: 3, b: 1 })).toBe(4);
  });

  it("drops stored junk and products that no longer exist", () => {
    expect(cleanCart({ a: 2, b: -1, c: 1.5, gone: 4, x: "9" }, products)).toEqual({ a: 2 });
    expect(cleanCart(null, products)).toEqual({});
    expect(cleanCart([1, 2], products)).toEqual({});
  });

  it("order numbers are readable and different", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newOrderId()));
    expect(ids.size).toBeGreaterThan(45);
    for (const id of ids) expect(id).toMatch(/^ORD-[A-HJ-NP-Z2-9]{6}$/);
  });
});

describe("payment logic", () => {
  const customer = { name: "Neha", email: "neha@example.com", phone: "9876543210", address: "12 Example Road" };
  const base = { orderId: "ORD-ABC234", amount: 698, currency: "INR", customer };

  it("checks card numbers and expiry", () => {
    expect(luhnValid(TEST_CARDS.success)).toBe(true);
    expect(luhnValid("4242 4242 4242 4241")).toBe(false);
    expect(luhnValid("1234")).toBe(false);
    const now = new Date(2026, 10, 19);
    expect(expiryValid("12/30", now)).toBe(true);
    expect(expiryValid("11/26", now)).toBe(true); // this month is still fine
    expect(expiryValid("10/26", now)).toBe(false);
    expect(expiryValid("13/30", now)).toBe(false);
    expect(expiryValid("1230", now)).toBe(false);
  });

  it("test mode: good card passes, declined card and bad details fail, nothing is charged", async () => {
    const ok = await pay({ ...base, card: { number: TEST_CARDS.success, expiry: "12/30", cvc: "123" } }, { mode: "test" });
    expect(ok).toEqual({ ok: true, paymentId: "test_ord-abc234" });
    const declined = await pay({ ...base, card: { number: TEST_CARDS.declined, expiry: "12/30", cvc: "123" } }, { mode: "test" });
    expect(declined.ok).toBe(false);
    const noCard = await pay(base, { mode: "test" });
    expect(noCard.ok).toBe(false);
    const badEmail = await pay({ ...base, customer: { ...customer, email: "nope" }, card: { number: TEST_CARDS.success, expiry: "12/30", cvc: "123" } }, { mode: "test" });
    expect(badEmail).toMatchObject({ ok: false, error: expect.stringContaining("email") });
    const empty = await pay({ ...base, amount: 0, card: { number: TEST_CARDS.success, expiry: "12/30", cvc: "123" } }, { mode: "test" });
    expect(empty).toMatchObject({ ok: false, error: expect.stringContaining("empty") });
  });

  it("real gateway: trusts only the server's ok:true with a payment id", async () => {
    const reply = (status: number, body: unknown) => (async () => ({ ok: status < 300, status, json: async () => body })) as unknown as typeof fetch;
    const good = await pay(base, { mode: "razorpay", endpoint: "/pay", fetchFn: reply(200, { ok: true, paymentId: "pay_1" }) });
    expect(good).toEqual({ ok: true, paymentId: "pay_1" });
    for (const body of [{ ok: true }, { ok: false, error: "Insufficient funds" }, {}]) {
      const r = await pay(base, { mode: "stripe", endpoint: "/pay", fetchFn: reply(200, body) });
      expect(r.ok).toBe(false);
    }
    expect(await pay(base, { mode: "stripe", endpoint: "/pay", fetchFn: reply(500, { ok: true, paymentId: "x" }) })).toMatchObject({ ok: false });
    const down = await pay(base, { mode: "stripe", endpoint: "/pay", fetchFn: (async () => { throw new Error("offline"); }) as unknown as typeof fetch });
    expect(down).toMatchObject({ ok: false, error: expect.stringContaining("not been charged") });
    expect(await pay(base, { mode: "razorpay" })).toMatchObject({ ok: false, error: expect.stringContaining("not set up") });
  });

  it("sends no card data to the server", async () => {
    let body = "";
    const spy = (async (_: unknown, init: { body: string }) => {
      body = init.body;
      return { ok: true, status: 200, json: async () => ({ ok: true, paymentId: "p" }) };
    }) as unknown as typeof fetch;
    await pay({ ...base, card: { number: TEST_CARDS.success, expiry: "12/30", cvc: "123" } }, { mode: "stripe", endpoint: "/pay", fetchFn: spy });
    expect(body).not.toContain("4242");
    expect(body).not.toContain("cvc");
  });
});

describe("booking logic", () => {
  const a: Availability = { days: [1, 2, 3, 4, 5, 6], open: "09:00", close: "11:00", stepMin: 30, leadHours: 2, horizonDays: 14 };
  const monday8am = new Date(2026, 11, 7, 8, 0); // Mon 7 Dec 2026

  it("reads dates strictly", () => {
    expect(parseIsoDate("2026-12-07")).not.toBeNull();
    expect(parseIsoDate("2026-02-31")).toBeNull();
    expect(parseIsoDate("tomorrow")).toBeNull();
  });

  it("knows open days and the booking window", () => {
    expect(isOpenDay(a, "2026-12-08", monday8am)).toBe(true); // Tuesday
    expect(isOpenDay(a, "2026-12-13", monday8am)).toBe(false); // Sunday
    expect(isOpenDay(a, "2026-12-06", monday8am)).toBe(false); // yesterday
    expect(isOpenDay(a, "2027-03-01", monday8am)).toBe(false); // beyond the window
    expect(dateRange(a, monday8am)).toEqual({ min: "2026-12-07", max: "2026-12-21" });
  });

  it("lists times that fit before closing and respects the lead time", () => {
    const tue = slotsFor(a, "2026-12-08", 60, [], monday8am);
    expect(tue.map((s) => s.id)).toEqual(["09:00", "09:30", "10:00"]); // a 60 min service cannot start at 10:30
    expect(tue.every((s) => s.available)).toBe(true);
    const today = slotsFor(a, "2026-12-07", 30, [], monday8am); // now 08:00 + 2h lead = 10:00
    expect(today.filter((s) => s.available).map((s) => s.id)).toEqual(["10:00", "10:30"]);
    expect(slotsFor(a, "2026-12-13", 30, [], monday8am)).toEqual([]); // Sunday: closed
  });

  it("blocks times that overlap an existing booking, even a longer one", () => {
    const slots = slotsFor(a, "2026-12-08", 30, [{ date: "2026-12-08", time: "09:00", durationMin: 60 }], monday8am);
    expect(Object.fromEntries(slots.map((s) => [s.id, s.available]))).toEqual({ "09:00": false, "09:30": false, "10:00": true, "10:30": true });
    const other = slotsFor(a, "2026-12-09", 30, [{ date: "2026-12-08", time: "09:00", durationMin: 60 }], monday8am);
    expect(other.every((s) => s.available)).toBe(true);
  });

  it("finds the first day with a free time", () => {
    expect(firstFreeDay(a, 30, [], monday8am)).toBe("2026-12-07");
    const lateMonday = new Date(2026, 11, 7, 20, 0);
    expect(firstFreeDay(a, 30, [], lateMonday)).toBe("2026-12-08");
    expect(firstFreeDay({ ...a, days: [0], horizonDays: 3 }, 30, [], monday8am)).toBeNull();
  });
});

describe("shop and booking config checks", () => {
  const store = () => clone(storeConfig) as Record<string, any>;
  const booking = () => clone(bookingConfig) as Record<string, any>;

  it("the sample configs are valid", () => {
    expect(checkSiteConfig(store()).errors).toEqual([]);
    expect(checkSiteConfig(booking()).errors).toEqual([]);
  });

  it("catches shop mistakes", () => {
    const missing = store();
    delete missing.store;
    expect(checkSiteConfig(missing).errors.join()).toContain("store");
    const dup = store();
    dup.sections["product-list"].products.push({ ...dup.sections["product-list"].products[0] });
    expect(checkSiteConfig(dup).errors.join()).toContain("duplicate id");
    const negative = store();
    negative.sections["product-list"].products[0].price = -5;
    expect(checkSiteConfig(negative).errors.join()).toContain("price");
    const real = store();
    real.store.payment = { mode: "razorpay" };
    expect(checkSiteConfig(real).errors.join()).toContain("endpoint");
    const empty = store();
    empty.sections["product-list"].products = [];
    expect(checkSiteConfig(empty).errors.join()).toContain("at least one product");
  });

  it("catches booking mistakes", () => {
    const hours = booking();
    hours.booking.availability.open = "18:00";
    expect(checkSiteConfig(hours).errors.join()).toContain("open and close");
    const days = booking();
    days.booking.availability.days = [7];
    expect(checkSiteConfig(days).errors.join()).toContain("weekday");
    const none = booking();
    none.booking.services = [];
    expect(checkSiteConfig(none).errors.join()).toContain("at least one service");
    const short = booking();
    short.booking.services[0].durationMin = 1;
    expect(checkSiteConfig(short).errors.join()).toContain("durationMin");
    const gone = booking();
    delete gone.booking;
    expect(checkSiteConfig(gone).errors.join()).toContain("booking");
  });
});

// ---------------------------------------------------------------------------
// Whole journeys
// ---------------------------------------------------------------------------
beforeEach(() => localStorage.clear());
afterEach(() => vi.useRealTimers());

function renderStore(path = "/", submit = vi.fn(async () => {}), raw: unknown = storeConfig) {
  const check = checkSiteConfig(clone(raw));
  if (!check.ok) throw new Error(check.errors.join("; "));
  render(
    <MemoryRouter initialEntries={[path]}>
      <StoreApp config={check.config!} blueprint={check.blueprint!} registry={registry} submit={submit} />
    </MemoryRouter>
  );
  return { submit };
}

async function fillCheckout(user: ReturnType<typeof userEvent.setup>, card: string = TEST_CARDS.success) {
  await user.type(screen.getByLabelText(/Full name/), "Neha Rao");
  await user.type(screen.getByLabelText(/^Email/, { selector: "input" }), "neha@example.com");
  await user.type(screen.getByLabelText(/^Phone/, { selector: "input" }), "9876543210");
  await user.type(screen.getByLabelText(/Delivery address/), "12 Example Road, Pune");
  await user.type(screen.getByLabelText(/Card number/), card);
  await user.type(screen.getByLabelText(/Expiry/), "12/30");
  await user.type(screen.getByLabelText(/Security code/), "123");
}

describe("shop journey (practice payment)", () => {
  it("browse, add to cart, change quantity, check out, pay, see the confirmation", async () => {
    const user = userEvent.setup();
    const { submit } = renderStore();

    await user.click(screen.getByRole("button", { name: "Add to cart: Assam Breakfast" }));
    await user.click(screen.getByRole("button", { name: "Add to cart: Assam Breakfast" }));
    await user.click(screen.getByRole("button", { name: "Add to cart: Masala Chai Blend" }));
    const nav = screen.getByRole("navigation", { name: "Main" });
    await user.click(within(nav).getByRole("link", { name: "Cart (3)" }));

    expect(await screen.findByText("Order summary")).toBeTruthy();
    expect(screen.getByText("₹997.00")).toBeTruthy(); // 2 x 349 + 299
    await user.click(screen.getByRole("button", { name: "Increase quantity of Masala Chai Blend" }));
    expect(screen.getByText("₹1,296.00")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Remove Masala Chai Blend from cart" }));
    expect(screen.getByText("₹698.00", { selector: "span" })).toBeTruthy();

    await user.click(screen.getByRole("link", { name: "Go to checkout" }));
    await fillCheckout(user);
    await user.click(screen.getByRole("button", { name: /^Pay / }));

    expect(await screen.findByText("Thank you for your order!")).toBeTruthy();
    expect(screen.getByText(/ORD-[A-HJ-NP-Z2-9]{6}/)).toBeTruthy();
    expect(submit).toHaveBeenCalledTimes(1);
    const [kind, values] = submit.mock.calls[0] as unknown as [string, Record<string, string>];
    expect(kind).toBe("order");
    expect(values).toMatchObject({ currency: "INR", total: "698", email: "neha@example.com", paymentId: expect.stringMatching(/^test_ord-/) });
    expect(JSON.parse(values.items)).toEqual([expect.objectContaining({ productId: "assam-breakfast", qty: 2 })]);
    expect(JSON.parse(localStorage.getItem("sparc.cart")!)).toEqual({}); // cart emptied after paying
  });

  it("a declined card shows the reason, keeps the cart and sends no order", async () => {
    const user = userEvent.setup();
    const { submit } = renderStore();
    await user.click(screen.getByRole("button", { name: "Add to cart: Steel Infuser" }));
    await user.click(within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", { name: "Cart (1)" }));
    await user.click(await screen.findByRole("link", { name: "Go to checkout" }));
    await fillCheckout(user, TEST_CARDS.declined);
    await user.click(screen.getByRole("button", { name: /^Pay / }));
    expect((await screen.findByRole("alert")).textContent).toContain("declined");
    expect(submit).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem("sparc.cart")!)).toEqual({ "steel-infuser": 1 });
  });

  it("a failed order notification does not undo a successful payment", async () => {
    const user = userEvent.setup();
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    renderStore("/", vi.fn(async () => { throw new Error("shop endpoint down"); }));
    await user.click(screen.getByRole("button", { name: "Add to cart: Steel Infuser" }));
    await user.click(within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", { name: "Cart (1)" }));
    await user.click(await screen.findByRole("link", { name: "Go to checkout" }));
    await fillCheckout(user);
    await user.click(screen.getByRole("button", { name: /^Pay / }));
    expect(await screen.findByText("Thank you for your order!")).toBeTruthy();
    quiet.mockRestore();
  });

  it("sold-out products cannot be added", () => {
    renderStore();
    const button = screen.getByRole("button", { name: "Sold out: Tasting Gift Box" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("a product page works and unknown products show the 404 page", async () => {
    const user = userEvent.setup();
    renderStore("/product/darjeeling-first-flush");
    expect(await screen.findByRole("heading", { name: "Darjeeling First Flush" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Add to cart" }));
    expect((await screen.findByRole("status")).textContent).toContain("1 in your cart");
  });

  it("unknown product, empty checkout and a stray confirmation page all behave", () => {
    renderStore("/product/does-not-exist");
    expect(screen.getByText("Page not found")).toBeTruthy();
  });

  it("opening checkout with an empty cart sends you to the cart", async () => {
    renderStore("/checkout");
    expect(await screen.findByText("Your cart is empty.")).toBeTruthy();
  });

  it("opening the confirmation page with no order sends you home", async () => {
    renderStore("/order-confirmation");
    expect(await screen.findByRole("button", { name: "Add to cart: Assam Breakfast" })).toBeTruthy();
  });

  it("the cart survives a page reload", async () => {
    const user = userEvent.setup();
    renderStore();
    await user.click(screen.getByRole("button", { name: "Add to cart: Steel Infuser" }));
    document.body.innerHTML = "";
    renderStore();
    expect(within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", { name: "Cart (1)" })).toBeTruthy();
  });

  it("a real-gateway store asks for no card fields", async () => {
    const real = clone(storeConfig) as Record<string, any>;
    real.store.payment = { mode: "stripe", endpoint: "https://shop.example/pay" };
    const user = userEvent.setup();
    renderStore("/", vi.fn(async () => {}), real);
    await user.click(screen.getByRole("button", { name: "Add to cart: Steel Infuser" }));
    await user.click(within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", { name: "Cart (1)" }));
    await user.click(await screen.findByRole("link", { name: "Go to checkout" }));
    expect(screen.queryByLabelText(/Card number/)).toBeNull();
    expect(screen.getByText(/processed securely by Stripe/)).toBeTruthy();
  });
});

function renderBooking(submit = vi.fn(async () => {})) {
  const check = checkSiteConfig(clone(bookingConfig));
  if (!check.ok) throw new Error(check.errors.join("; "));
  render(
    <MemoryRouter>
      <BookingApp config={check.config!} blueprint={check.blueprint!} registry={registry} submit={submit} />
    </MemoryRouter>
  );
  return { submit };
}

const timeButtons = () => within(screen.getByRole("group", { name: "Available times" })).getAllByRole("button") as HTMLButtonElement[];

describe("booking journey", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 11, 7, 8, 0)); // Monday 08:00
  });

  it("choose a service, pick a time, give details, get a reference", async () => {
    const user = userEvent.setup();
    const { submit } = renderBooking();
    expect((screen.getByRole("button", { name: "Confirm booking" }) as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByRole("button", { name: /General consultation/ }));
    const free = timeButtons().filter((b) => !b.disabled);
    expect(free[0].textContent).toBe("10:00 AM"); // 08:00 now + 2h lead
    expect(timeButtons().some((b) => b.disabled && b.textContent === "9:00 AM")).toBe(true);
    await user.click(free[0]);

    await user.type(screen.getByLabelText(/^Your name/), "Aarav Shah");
    await user.type(screen.getByLabelText(/^Email/, { selector: "input" }), "aarav@example.com");
    await user.type(screen.getByLabelText(/^Phone/, { selector: "input" }), "9876543210");
    await user.click(screen.getByRole("button", { name: "Confirm booking" }));

    expect(await screen.findByText("You are booked!")).toBeTruthy();
    expect(screen.getByText(/BK-[A-HJ-NP-Z2-9]{6}/)).toBeTruthy();
    expect(screen.getByText(/10:00 AM/)).toBeTruthy();
    expect(submit).toHaveBeenCalledWith("booking", expect.objectContaining({ service: "General consultation", date: "2026-12-07", time: "10:00", email: "aarav@example.com" }));
  });

  it("a time that was booked is no longer offered, and a longer service skips overlaps", async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      "sparc.bookings",
      JSON.stringify([{ reference: "BK-AAAAAA", serviceId: "x", serviceName: "x", date: "2026-12-07", time: "10:00", durationMin: 30, customer: {}, createdAt: "" }])
    );
    renderBooking();
    await user.click(screen.getByRole("button", { name: /Full health check-up/ })); // 60 min
    const byLabel = Object.fromEntries(timeButtons().map((b) => [b.textContent, !b.disabled]));
    expect(byLabel["10:00 AM"]).toBe(false); // taken
    expect(byLabel["9:30 AM"]).toBe(false); // would run into the 10:00 booking (and is before the lead time)
    expect(byLabel["10:30 AM"]).toBe(true);
  });

  it("refuses a time that was taken while the page was open", async () => {
    const user = userEvent.setup();
    renderBooking();
    await user.click(screen.getByRole("button", { name: /Vaccination/ }));
    await user.click(timeButtons().find((b) => !b.disabled)!);
    // Another visitor books the same time in the meantime.
    localStorage.setItem(
      "sparc.bookings",
      JSON.stringify([{ reference: "BK-BBBBBB", serviceId: "x", serviceName: "x", date: "2026-12-07", time: "10:00", durationMin: 15, customer: {}, createdAt: "" }])
    );
    await user.type(screen.getByLabelText(/^Your name/), "Aarav Shah");
    await user.type(screen.getByLabelText(/^Email/, { selector: "input" }), "aarav@example.com");
    await user.type(screen.getByLabelText(/^Phone/, { selector: "input" }), "9876543210");
    await user.click(screen.getByRole("button", { name: "Confirm booking" }));
    expect((await screen.findByRole("alert")).textContent).toContain("no longer available");
    expect(screen.queryByText("You are booked!")).toBeNull();
  });

  it("shows a friendly message on a closed day", async () => {
    const user = userEvent.setup();
    renderBooking();
    await user.click(screen.getByRole("button", { name: /General consultation/ }));
    const date = screen.getByLabelText("Day") as HTMLInputElement;
    await user.clear(date);
    await user.type(date, "2026-12-13"); // a Sunday
    expect(await screen.findByText(/closed or fully booked/)).toBeTruthy();
  });

  it("the confirmation page without a booking goes home", async () => {
    const check = checkSiteConfig(clone(bookingConfig));
    render(
      <MemoryRouter initialEntries={["/booked"]}>
        <BookingApp config={check.config!} blueprint={check.blueprint!} registry={registry} submit={async () => {}} />
      </MemoryRouter>
    );
    expect(await screen.findByText("Choose a service")).toBeTruthy();
  });
});
