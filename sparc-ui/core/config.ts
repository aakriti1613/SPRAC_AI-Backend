// The site config every shell reads (src/sparc.config.json).
// The assembler (Phase 5) writes it from the wizard / AI output; module shapes
// match the backend's buildGeneratedModules() so existing portal configs map
// straight across.
import { z } from "zod";
import type { Brand, Cta, Feature, FieldDef, NavLink, RoomId, RoomPropsMap, Service, SocialLink, StyleLevel } from "@contracts";
import type { Availability } from "./booking";
import { getBlueprint, type ActiveBlueprint } from "./blueprint";
import type { ThemeSettings } from "./theme";

export interface TableFeatures {
  sort: boolean;
  filter: boolean;
  search: boolean;
  pagination: boolean;
  export: boolean;
}

export interface PortalModule {
  id: string;
  tableName: string;
  singularName: string;
  pluralName: string;
  icon?: string;
  fields: FieldDef[];
  listColumns: string[];
  tableFeatures: TableFeatures;
}

interface BaseConfig {
  sparcVersion: 1;
  styleLevel: StyleLevel;
  industry?: string;
  brand: Brand;
  theme: ThemeSettings;
  /** Optional rooms switched on (required rooms are always on). */
  rooms: { enabled: string[] };
}

export interface PortalConfig extends BaseConfig {
  websiteType: "admin-portal";
  loginPage: { badge?: string; headline: string; description?: string; features?: Feature[] };
  modules: PortalModule[];
  roles?: string[];
}

/** Content for site sections: the room's props minus what the shell supplies. */
type Content<K extends RoomId> = RoomPropsMap[K];

export interface SiteSections {
  hero: Content<"hero">;
  about?: Content<"about">;
  projects?: Content<"projects">;
  skills?: Content<"skills">;
  experience?: Content<"experience">;
  education?: Content<"education">;
  services?: Content<"services">;
  stats?: Content<"stats">;
  testimonials?: Content<"testimonials">;
  "resume-download"?: Content<"resume-download">;
  contact?: Content<"contact">;
  pricing?: Content<"pricing">;
  faq?: Content<"faq">;
  team?: Content<"team">;
  gallery?: Content<"gallery">;
  "location-map"?: Content<"location-map">;
  "cta-banner"?: Content<"cta-banner">;
  "product-list"?: Pick<RoomPropsMap["product-list"], "heading" | "subtitle" | "products">;
  "contact-form"?: Pick<RoomPropsMap["contact-form"], "heading" | "text">;
  newsletter?: Pick<RoomPropsMap["newsletter"], "heading" | "text">;
}

/** Settings of an e-commerce site (websiteType "ecommerce"). */
export interface StoreSettings {
  currency: string;
  /** "test" = practice cards. razorpay/stripe go through your server function at `endpoint`. */
  payment: { mode: "test" | "razorpay" | "stripe"; endpoint?: string };
}

/** Settings of a booking site (websiteType "booking"). */
export interface BookingSettings {
  currency: string;
  services: Service[];
  availability: Availability;
}

export interface SiteConfig extends BaseConfig {
  websiteType: "portfolio" | "landing" | "ecommerce" | "booking";
  store?: StoreSettings;
  booking?: BookingSettings;
  meta: { title: string; description?: string };
  nav?: { links?: NavLink[]; cta?: Cta };
  footer?: { text?: string; links?: NavLink[]; socialLinks?: SocialLink[]; copyright?: string };
  sections: SiteSections;
  notFound?: { title?: string; message?: string };
}

export type SparcConfig = PortalConfig | SiteConfig;

// ---------------------------------------------------------------------------
// Validation (light: catches mistakes that would break pages)
// ---------------------------------------------------------------------------
const hex = z.string().regex(/^#[0-9a-f]{6}$/i, "must be a 6-digit hex colour like #2563eb");
const base = {
  sparcVersion: z.literal(1),
  styleLevel: z.enum(["basic", "good", "amazing", "astonishing"]),
  brand: z.object({ name: z.string().min(1), logoUrl: z.string().optional(), logoText: z.string().optional() }),
  theme: z.object({ primary: hex }).passthrough(),
  rooms: z.object({ enabled: z.array(z.string()) }),
};

/** Module ids that would clash with the portal's own pages. */
export const RESERVED_MODULE_IDS = ["login", "signup", "forgot-password", "profile", "settings", "users", "new"];

const moduleSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  tableName: z.string().regex(/^[a-z0-9_]+$/),
  singularName: z.string().min(1),
  pluralName: z.string().min(1),
  fields: z.array(z.object({ key: z.string().min(1), label: z.string().min(1), type: z.string(), required: z.boolean() }).passthrough()).min(1),
  listColumns: z.array(z.string()),
  tableFeatures: z.object({ sort: z.boolean(), filter: z.boolean(), search: z.boolean(), pagination: z.boolean(), export: z.boolean() }),
}).passthrough();

const portalSchema = z.object({
  ...base,
  websiteType: z.literal("admin-portal"),
  loginPage: z.object({ headline: z.string().min(1) }).passthrough(),
  modules: z.array(moduleSchema).min(1),
}).passthrough();

