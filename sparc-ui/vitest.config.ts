import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { aliases } from "./vite.shared";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: aliases },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.{ts,tsx}"],
    setupFiles: ["test/setup.ts"],
    css: false,
    testTimeout: 15000,
  },
});
