import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useActiveWalletMock, usePrivyMock } = vi.hoisted(() => ({
  useActiveWalletMock: vi.fn(),
  usePrivyMock: vi.fn(),
}));

vi.mock("@privy-io/react-auth", () => ({
  useActiveWallet: useActiveWalletMock,
  usePrivy: usePrivyMock,
}));

import { WalletAuthGate } from "../../../src/components/auth/wallet-auth-gate";
import { WalletSessionBridge } from "../../../src/components/auth/wallet-session-bridge";

describe("Privy authentication boundary", () => {
  beforeEach(() => {
    useActiveWalletMock.mockReset();
    usePrivyMock.mockReset();
    usePrivyMock.mockReturnValue({
      authenticated: false,
      getAccessToken: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      ready: true,
      user: null,
    });
  });

  it("does not initialize active-wallet tracking before login", () => {
    const html = renderToStaticMarkup(
      <WalletAuthGate configured>
        <div>Private Safe controls</div>
      </WalletAuthGate>,
    );

    expect(html).toContain("Sign in with wallet");
    expect(useActiveWalletMock).not.toHaveBeenCalled();
  });

  it("keeps the public session bridge idle before login", () => {
    renderToStaticMarkup(<WalletSessionBridge />);

    expect(useActiveWalletMock).not.toHaveBeenCalled();
  });
});
