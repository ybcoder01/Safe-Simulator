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

describe("WalletConnect pairing links", () => {
  it("accepts a complete v2 link and strips pasted whitespace", () => {
    expect(
      normalizeWalletConnectPairingUri(`  ${pairingUri()}\n`, NOW_MS),
    ).toBe(pairingUri());
  });

  it("accepts a percent-encoded pairing link", () => {
    expect(
      normalizeWalletConnectPairingUri(
        encodeURIComponent(pairingUri()),
        NOW_MS,
      ),
    ).toBe(pairingUri());
  });

  it("rejects expired and nearly expired one-time links", () => {
    expect(() =>
      normalizeWalletConnectPairingUri(pairingUri(NOW_SECONDS), NOW_MS),
    ).toThrowError("This WalletConnect link has expired");

    expect(() =>
      normalizeWalletConnectPairingUri(
        pairingUri(NOW_SECONDS + 5),
        NOW_MS,
      ),
    ).toThrowError("This WalletConnect link is about to expire");
  });

  it("rejects incomplete links before they reach the relay", () => {
    expect(() =>
      normalizeWalletConnectPairingUri(
        `wc:${topic}@2?relay-protocol=irn`,
        NOW_MS,
      ),
    ).toThrow(WalletConnectPairingError);
  });

  it("does not expose relay topics or symmetric keys in connection errors", () => {
    const rawError = new Error(
      `Subscribing to ${topic}?symKey=${symmetricKey} failed, please try again`,
    );

    expect(walletConnectPairingFailureMessage(rawError)).not.toContain(topic);
    expect(walletConnectPairingFailureMessage(rawError)).not.toContain(
      symmetricKey,
    );
    expect(walletConnectPairingFailureMessage(rawError)).toContain(
      "Generate a fresh pairing link",
    );
  });
});
