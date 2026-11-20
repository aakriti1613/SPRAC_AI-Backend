// Backend checker for a SPARC site config (what the planner produces and the
// assembler will build). Mirrors sparc-ui/core/config.ts but runs on the server,
// with no frontend. Returns clear problems so the AI's output can be repaired or
// rejected before anything is built.
import { z } from "zod";
import { FIELD_TYPE_NAMES } from "../lib/fieldTypes.js";
import { PORTAL_INDUSTRIES } from "../lib/portalConfig.js";
import { STYLE_LEVEL_IDS, levelsUpTo } from "./styleLevels.js";
import { loadBlueprints, roomsOf } from "./index.js";

const hex = z.string().regex(/^#[0-9a-f]{6}$/i, "theme.primary must be a 6-digit hex colour");
const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

const base = {
  sparcVersion: z.literal(1),
  styleLevel: z.enum(STYLE_LEVEL_IDS),
  industry: z.enum(PORTAL_INDUSTRIES).optional(),
  brand: z.object({ name: z.string().min(1), logoUrl: z.string().optional(), logoText: z.string().optional() }),
  theme: z.object({ primary: hex }).passthrough(),
  rooms: z.object({ enabled: z.array(z.string()).default([]) }).default({ enabled: [] }),
};

const fieldSchema = z
  .object({
    key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
    label: z.string().min(1),
    type: z.enum(FIELD_TYPE_NAMES),
    required: z.boolean().default(false),
    width: z.enum(["full", "half", "third"]).optional(),
    options: z.array(z.string()).optional(),
  })
  .passthrough();

const moduleSchema = z
  .object({
    id: slug,
    singularName: z.string().min(1),
    pluralName: z.string().min(1),
    icon: z.string().optional(),
    fields: z.array(fieldSchema).min(1),
    listColumns: z.array(z.string()).default([]),
  })
  .passthrough();

const portalSchema = z.object({ ...base, websiteType: z.literal("admin-portal"), loginPage: z.object({ headline: z.string().min(1) }).passthrough(), modules: z.array(moduleSchema).min(1) }).passthrough();
const siteSchema = z.object({ ...base, websiteType: z.enum(["portfolio", "landing", "ecommerce", "booking"]), meta: z.object({ title: z.string().min(1) }).passthrough(), sections: z.object({ hero: z.object({ title: z.string().min(1) }).passthrough() }).passthrough() }).passthrough();

export const RESERVED_MODULE_IDS = ["login", "signup", "forgot-password", "profile", "settings", "users", "new", "dashboard"];
const OPTION_TYPES = new Set(["select", "radio", "multi-select", "checkbox-group"]);
/** Site rooms the shell builds itself, so they need no `sections` entry. */
const SHELL_BUILT = new Set([
  "navbar",
  "footer",
  "not-found",
  "contact-form",
  "newsletter",
  // shop and booking rooms get their content from `store` / `booking` (checked below)
  "product-page",
  "cart",
  "checkout-payment",
  "order-confirmation",
  "services-list",
  "slot-picker",
  "booking-form",
  "booking-confirmation",
]);

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const CURRENCY = /^[A-Z]{3}$/;

function checkStore(config, errors) {
  const store = config.store;
  if (!store) return void errors.push("store: an e-commerce site needs a store section (currency, payment)");
  if (!CURRENCY.test(store.currency ?? "")) errors.push("store.currency: use a 3-letter code like INR");
  const mode = store.payment?.mode;
  if (!["test", "razorpay", "stripe"].includes(mode)) errors.push("store.payment.mode: must be test, razorpay or stripe");
  else if (mode !== "test" && !store.payment.endpoint) errors.push(`store.payment.endpoint: ${mode} needs the URL of your server payment function`);
  const products = config.sections?.["product-list"]?.products ?? [];
  if (products.length === 0) errors.push("sections.product-list: add at least one product");
  const seen = new Set();
  for (const p of products) {
    if (!ID.test(p.id ?? "")) errors.push(`products: id "${p.id}" must be lowercase-with-dashes`);
    if (seen.has(p.id)) errors.push(`products: duplicate id "${p.id}"`);
    seen.add(p.id);
    if (typeof p.name !== "string" || !p.name) errors.push(`products.${p.id}: name is required`);
    if (!(typeof p.price === "number" && p.price >= 0)) errors.push(`products.${p.id}: price must be a number, 0 or more`);
  }
}

function checkBooking(config, errors) {
  const b = config.booking;
  if (!b) return void errors.push("booking: a booking site needs a booking section (services, availability)");
  if (!CURRENCY.test(b.currency ?? "")) errors.push("booking.currency: use a 3-letter code like INR");
  if (!b.services?.length) errors.push("booking.services: add at least one service");
  const seen = new Set();
  for (const s of b.services ?? []) {
    if (!ID.test(s.id ?? "")) errors.push(`booking.services: id "${s.id}" must be lowercase-with-dashes`);
    if (seen.has(s.id)) errors.push(`booking.services: duplicate id "${s.id}"`);
    seen.add(s.id);
    if (!(Number.isInteger(s.durationMin) && s.durationMin >= 5 && s.durationMin <= 480)) errors.push(`booking.services.${s.id}: durationMin must be 5 to 480`);
  }
  const a = b.availability;
  if (!a) return void errors.push("booking.availability: missing");
  if (!a.days?.length || a.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) errors.push("booking.availability.days: use weekday numbers 0 (Sunday) to 6");
  if (!HHMM.test(a.open ?? "") || !HHMM.test(a.close ?? "") || a.open >= a.close) errors.push("booking.availability: open and close must be HH:MM with open before close");
  if (!(a.stepMin >= 5 && a.stepMin <= 240)) errors.push("booking.availability.stepMin: use 5 to 240 minutes");
  if (!(a.horizonDays >= 1 && a.horizonDays <= 365)) errors.push("booking.availability.horizonDays: use 1 to 365");
  if (!(a.leadHours >= 0)) errors.push("booking.availability.leadHours: 0 or more");
}

function issues(err) {
  return err.issues.map((i) => `${i.path.join(".") || "config"}: ${i.message}`);
}

function checkRoomsEnabled(bp, enabled, errors) {
  for (const id of enabled) if (!bp.rooms.optional.includes(id)) errors.push(`rooms.enabled: "${id}" is not an optional room of ${bp.id}`);
}

/**
 * Validate a SPARC config. Returns { ok, config?, blueprint?, websiteType?, errors }.
 * Shape errors fail first; then blueprint/field rules are checked.
 */
export function checkSparcConfig(raw, blueprints = loadBlueprints()) {
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["config must be an object"] };
  const type = raw.websiteType;
  const schema = type === "admin-portal" ? portalSchema : type === "portfolio" || type === "landing" || type === "ecommerce" || type === "booking" ? siteSchema : null;
  if (!schema) return { ok: false, errors: [`websiteType must be one of portfolio, landing, ecommerce, booking, admin-portal (got ${JSON.stringify(type)})`] };

  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: issues(parsed.error) };
  const config = parsed.data;
  const bp = blueprints.find((b) => b.id === type && b.status === "active");
  if (!bp) return { ok: false, errors: [`website type "${type}" is not active`] };

  const errors = [];
  if (!levelsUpTo(bp.maxStyleLevel).includes(config.styleLevel)) {
    errors.push(`styleLevel "${config.styleLevel}" is above the maximum for ${type} (${bp.maxStyleLevel})`);
  }
  checkRoomsEnabled(bp, config.rooms.enabled, errors);

  if (type === "admin-portal") {
    const ids = new Set();
    for (const m of config.modules) {
      if (ids.has(m.id)) errors.push(`modules: duplicate id "${m.id}"`);
      ids.add(m.id);
      if (RESERVED_MODULE_IDS.includes(m.id)) errors.push(`modules: id "${m.id}" is reserved for a built-in page`);
      const keys = new Set();
      for (const field of m.fields) {
        if (keys.has(field.key)) errors.push(`modules.${m.id}: duplicate field key "${field.key}"`);
        keys.add(field.key);
        if (OPTION_TYPES.has(field.type) && !(field.options && field.options.length)) errors.push(`modules.${m.id}.${field.key}: ${field.type} needs options`);
      }
      for (const c of m.listColumns) if (!keys.has(c)) errors.push(`modules.${m.id}: list column "${c}" is not a field`);
    }
  } else {
    const needed = [...bp.rooms.required, ...bp.rooms.optional.filter((r) => config.rooms.enabled.includes(r))];
    for (const room of needed) {
      if (SHELL_BUILT.has(room)) continue;
      if (!(config.sections && room in config.sections)) errors.push(`sections: "${room}" is switched on but has no content`);
    }
    if (type === "ecommerce") checkStore(config, errors);
    if (type === "booking") checkBooking(config, errors);
  }

  return { ok: errors.length === 0, config, blueprint: bp, websiteType: type, errors, rooms: roomsOf(bp) };
}
