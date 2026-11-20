// Phase 7: the e-commerce store and the booking site as full website types:
// blueprints, room contracts, config checks, planner, assembler, API and a real build.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOMS, checkBlueprint, checkCatalogue, getBlueprint, libraryTargets, loadBlueprints } from "../sparc/index.js";
import { checkSparcConfig } from "../sparc/config.js";
import { assembleConfig } from "../registry/plan/assemble.js";
import { planOffline } from "../registry/plan/offline.js";
import { composeSite } from "../registry/retrieve/compose.js";
import { configChecklist } from "../registry/assemble/verify.js";
import { createFileStore } from "../registry/store/file.js";
import { startServer, BACKEND_DIR } from "./helpers/server.js";

const records = await createFileStore(path.join(BACKEND_DIR, "registry", "data")).list();
const clone = (v) => structuredClone(v);
const sample = (name) => JSON.parse(fs.readFileSync(path.join(BACKEND_DIR, "sparc-ui", "shells", "site-shell", "src", "configs", `${name}.json`), "utf8"));

const SHOP_ROOMS = ["product-list", "product-page", "cart", "checkout-payment", "order-confirmation"];
const BOOKING_ROOMS = ["services-list", "slot-picker", "booking-form", "booking-confirmation"];

describe("blueprints and room contracts", () => {
  test("both types are active and consistent with the room catalogue", () => {
    for (const id of ["ecommerce", "booking"]) {
      const bp = getBlueprint(id);
      assert.equal(bp.maxStyleLevel, "amazing");
      assert.deepEqual(checkBlueprint(bp), []);
    }
    assert.deepEqual(checkCatalogue(), []);
  });

  test("every new room is a workflow room with the logic in the shell (callbacks, no data fetching)", () => {
    for (const room of [...SHOP_ROOMS, ...BOOKING_ROOMS]) {
      assert.equal(ROOMS[room].kind, "workflow", room);
      assert.ok(Object.values(ROOMS[room].props).some((p) => p.type === "callback") || room.endsWith("confirmation") || room === "product-page" || room === "cart", `${room} has a way to act`);
    }
    assert.deepEqual(getBlueprint("ecommerce").rooms.required.filter((r) => SHOP_ROOMS.includes(r)), SHOP_ROOMS);
    assert.deepEqual(getBlueprint("booking").rooms.required.filter((r) => BOOKING_ROOMS.includes(r)), BOOKING_ROOMS);
  });

  test("the checkout page carries the payment mode, and never a card-number prop to a server", () => {
    assert.deepEqual(ROOMS["checkout-payment"].props.mode.values, ["test", "razorpay", "stripe"]);
  });

  test("the library targets grew by exactly the new workflow rooms (basic + good each)", () => {
    const { rows, total } = libraryTargets(loadBlueprints());
    for (const room of [...SHOP_ROOMS, ...BOOKING_ROOMS]) assert.deepEqual(rows.find((r) => r.room === room).levels, ["basic", "good"], room);
    assert.equal(total, 149);
  });
});

describe("server-side config checks", () => {
  test("the sample configs used by the shell are valid on the server too", () => {
    assert.deepEqual(checkSparcConfig(sample("store")).errors, []);
    assert.deepEqual(checkSparcConfig(sample("booking")).errors, []);
  });

  test("shop mistakes are reported", () => {
    const bad = (mutate) => {
      const c = clone(sample("store"));
      mutate(c);
      return checkSparcConfig(c).errors.join("\n");
    };
    assert.match(bad((c) => delete c.store), /store: an e-commerce site needs/);
    assert.match(bad((c) => (c.store.currency = "rupees")), /store.currency/);
    assert.match(bad((c) => (c.store.payment = { mode: "paypal" })), /payment.mode/);
    assert.match(bad((c) => (c.store.payment = { mode: "razorpay" })), /endpoint/);
    assert.match(bad((c) => (c.sections["product-list"].products = [])), /at least one product/);
    assert.match(bad((c) => c.sections["product-list"].products.push(clone(c.sections["product-list"].products[0]))), /duplicate id/);
    assert.match(bad((c) => (c.sections["product-list"].products[0].price = -1)), /price/);
    assert.match(bad((c) => (c.sections["product-list"].products[0].id = "Bad Id")), /lowercase-with-dashes/);
    assert.match(bad((c) => (c.styleLevel = "astonishing")), /above the maximum for ecommerce/);
  });

  test("booking mistakes are reported", () => {
    const bad = (mutate) => {
      const c = clone(sample("booking"));
      mutate(c);
      return checkSparcConfig(c).errors.join("\n");
    };
    assert.match(bad((c) => delete c.booking), /booking: a booking site needs/);
    assert.match(bad((c) => (c.booking.services = [])), /at least one service/);
    assert.match(bad((c) => (c.booking.services[0].durationMin = 2)), /durationMin/);
    assert.match(bad((c) => (c.booking.availability.open = "18:00")), /open and close/);
    assert.match(bad((c) => (c.booking.availability.close = "25:00")), /open and close/);
    assert.match(bad((c) => (c.booking.availability.days = [8])), /weekday/);
    assert.match(bad((c) => (c.booking.availability.stepMin = 1)), /stepMin/);
    assert.match(bad((c) => (c.booking.services[1].id = c.booking.services[0].id)), /duplicate id/);
  });

  test("a switched-on optional room still needs its content", () => {
    const c = clone(sample("store"));
    c.rooms.enabled.push("testimonials");
    assert.match(checkSparcConfig(c).errors.join("\n"), /"testimonials" is switched on but has no content/);
  });
});

