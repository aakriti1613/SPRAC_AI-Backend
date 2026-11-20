import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { checkSiteConfig } from "@core/config";
import { ConfigErrorScreen } from "@core/ConfigErrorScreen";
import { SiteApp } from "./App";
import { BookingApp } from "./BookingApp";
import { StoreApp } from "./StoreApp";
import { createSubmitter } from "./forms";
import { loadRegistry } from "@core/registry";
import type { SlotRegistry } from "@core/slots";
import "./index.css";

// A generated site has src/sparc.config.json. In this repo, sample configs live
// in src/configs/; pick one with VITE_SITE_CONFIG=landing (default: portfolio).
const own = import.meta.glob<{ default: unknown }>("./sparc.config.json", { eager: true });
const samples = import.meta.glob<{ default: unknown }>("./configs/*.json", { eager: true });
const wanted = import.meta.env.VITE_SITE_CONFIG as string | undefined;
const raw =
  (wanted && samples[`./configs/${wanted}.json`]?.default) ?? own["./sparc.config.json"]?.default ?? samples["./configs/portfolio.json"]?.default;

const root = createRoot(document.getElementById("root")!);
const check = checkSiteConfig(raw);
if (!check.ok || !check.config || !check.blueprint) {
  root.render(<ConfigErrorScreen errors={check.errors} />);
} else {
  const { config, blueprint } = check;
  const App = config.websiteType === "ecommerce" ? StoreApp : config.websiteType === "booking" ? BookingApp : SiteApp;
  const registries = import.meta.glob<{ registry: SlotRegistry }>("./registries/*.ts");
  loadRegistry(registries, config.styleLevel, { allowOverride: import.meta.env.DEV }).then((registry) =>
    root.render(
      <StrictMode>
        <BrowserRouter>
          <App config={config} blueprint={blueprint} registry={registry} submit={createSubmitter(import.meta.env.VITE_FORM_ENDPOINT as string | undefined)} />
        </BrowserRouter>
      </StrictMode>
    )
  );
}
