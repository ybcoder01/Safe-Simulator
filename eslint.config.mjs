import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

import readOnlyBoundary from "./eslint-rules/read-only-boundary.mjs";

const signingKitBan = {
  paths: [
    {
      name: "@safe-global/relay-kit",
      message:
        "Safe Inspector is read-only; signing and relay kits are forbidden.",
    },
    {
      name: "@safe-global/onramp-kit",
      message:
        "Safe Inspector is read-only; signing and onramp kits are forbidden.",
    },
  ],
  patterns: [
    {
      group: ["@safe-global/relay-kit/**", "@safe-global/onramp-kit/**"],
      message:
        "Safe Inspector is read-only; signing-capable kits are forbidden.",
    },
  ],
};

export default defineConfig([
  globalIgnores([".next/**", "coverage/**", "node_modules/**"]),
  ...nextVitals,
  ...nextTypescript,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      safety: {
        rules: { "read-only-boundary": readOnlyBoundary },
      },
    },
    rules: {
      "no-restricted-imports": ["error", signingKitBan],
      "safety/read-only-boundary": "error",
    },
  },
  {
    files: ["src/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          ...signingKitBan,
          patterns: [
            ...signingKitBan.patterns,
            {
              group: [
                "@/adapters/**",
                "@/app/**",
                "@/components/**",
                "next/**",
                "react/**",
              ],
              message:
                "The domain core must remain framework-free and cannot import adapters or UI code.",
            },
          ],
        },
      ],
    },
  },
]);
