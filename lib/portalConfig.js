// Pure portal-config logic: normalise a user config and turn it into the
// runtime config each template reads. Moved out of index.js unchanged so it
// can be tested and reused (SPARC AI Phase 0). Keep this file free of I/O
// except reading a template's bundled default config.
import crypto from "node:crypto";
import path from "node:path";
import fs from "fs-extra";
import { z } from "zod";
import { tableNameForModule } from "./schemaGenerator.js";
import { FIELD_TYPE_NAMES, OPTION_FIELD_TYPE_NAMES } from "./fieldTypes.js";

const NAME_RE = /^[a-z0-9-_]+$/i;
const OPTION_FIELD_TYPES = new Set(OPTION_FIELD_TYPE_NAMES);
const PORTAL_FIELD_TYPES = new Set(FIELD_TYPE_NAMES);

const PORTAL_INDUSTRIES = [
  "healthcare",
  "crm",
  "hrms",
  "school",
  "inventory",
  "erp",
  "generic",
];

const INDUSTRY_DEFAULTS = {
  generic: {
    badge: "Business Operations",
    headline: "Run your operations from one focused workspace",
    highlightText: "operations",
    description: "Manage records, tasks, approvals, and daily workflows from one secure dashboard.",
    footerText: "Powered by your operations team",
  },
  healthcare: {
    badge: "Care Operations",
    headline: "Coordinate care records with clarity",
    highlightText: "care records",
    description: "Track visits, appointments, teams, and operational workflows from one secure portal.",
    footerText: "Secure care operations portal",
  },
  crm: {
    badge: "Customer Management",
    headline: "Manage your customers with ease",
    highlightText: "customers",
    description: "Manage records, workflows, and operations from one place.",
    footerText: "Customer operations workspace",
  },
  hrms: {
    badge: "People Operations",
    headline: "Manage employees, leave, and HR workflows",
    highlightText: "employees",
    description: "Keep employee records, approvals, and HR operations organized in one secure portal.",
    footerText: "People operations portal",
  },
  school: {
    badge: "School Management",
    headline: "Run student and campus operations smoothly",
    highlightText: "student",
    description: "Manage student records, fees, classes, and school workflows from a single dashboard.",
    footerText: "School administration portal",
  },
  inventory: {
    badge: "Inventory Control",
    headline: "Track stock, products, and movement in real time",
    highlightText: "stock",
    description: "Manage inventory records, stock movement, suppliers, and reorder workflows from one place.",
    footerText: "Inventory operations portal",
  },
  erp: {
    badge: "Enterprise Operations",
    headline: "Bring vendors, purchases, and operations together",
    highlightText: "operations",
    description: "Coordinate enterprise records, procurement workflows, and approvals from one system.",
    footerText: "Enterprise operations portal",
  },
};

const THEME_PRESET_COLORS = {
  blue: "#2563eb",
  red: "#dc2626",
  green: "#16a34a",
  purple: "#7c3aed",
  slate: "#334155",
};

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function safePortalSlug(value) {
  const slug = slugify(value);
  return NAME_RE.test(slug) ? slug : "";
}

