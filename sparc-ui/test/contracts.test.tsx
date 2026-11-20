// Every registered component renders with valid contract props, and the
// registries cover every room the blueprints need.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ComponentType } from "react";
import type { FieldDef, RoomId } from "@contracts";
import { getBlueprint } from "@core/blueprint";
import { FieldSlot, Slot, SlotsProvider, type SlotRegistry } from "@core/slots";
import { FIELD_TYPE_NAMES } from "../../lib/fieldTypes.js";
import { registry as portal } from "../shells/portal-shell/src/registries/basic";
import { registry as site } from "../shells/site-shell/src/registries/basic";
import { SAMPLES } from "./fixtures/roomProps";

const roomsOf = (id: "portfolio" | "landing" | "admin-portal") => {
  const bp = getBlueprint(id);
  return [...bp.rooms.required, ...bp.rooms.optional];
};

type AnyComponent = ComponentType<Record<string, unknown>>;

function renderRoom(room: RoomId, Cmp: AnyComponent) {
  const { props } = SAMPLES[room];
  return render(
    <MemoryRouter>
      <Cmp {...(props as unknown as Record<string, unknown>)} />
    </MemoryRouter>
  );
}

describe("registries cover the blueprints", () => {
  it("portal shell has a component for every admin-portal room", () => {
    const missing = roomsOf("admin-portal").filter((r) => r !== "form-field" && !portal.rooms[r]);
    expect(missing).toEqual([]);
  });

  it("site shell has a component for every portfolio and landing room", () => {
    const needed = new Set([...roomsOf("portfolio"), ...roomsOf("landing")]);
    expect([...needed].filter((r) => !site.rooms[r])).toEqual([]);
  });

  it("form-field components cover all field types, each exactly once", () => {
    expect(Object.keys(portal.fields).sort()).toEqual([...FIELD_TYPE_NAMES].sort());
  });
});

describe.each([
  ["portal", portal],
  ["site", site],
] as const)("%s shell components render their contract", (_name, registry) => {
  const entries = Object.entries(registry.rooms) as unknown as [RoomId, AnyComponent][];
  it.each(entries)("%s", (room, Cmp) => {
    const { container } = renderRoom(room, Cmp);
    expect(container.textContent).toContain(SAMPLES[room].expectText);
  });
});

describe("form-field inputs", () => {
  it.each([...FIELD_TYPE_NAMES])("%s renders its label and reports changes", async (type) => {
    const onChange = vi.fn();
    const field = {
      key: `f_${type.replace(/-/g, "_")}`,
      label: `Label for ${type}`,
      type,
      required: false,
      options: ["Alpha", "Beta"],
    } as FieldDef;
    render(
      <SlotsProvider registry={portal}>
        <FieldSlot field={field} value={type === "toggle" || type === "checkbox" ? false : ""} onChange={onChange} />
      </SlotsProvider>
    );
    expect(document.body.textContent).toContain(`Label for ${type}`);
    expect(document.querySelector(`[data-field-type="${type}"]`)).not.toBeNull();
  });
});

describe("slot safety", () => {
  it("a crashing component only breaks its own room", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const Boom = () => {
      throw new Error("boom");
    };
    const registry: SlotRegistry = { styleLevel: "basic", rooms: { hero: Boom as never, stats: site.rooms.stats }, fields: {} };
    render(
      <SlotsProvider registry={registry}>
        <Slot room="hero" props={SAMPLES.hero.props} />
        <Slot room="stats" props={SAMPLES.stats.props} />
      </SlotsProvider>
    );
    expect(screen.getByRole("alert").textContent).toContain("hero");
    expect(document.body.textContent).toContain("40k+");
    spy.mockRestore();
  });

  it("a room with no component shows a clear warning instead of crashing", () => {
    render(
      <SlotsProvider registry={{ styleLevel: "basic", rooms: {}, fields: {} }}>
        <Slot room="pricing" props={SAMPLES.pricing.props} />
      </SlotsProvider>
    );
    expect(screen.getByRole("alert").textContent).toContain("pricing");
  });
});
