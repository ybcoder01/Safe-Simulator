import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { xdc } from "viem/chains";

import { getRpcUrls } from "@/adapters/chain-viem/config";

const key = `RPC_URL_${xdc.id}`;
const original = process.env[key];

describe("getRpcUrls", () => {
  beforeEach(() => {
    delete process.env[key];
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  });

  it("uses the chain defaults when no endpoints are configured", () => {
    expect(getRpcUrls(xdc)).toEqual(xdc.rpcUrls.default.http);
  });

  it("keeps configured endpoints first and appends unique defaults", () => {
    const defaultUrl = xdc.rpcUrls.default.http[0];
    process.env[key] =
      ` https://custom-one.example , ${defaultUrl}, https://custom-two.example `;

    expect(getRpcUrls(xdc)).toEqual([
      "https://custom-one.example",
      defaultUrl,
      "https://custom-two.example",
    ]);
  });
});
