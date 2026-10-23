"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useState, type ReactNode } from "react";

interface SessionErrorBody {
  readonly error?: { readonly message?: string };
}

function WalletGate({ children }: { readonly children: ReactNode }) {
  const { ready, authenticated, login, logout, user, getAccessToken } =
    usePrivy();
  const walletAddress = user?.wallet?.address;
  const [sessionState, setSessionState] = useState<{
    readonly walletAddress: string | null;
    readonly error: string | null;
  }>({ walletAddress: null, error: null });
  const sessionReady =
    Boolean(walletAddress) &&
    sessionState.walletAddress === walletAddress?.toLowerCase();

  useEffect(() => {
    if (!ready || !authenticated || !walletAddress) {
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
  }, [authenticated, getAccessToken, ready, walletAddress]);

  async function signOut() {
    await fetch("/api/v1/auth/session", { method: "DELETE" });
    await logout();
    setSessionState({ walletAddress: null, error: null });
  }

  if (!ready) {
    return <div className="auth-state">Checking wallet session…</div>;
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
