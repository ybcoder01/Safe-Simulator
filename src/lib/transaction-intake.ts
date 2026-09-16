const ADDRESS_PATTERN = /0x[0-9a-fA-F]{40}/;
const HASH_PATTERN = /0x[0-9a-fA-F]{64}/;

const CHAIN_ALIASES = new Map<string, number>([
  ["1", 1],
  ["eth", 1],
  ["ethereum", 1],
  ["eip155:1", 1],
  ["50", 50],
  ["xdc", 50],
  ["eip155:50", 50],
]);

export type TransactionIntakeSource =
  | "inspector"
  | "safe-app"
  | "explorer"
  | "text";

export interface TransactionIntakeResult {
  readonly status: "complete" | "partial" | "invalid";
  readonly source: TransactionIntakeSource;
  readonly chainId?: number | undefined;
  readonly safeAddress?: string | undefined;
  readonly safeTxHash?: string | undefined;
  readonly message: string;
}

function normalizeHex(value: string | undefined) {
  return value?.toLowerCase();
}

function chainFromAlias(value: string | null | undefined) {
  if (!value) return undefined;
  return CHAIN_ALIASES.get(value.trim().toLowerCase());
}

function resultFor(input: {
  readonly source: TransactionIntakeSource;
  readonly chainId?: number | undefined;
  readonly safeAddress?: string | undefined;
  readonly safeTxHash?: string | undefined;
}): TransactionIntakeResult {
  const safeAddress = normalizeHex(input.safeAddress);
  const safeTxHash = normalizeHex(input.safeTxHash);

  if (input.chainId && safeAddress && safeTxHash) {
    return {
      ...input,
      safeAddress,
      safeTxHash,
      status: "complete",
      message: "Network, Safe address, and transaction hash detected.",
    };
  }

  const missing = [
    input.chainId ? null : "network",
    safeAddress ? null : "Safe address",
    safeTxHash ? null : "transaction hash",
  ].filter((item): item is string => item !== null);

  if (missing.length < 3) {
    return {
      ...input,
      safeAddress,
      safeTxHash,
      status: "partial",
      message: `Detected part of the transaction. Add the missing ${missing.join(
        " and ",
      )}.`,
    };
  }

  return {
    source: input.source,
    status: "invalid",
    message:
      "No supported Safe address or transaction hash was found in that value.",
  };
}

function parseInspectorUrl(url: URL) {
  const match = url.pathname.match(
    /^\/safe\/(\d+)\/(0x[0-9a-fA-F]{40})\/tx\/(0x[0-9a-fA-F]{64})\/?$/,
  );
  if (!match) return null;

  const chainId = Number(match[1]);
  if (chainId !== 1 && chainId !== 50) {
    return {
      source: "inspector" as const,
      status: "invalid" as const,
      message: `Chain ${chainId} is not supported yet.`,
    };
  }

  return resultFor({
    source: "inspector",
    chainId,
    safeAddress: match[2],
    safeTxHash: match[3],
  });
}

function parseSafeAppUrl(url: URL) {
  if (url.hostname.toLowerCase() !== "app.safe.global") return null;

  const safe = url.searchParams.get("safe");
  const safeParts = safe?.split(":") ?? [];
  const safeAddress = safeParts
    .find((part) => ADDRESS_PATTERN.test(part))
    ?.match(ADDRESS_PATTERN)?.[0];
  const chainAlias = safeAddress
    ? safeParts.filter((part) => part !== safeAddress).join(":")
    : safeParts[0];
  const id = url.searchParams.get("id") ?? "";

  return resultFor({
    source: "safe-app",
    chainId: chainFromAlias(chainAlias),
    safeAddress,
    safeTxHash: id.match(HASH_PATTERN)?.[0],
  });
}

function parseExplorerUrl(url: URL) {
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  const chainId =
    hostname === "xdcscan.com" ? 50 : hostname === "etherscan.io" ? 1 : null;
  if (!chainId) return null;

  const transactionMatch = url.pathname.match(/^\/tx\/(0x[0-9a-fA-F]{64})\/?$/);
  if (!transactionMatch) {
    return {
      source: "explorer" as const,
      status: "invalid" as const,
      message: "Use a transaction page URL from this explorer.",
    };
  }

  return resultFor({
    source: "explorer",
    chainId,
    safeTxHash: transactionMatch[1],
  });
}

function parseText(value: string) {
  const safeTxHash = value.match(HASH_PATTERN)?.[0];
  const withoutHash = safeTxHash ? value.replace(safeTxHash, "") : value;
  const safeAddress = withoutHash.match(ADDRESS_PATTERN)?.[0];
  const chainId =
    /\bxdc\b/i.test(value) || /\bchain\s*50\b/i.test(value)
      ? 50
      : /\beth(?:ereum)?\b/i.test(value) || /\bchain\s*1\b/i.test(value)
        ? 1
        : undefined;

  return resultFor({ source: "text", chainId, safeAddress, safeTxHash });
}

export function parseTransactionIntake(value: string): TransactionIntakeResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return {
      source: "text",
      status: "invalid",
      message: "Paste a transaction link or identifier first.",
    };
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return {
        source: "text",
        status: "invalid",
        message: "Only HTTP or HTTPS transaction links are supported.",
      };
    }

    return (
      parseInspectorUrl(url) ??
      parseSafeAppUrl(url) ??
      parseExplorerUrl(url) ?? {
        source: "text",
        status: "invalid",
        message:
          "That site is not supported. Use a Safe Wallet, Safe Inspector, XDCScan, or Etherscan transaction link.",
      }
    );
  } catch {
    return parseText(trimmed);
  }
}