describe("the planner", () => {
  const type = async (d) => (await planOffline(d, {})).signals.websiteType;

  test("recognises shops and booking sites", async () => {
    assert.equal(await type("An online store to sell handmade candles with a cart and checkout"), "ecommerce");
    assert.equal(await type("I want customers to buy online from my bakery"), "ecommerce");
    assert.equal(await type("Let patients book appointments online for my dental clinic"), "booking");
    assert.equal(await type("A salon with online booking and time slots"), "booking");
  });

  test("descriptions that worked before still plan the same way (a tie goes to admin-portal)", async () => {
    assert.equal(await type("A clinic website to manage patients and appointments"), "admin-portal");
    assert.equal(await type("manage orders in my online store"), "admin-portal");
    assert.equal(await type("my personal portfolio"), "portfolio");
    assert.equal(await type("a landing page for my coaching centre"), "landing");
  });

  test("assembled configs are valid, editable starters", () => {
    for (const [websiteType, industry] of [["ecommerce", "inventory"], ["booking", "healthcare"]]) {
      const r = assembleConfig({ websiteType, industry, styleLevel: "good", brandName: "Test Brand", description: "x" });
      assert.deepEqual(r.errors, [], websiteType);
      assert.equal(r.ok, true);
    }
    const shop = assembleConfig({ websiteType: "ecommerce", industry: "generic", styleLevel: "good", brandName: "Shop" }).config;
    assert.equal(shop.store.payment.mode, "test", "a new store starts in practice (test) mode");
    assert.ok(shop.sections["product-list"].products.length >= 1);
    const book = assembleConfig({ websiteType: "booking", industry: "generic", styleLevel: "good", brandName: "Salon" }).config;
    assert.ok(book.booking.services.length >= 1);
  });

  test("portals and shops cannot be astonishing", () => {
    for (const websiteType of ["ecommerce", "booking"]) {
      const r = assembleConfig({ websiteType, industry: "generic", styleLevel: "astonishing", brandName: "X" });
      assert.equal(r.config.styleLevel, "amazing");
      assert.equal(r.ok, true);
    }
  });

  test("optional rooms the user switched off stay off", () => {
    const r = assembleConfig({ websiteType: "booking", industry: "healthcare", styleLevel: "good", brandName: "Clinic", disabledOptional: ["location-map"] });
    assert.ok(!r.config.rooms.enabled.includes("location-map"));
    assert.deepEqual(r.errors, []);
  });
});

describe("components for every room", () => {
  test("every level finds a verified component for every room (workflow rooms fall back to Good)", () => {
    for (const websiteType of ["ecommerce", "booking"]) {
      const bp = getBlueprint(websiteType);
      for (const styleLevel of ["basic", "good", "amazing"]) {
        const c = composeSite(records, { websiteType, styleLevel, enabledOptional: bp.rooms.optional });
        assert.deepEqual(c.missing, [], `${websiteType}/${styleLevel}`);
        assert.deepEqual(c.problems, [], `${websiteType}/${styleLevel}`);
        assert.equal(c.ok, true);
      }
    }
    const amazing = composeSite(records, { websiteType: "ecommerce", styleLevel: "amazing" });
    assert.equal(amazing.picks.cart.level, "good", "no Amazing cart yet, so the Good one is used");
    assert.equal(amazing.picks.hero.level, "amazing", "visual rooms still follow the chosen style");
  });

  test("the assembler checklist passes for both types and notices a broken store", () => {
    for (const [websiteType, industry] of [["ecommerce", "inventory"], ["booking", "healthcare"]]) {
      const { config } = assembleConfig({ websiteType, industry, styleLevel: "good", brandName: "Test" });
      const composition = composeSite(records, { websiteType, styleLevel: "good", enabledOptional: config.rooms.enabled });
      const r = configChecklist(config, composition);
      assert.equal(r.ok, true, r.checks.filter((c) => !c.pass).map((c) => c.name).join("; "));
    }
    const { config } = assembleConfig({ websiteType: "ecommerce", industry: "generic", styleLevel: "good", brandName: "Test" });
    config.sections["product-list"].products = [];
    assert.equal(configChecklist(config).ok, false);
  });
});

