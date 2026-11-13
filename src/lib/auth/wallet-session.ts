export function resolveSessionWalletAddress(
  activeWalletAddress: string | null | undefined,
  primaryWalletAddress: string | null | undefined,
) {
  // The wallet that completed Privy authentication owns the session. A newly
  // selected provider account must authenticate again instead of silently
  // inheriting the existing Safe Inspector session.
  return primaryWalletAddress ?? activeWalletAddress;
}

export function normalizeWalletAddress(address: string | null | undefined) {
  const trimmed = address?.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

export function walletAddressesMatch(
  first: string | null | undefined,
  second: string | null | undefined,
) {
  const normalizedFirst = normalizeWalletAddress(first);
  const normalizedSecond = normalizeWalletAddress(second);
  return (
    normalizedFirst !== null &&
    normalizedSecond !== null &&
    normalizedFirst === normalizedSecond
  );
}

export function firstWalletAccount(accounts: unknown) {
  if (!Array.isArray(accounts)) return null;
  const first = accounts.find(
    (account): account is string =>
      typeof account === "string" && account.trim().length > 0,
  );
  return first?.trim() ?? null;
}
