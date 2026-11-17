export interface WalletConnectSessionScope {
  readonly address: string;
  readonly chainId: number;
}

export interface WalletConnectSessionLike {
  readonly topic: string;
  readonly namespaces: Readonly<
    Record<string, { readonly accounts?: readonly string[] }>
  >;
}

export function walletConnectSessionStorageKey(
  scope: WalletConnectSessionScope,
) {
  return `safe-inspector:walletconnect-session:${scope.chainId}:${scope.address.toLowerCase()}`;
}

export function walletConnectSessionMatchesSafe(
  session: WalletConnectSessionLike,
  scope: WalletConnectSessionScope,
) {
  const expectedAccount =
    `eip155:${scope.chainId}:${scope.address}`.toLowerCase();

  return Object.values(session.namespaces).some((namespace) =>
    namespace.accounts?.some(
      (account) => account.toLowerCase() === expectedAccount,
    ),
  );
}

export function selectWalletConnectSession<T extends WalletConnectSessionLike>(
  sessions: readonly T[],
  persistedTopic: string | null,
  scope: WalletConnectSessionScope,
): T | null {
  const matchingSessions = sessions.filter((session) =>
    walletConnectSessionMatchesSafe(session, scope),
  );

  if (persistedTopic) {
    return (
      matchingSessions.find((session) => session.topic === persistedTopic) ??
      null
    );
  }

  return matchingSessions.length === 1 ? (matchingSessions[0] ?? null) : null;
}
