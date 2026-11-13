"use client";

import { useActiveWallet, usePrivy } from "@privy-io/react-auth";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { useLiveWalletAccount } from "@/components/auth/use-live-wallet-account";
import {
  resolveSessionWalletAddress,
  walletAddressesMatch,
} from "@/lib/auth/wallet-session";

interface SessionErrorBody {
  readonly error?: { readonly message?: string };
}

function WalletGate({ children }: { readonly children: ReactNode }) {
  const { ready, authenticated, login, logout, user, getAccessToken } =
    usePrivy();
  const { wallet: activeWallet } = useActiveWallet();
  const walletAddress = resolveSessionWalletAddress(
    activeWallet?.address,
    user?.wallet?.address,
  );
  const liveWallet = useLiveWalletAccount(activeWallet);
  const [walletChange, setWalletChange] = useState<{
    readonly previousAddress: string;
    readonly nextAddress: string;
  } | null>(null);
  const handledWalletChange = useRef<string | null>(null);
  const [sessionState, setSessionState] = useState<{
    readonly walletAddress: string | null;
    readonly error: string | null;
  }>({ walletAddress: null, error: null });
  const sessionReady =
    Boolean(walletAddress) &&
    sessionState.walletAddress === walletAddress?.toLowerCase();
  const providerWalletChanged =
    Boolean(walletAddress) &&
    liveWallet.checked &&
    Boolean(liveWallet.address) &&
    !walletAddressesMatch(walletAddress, liveWallet.address);

  useEffect(() => {
    if (
      !ready ||
      !authenticated ||
      !walletAddress ||
      !liveWallet.address ||
      !providerWalletChanged
    ) {
      return;
    }

    const changeKey = `${walletAddress.toLowerCase()}:${liveWallet.address.toLowerCase()}`;
    if (handledWalletChange.current === changeKey) return;
    handledWalletChange.current = changeKey;

    setWalletChange({
      previousAddress: walletAddress,
      nextAddress: liveWallet.address,
    });
    setSessionState({ walletAddress: null, error: null });

    void fetch("/api/v1/auth/session", { method: "DELETE" }).finally(() => {
      void logout();
    });
  }, [
    authenticated,
    liveWallet.address,
    logout,
    providerWalletChanged,
    ready,
    walletAddress,
  ]);

  useEffect(() => {
    if (
      !ready ||
      !authenticated ||
      !walletAddress ||
      providerWalletChanged ||
      walletChange
    ) {
      return;
    }

    let active = true;
    void getAccessToken()
      .then(async (token) => {
        if (!token) throw new Error("Privy did not provide an access token.");
        const response = await fetch("/api/v1/auth/session", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ walletAddress }),
        });
        const body = (await response.json()) as SessionErrorBody;
        if (!response.ok) {
          throw new Error(body.error?.message ?? "Wallet login was rejected.");
        }
        if (active) {
          setSessionState({
            walletAddress: walletAddress.toLowerCase(),
            error: null,
          });
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setSessionState({
            walletAddress: null,
            error:
              cause instanceof Error ? cause.message : "Wallet login failed.",
          });
        }
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
    walletChange,
  ]);

  async function signOut() {
    await fetch("/api/v1/auth/session", { method: "DELETE" });
    await logout();
    handledWalletChange.current = null;
    setWalletChange(null);
    setSessionState({ walletAddress: null, error: null });
  }

  function signInAfterWalletChange() {
    handledWalletChange.current = null;
    setWalletChange(null);
    login();
  }

  if (!ready) {
    return <div className="auth-state">Checking wallet session…</div>;
  }

  if (walletChange) {
    return (
      <section className="auth-gate" aria-labelledby="wallet-changed-title">
        <span className="eyebrow">Wallet changed</span>
        <h1 id="wallet-changed-title">Sign in with the selected wallet</h1>
        <p>
          Your wallet changed from {walletChange.previousAddress.slice(0, 8)}…
          {walletChange.previousAddress.slice(-6)} to{" "}
          {walletChange.nextAddress.slice(0, 8)}…
          {walletChange.nextAddress.slice(-6)}. Sign in again so one signer
          cannot inherit another signer&apos;s Safe Inspector session.
        </p>
        <button
          className="button"
          type="button"
          onClick={signInAfterWalletChange}
        >
          Sign in with selected wallet
        </button>
      </section>
    );
  }

  if (!authenticated) {
    return (
      <section className="auth-gate" aria-labelledby="wallet-login-title">
        <span className="eyebrow">Wallet-only access</span>
        <h1 id="wallet-login-title">Sign in to manage your Safes</h1>
        <p>
          Your wallet proves who you are. Safe Inspector cannot sign, submit, or
          approve transactions and will not create an embedded wallet.
        </p>
        <button className="button" type="button" onClick={login}>
          Sign in with wallet
        </button>
      </section>
    );
  }

  if (!sessionReady) {
    return (
      <section className="auth-gate compact">
        <h1>Verifying wallet ownership</h1>
        <p>
          {sessionState.error ?? "Creating a secure Safe Inspector session…"}
        </p>
        {sessionState.error ? (
          <button
            className="button button-secondary"
            type="button"
            onClick={logout}
          >
            Try another wallet
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <>
      <div className="auth-account-bar">
        <span>
          Signed in as {walletAddress?.slice(0, 8)}…{walletAddress?.slice(-6)}
        </span>
        <button className="text-button" type="button" onClick={signOut}>
          Sign out
        </button>
      </div>
      {children}
    </>
  );
}

export function WalletAuthGate({
  configured,
  children,
}: {
  readonly configured: boolean;
  readonly children: ReactNode;
}) {
  if (!configured) {
    return (
      <section className="auth-gate compact">
        <h1>Wallet login is not configured</h1>
        <p>
          Add the Privy app ID and app secret to this environment before using
          personal Safe features.
        </p>
      </section>
    );
  }
  return <WalletGate>{children}</WalletGate>;
}
