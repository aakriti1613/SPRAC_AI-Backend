import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { shellConfig } from "../../vite.shared";

export default defineConfig(shellConfig(fileURLToPath(new URL(".", import.meta.url)), 4310));
