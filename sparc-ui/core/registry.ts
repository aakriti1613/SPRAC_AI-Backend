// Picks which registry (style level) a shell loads. A generated site has one
// registry; in this repo every level exists, and in development `?level=amazing`
// in the URL overrides the config so all levels can be compared.
import type { SlotRegistry } from "./slots";

const ORDER = ["basic", "good", "amazing", "astonishing"] as const;

export async function loadRegistry(
  loaders: Record<string, () => Promise<{ registry: SlotRegistry }>>,
  configLevel: string,
  { allowOverride = false, search = typeof location !== "undefined" ? location.search : "" } = {}
): Promise<SlotRegistry> {
  const override = allowOverride ? new URLSearchParams(search).get("level") : null;
  const wanted = (override ?? configLevel) as (typeof ORDER)[number];
  // Use the wanted level, or the closest lower one this shell has.
  const start = Math.max(0, ORDER.indexOf(wanted));
  for (let i = start; i >= 0; i -= 1) {
    const load = loaders[`./registries/${ORDER[i]}.ts`];
    if (load) return (await load()).registry;
  }
  throw new Error("no registry found in ./registries");
}
