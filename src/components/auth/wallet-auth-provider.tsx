"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import type { ReactNode } from "react";

export function WalletAuthProvider({
  appId,
  children,
}: {
  readonly appId: string | undefined;
  readonly children: ReactNode;
}) {
  if (!appId) return children;

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["wallet"],
        embeddedWallets: {
          ethereum: { createOnLogin: "off" },
          solana: { createOnLogin: "off" },
          showWalletUIs: false,
        },
        appearance: {
          theme: "dark",
          accentColor: "#63edb1",
          landingHeader: "Sign in to Safe Inspector",
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
