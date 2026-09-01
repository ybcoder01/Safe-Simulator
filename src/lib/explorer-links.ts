const EXPLORER_BASE_URLS: Readonly<Record<number, string>> = {
  1: "https://etherscan.io",
  50: "https://xdcscan.com",
};

function explorerBaseUrl(chainId: number): string | null {
  return EXPLORER_BASE_URLS[chainId] ?? null;
}

export function explorerAddressUrl(
  chainId: number,
  address: string,
): string | null {
  const baseUrl = explorerBaseUrl(chainId);
  if (!baseUrl || !/^0x[0-9a-fA-F]{40}$/.test(address)) return null;

  const explorerAddress = chainId === 50 ? `xdc${address.slice(2)}` : address;
  return `${baseUrl}/address/${explorerAddress}`;
}

export function explorerTransactionUrl(
  chainId: number,
  transactionHash: string,
): string | null {
  const baseUrl = explorerBaseUrl(chainId);
  if (!baseUrl || !/^0x[0-9a-fA-F]{64}$/.test(transactionHash)) return null;

  return `${baseUrl}/tx/${transactionHash}`;
}
