"use client";

import type {
  BaseConnectedSolanaWallet,
  ConnectedWallet,
} from "@privy-io/react-auth";
import { useEffect, useState } from "react";

import {
  firstWalletAccount,
  type LiveWalletAccountStatus,
} from "@/lib/auth/wallet-session";

interface LiveWalletAccount {
  readonly address: string | null;
  readonly status: LiveWalletAccountStatus;
}

interface ObservedWalletAccount extends LiveWalletAccount {
  readonly walletKey: string | null;
}

const uncheckedAccount: LiveWalletAccount = {
  address: null,
  status: "unchecked",
};

/**
 * Reads the account selected in the wallet provider itself. Privy's active
 * wallet can remain cached after a MetaMask account switch, so protected
 * sessions must also observe the provider's accountsChanged event.
 */
export function useLiveWalletAccount(
  wallet: ConnectedWallet | BaseConnectedSolanaWallet | undefined,
): LiveWalletAccount {
  const walletKey =
    wallet?.type === "ethereum" ? wallet.address.toLowerCase() : null;
  const [account, setAccount] = useState<ObservedWalletAccount>({
    ...uncheckedAccount,
    walletKey: null,
  });

  useEffect(() => {
    if (!wallet || wallet.type !== "ethereum") {
      return;
    }

    let active = true;
    let cleanup: (() => void) | undefined;

    void wallet
      .getEthereumProvider()
      .then(async (provider) => {
        const applyAccounts = (accounts: unknown) => {
          if (!active) return;
          const address = firstWalletAccount(accounts);
          setAccount({
            address,
            status: address ? "connected" : "disconnected",
            walletKey,
          });
        };

        const refreshAccount = async () => {
          try {
            const accounts = await provider.request({ method: "eth_accounts" });
            applyAccounts(accounts);
          } catch {
            if (active) {
              // A provider outage is not evidence that the signer changed.
              setAccount({
                address: null,
                status: "unavailable",
                walletKey,
              });
            }
          }
        };

        const handleAccountsChanged = (accounts: string[]) => {
          applyAccounts(accounts);
        };
        const handleDisconnect = () => {
          if (!active) return;
          setAccount({
            address: null,
            status: "disconnected",
            walletKey,
          });
        };
        const handleFocus = () => void refreshAccount();
        const handleVisibilityChange = () => {
          if (document.visibilityState === "visible") void refreshAccount();
        };

        provider.on("accountsChanged", handleAccountsChanged);
        provider.on("disconnect", handleDisconnect);
        window.addEventListener("focus", handleFocus);
        document.addEventListener("visibilitychange", handleVisibilityChange);
        cleanup = () => {
          provider.removeListener("accountsChanged", handleAccountsChanged);
          provider.removeListener("disconnect", handleDisconnect);
          window.removeEventListener("focus", handleFocus);
          document.removeEventListener(
            "visibilitychange",
            handleVisibilityChange,
          );
        };

        await refreshAccount();
      })
      .catch(() => {
        if (active) {
          // If the provider cannot be queried, keep using Privy's authenticated
          // account. We do not infer an account switch from a provider outage.
          setAccount({ address: null, status: "unavailable", walletKey });
        }
      });

    return () => {
      active = false;
      cleanup?.();
    };
  }, [wallet, walletKey]);

  return account.walletKey === walletKey ? account : uncheckedAccount;
}
