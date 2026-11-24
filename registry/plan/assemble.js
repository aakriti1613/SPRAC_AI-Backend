// Turn planner "signals" (the decisions) into a full SPARC config by EXPANDING
// library modules (reuse-first) rather than inventing fields. Both the offline
// and the Gemini planner produce the same signals and call this, so the config
// is built one way and always validated.
import { MODULE_LIBRARY } from "../../sparc/modules.js";
import { checkSparcConfig } from "../../sparc/config.js";
import { getBlueprint } from "../../sparc/index.js";
import { THEME_PRESET_COLORS, INDUSTRY_DEFAULTS } from "../../lib/portalConfig.js";
import { levelsUpTo } from "../../sparc/styleLevels.js";

const MODULES = new Map(MODULE_LIBRARY.map((m) => [m.id, m]));
const INDUSTRY_COLOR = { healthcare: "#0f766e", crm: "#4f46e5", hrms: "#7c3aed", school: "#2563eb", inventory: "#ea580c", erp: "#334155", generic: "#2563eb" };

function themeFor(industry, styleLevel, chosenColor) {
  const chosen = /^#[0-9a-f]{6}$/i.test(chosenColor || "") ? chosenColor.toLowerCase() : null; // the user's own colour, when valid
  return {
    primary: chosen || INDUSTRY_COLOR[industry] || THEME_PRESET_COLORS.blue,
    mode: "light",
    radius: styleLevel === "basic" ? "md" : "lg",
    density: "comfortable",
    buttonSize: "md",
    font: "system",
  };
}

const initials = (name) =>
  name.replace(/[^a-zA-Z0-9 ]/g, " ").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "AP";

/**
 * Optional rooms that end up switched on: the blueprint's defaults, the industry's
 * defaults and what the user turned on — minus anything the user turned off.
 */
function enabledRoomsFor(bp, signals) {
  const off = new Set(signals.disabledOptional || []);
  return [...new Set([...(bp.rooms.defaultOn || []), ...(bp.industryDefaults?.[signals.industry] || []), ...(signals.enabledOptional || [])])].filter((r) => bp.rooms.optional.includes(r) && !off.has(r));
}

/** Build an admin-portal config from chosen library module ids. */
function assemblePortal(signals) {
  const bp = getBlueprint("admin-portal");
  const level = levelsUpTo(bp.maxStyleLevel).includes(signals.styleLevel) ? signals.styleLevel : bp.maxStyleLevel;
  const defaults = INDUSTRY_DEFAULTS[signals.industry] || INDUSTRY_DEFAULTS.generic;
  const usedIds = [];
  const unknownIds = [];
  const modules = [];
  for (const id of signals.moduleIds) {
    const m = MODULES.get(id);
    if (!m) {
      unknownIds.push(id);
      continue;
    }
    usedIds.push(id);
    modules.push({
      id: m.id,
      singularName: m.singularName,
      pluralName: m.pluralName,
      icon: m.icon,
      fields: m.fields.map((f) => ({ ...f })),
      listColumns: [...m.listColumns],
    });
  }
  const enabled = enabledRoomsFor(bp, signals);
  const config = {
    sparcVersion: 1,
    websiteType: "admin-portal",
    styleLevel: level,
    industry: signals.industry,
    brand: { name: signals.brandName, logoText: initials(signals.brandName) },
    theme: themeFor(signals.industry, level, signals.themeColor),
    rooms: { enabled },
    loginPage: { badge: defaults.badge, headline: defaults.headline, description: defaults.description },
    modules,
  };
  return { config, usedIds, unknownIds };
}

/** Starter shop: three editable products, practice-card payments. */
function addStoreContent(config, signals) {
  const name = signals.brandName;
  config.store = { currency: "INR", payment: { mode: "test" } };
  config.nav = { cta: { label: "View cart", href: "/cart" } };
  config.sections.hero = {
    title: signals.headline || `Shop ${name}`,
    subtitle: signals.subtitle || (signals.description || "").slice(0, 140),
    primaryCta: { label: "Shop now", href: "#products" },
  };
  config.sections["product-list"] = {
    heading: "Our products",
    products: [
      { id: "product-one", name: "Product one", description: "Describe this product.", price: 499 },
      { id: "product-two", name: "Product two", description: "Describe this product.", price: 799 },
      { id: "product-three", name: "Product three", description: "Describe this product.", price: 1299 },
    ],
  };
}

