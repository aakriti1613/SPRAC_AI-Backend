// "Reduce motion" must turn animated levels into calm, still versions.
// Own file: the motion library reads this browser setting once, so it must be
// set before any animated component loads.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ComponentType } from "react";
import type { RoomId } from "@contracts";
import { SAMPLES } from "./fixtures/roomProps";

beforeAll(() => {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        onchange: null,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent: () => false,
      }) as MediaQueryList
  );
  vi.spyOn(console, "warn").mockImplementation(() => {}); // motion logs a notice when reduce-motion is on
});

async function show(room: RoomId, level: string) {
  const mod = (await import(`../library/${room}/${level}/sparc/index.tsx`)) as { default: ComponentType<Record<string, unknown>> };
  const Cmp = mod.default;
  return render(
    <MemoryRouter>
      <Cmp {...(SAMPLES[room].props as unknown as Record<string, unknown>)} />
    </MemoryRouter>
  );
}

describe("with reduce-motion on", () => {
  it("Astonishing skills become a still, wrapped list (no moving duplicate track)", async () => {
    const { container } = await show("skills", "astonishing");
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBe(0);
    expect(container.textContent).toContain("TypeScript");
  });

  it("Astonishing testimonials stop scrolling too", async () => {
    const { container } = await show("testimonials", "astonishing");
    // A moving marquee repeats each quote in a hidden copy; a still list shows it once.
    expect(container.textContent?.split("Very kind staff.").length).toBe(2);
  });

  it("animated numbers show their final value straight away", async () => {
    const { container } = await show("stats", "amazing");
    expect(container.textContent).toContain("40k+");
  });
});
