import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mainnet, xdc } from "viem/chains";

import {
  getArchiveRpcUrls,
  getRpcUrls,
  getTraceRpcUrls,
} from "@/adapters/chain-viem/config";

const rpcKey = `RPC_URL_${xdc.id}`;
const archiveKey = `ARCHIVE_RPC_URL_${xdc.id}`;
const originalRpc = process.env[rpcKey];
const originalArchive = process.env[archiveKey];
const traceKey = `TRACE_RPC_URL_${xdc.id}`;
const originalTrace = process.env[traceKey];

describe("RPC URL configuration", () => {
  beforeEach(() => {
    delete process.env[rpcKey];
    delete process.env[archiveKey];
    delete process.env[traceKey];
  });

  afterEach(() => {
    if (originalRpc === undefined) {
      delete process.env[rpcKey];
    } else {
      process.env[rpcKey] = originalRpc;
    }

    if (originalTrace === undefined) {
      delete process.env[traceKey];
    } else {
      process.env[traceKey] = originalTrace;
    }

    if (originalArchive === undefined) {
      delete process.env[archiveKey];
    } else {
      process.env[archiveKey] = originalArchive;
    }
  });

  it("uses only the public XDC endpoint, never viem's built-in one, when nothing is configured", () => {
    expect(getRpcUrls(xdc)).toEqual(["https://rpc.xdcrpc.com"]);
    expect(getArchiveRpcUrls(xdc).join(" ")).not.toContain("rpc.xdc.org");
  });

  it("uses the chain defaults for other chains when nothing is configured", () => {
    expect(getRpcUrls(mainnet)).toEqual(mainnet.rpcUrls.default.http);
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
      "https://rpc.xdcrpc.com",
      "https://current.example",
    ]);
  });

  it("tries configured trace providers before the keyless public XDC gateway", () => {
    expect(getTraceRpcUrls(xdc.id)).toEqual([
      "https://xdc-mainnet.gateway.tatum.io",
    ]);

    process.env[traceKey] = " https://trace.example , https://trace.example ";
    expect(getTraceRpcUrls(xdc.id)).toEqual([
      "https://trace.example",
      "https://xdc-mainnet.gateway.tatum.io",
    ]);
  });

  it("has no public trace fallback for other chains", () => {
    expect(getTraceRpcUrls(mainnet.id)).toEqual([]);
  });

  it("does not add the XDC archive fallback to other chains", () => {
    expect(getArchiveRpcUrls(mainnet)).toEqual(mainnet.rpcUrls.default.http);
  });
});
