import { describe, expect, it } from "vitest";
import { checkPortalConfig, checkSiteConfig } from "@core/config";
import { contrastRatio, readableOn, themeVariables } from "@core/theme";
import { createMemoryBackend, DEMO_EMAIL, DEMO_PASSWORD } from "../shells/portal-shell/src/data/memory";
import { toCsv } from "../shells/portal-shell/src/logic/hooks";
import { validateRecord } from "../shells/portal-shell/src/logic/validation";
import portalConfig from "../shells/portal-shell/src/sparc.config.json";
import landingConfig from "../shells/site-shell/src/configs/landing.json";
import portfolioConfig from "../shells/site-shell/src/configs/portfolio.json";

const clone = <T,>(v: T): T => structuredClone(v);

describe("theme", () => {
  it("turns settings into CSS variables", () => {
    const v = themeVariables({ primary: "#0F766E", radius: "lg", density: "compact", buttonSize: "lg" });
    expect(v["--sparc-primary"]).toBe("#0f766e");
    expect(v["--sparc-radius"]).toBe("14px");
    expect(v["--sparc-density"]).toBe("0.85");
    expect(v["--sparc-control-h"]).toBe("3rem");
  });

  it("always picks readable text on the brand colour (WCAG AA for large text)", () => {
    for (const bg of ["#0f766e", "#7c3aed", "#facc15", "#ffffff", "#000000", "#2563eb", "#f97316"]) {
      expect(contrastRatio(bg, readableOn(bg))).toBeGreaterThanOrEqual(3);
    }
    expect(readableOn("#facc15")).toBe("#0f172a");
    expect(readableOn("#1e3a8a")).toBe("#ffffff");
  });

  it("falls back to a safe colour for bad input", () => {
    expect(themeVariables({ primary: "red" })["--sparc-primary"]).toBe("#2563eb");
  });
});

describe("record validation (same rules as the backend)", () => {
  const fields = portalConfig.modules[0].fields as never;
  it("reports required, email and option errors", () => {
    const r = validateRecord(fields, { name: "", email: "not-an-email", care_status: "Unknown" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.name).toMatch(/required/);
      expect(r.errors.email).toMatch(/valid email/);
      expect(r.errors.care_status).toMatch(/one of the options/);
    }
  });
  it("accepts a good record and stores empty optional values as null", () => {
    const r = validateRecord(fields, { name: "Aarav", care_status: "New", email: "", insured: true, notes: "" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.name).toBe("Aarav");
      expect(r.data.email).toBeNull();
      expect(r.data.insured).toBe(true);
    }
  });
  it("coerces numbers and tags", () => {
    const apptFields = portalConfig.modules[1].fields as never;
    const r = validateRecord(apptFields, { patient_name: "Diya", appointment_date: "2026-11-20", fee: "1200", tags: "urgent, follow-up" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.fee).toBe(1200);
      expect(r.data.tags).toEqual(["urgent", "follow-up"]);
    }
  });
});

