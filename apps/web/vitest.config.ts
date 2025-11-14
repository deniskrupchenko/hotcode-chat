import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      reporter: ["text", "html"],
      include: ["lib/**/*.ts", "hooks/**/*.ts", "components/**/*.tsx"]
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      "@shared": path.resolve(__dirname, "../..", "shared", "src")
    }
  }
});


