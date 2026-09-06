import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mainnet, xdc } from "viem/chains";

import { getArchiveRpcUrls, getRpcUrls } from "@/adapters/chain-viem/config";

const rpcKey = `RPC_URL_${xdc.id}`;
const archiveKey = `ARCHIVE_RPC_URL_${xdc.id}`;
const originalRpc = process.env[rpcKey];
const originalArchive = process.env[archiveKey];

describe("RPC URL configuration", () => {
  beforeEach(() => {
    delete process.env[rpcKey];
    delete process.env[archiveKey];
  });

  afterEach(() => {
    if (originalRpc === undefined) {
      delete process.env[rpcKey];
    } else {
      process.env[rpcKey] = originalRpc;
    }

    if (originalArchive === undefined) {
      delete process.env[archiveKey];
    } else {
      process.env[archiveKey] = originalArchive;
    }
  });

  it("uses the chain defaults when no endpoints are configured", () => {
    expect(getRpcUrls(xdc)).toEqual(xdc.rpcUrls.default.http);
  });

  it("uses only unique configured endpoints when an override is present", () => {
    process.env[rpcKey] =
      " https://custom-one.example , https://custom-one.example, https://custom-two.example ";

    expect(getRpcUrls(xdc)).toEqual([
      "https://custom-one.example",
      "https://custom-two.example",
    ]);
  });

  it("uses the archive override before the public XDC archive fallback", () => {
    process.env[archiveKey] =
      " https://archive-one.example , https://rpc.ankr.com/xdc ";
    process.env[rpcKey] = "https://current.example";

    expect(getArchiveRpcUrls(xdc)).toEqual([
      "https://archive-one.example",
      "https://rpc.ankr.com/xdc",
      "https://current.example",
    ]);
  });

  it("does not add the XDC archive fallback to other chains", () => {
    expect(getArchiveRpcUrls(mainnet)).toEqual(mainnet.rpcUrls.default.http);
  });
});