describe("demo data store", () => {
  const modules = clone(portalConfig.modules) as never;
  const make = () => createMemoryBackend(modules, { seedCount: 12 });
  const q = (over = {}) => ({ search: "", searchKeys: ["name"], filters: {}, page: 1, pageSize: 5, ...over });

  it("seeds believable rows and pages them", async () => {
    const { data } = make();
    const r = await data.list("patients", q());
    expect(r.total).toBe(12);
    expect(r.rows).toHaveLength(5);
    expect(typeof r.rows[0].name).toBe("string");
  });

  it("searches, filters and sorts", async () => {
    const { data } = make();
    const all = await data.list("patients", q({ pageSize: 50 }));
    const first = String(all.rows[0].name).split(" ")[0];
    const found = await data.list("patients", q({ search: first.toLowerCase(), pageSize: 50 }));
    expect(found.total).toBeGreaterThan(0);
    expect(found.rows.every((r) => String(r.name).toLowerCase().includes(first.toLowerCase()))).toBe(true);
    const inCare = await data.list("patients", q({ filters: { care_status: "In Care" }, pageSize: 50 }));
    expect(inCare.rows.every((r) => r.care_status === "In Care")).toBe(true);
    const sorted = await data.list("patients", q({ sort: { key: "name", dir: "asc" }, pageSize: 50 }));
    const names = sorted.rows.map((r) => String(r.name));
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base", numeric: true })));
  });

  it("creates, updates and deletes", async () => {
    const { data } = make();
    const row = await data.create("patients", { name: "Zara Khan", care_status: "New" });
    expect((await data.get("patients", row.id))?.name).toBe("Zara Khan");
    await data.update("patients", row.id, { care_status: "Closed" });
    expect((await data.get("patients", row.id))?.care_status).toBe("Closed");
    await data.remove("patients", row.id);
    expect(await data.get("patients", row.id)).toBeNull();
    expect(await data.count("patients")).toBe(12);
  });

  it("aggregates for the dashboard", async () => {
    const { data } = make();
    const groups = await data.groupCount("patients", "care_status");
    expect(groups.reduce((n, g) => n + g.value, 0)).toBe(12);
    expect(await data.sum("appointments", "fee")).toBeGreaterThan(0);
  });

  it("demo login accepts only the demo password", async () => {
    const { auth } = make();
    await expect(auth.signIn(DEMO_EMAIL, "wrong")).rejects.toThrow(/Invalid/);
    expect((await auth.signIn(DEMO_EMAIL, DEMO_PASSWORD)).email).toBe(DEMO_EMAIL);
    expect(await auth.current()).not.toBeNull();
    await auth.signOut();
    expect(await auth.current()).toBeNull();
  });

  it("keeps data across reloads when given a storage key", async () => {
    const a = createMemoryBackend(modules, { storageKey: "test-store" });
    await a.data.create("patients", { name: "Persisted Person", care_status: "New" });
    const b = createMemoryBackend(modules, { storageKey: "test-store" });
    const r = await b.data.list("patients", q({ search: "persisted", pageSize: 50 }));
    expect(r.total).toBe(1);
  });

  it("exports CSV with labels and safe quoting", () => {
    const csv = toCsv(portalConfig.modules[0] as never, [{ id: "1", name: 'Aarav "AJ", Jr', care_status: "New", notes: "line1\nline2" }]);
    expect(csv.split("\n")[0]).toContain("Patient name");
    expect(csv).toContain('"Aarav ""AJ"", Jr"');
  });
});

describe("config checks", () => {
  it("the sample configs are valid", () => {
    expect(checkPortalConfig(portalConfig).errors).toEqual([]);
    expect(checkSiteConfig(portfolioConfig).errors).toEqual([]);
    expect(checkSiteConfig(landingConfig).errors).toEqual([]);
  });

  it("explains portal config mistakes", () => {
    const bad = clone(portalConfig) as Record<string, unknown> & typeof portalConfig;
    bad.rooms.enabled.push("hero");
    bad.modules[1].id = "patients";
    bad.modules[0].listColumns.push("ghost");
    (bad.modules[0] as { id: string }).id = "profile";
    const errors = checkPortalConfig(bad).errors.join("\n");
    expect(errors).toMatch(/"hero" is not an optional room/);
    expect(errors).toMatch(/"profile" is reserved/);
    expect(errors).toMatch(/list column "ghost" is not a field/);
  });

  it("explains site config mistakes", () => {
    const bad = clone(landingConfig) as unknown as { sections: Record<string, unknown> };
    delete bad.sections.pricing;
    const missingHero = clone(portfolioConfig) as unknown as { sections: Record<string, unknown> };
    delete missingHero.sections.hero;
    expect(checkSiteConfig(bad).errors).toEqual(['sections: "pricing" is switched on but has no content']);
    expect(checkSiteConfig(missingHero).ok).toBe(false);
    expect(checkSiteConfig({ websiteType: "shop" }).ok).toBe(false);
  });
});
