import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { checkPortalConfig } from "@core/config";
import { ConfigErrorScreen } from "@core/ConfigErrorScreen";
import { PortalApp } from "./App";
import { createMemoryBackend } from "./data/memory";
import { createSupabaseBackend } from "./data/supabase";
import { loadRegistry } from "@core/registry";
import type { SlotRegistry } from "@core/slots";
import rawConfig from "./sparc.config.json";
import "./index.css";

const root = createRoot(document.getElementById("root")!);
const check = checkPortalConfig(rawConfig);

if (!check.ok || !check.config) {
  root.render(<ConfigErrorScreen errors={check.errors} />);
} else {
  const config = check.config;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  const backend = url && key ? createSupabaseBackend(url, key) : createMemoryBackend(config.modules, { storageKey: `sparc-demo:${config.brand.name}` });
  const registries = import.meta.glob<{ registry: SlotRegistry }>("./registries/*.ts");
  loadRegistry(registries, config.styleLevel, { allowOverride: import.meta.env.DEV }).then((registry) =>
    root.render(
      <StrictMode>
        <BrowserRouter>
          <PortalApp config={config} data={backend.data} auth={backend.auth} registry={registry} />
        </BrowserRouter>
      </StrictMode>
    )
  );
}