const siteSchema = z.object({
  ...base,
  websiteType: z.enum(["portfolio", "landing", "ecommerce", "booking"]),
  meta: z.object({ title: z.string().min(1) }).passthrough(),
  sections: z.object({ hero: z.object({ title: z.string().min(1) }).passthrough() }).passthrough(),
}).passthrough();

export interface ConfigCheck<T> {
  ok: boolean;
  config?: T;
  blueprint?: ActiveBlueprint;
  errors: string[];
}

function issues(err: z.ZodError): string[] {
  return err.issues.map((i) => `${i.path.join(".") || "config"}: ${i.message}`);
}

function roomRules(bp: ActiveBlueprint, enabled: string[], errors: string[]) {
  for (const id of enabled) {
    if (!bp.rooms.optional.includes(id as RoomId)) errors.push(`rooms.enabled: "${id}" is not an optional room of ${bp.id}`);
  }
}

export function checkPortalConfig(raw: unknown): ConfigCheck<PortalConfig> {
  const parsed = portalSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: issues(parsed.error) };
  const config = parsed.data as unknown as PortalConfig;
  const bp = getBlueprint("admin-portal");
  const errors: string[] = [];
  roomRules(bp, config.rooms.enabled, errors);
  const ids = new Set<string>();
  for (const m of config.modules) {
    if (ids.has(m.id)) errors.push(`modules: duplicate id "${m.id}"`);
    ids.add(m.id);
    if (RESERVED_MODULE_IDS.includes(m.id)) errors.push(`modules: id "${m.id}" is reserved for a built-in page`);
    const keys = new Set(m.fields.map((f) => f.key));
    if (keys.size !== m.fields.length) errors.push(`modules.${m.id}: duplicate field keys`);
    for (const c of m.listColumns) if (!keys.has(c)) errors.push(`modules.${m.id}: list column "${c}" is not a field`);
  }
  return { ok: errors.length === 0, config, blueprint: bp, errors };
}

const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

function checkStore(config: SiteConfig, errors: string[]) {
  const store = config.store;
  if (!store) return void errors.push("store: an e-commerce site needs a store section (currency, payment)");
  if (!/^[A-Z]{3}$/.test(store.currency ?? "")) errors.push("store.currency: use a 3-letter code like INR");
  const mode = store.payment?.mode;
  if (!["test", "razorpay", "stripe"].includes(mode as string)) errors.push("store.payment.mode: must be test, razorpay or stripe");
  else if (mode !== "test" && !store.payment.endpoint) errors.push(`store.payment.endpoint: ${mode} needs the URL of your server payment function`);
  const products = config.sections["product-list"]?.products ?? [];
  if (products.length === 0) errors.push("sections.product-list: add at least one product");
  const seen = new Set<string>();
  for (const p of products) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.id)) errors.push(`products: id "${p.id}" must be lowercase-with-dashes`);
    if (seen.has(p.id)) errors.push(`products: duplicate id "${p.id}"`);
    seen.add(p.id);
    if (!(typeof p.price === "number" && p.price >= 0)) errors.push(`products.${p.id}: price must be a number, 0 or more`);
  }
}

function checkBooking(config: SiteConfig, errors: string[]) {
  const b = config.booking;
  if (!b) return void errors.push("booking: a booking site needs a booking section (services, availability)");
  if (!/^[A-Z]{3}$/.test(b.currency ?? "")) errors.push("booking.currency: use a 3-letter code like INR");
  if (!b.services?.length) errors.push("booking.services: add at least one service");
  const seen = new Set<string>();
  for (const s of b.services ?? []) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.id)) errors.push(`booking.services: id "${s.id}" must be lowercase-with-dashes`);
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

/** Rooms the site shell builds itself from brand/meta, so they need no `sections` entry. */
const SHELL_BUILT_SITE_ROOMS = new Set<string>([
  "navbar",
  "footer",
  "not-found",
  "contact-form",
  "newsletter",
  // shop and booking rooms get their content from `store` / `booking`, checked below
  "product-page",
  "cart",
  "checkout-payment",
  "order-confirmation",
  "services-list",
  "slot-picker",
  "booking-form",
  "booking-confirmation",
]);

export function checkSiteConfig(raw: unknown): ConfigCheck<SiteConfig> {
  const parsed = siteSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: issues(parsed.error) };
  const config = parsed.data as unknown as SiteConfig;
  const bp = getBlueprint(config.websiteType);
  const errors: string[] = [];
  roomRules(bp, config.rooms.enabled, errors);
  const needed = [...bp.rooms.required, ...bp.rooms.optional.filter((r) => config.rooms.enabled.includes(r))];
  for (const room of needed) {
    if (SHELL_BUILT_SITE_ROOMS.has(room)) continue;
    if (!(room in config.sections)) errors.push(`sections: "${room}" is switched on but has no content`);
  }
  if (config.websiteType === "ecommerce") checkStore(config, errors);
  if (config.websiteType === "booking") checkBooking(config, errors);
  return { ok: errors.length === 0, config, blueprint: bp, errors };
}