function initialsForName(value = "") {
  const words = String(value || "")
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "AP";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

function industryDefaults(industry = "generic") {
  return INDUSTRY_DEFAULTS[industry] || INDUSTRY_DEFAULTS.generic;
}

function normalizeLoginPage(rawLoginPage = {}, { appName, industry, footerText }) {
  const defaults = industryDefaults(industry);
  const features = Array.isArray(rawLoginPage.features)
    ? rawLoginPage.features
        .map((feature) => ({
          title: String(feature?.title || "").trim(),
          description: String(feature?.description || "").trim(),
        }))
        .filter((feature) => feature.title && feature.description)
    : [];

  return {
    portalName: rawLoginPage.portalName || appName,
    badge: rawLoginPage.badge || defaults.badge,
    headline: rawLoginPage.headline || defaults.headline,
    highlightText: rawLoginPage.highlightText || defaults.highlightText,
    description: rawLoginPage.description || defaults.description,
    features: features.length
      ? features
      : [
          {
            title: "Secure Access",
            description: "Enterprise-grade authentication for authorized users.",
          },
          {
            title: "Self Service",
            description: "Manage records, workflows, and operations from one dashboard.",
          },
        ],
    footerText: rawLoginPage.footerText || footerText || defaults.footerText,
  };
}

function hexToRgb(hex) {
  const normalized = String(hex || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return { r: 37, g: 99, b: 235 };
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b]
    .map((component) => Math.max(0, Math.min(255, Math.round(component))).toString(16).padStart(2, "0"))
    .join("")}`;
}

function mixHex(hex, mixWith, weight = 0.5) {
  const a = hexToRgb(hex);
  const b = hexToRgb(mixWith);
  return rgbToHex({
    r: a.r * (1 - weight) + b.r * weight,
    g: a.g * (1 - weight) + b.g * weight,
    b: a.b * (1 - weight) + b.b * weight,
  });
}

function hexToHsl(hex) {
  const { r, g, b } = hexToRgb(hex);
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const delta = max - min;
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    switch (max) {
      case red:
        h = (green - blue) / delta + (green < blue ? 6 : 0);
        break;
      case green:
        h = (blue - red) / delta + 2;
        break;
      default:
        h = (red - green) / delta + 4;
        break;
    }
    h /= 6;
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function themeTokensFromColor(hex) {
  const { r, g, b } = hexToRgb(hex);
  const primaryHover = mixHex(hex, "#000000", 0.18);
  const primaryLight = mixHex(hex, "#ffffff", 0.88);
  const accent = mixHex(hex, "#ffffff", 0.12);
  const accent2 = mixHex(hex, "#ffffff", 0.68);
  const { r: ar, g: ag, b: ab } = hexToRgb(accent);
  const { r: a2r, g: a2g, b: a2b } = hexToRgb(accent2);
  return {
    primary: hexToHsl(hex),
    "primary-hover": hexToHsl(primaryHover),
    "primary-light": hexToHsl(primaryLight),
    ring: hexToHsl(hex),
    "sidebar-ring": hexToHsl(hex),
    "auth-panel-orb": hexToHsl(hex),
    "brand-primary": hex,
    "brand-primary-hover": primaryHover,
    "brand-primary-light": primaryLight,
    "brand-primary-rgb": `${r}, ${g}, ${b}`,
    "brand-accent": accent,
    "brand-accent-2": accent2,
    "brand-accent-rgb": `${ar}, ${ag}, ${ab}`,
    "brand-accent-2-rgb": `${a2r}, ${a2g}, ${a2b}`,
    "gradient-start": hex,
    "gradient-end": primaryHover,
    "chart-primary": hex,
    "chart-secondary": accent,
    "chart-tertiary": accent2,
  };
}

function nowIso() {
  return new Date().toISOString();
}

const portalFieldSchema = z
  .object({
    id: z.string().optional(),
    key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
    label: z.string().min(1),
    type: z.string().min(1),
    required: z.boolean().default(false),
    width: z.enum(["full", "half", "third"]).default("full"),
    placeholder: z.string().optional().default(""),
    helpText: z.string().optional().default(""),
    options: z.array(z.string()).optional().default([]),
    settings: z.record(z.any()).optional().default({}),
    features: z
      .object({
        filter: z.boolean().optional().default(false),
      })
      .passthrough()
      .optional()
      .default({ filter: false }),
  })
  .passthrough();

const portalModuleSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    singularName: z.string().min(1),
    pluralName: z.string().min(1),
    icon: z.string().optional().default("Database"),
    fields: z.array(portalFieldSchema).min(1),
    listColumns: z.array(z.string()).optional().default([]),
    tableFeatures: z
      .object({
        sort: z.boolean().optional().default(true),
        filter: z.boolean().optional().default(true),
        search: z.boolean().optional().default(true),
        pagination: z.boolean().optional().default(true),
        export: z.boolean().optional().default(false),
      })
      .optional()
      .default({
        sort: true,
        filter: true,
        search: true,
        pagination: true,
        export: false,
      }),
  })
  .passthrough();

const portalLoginPageSchema = z
  .object({
    portalName: z.string().optional().default(""),
    badge: z.string().optional().default(""),
    headline: z.string().optional().default(""),
    highlightText: z.string().optional().default(""),
    description: z.string().optional().default(""),
    features: z
      .array(
        z.object({
          title: z.string().default(""),
          description: z.string().default(""),
        })
      )
      .optional()
      .default([]),
    footerText: z.string().optional().default(""),
  })
  .passthrough()
  .optional()
  .default({});

const portalConfigSchema = z
  .object({
    version: z.number().optional().default(1),
    templateId: z.string().optional().default("portal-admin"),
    slug: z.string().min(1),
    portalName: z.string().min(1),
    appName: z.string().min(1),
    type: z.enum(["admin", "insurance", "management", "custom"]).default("admin"),
    industry: z.enum(PORTAL_INDUSTRIES).optional().default("generic"),
    themePreset: z.string().optional().default("custom"),
    themeColor: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .default("#1e40af"),
    logoUrl: z.string().optional().default(""),
    logoText: z.string().optional().default(""),
    loginPage: portalLoginPageSchema,
    footer: z
      .object({
        text: z.string().optional().default(""),
      })
      .passthrough()
      .optional()
      .default({}),
    company: z
      .object({
        name: z.string().optional().default(""),
        website: z.string().optional().default(""),
        supportEmail: z.string().optional().default(""),
        address: z.string().optional().default(""),
      })
      .passthrough()
      .optional()
      .default({}),
    auth: z
      .object({
        screens: z
          .object({
            login: z.boolean().optional().default(true),
            signup: z.boolean().optional().default(true),
            forgotPassword: z.boolean().optional().default(false),
          })
          .optional()
          .default({ login: true, signup: true, forgotPassword: false }),
        method: z.enum(["email-password", "magic-link"]).default("email-password"),
      })
      .optional()
      .default({
        screens: { login: true, signup: true, forgotPassword: false },
        method: "email-password",
      }),
    dashboard: z
      .object({
        enabled: z.boolean().optional().default(true),
        template: z
          .enum(["stats-overview", "charts", "minimal"])
          .optional()
          .default("stats-overview"),
      })
      .optional()
      .default({ enabled: true, template: "stats-overview" }),
    profile: z
      .object({
        enabled: z.boolean().optional().default(true),
      })
      .optional()
      .default({ enabled: true }),
    modules: z.array(portalModuleSchema).min(1),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough();

function normalizePortalConfig(rawConfig) {
  const rawSlug = safePortalSlug(rawConfig?.slug || rawConfig?.portalName || rawConfig?.appName);
  if (!rawSlug) {
    throw new Error("Portal slug is invalid.");
  }
  const appName = String(rawConfig?.appName || rawConfig?.portalName || rawSlug);
  const industry = PORTAL_INDUSTRIES.includes(rawConfig?.industry)
    ? rawConfig.industry
    : "generic";
  const requestedThemePreset = String(
    rawConfig?.themePreset ||
      (typeof rawConfig?.theme === "string" ? rawConfig.theme : "") ||
      "custom"
  ).toLowerCase();
  const themeColor =
    rawConfig?.themeColor ||
    THEME_PRESET_COLORS[requestedThemePreset] ||
    THEME_PRESET_COLORS.blue;
  const footerText =
    rawConfig?.footer?.text ||
    rawConfig?.loginPage?.footerText ||
    industryDefaults(industry).footerText;
  const loginPage = normalizeLoginPage(rawConfig?.loginPage || {}, {
    appName,
    industry,
    footerText,
  });

  const modules = (rawConfig.modules || []).map((module) => {
    const id = safePortalSlug(module.id || module.pluralName || module.singularName);
    const fields = (module.fields || []).map((field) => {
      const key = String(
        field.key ||
          slugify(field.label || field.id)
            .replace(/-/g, "_")
      );
      return {
        ...field,
        id: field.id || crypto.randomUUID(),
        key,
        type: PORTAL_FIELD_TYPES.has(field.type) ? field.type : "text",
        features: {
          filter: !!field.features?.filter,
          ...(field.features || {}),
        },
      };
    });
    const listColumns = (module.listColumns || []).filter((key) =>
      fields.some((field) => field.key === key)
    );
    return {
      ...module,
      id,
      fields,
      listColumns: listColumns.length
        ? listColumns
        : fields.slice(0, 5).map((field) => field.key),
    };
  });

  const parsed = portalConfigSchema.parse({
    ...rawConfig,
    slug: rawSlug,
    appName,
    industry,
    themePreset: requestedThemePreset,
    themeColor,
    logoText: rawConfig?.logoText || initialsForName(appName),
    footer: {
      ...(rawConfig?.footer || {}),
      text: footerText,
    },
    company: {
      name: rawConfig?.company?.name || appName,
      website: rawConfig?.company?.website || "",
      supportEmail: rawConfig?.company?.supportEmail || "",
      address: rawConfig?.company?.address || "",
      ...(rawConfig?.company || {}),
    },
    loginPage,
    modules,
    createdAt: rawConfig.createdAt || nowIso(),
    updatedAt: nowIso(),
  });

  const moduleIds = new Set();
  for (const module of parsed.modules) {
    if (moduleIds.has(module.id)) {
      throw new Error(`Duplicate module id "${module.id}".`);
    }
    moduleIds.add(module.id);
    const fieldKeys = new Set();
    for (const field of module.fields) {
      if (fieldKeys.has(field.key)) {
        throw new Error(`Duplicate field key "${field.key}" in ${module.pluralName}.`);
      }
      fieldKeys.add(field.key);
    }
  }

  return parsed;
}

function numberSetting(value) {
  if (value === "" || value === undefined || value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalRecordValue(schema) {
  return z.preprocess(
    (value) => (value === "" ? undefined : value),
    schema.optional().nullable()
  );
}

function schemaForPortalField(field) {
  const settings = field.settings || {};
  let schema;

  switch (field.type) {
    case "email":
      schema = z.string().email(`${field.label} must be a valid email.`);
      break;
    case "number":
    case "currency": {
      schema = z.coerce.number();
      const min = numberSetting(settings.min);
      const max = numberSetting(settings.max);
      if (min !== undefined) schema = schema.min(min);
      if (max !== undefined) schema = schema.max(max);
      break;
    }
    case "select":
    case "radio": {
      const options = (field.options || []).filter(Boolean);
      schema = z.string();
      if (options.length) {
        schema = schema.refine((value) => options.includes(value), {
          message: `${field.label} must match a configured option.`,
        });
      }
      break;
    }
    case "multi-select":
    case "tags":
      schema = z.preprocess((value) => {
        if (Array.isArray(value)) return value;
        if (typeof value === "string") {
          return value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
        }
        return [];
      }, z.array(z.string()));
      break;
    case "checkbox":
    case "toggle":
      schema = z.boolean();
      break;
    case "date":
    case "file":
    case "image":
    case "password":
    case "textarea":
    case "text":
    default: {
      schema = z.string();
      const minLength = numberSetting(settings.minLength);
      const maxLength = numberSetting(settings.maxLength);
      if (minLength !== undefined) schema = schema.min(minLength);
      if (maxLength !== undefined) schema = schema.max(maxLength);
      break;
    }
  }

  if (field.required) {
    if (field.type === "multi-select" || field.type === "tags") {
      return schema.refine((value) => value.length > 0, {
        message: `${field.label} is required.`,
      });
    }
    if (field.type === "checkbox" || field.type === "toggle") {
      return schema;
    }
    return schema.refine((value) => value !== undefined && value !== "", {
      message: `${field.label} is required.`,
    });
  }

  return optionalRecordValue(schema);
}

function buildRecordSchema(module) {
  const shape = {};
  for (const field of module.fields || []) {
    shape[field.key] = schemaForPortalField(field);
  }
  return z.object(shape).strip();
}

function generatedModuleAction(module) {
  return {
    title: module.pluralName,
    description: `Manage ${String(module.pluralName || "records").toLowerCase()} records`,
    icon: module.icon || "Database",
    href: `/organization/crud/${module.id}`,
    gradient: "gradient-primary",
  };
}

function generatedModulePermissions(module) {
  const resource = tableNameForModule(module) || module.id;
  return {
    read: `${resource}:read`,
    write: `${resource}:write`,
    delete: `${resource}:delete`,
  };
}

function buildGeneratedModules(config) {
  return (config.modules || []).map((module) => ({
    id: module.id,
    tableName: module.tableName || tableNameForModule(module),
    singularName: module.singularName,
    pluralName: module.pluralName,
    icon: module.icon || "Database",
    permissions: module.permissions || generatedModulePermissions(module),
    fields: (module.fields || []).map((field) => ({
      key: field.key,
      label: field.label,
      type: field.type,
      required: !!field.required,
      ...(OPTION_FIELD_TYPES.has(field.type) && field.options?.length ? { options: field.options } : {}),
      width: field.width || "full",
      placeholder: field.placeholder || "",
      helpText: field.helpText || "",
    })),
    listColumns: module.listColumns?.length
      ? module.listColumns
      : (module.fields || []).slice(0, 5).map((field) => field.key),
    tableFeatures: {
      sort: module.tableFeatures?.sort !== false,
      filter: module.tableFeatures?.filter !== false,
      search: module.tableFeatures?.search !== false,
      pagination: module.tableFeatures?.pagination !== false,
      export: !!module.tableFeatures?.export,
    },
  }));
}

function buildDashboardConfig(config, generatedModules) {
  const loginPage = config.loginPage || normalizeLoginPage({}, {
    appName: config.appName,
    industry: config.industry,
    footerText: config.footer?.text,
  });
  const actions = generatedModules.map(generatedModuleAction);
  const primaryActions = actions.slice(0, Math.min(3, actions.length));
  const secondaryActions = actions.slice(primaryActions.length);

  return {
    enabled: config.dashboard?.enabled !== false,
    template: config.dashboard?.template || "stats-overview",
    style: config.dashboard?.style || config.industry || "generic",
    heroTitle: loginPage.headline,
    heroSubtitle: loginPage.description,
    primaryActions,
    secondaryActions,
    sectionTitle: secondaryActions.length ? "More Modules" : "Workspace Modules",
    emptyTitle: "No modules configured",
    emptyDescription: "Add CRUD modules in the platform wizard to populate this dashboard.",
  };
}

function auditPortalRuntimeConfig(config) {
  const errors = [];
  const warnings = [];
  const industry = config.industry || "generic";
  const text = JSON.stringify(config || {}).toLowerCase();
  const bannedHealthcareTerms = [
    "wc-health",
    "aidin",
    "hipaa",
    "payer",
    "clinic",
    "patient records",
    "patients & claims",
    "claim status",
    "demo health",
  ];

  if (!config.appName && !config.portalName) {
    errors.push("Runtime config is missing appName/portalName.");
  }
  if (!config.loginPage?.headline || !config.loginPage?.description) {
    errors.push("Runtime config is missing login page copy.");
  }
  if (!Array.isArray(config.navigation) || config.navigation.length === 0) {
    errors.push("Runtime config has no navigation items.");
  }
  if (!Array.isArray(config.generatedModules) || config.generatedModules.length === 0) {
    errors.push("Runtime config has no generated modules.");
  }
  if (industry !== "healthcare") {
    const matches = bannedHealthcareTerms.filter((term) => text.includes(term));
    if (matches.length) {
      errors.push(`Runtime config contains template/healthcare leakage: ${matches.join(", ")}.`);
    }
  }
  if (!config.logo?.src && !config.logo?.text) {
    warnings.push("No uploaded logo found. Generated project will use fallback initials.");
  }

  return { errors, warnings };
}

async function buildPortalAdminRuntimeConfig(config, { templatesDir }) {
  const defaultConfigPath = path.join(templatesDir, config.templateId === undefined ? "portal-admin" : config.templateId, "src", "portal-config.json");
  const defaultConfig = await fs.readJson(defaultConfigPath);
  const generatedModules = buildGeneratedModules(config);

  const generatedNavItems = generatedModules.map((module) => ({
    label: module.pluralName,
    icon: module.icon || "Database",
    path: `/organization/crud/${module.id}`,
    permission: "dashboard:read",
  }));

  const navigation = [
    {
      label: "Dashboard",
      icon: "LayoutDashboard",
      path: "/organization/dashboard",
      permission: "dashboard:read",
    },
    ...generatedNavItems,
  ];
  if (config.profile?.enabled !== false) {
    navigation.push({
      label: "Profile",
      icon: "UserRound",
      path: "/organization/profile",
      permission: "dashboard:read",
    });
  }

  const loginPage = normalizeLoginPage(config.loginPage || {}, {
    appName: config.appName,
    industry: config.industry,
    footerText: config.footer?.text,
  });
  const themeTokens = themeTokensFromColor(config.themeColor || "#2563eb");
  const logoText = config.logoText || initialsForName(config.appName || config.portalName);

  return {
    ...defaultConfig,
    appName: config.appName,
    portalName: config.appName || config.portalName || defaultConfig.portalName,
    industry: config.industry || "generic",
    themePreset: config.themePreset || "custom",
    runtime: {
      ...(defaultConfig.runtime || {}),
      legacyRoutesEnabled: false,
      blockMobile: false,
    },
    auth: config.auth || defaultConfig.auth,
    footer: {
      ...(defaultConfig.footer || {}),
      ...(config.footer || {}),
      text: config.footer?.text || loginPage.footerText,
    },
    company: {
      name: config.company?.name || config.appName,
      website: config.company?.website || "",
      supportEmail: config.company?.supportEmail || "",
      address: config.company?.address || "",
    },
    loginPage,
    dashboard: buildDashboardConfig({ ...config, loginPage }, generatedModules),
    navigation,
    generatedModules,
    entities: [],
    logo: {
      ...(defaultConfig.logo || {}),
      src: config.logoUrl || "",
      text: logoText,
      alt: config.appName || defaultConfig.logo?.alt || defaultConfig.portalName,
    },
    theme: {
      ...(defaultConfig.theme || {}),
      mode: config.themeMode || defaultConfig.theme?.mode || "system",
      name: config.themePreset || "custom",
      primary: config.themeColor || "#2563eb",
      primaryHover: themeTokens["brand-primary-hover"],
      primaryLight: themeTokens["brand-primary-light"],
      accent: themeTokens["brand-accent"],
      tokens: {
        ...(defaultConfig.theme?.tokens || {}),
        ...themeTokens,
      },
    },
  };
}

function buildTopbarRuntimeConfig(config) {
  const generatedModules = buildGeneratedModules(config);
  const loginPage = normalizeLoginPage(config.loginPage || {}, {
    appName: config.appName,
    industry: config.industry,
    footerText: config.footer?.text,
  });
  const themeColor = config.themeColor || "#2563eb";
  const themeTokens = themeTokensFromColor(themeColor);
  const logoInitials = config.logoText || initialsForName(config.appName || config.portalName);

  return {
    portalName: config.portalName || config.appName,
    appName: config.appName,
    industry: config.industry || "generic",
    logo: config.logoUrl || "",
    logoInitials,
    theme: {
      primary: themeColor,
      primaryHover: themeTokens["brand-primary-hover"],
      primaryLight: themeTokens["brand-primary-light"],
      accent: themeTokens["brand-accent"],
    },
    loginPage: {
      ...loginPage,
      features: (loginPage.features || []).map((feature, index) => ({
        ...feature,
        icon: feature.icon || (index === 0 ? "ShieldCheck" : "LayoutGrid"),
      })),
    },
    routes: {
      loginPath: "/login",
      appBasePath: "/organization",
      dashboardPath: "/organization/dashboard",
      profilePath: "/organization/profile",
    },
    dashboard: {
      enabled: config.dashboard?.enabled !== false,
      label: "Dashboard",
      icon: "LayoutDashboard",
      title: config.appName,
      description: `${config.appName} operational overview`,
      widgets: ["module-counts", "currency-sum", "status-breakdown", "created-trend"],
    },
    footer: {
      text: config.footer?.text || loginPage.footerText,
    },
    company: {
      name: config.company?.name || config.appName,
      website: config.company?.website || "",
      address: config.company?.address || "",
    },
    support: {
      email: config.company?.supportEmail || "",
      phone: "",
      helpUrl: config.company?.website || "",
    },
    featureFlags: {
      profile: config.profile?.enabled !== false,
      signup: config.auth?.screens?.signup === true,
    },
    generatedModules,
  };
}

export {
  NAME_RE,
  OPTION_FIELD_TYPES,
  PORTAL_FIELD_TYPES,
  PORTAL_INDUSTRIES,
  INDUSTRY_DEFAULTS,
  THEME_PRESET_COLORS,
  slugify,
  safePortalSlug,
  initialsForName,
  industryDefaults,
  normalizeLoginPage,
  hexToRgb,
  rgbToHex,
  mixHex,
  hexToHsl,
  themeTokensFromColor,
  nowIso,
  portalFieldSchema,
  portalModuleSchema,
  portalLoginPageSchema,
  portalConfigSchema,
  normalizePortalConfig,
  numberSetting,
  optionalRecordValue,
  schemaForPortalField,
  buildRecordSchema,
  generatedModuleAction,
  generatedModulePermissions,
  buildGeneratedModules,
  buildDashboardConfig,
  auditPortalRuntimeConfig,
  buildPortalAdminRuntimeConfig,
  buildTopbarRuntimeConfig,
};
