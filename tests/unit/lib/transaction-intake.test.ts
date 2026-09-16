import { describe, expect, it } from "vitest";

import { parseTransactionIntake } from "../../../src/lib/transaction-intake";

const safe = "0xc8bAe80ca5c2C9eC3bd4AC16c422220a33b6B173";
const hash = `0x${"a".repeat(64)}`;

describe("transaction intake parser", () => {
  it("parses a Safe Inspector transaction URL", () => {
    expect(
      parseTransactionIntake(
        `https://safe-simulator.vercel.app/safe/50/${safe}/tx/${hash}`,
      ),
    ).toMatchObject({
      status: "complete",
      source: "inspector",
      chainId: 50,
      safeAddress: safe.toLowerCase(),
      safeTxHash: hash,
    });
  });

  it("parses a Safe Wallet transaction URL", () => {
    expect(
      parseTransactionIntake(
        `https://app.safe.global/transactions/tx?safe=xdc:${safe}&id=multisig_${safe}_${hash}`,
      ),
    ).toMatchObject({
      status: "complete",
      source: "safe-app",
      chainId: 50,
      safeAddress: safe.toLowerCase(),
      safeTxHash: hash,
    });
  });

  it("extracts an Ethereum Safe Wallet reference", () => {
    expect(
      parseTransactionIntake(
        `https://app.safe.global/transactions/tx?safe=eth:${safe}&id=multisig_${hash}`,
      ),
    ).toMatchObject({ status: "complete", chainId: 1 });
  });

  it("uses explorer links without guessing the Safe address", () => {
    expect(parseTransactionIntake(`https://xdcscan.com/tx/${hash}`)).toEqual({
      status: "partial",
      source: "explorer",
      chainId: 50,
      safeTxHash: hash,
      message:
        "Detected part of the transaction. Add the missing Safe address.",
    });
  });

  it("extracts identifiers from labelled text without treating a hash prefix as an address", () => {
    expect(
      parseTransactionIntake(`XDC Safe ${safe}\nSafe transaction hash ${hash}`),
    ).toMatchObject({
      status: "complete",
      source: "text",
      chainId: 50,
      safeAddress: safe.toLowerCase(),
      safeTxHash: hash,
    });

    expect(parseTransactionIntake(hash)).toMatchObject({
      status: "partial",
      safeTxHash: hash,
      safeAddress: undefined,
    });
  });

  it("rejects unsupported chains and unrelated links", () => {
    expect(
      parseTransactionIntake(`https://example.com/safe/137/${safe}/tx/${hash}`),
    ).toMatchObject({
      status: "invalid",
      message: "Chain 137 is not supported yet.",
    });
    expect(
      parseTransactionIntake("https://example.com/transaction"),
    ).toMatchObject({
      status: "invalid",
    });
  });
});
