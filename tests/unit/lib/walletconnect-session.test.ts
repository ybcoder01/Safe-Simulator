import { describe, expect, it } from "vitest";

import {
  selectWalletConnectSession,
  walletConnectSessionMatchesSafe,
  walletConnectSessionStorageKey,
  type WalletConnectSessionLike,
} from "../../../src/lib/walletconnect-session";

const safe = {
  address: "0xc8bAe80ca5c2C9eC3bd4AC16c422220a33b6B173",
  chainId: 50,
};

function session(
  topic: string,
  account = `eip155:${safe.chainId}:${safe.address}`,
): WalletConnectSessionLike {
  return {
    topic,
    namespaces: { eip155: { accounts: [account] } },
  };
}

describe("WalletConnect session selection", () => {
  it("creates a Safe-specific storage key", () => {
    expect(walletConnectSessionStorageKey(safe)).toBe(
      "safe-inspector:walletconnect-session:50:0xc8bae80ca5c2c9ec3bd4ac16c422220a33b6b173",
    );
  });

  it("matches the same Safe account without regard to address casing", () => {
    expect(
      walletConnectSessionMatchesSafe(
        session("oku", `eip155:50:${safe.address.toUpperCase()}`),
        safe,
      ),
    ).toBe(true);
  });

  it("rejects sessions for another Safe or network", () => {
    expect(
      walletConnectSessionMatchesSafe(
        session(
          "other",
          "eip155:50:0x0000000000000000000000000000000000000001",
        ),
        safe,
      ),
    ).toBe(false);
    expect(
      walletConnectSessionMatchesSafe(
        session("ethereum", `eip155:1:${safe.address}`),
        safe,
      ),
    ).toBe(false);
  });

  it("restores only the exact persisted topic when several dApps use the same Safe", () => {
    const fathom = session("fathom");
    const oku = session("oku");

    expect(selectWalletConnectSession([fathom, oku], "oku", safe)).toBe(oku);
  });

  it("does not fall back to another dApp when the persisted topic is stale", () => {
    expect(selectWalletConnectSession([session("fathom")], "oku", safe)).toBe(
      null,
    );
  });

  it("restores a sole matching session when no topic has been persisted", () => {
    const oku = session("oku");
    expect(selectWalletConnectSession([oku], null, safe)).toBe(oku);
  });

  it("requires reconnecting when several matching sessions are ambiguous", () => {
    expect(
      selectWalletConnectSession(
        [session("fathom"), session("oku")],
        null,
        safe,
      ),
    ).toBe(null);
  });
});
