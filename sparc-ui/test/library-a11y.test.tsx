// Accessibility: every component is rendered with valid contract props and
// scanned with axe-core. Serious or critical violations fail the check.
// (Colour contrast needs real layout, so it is checked later in the browser.)
import axe from "axe-core";
import type { ComponentType } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { FieldDef, RoomId } from "@contracts";
import { SAMPLES } from "./fixtures/roomProps";
import { discoverComponents, saveOrCompare } from "./library/quality";

type Module = { default: ComponentType<Record<string, unknown>>; fieldTypes?: readonly string[] };
const modules = import.meta.glob<Module>("../library/*/*/*/index.tsx", { eager: true });

const AXE_OPTIONS: axe.RunOptions = {
  rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
  resultTypes: ["violations"],
};

async function scan(ui: React.ReactElement) {
  const { container, unmount } = render(<MemoryRouter>{ui}</MemoryRouter>);
  const result = await axe.run(container, AXE_OPTIONS);
  unmount();
  return result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
}

describe("axe sanity", () => {
  it("really catches problems (unlabelled input, image without alt, empty button)", async () => {
    const found = await scan(
      <div>
        <input type="text" />
        <img src="/x.png" />
        <button type="button" />
      </div>
    );
    expect(found.map((v) => v.id).sort()).toEqual(["button-name", "image-alt", "label"]);
  });
});

describe("component accessibility (axe)", () => {
  const components = discoverComponents();
  const report: Record<string, { a11yViolations: number; rules: string[] }> = {};

  it.each(components)("$key has no serious accessibility problems", async ({ key, room }) => {
    const mod = modules[`../library/${key}/index.tsx`];
    expect(mod, `could not import ${key}`).toBeTruthy();
    const Cmp = mod.default;
    const runs =
      room === "form-field"
        ? (mod.fieldTypes ?? []).map((type) => {
            const field = { key: `f_${type.replace(/-/g, "_")}`, label: `Label ${type}`, type, required: true, options: ["One", "Two"] } as FieldDef;
            return <Cmp field={field} value={type === "toggle" || type === "checkbox" ? false : ""} onChange={() => {}} error="Something is wrong" />;
          })
        : [<Cmp {...(SAMPLES[room as RoomId].props as unknown as Record<string, unknown>)} />];
    const found = [];
    for (const ui of runs) found.push(...(await scan(ui))); // axe runs one scan at a time
    report[key] = { a11yViolations: found.length, rules: [...new Set(found.map((v) => v.id))].sort() };
    expect(found.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  it("report is saved / up to date", () => {
    expect(Object.keys(report)).toHaveLength(components.length);
    saveOrCompare("a11y", report);
  });
});
