// Read the blueprints (platform-backend-main/sparc/blueprints/*.json) so shells
// build their pages from the same data the backend checks.
import adminPortal from "@blueprints/admin-portal.json";
import booking from "@blueprints/booking.json";
import ecommerce from "@blueprints/ecommerce.json";
import landing from "@blueprints/landing.json";
import portfolio from "@blueprints/portfolio.json";
import type { RoomId } from "@contracts";

export interface BlueprintPage {
  id: string;
  path: string;
  title: string;
  rooms: RoomId[];
  repeat?: "per-module";
  when?: RoomId;
}

export interface ActiveBlueprint {
  id: "portfolio" | "landing" | "admin-portal" | "ecommerce" | "booking";
  name: string;
  maxStyleLevel: string;
  rooms: { required: RoomId[]; optional: RoomId[]; defaultOn: RoomId[] };
  industryDefaults: Record<string, RoomId[]>;
  pages: BlueprintPage[];
}

const BLUEPRINTS = { portfolio, landing, "admin-portal": adminPortal, ecommerce, booking } as unknown as Record<ActiveBlueprint["id"], ActiveBlueprint>;

export function getBlueprint(id: ActiveBlueprint["id"]): ActiveBlueprint {
  const bp = BLUEPRINTS[id];
  if (!bp) throw new Error(`unknown website type "${id}"`);
  return bp;
}

/** Required rooms + the optional rooms the config switched on. */
export function enabledRooms(bp: ActiveBlueprint, enabledOptional: readonly string[]): Set<RoomId> {
  const on = new Set<RoomId>(bp.rooms.required);
  for (const id of bp.rooms.optional) if (enabledOptional.includes(id)) on.add(id);
  return on;
}

/** Pages that exist with these rooms (a page with `when` needs that room on). */
export function activePages(bp: ActiveBlueprint, enabled: Set<RoomId>): BlueprintPage[] {
  return bp.pages.filter((p) => !p.when || enabled.has(p.when));
}

/** Rooms of a page in blueprint order, keeping only enabled ones. */
export function roomsOnPage(bp: ActiveBlueprint, pageId: string, enabled: Set<RoomId>): RoomId[] {
  const page = bp.pages.find((p) => p.id === pageId);
  if (!page) throw new Error(`blueprint "${bp.id}" has no page "${pageId}"`);
  return page.rooms.filter((r) => enabled.has(r));
}