/** Starter booking site: three editable services, Monday to Saturday 9 to 5. */
function addBookingContent(config, signals) {
  const name = signals.brandName;
  config.booking = {
    currency: "INR",
    services: [
      { id: "consultation", name: "Consultation", description: "Describe this service.", durationMin: 30, price: 500 },
      { id: "follow-up", name: "Follow-up visit", description: "Describe this service.", durationMin: 15, price: 300 },
      { id: "extended-session", name: "Extended session", description: "Describe this service.", durationMin: 60, price: 900 },
    ],
    availability: { days: [1, 2, 3, 4, 5, 6], open: "09:00", close: "17:00", stepMin: 30, leadHours: 2, horizonDays: 30 },
  };
  config.nav = { cta: { label: "Book now", href: "#services" } };
  config.sections.hero = {
    title: signals.headline || `Book your visit at ${name}`,
    subtitle: signals.subtitle || (signals.description || "").slice(0, 140),
    primaryCta: { label: "Book now", href: "#services" },
  };
}

/** Build a portfolio/landing config with sensible section content. */
function assembleSite(signals) {
  const bp = getBlueprint(signals.websiteType);
  const level = levelsUpTo(bp.maxStyleLevel).includes(signals.styleLevel) ? signals.styleLevel : bp.maxStyleLevel;
  const name = signals.brandName;
  const enabled = enabledRoomsFor(bp, signals);

  const sections = {
    hero: {
      title: signals.headline || (signals.websiteType === "portfolio" ? `Hi, I'm ${name}` : `Welcome to ${name}`),
      subtitle: signals.subtitle || (signals.description || "").slice(0, 140),
      primaryCta: { label: signals.websiteType === "portfolio" ? "See my work" : "Get in touch", href: "#contact-form" },
    },
  };
  // Give each switched-on content room a minimal, valid placeholder the user can edit.
  const filler = {
    about: { heading: "About", body: signals.description || `About ${name}.` },
    services: { heading: signals.websiteType === "portfolio" ? "What I do" : "Services", items: [{ title: "Service one", description: "Describe this service." }, { title: "Service two", description: "Describe this service." }] },
    projects: { heading: "Projects", items: [{ title: "Project one", description: "Describe this project." }] },
    skills: { heading: "Skills", groups: [{ name: "Skills", items: ["Add", "your", "skills"] }] },
    experience: { heading: "Experience", items: [{ title: "Role", organization: "Company", period: "Year" }] },
    education: { heading: "Education", items: [{ title: "Degree", organization: "Institute", period: "Year" }] },
    stats: { items: [{ value: "100+", label: "Happy clients" }, { value: "4.8", label: "Rating" }] },
    testimonials: { heading: "What people say", items: [{ quote: "Great work.", author: "A client" }] },
    pricing: { heading: "Pricing", plans: [{ name: "Standard", price: "₹999", features: ["Feature one"], cta: { label: "Choose", href: "#contact-form" } }] },
    faq: { heading: "FAQ", items: [{ question: "A question?", answer: "An answer." }] },
    team: { heading: "Our team", members: [{ name: "Team member", role: "Role" }] },
    gallery: { heading: "Gallery", images: [{ src: "/placeholder.jpg", alt: "Gallery image" }] },
    "location-map": { heading: "Visit us", address: "Your address here" },
    "cta-banner": { title: "Ready to start?", cta: { label: "Contact us", href: "#contact-form" } },
    contact: { heading: "Contact", links: [{ type: "email", label: "hello@example.com", href: "mailto:hello@example.com" }] },
    "resume-download": { label: "Download CV", href: "/cv.pdf" },
  };
  for (const room of [...bp.rooms.required, ...enabled]) {
    if (filler[room] && !sections[room]) sections[room] = filler[room];
  }
  const config = {
    sparcVersion: 1,
    websiteType: signals.websiteType,
    styleLevel: level,
    industry: signals.industry,
    brand: { name, logoText: initials(name) },
    theme: themeFor(signals.industry, level, signals.themeColor),
    rooms: { enabled },
    meta: { title: signals.websiteType === "portfolio" ? `${name} — Portfolio` : name, description: (signals.description || "").slice(0, 160) },
    sections,
  };
  if (signals.websiteType === "ecommerce") addStoreContent(config, signals);
  if (signals.websiteType === "booking") addBookingContent(config, signals);
  return { config, usedIds: [], unknownIds: [] };
}

/**
 * signals: { websiteType, industry, styleLevel, brandName, moduleIds?, enabledOptional?, description?, headline?, subtitle? }
 * Returns { ok, config, errors, usedIds, unknownIds }.
 */
export function assembleConfig(signals) {
  const built = signals.websiteType === "admin-portal" ? assemblePortal(signals) : assembleSite(signals);
  const check = checkSparcConfig(built.config);
  return { ok: check.ok, config: built.config, errors: check.errors, usedIds: built.usedIds, unknownIds: built.unknownIds };
}