describe("through the real server: plan -> build for deploy", () => {
  let server;
  let auth;
  before(async () => {
    server = await startServer({ SPARC_API_ENABLED: "1" });
    await server.login();
    auth = { "Content-Type": "application/json", Authorization: `Bearer ${server.token}` };
  });
  after(async () => {
    await server?.stop();
  });
  const post = async (p, body) => {
    const res = await fetch(server.baseUrl + p, { method: "POST", headers: auth, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };

  test("the builder is offered both new types, with their optional rooms", async () => {
    const res = await fetch(server.baseUrl + "/api/sparc/options", { headers: auth });
    const options = await res.json();
    const ids = options.websiteTypes.map((w) => w.id).sort();
    assert.deepEqual(ids, ["admin-portal", "booking", "ecommerce", "landing", "portfolio"]);
    const shop = options.websiteTypes.find((w) => w.id === "ecommerce");
    assert.equal(shop.maxStyleLevel, "amazing");
    assert.ok(shop.optionalRooms.some((r) => r.id === "faq" && r.defaultOn));
  });

  test("a described shop is planned, composed and built into the output folder", async () => {
    const plan = await post("/api/plan", { description: "An online store to sell handmade candles with a cart and checkout", styleLevel: "good" });
    assert.equal(plan.body.config.websiteType, "ecommerce");
    assert.equal(plan.body.ok, true);

    const rebuilt = await post("/api/sparc/config", { signals: { ...plan.body.signals, brandName: "Wax & Wick", disabledOptional: ["faq"] } });
    assert.equal(rebuilt.body.success, true, JSON.stringify(rebuilt.body.errors));
    assert.ok(!rebuilt.body.config.rooms.enabled.includes("faq"));

    const compose = await post("/api/compose", { websiteType: "ecommerce", styleLevel: "good", enabledOptional: rebuilt.body.config.rooms.enabled });
    assert.equal(compose.body.composition.ok, true);
    assert.ok(compose.body.composition.picks["checkout-payment"]);

    const built = await post("/api/build", { config: rebuilt.body.config, name: "p7-candles", forDeploy: true });
    assert.equal(built.body.success, true, JSON.stringify(built.body));
    assert.equal(built.body.verify.checklist.ok, true);
    assert.equal(built.body.lock.reuse.newCode, 0);
    const dir = path.join(server.outputDir, "p7-candles");
    const written = JSON.parse(fs.readFileSync(path.join(dir, "src", "sparc.config.json"), "utf8"));
    assert.equal(written.store.payment.mode, "test");
    assert.equal(written.brand.name, "Wax & Wick");
    for (const f of ["StoreApp.tsx", "BookingApp.tsx", "shared.tsx"]) assert.ok(fs.existsSync(path.join(dir, "src", f)), f);
    const lock = JSON.parse(fs.readFileSync(path.join(dir, "sparc.lock.json"), "utf8"));
    for (const room of ["cart", "checkout-payment", "product-list", "order-confirmation"]) assert.ok(lock.components[room], `${room} is in the lock`);
  });

  test("a described booking site is planned and built too", async () => {
    const plan = await post("/api/plan", { description: "Let patients book appointments online for my dental clinic" });
    assert.equal(plan.body.config.websiteType, "booking");
    const built = await post("/api/build", { config: plan.body.config, name: "p7-dental", forDeploy: true });
    assert.equal(built.body.success, true, JSON.stringify(built.body));
    assert.ok(fs.existsSync(path.join(server.outputDir, "p7-dental", "src", "sparc.config.json")));
  });

  test("a store with a broken payment setup is refused, not built", async () => {
    const config = clone(sample("store"));
    config.store.payment = { mode: "stripe" };
    const built = await post("/api/build", { config, name: "p7-broken", forDeploy: true });
    assert.notEqual(built.body.success, true);
    assert.match(JSON.stringify(built.body), /endpoint/);
    assert.ok(!fs.existsSync(path.join(server.outputDir, "p7-broken")));
  });
});
