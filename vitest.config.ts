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
    },
    include: ["tests/unit/**/*.test.ts"],
  },
});
