"use client";

import { useActiveWallet, usePrivy } from "@privy-io/react-auth";
import { useEffect } from "react";

import { useLiveWalletAccount } from "@/components/auth/use-live-wallet-account";
import {
  resolveSessionWalletAddress,
  walletAddressesMatch,
} from "@/lib/auth/wallet-session";

interface SessionResponse {
  readonly authenticated?: boolean;
  readonly walletAddress?: string;
}

interface SessionErrorResponse {
  readonly error?: { readonly message?: string };
}

/**
 * Keeps the app's short-lived server session aligned with Privy's longer-lived
 * wallet session without making public Safe reports login-only.
 */
export function WalletSessionBridge() {
  const { authenticated, getAccessToken, logout, ready, user } = usePrivy();
  const { wallet: activeWallet } = useActiveWallet();
  const walletAddress = resolveSessionWalletAddress(
    activeWallet?.address,
    user?.wallet?.address,
  );
  const liveWallet = useLiveWalletAccount(activeWallet);
  const providerWalletChanged =
    Boolean(walletAddress) &&
    liveWallet.checked &&
    Boolean(liveWallet.address) &&
    !walletAddressesMatch(walletAddress, liveWallet.address);

  useEffect(() => {
    if (!ready || !authenticated || !providerWalletChanged) return;

    let active = true;
    void fetch("/api/v1/auth/session", { method: "DELETE" }).finally(() => {
      if (active) void logout();
    });

    return () => {
      active = false;
    };
  }, [authenticated, logout, providerWalletChanged, ready]);

  useEffect(() => {
    if (!ready || !authenticated || !walletAddress || providerWalletChanged) {
      return;
    }

    let active = true;

    void (async () => {
      const currentResponse = await fetch("/api/v1/auth/session", {
        cache: "no-store",
      });
      const current = (await currentResponse.json()) as SessionResponse;
      if (
        currentResponse.ok &&
        current.authenticated &&
        current.walletAddress?.toLowerCase() === walletAddress.toLowerCase()
      ) {
        return;
      }

      const token = await getAccessToken();
      if (!token) throw new Error("Privy did not provide an access token.");

      const response = await fetch("/api/v1/auth/session", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ walletAddress }),
      });
      const body = (await response.json()) as SessionErrorResponse;
      if (!response.ok) {
        throw new Error(
          body.error?.message ?? "The wallet session could not be renewed.",
        );
      }

      // Reload once so server components and server actions both read the new
      // HttpOnly session, and any stale action error is cleared.
      if (active) window.location.reload();
    })().catch((cause: unknown) => {
      console.warn("Safe Inspector session renewal failed.", {
        error: cause instanceof Error ? cause.message : String(cause),
      });
    });

    return () => {
      active = false;
    };
  }, [
    authenticated,
    getAccessToken,
    providerWalletChanged,
    ready,
    walletAddress,
  ]);

  return null;
}
