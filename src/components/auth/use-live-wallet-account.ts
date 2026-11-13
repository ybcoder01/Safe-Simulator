"use client";

import type {
  BaseConnectedSolanaWallet,
  ConnectedWallet,
} from "@privy-io/react-auth";
import { useEffect, useState } from "react";

import { firstWalletAccount } from "@/lib/auth/wallet-session";

interface LiveWalletAccount {
  readonly address: string | null;
  readonly checked: boolean;
}

interface ObservedWalletAccount extends LiveWalletAccount {
  readonly walletKey: string | null;
}

const uncheckedAccount: LiveWalletAccount = {
  address: null,
  checked: false,
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
        const handleAccountsChanged = (accounts: string[]) => {
          if (!active) return;
          setAccount({
            address: firstWalletAccount(accounts),
            checked: true,
            walletKey,
          });
        };

        provider.on("accountsChanged", handleAccountsChanged);
        cleanup = () =>
          provider.removeListener("accountsChanged", handleAccountsChanged);

        const accounts = await provider.request({ method: "eth_accounts" });
        if (active) {
          setAccount({
            address: firstWalletAccount(accounts),
            checked: true,
            walletKey,
          });
        }
      })
      .catch(() => {
        if (active) {
          // If the provider cannot be queried, keep using Privy's authenticated
          // account. We do not infer an account switch from a provider outage.
          setAccount({ address: null, checked: true, walletKey });
        }
      });

    return () => {
      active = false;
      cleanup?.();
    };
  }, [wallet, walletKey]);

  return account.walletKey === walletKey ? account : uncheckedAccount;
}
