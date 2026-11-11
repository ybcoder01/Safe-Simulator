import { describe, expect, it } from "vitest";

import {
  normalizeWalletConnectPairingUri,
  walletConnectPairingFailureMessage,
  WalletConnectPairingError,
} from "../../../src/lib/walletconnect-pairing";

const NOW_MS = 1_700_000_000_000;
const NOW_SECONDS = Math.floor(NOW_MS / 1_000);
const topic = "a".repeat(64);
const symmetricKey = "b".repeat(64);

function pairingUri(expiryTimestamp = NOW_SECONDS + 300) {
  return `wc:${topic}@2?expiryTimestamp=${expiryTimestamp}&relay-protocol=irn&symKey=${symmetricKey}`;
}

function normalize(uri: string) {
  return normalizeWalletConnectPairingUri(uri, NOW_MS);
}

describe("WalletConnect pairing links", () => {
  it("accepts a complete v2 link and strips pasted whitespace", () => {
    expect(normalize(`  ${pairingUri()}\n`)).toBe(pairingUri());
  });

  it("accepts a percent-encoded pairing link", () => {
    const encodedUri = encodeURIComponent(pairingUri());

    expect(normalize(encodedUri)).toBe(pairingUri());
  });

  it("rejects expired and nearly expired one-time links", () => {
    const expiredUri = pairingUri(NOW_SECONDS);
    const nearlyExpiredUri = pairingUri(NOW_SECONDS + 5);

    expect(() => normalize(expiredUri)).toThrowError(
      "This WalletConnect link has expired",
    );
    expect(() => normalize(nearlyExpiredUri)).toThrowError(
      "This WalletConnect link is about to expire",
    );
  });

  it("rejects incomplete links before they reach the relay", () => {
    const incompleteUri = `wc:${topic}@2?relay-protocol=irn`;

    expect(() => normalize(incompleteUri)).toThrow(WalletConnectPairingError);
  });

  it("does not expose relay topics or symmetric keys in connection errors", () => {
    const rawError = new Error(
      `Subscribing to ${topic}?symKey=${symmetricKey} failed, please try again`,
    );
    const message = walletConnectPairingFailureMessage(rawError);

    expect(message).not.toContain(topic);
    expect(message).not.toContain(symmetricKey);
    expect(message).toContain("Generate a fresh pairing link");
  });
});
