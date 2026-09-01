import { Linter } from "eslint";
import { describe, expect, it } from "vitest";

// @ts-expect-error The lint rule is an intentionally framework-neutral module.
import readOnlyBoundary from "../../../eslint-rules/read-only-boundary.mjs";

const linter = new Linter({ configType: "flat" });

function verify(code: string) {
  return linter.verify(code, [
    {
      languageOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      plugins: {
        safety: {
          rules: { "read-only-boundary": readOnlyBoundary },
        },
      },
      rules: {
        "safety/read-only-boundary": "error",
      },
    },
  ]);
}

describe("read-only boundary lint rule", () => {
  it("allows public reads and account discovery", () => {
    expect(
      verify(`
        import { createPublicClient } from "viem";
        provider.request({ method: "eth_requestAccounts" });
        provider.request({ method: "eth_call" });
        createPublicClient({});
      `),
    ).toEqual([]);
  });

  it("rejects signing-capable modules and private-key helpers", () => {
    expect(
      verify(`
        import { privateKeyToAccount } from "viem/accounts";
        privateKeyToAccount("0x00");
      `).map(({ messageId }) => messageId),
    ).toContain("forbiddenImport");
  });

  it("rejects wallet clients and write operations", () => {
    expect(
      verify(`
        import { createWalletClient } from "viem";
        createWalletClient({});
        client.writeContract({});
        client.sendTransaction({});
      `).map(({ messageId }) => messageId),
    ).toEqual([
      "forbiddenOperation",
      "forbiddenOperation",
      "forbiddenOperation",
      "forbiddenOperation",
    ]);
  });

  it("rejects raw signing and broadcast RPC methods", () => {
    expect(
      verify(`
        provider.request({ method: "personal_sign" });
        provider.request({ method: "eth_signTypedData_v4" });
        provider.request({ method: "eth_sendRawTransaction" });
      `).map(({ messageId }) => messageId),
    ).toEqual(["forbiddenRpc", "forbiddenRpc", "forbiddenRpc"]);
  });
});
