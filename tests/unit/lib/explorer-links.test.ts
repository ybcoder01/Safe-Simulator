import { describe, expect, it } from "vitest";

import {
  explorerAddressUrl,
  explorerTransactionUrl,
} from "../../../src/lib/explorer-links";

const address = "0x000000000000000000000000000000000000dead";
const transactionHash = `0x${"ab".repeat(32)}`;

describe("explorer links", () => {
  it("builds Ethereum address and transaction links", () => {
    expect(explorerAddressUrl(1, address)).toBe(
      `https://etherscan.io/address/${address}`,
    );
    expect(explorerTransactionUrl(1, transactionHash)).toBe(
      `https://etherscan.io/tx/${transactionHash}`,
    );
  });

  it("uses XDCScan address and transaction path formats", () => {
    expect(explorerAddressUrl(50, address)).toBe(
      "https://xdcscan.com/address/xdc000000000000000000000000000000000000dead",
    );
    expect(explorerTransactionUrl(50, transactionHash)).toBe(
      `https://xdcscan.com/tx/${transactionHash}`,
    );
  });

  it("rejects unsupported chains and malformed values", () => {
    expect(explorerAddressUrl(10, address)).toBeNull();
    expect(explorerAddressUrl(1, "not-an-address")).toBeNull();
    expect(explorerTransactionUrl(50, "0x1234")).toBeNull();
  });
});
