// Shared Vite settings for every shell and for tests: path aliases + plugins.
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import type { UserConfig } from "vite";

export const SPARC_UI_DIR = path.dirname(fileURLToPath(import.meta.url));

export const aliases = {
  "@core": path.join(SPARC_UI_DIR, "core"),
  "@library": path.join(SPARC_UI_DIR, "library"),
  "@contracts": path.join(SPARC_UI_DIR, "contracts", "rooms.d.ts"),
  "@blueprints": path.join(SPARC_UI_DIR, "..", "sparc", "blueprints"),
};

/** Vite config for one shell folder (shells/<name>). */
export function shellConfig(shellDir: string, port: number): UserConfig {
  return {
    root: shellDir,
    base: "/",
    plugins: [react(), tailwindcss()],
    resolve: { alias: aliases, dedupe: ["react", "react-dom"] },
    envDir: shellDir,
    server: { port, strictPort: true, fs: { allow: [SPARC_UI_DIR, path.join(SPARC_UI_DIR, "..", "sparc")] } },
    build: { outDir: path.join(shellDir, "dist"), emptyOutDir: true, chunkSizeWarningLimit: 900 },
  };
}
