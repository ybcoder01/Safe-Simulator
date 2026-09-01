import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    coverage: {
      include: ["src/core/**/*.ts"],
      provider: "v8",
      reporter: ["text", "json-summary"],
      thresholds: {
        branches: 68,
        functions: 92,
        lines: 79,
        statements: 77,
      },
    },
    include: ["tests/unit/**/*.test.ts"],
  },
});
