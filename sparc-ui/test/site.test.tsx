// Site shell: sections follow the blueprint, only switched-on rooms appear,
// forms work, unknown paths show 404.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { roomsOnPage, enabledRooms } from "@core/blueprint";
import { checkSiteConfig, type SiteConfig } from "@core/config";
import { SiteApp } from "../shells/site-shell/src/App";
import { registry } from "../shells/site-shell/src/registries/basic";
import landing from "../shells/site-shell/src/configs/landing.json";
import portfolio from "../shells/site-shell/src/configs/portfolio.json";

function setup(raw: unknown, path = "/", submit = vi.fn(async () => {})) {
  const check = checkSiteConfig(structuredClone(raw));
  if (!check.ok) throw new Error(check.errors.join("; "));
  render(
    <MemoryRouter initialEntries={[path]}>
      <SiteApp config={check.config!} blueprint={check.blueprint!} registry={registry} submit={submit} />
    </MemoryRouter>
  );
  return { config: check.config as SiteConfig, blueprint: check.blueprint!, submit };
}

const renderedRooms = () => [...document.querySelectorAll("[data-sparc-room]")].map((el) => el.getAttribute("data-sparc-room"));

describe("site shell", () => {
  it.each([
    ["portfolio", portfolio],
    ["landing", landing],
  ])("%s: sections appear in blueprint order, only switched-on ones", (_name, raw) => {
    const { config, blueprint } = setup(raw);
    const expected = roomsOnPage(blueprint, "home", enabledRooms(blueprint, config.rooms.enabled));
    expect(renderedRooms()).toEqual(expected);
    // An optional room that is off never renders.
    const off = blueprint.rooms.optional.filter((r) => !config.rooms.enabled.includes(r));
    for (const r of off) expect(document.querySelector(`[data-sparc-room="${r}"]`)).toBeNull();
  });

  it("builds the menu from the switched-on sections", () => {
    setup(portfolio);
    const nav = screen.getByRole("navigation", { name: "Main" });
    for (const label of ["About me", "Skills", "Experience", "Projects", "Contact"]) {
      expect(nav.textContent).toContain(label);
    }
    expect(nav.querySelector('a[href="#about"]')).not.toBeNull();
  });

  it("contact form sends the values and shows the thank-you state", async () => {
    const user = userEvent.setup();
    const { submit } = setup(landing);
    const form = document.getElementById("contact-form")!;
    await user.type(form.querySelector("#cf-name")!, "Neha");
    await user.type(form.querySelector("#cf-email")!, "neha@example.com");
    await user.type(form.querySelector("#cf-message")!, "Can I visit on Sunday?");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByText(/Your message was sent/)).toBeTruthy();
    expect(submit).toHaveBeenCalledWith("contact", { name: "Neha", email: "neha@example.com", message: "Can I visit on Sunday?" });
  });

  it("a failed submission shows the error and keeps the form", async () => {
    const user = userEvent.setup();
    setup(landing, "/", vi.fn(async () => Promise.reject(new Error("Server is down"))));
    await user.type(screen.getByPlaceholderText("you@example.com"), "x@example.com");
    await user.click(screen.getByRole("button", { name: "Subscribe" }));
    expect(await screen.findByText("Server is down")).toBeTruthy();
  });

  it("unknown paths show the 404 room", () => {
    setup(portfolio, "/nope");
    expect(screen.getByText("Page not found")).toBeTruthy();
  });

  it("theme and page title come from the config", () => {
    setup(landing);
    expect(document.title).toBe(landing.meta.title);
    expect(document.documentElement.style.getPropertyValue("--sparc-primary")).toBe("#0f766e");
    expect(document.documentElement.style.getPropertyValue("--sparc-control-h")).toBe("3rem");
  });
});
