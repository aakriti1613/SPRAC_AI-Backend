// Phase 3b: style levels. Every level's registry covers the blueprints, the
// generated files are current, levels really look different, reduce-motion works.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ComponentType } from "react";
import type { RoomId } from "@contracts";
import { getBlueprint } from "@core/blueprint";
import { loadRegistry } from "@core/registry";
import type { SlotRegistry } from "@core/slots";
import { FIELD_TYPE_NAMES } from "../../lib/fieldTypes.js";
import { plan } from "../scripts/gen-library.mjs";
import { SAMPLES } from "./fixtures/roomProps";

const UI = path.resolve(__dirname, "..");
const portal = import.meta.glob<{ registry: SlotRegistry }>("../shells/portal-shell/src/registries/*.ts", { eager: true });
const site = import.meta.glob<{ registry: SlotRegistry }>("../shells/site-shell/src/registries/*.ts", { eager: true });
const levelOf = (file: string) => path.basename(file, ".ts");
const roomsOf = (...ids: ("portfolio" | "landing" | "admin-portal")[]) =>
  [...new Set(ids.flatMap((id) => [...getBlueprint(id).rooms.required, ...getBlueprint(id).rooms.optional]))];

type Any = ComponentType<Record<string, unknown>>;
const renderRoom = (room: RoomId, Cmp: Any) =>
  render(
    <MemoryRouter>
      <Cmp {...(SAMPLES[room].props as unknown as Record<string, unknown>)} />
    </MemoryRouter>
  );

describe("generated files", () => {
  it("wrappers and registries match scripts/gen-library.mjs (run it after editing views/skins)", async () => {
    const files = await plan();
    const stale = Object.entries(files).filter(([rel, content]) => {
      const abs = path.join(UI, rel);
      return !fs.existsSync(abs) || fs.readFileSync(abs, "utf8") !== content;
    });
    expect(stale.map(([rel]) => rel)).toEqual([]);
    expect(Object.keys(files).filter((f) => f.includes("/registries/")).sort()).toEqual([
      "shells/portal-shell/src/registries/amazing.ts",
      "shells/portal-shell/src/registries/basic.ts",
      "shells/portal-shell/src/registries/good.ts",
      "shells/site-shell/src/registries/amazing.ts",
      "shells/site-shell/src/registries/astonishing.ts",
      "shells/site-shell/src/registries/basic.ts",
      "shells/site-shell/src/registries/good.ts",
    ]);
  });
});

describe.each([
  ["portal-shell", portal, roomsOf("admin-portal")],
  ["site-shell", site, roomsOf("portfolio", "landing")],
] as const)("%s registries", (_shell, registries, rooms) => {
  const entries = Object.entries(registries).map(([file, mod]) => [levelOf(file), mod.registry] as const);

  it.each(entries)("%s covers every room and renders it", (level, registry) => {
    expect(registry.styleLevel).toBe(level);
    for (const room of rooms) {
      if (room === "form-field") {
        expect(Object.keys(registry.fields).sort()).toEqual([...FIELD_TYPE_NAMES].sort());
        continue;
      }
      const Cmp = registry.rooms[room] as unknown as Any;
      expect(Cmp, `${level}: ${room}`).toBeTruthy();
      const { container, unmount } = renderRoom(room, Cmp);
      expect(container.textContent).toContain(SAMPLES[room].expectText);
      unmount();
    }
  });
});

describe("levels look different", () => {
  it("the same hero renders different markup at every level", async () => {
    const html = new Set<string>();
    for (const level of ["basic", "good", "amazing", "astonishing"]) {
      const mod = (await import(`../library/hero/${level}/sparc/index.tsx`)) as { default: Any };
      const { container, unmount } = renderRoom("hero", mod.default);
      html.add(container.innerHTML.replace(/style="[^"]*"/g, ""));
      unmount();
    }
    expect(html.size).toBe(4);
  });

  it("an Amazing site falls back to Good for rooms that only have Basic/Good (e.g. contact form)", () => {
    const amazing = site["../shells/site-shell/src/registries/amazing.ts"].registry;
    const good = site["../shells/site-shell/src/registries/good.ts"].registry;
    expect(amazing.rooms["contact-form"]).toBe(good.rooms["contact-form"]);
    expect(amazing.rooms.hero).not.toBe(good.rooms.hero);
  });

  it("loadRegistry falls back to the closest lower level (portal has no Astonishing)", async () => {
    const loaders = Object.fromEntries(
      Object.entries(portal).map(([file, mod]) => [`./registries/${levelOf(file)}.ts`, async () => mod])
    );
    expect((await loadRegistry(loaders, "astonishing")).styleLevel).toBe("amazing");
    expect((await loadRegistry(loaders, "good", { allowOverride: true, search: "?level=basic" })).styleLevel).toBe("basic");
    expect((await loadRegistry(loaders, "good", { allowOverride: false, search: "?level=basic" })).styleLevel).toBe("good");
  });
});

describe("reduce motion", () => {
  it("Astonishing skills scroll as an endless marquee (duplicated, hidden copy for screen readers)", async () => {
    const mod = (await import("../library/skills/astonishing/sparc/index.tsx")) as unknown as { default: Any };
    const { container, unmount } = renderRoom("skills", mod.default);
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
    unmount();
  });

  it("animated levels only use packages their level allows", () => {
    const read = (rel: string) => fs.readFileSync(path.join(UI, rel), "utf8");
    expect(read("library/_skins/good.ts")).not.toMatch(/from "motion|framer-motion/);
    expect(read("library/_skins/basic.ts")).not.toMatch(/from "motion|framer-motion/);
    for (const v of fs.readdirSync(path.join(UI, "library", "_views"))) {
      if (v.endsWith(".tsx")) expect(read(`library/_views/${v}`), v).not.toMatch(/from "motion|framer-motion|gsap/);
    }
  });
});
