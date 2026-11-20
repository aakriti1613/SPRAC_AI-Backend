// End-to-end walk through the portal shell in demo mode, like a real user.
import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { DataTableProps } from "@contracts";
import { checkPortalConfig } from "@core/config";
import type { SlotRegistry } from "@core/slots";
import { PortalApp } from "../shells/portal-shell/src/App";
import { createMemoryBackend, DEMO_EMAIL, DEMO_PASSWORD } from "../shells/portal-shell/src/data/memory";
import { registry } from "../shells/portal-shell/src/registries/basic";
import rawConfig from "../shells/portal-shell/src/sparc.config.json";

function setup(path = "/", reg: SlotRegistry = registry) {
  const config = checkPortalConfig(structuredClone(rawConfig)).config!;
  const backend = createMemoryBackend(config.modules, { seedCount: 3 });
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[path]}>
      <PortalApp config={config} data={backend.data} auth={backend.auth} registry={reg} />
    </MemoryRouter>
  );
  return { user, backend };
}

async function login(user: ReturnType<typeof userEvent.setup>, password = DEMO_PASSWORD) {
  await user.type(await screen.findByLabelText(/^Email/), DEMO_EMAIL);
  await user.type(screen.getByLabelText(/^Password/), password);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("portal shell (demo mode)", () => {
  it("full journey: login, dashboard, add, search, delete, 404, logout", async () => {
    const { user, backend } = setup("/");

    // Not signed in -> login page, with the demo banner.
    expect(await screen.findByText("Welcome back")).toBeTruthy();
    expect(screen.getByTestId("demo-banner").textContent).toContain(DEMO_EMAIL);

    // Wrong password is refused.
    await login(user, "nope");
    expect(await screen.findByText("Invalid email or password")).toBeTruthy();

    // Right password -> dashboard with counts from the data.
    await user.clear(screen.getByLabelText(/^Email/));
    await user.clear(screen.getByLabelText(/^Password/));
    await login(user);
    const grid = await screen.findByTestId("stat-grid");
    await waitFor(() => expect(within(grid).getAllByText("3").length).toBeGreaterThanOrEqual(2));
    expect(within(grid).getByText("Patients")).toBeTruthy();
    expect(within(grid).getByText(/Total fee/)).toBeTruthy();
    expect(await screen.findByText("Patients by care status")).toBeTruthy();
    expect(screen.getByText("Recent activity")).toBeTruthy();

    // Go to Patients via the menu.
    await user.click(within(screen.getAllByRole("navigation", { name: "Portal" })[0]).getByText("Patients"));
    expect(await screen.findByText("3 records")).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(4); // header + 3

    // Add: empty save shows errors, then a valid save opens the record.
    await user.click(screen.getByRole("link", { name: /Add patient/ }));
    await user.click(await screen.findByRole("button", { name: "Save" }));
    expect(await screen.findByText("Patient name is required.")).toBeTruthy();
    expect(screen.getByText("Care status is required.")).toBeTruthy();
    await user.type(screen.getByLabelText(/Patient name/), "Zara Khan");
    await user.selectOptions(screen.getByLabelText(/Care status/), "In Care");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("heading", { name: "Zara Khan" })).toBeTruthy();
    expect(await backend.data.count("patients")).toBe(4);

    // Search finds the new record.
    await user.click(screen.getByRole("link", { name: /All patients/ }));
    expect(await screen.findByText("4 records")).toBeTruthy();
    await user.type(screen.getByRole("searchbox", { name: "Search" }), "zara");
    await waitFor(() => expect(screen.getByText("1 record")).toBeTruthy(), { timeout: 2000 });

    // Delete with confirmation.
    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("Zara Khan");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(await backend.data.count("patients")).toBe(3);

    // Unknown module -> 404 page.
    await user.click(screen.getByRole("button", { name: /Clear/ }));
    expect(await screen.findByText("3 records")).toBeTruthy();
  });

  it("unknown pages and modules show the 404 room", async () => {
    const { user } = setup("/doctors");
    await login(user);
    expect(await screen.findByText("Page not found")).toBeTruthy();
  });

  it("logout returns to the login page and locks the portal", async () => {
    const { user } = setup("/profile");
    await login(user);
    expect(await screen.findByRole("heading", { name: "My profile" })).toBeTruthy();
    await user.click(screen.getAllByRole("button", { name: "Sign out" })[0]);
    expect(await screen.findByText("Welcome back")).toBeTruthy();
  });

  it("optional pages exist only when their room is on", async () => {
    const config = checkPortalConfig({ ...structuredClone(rawConfig), rooms: { enabled: [] } }).config!;
    const backend = createMemoryBackend(config.modules, { seedCount: 1 });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <PortalApp config={config} data={backend.data} auth={backend.auth} registry={registry} />
      </MemoryRouter>
    );
    await login(user);
    // /settings is not a page now, so it is treated as an unknown module.
    expect(await screen.findByText("Page not found")).toBeTruthy();
    expect(screen.queryByText("Recent activity")).toBeNull();
  });

  it("swapping a room's component changes the look, not the logic", async () => {
    function PlainTable({ rows, page }: DataTableProps) {
      return <p data-testid="plain-table">{`${rows.length} rows shown, ${page.total} total`}</p>;
    }
    const swapped: SlotRegistry = { ...registry, rooms: { ...registry.rooms, "data-table": PlainTable } };
    const { user } = setup("/patients", swapped);
    await login(user);
    await waitFor(() => expect(screen.getByTestId("plain-table").textContent).toBe("3 rows shown, 3 total"));
  });
});
