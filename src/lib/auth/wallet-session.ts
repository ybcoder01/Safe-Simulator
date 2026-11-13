export function resolveSessionWalletAddress(
  activeWalletAddress: string | null | undefined,
  primaryWalletAddress: string | null | undefined,
) {
  return activeWalletAddress ?? primaryWalletAddress;
}
