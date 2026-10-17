import { decodedCallSummary } from "@/core/analysis/decoding/calldata";
import { formatTokenAmount } from "@/core/analysis/tokens/metadata";
import type { DecodedCall } from "@/core/domain";
import type { ExecutionInsight } from "@/lib/api/execution-insight";
import type { TokenMetadataResult } from "@/lib/api/token-metadata";
import { resolveTokenPresentation } from "@/lib/api/token-presentation";

const UNSIGNED_INTEGER = /^\d+$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function methodName(method: string) {
  return method.split("(").at(0)?.toLowerCase() ?? method.toLowerCase();
}

function parameterValue(
  call: DecodedCall,
  names: readonly string[],
  index: number,
) {
  const named = call.parameters.find((parameter) =>
    names.includes((parameter.name ?? "").replace(/^_/, "").toLowerCase()),
  );
  return named?.value ?? call.parameters[index]?.value ?? null;
}

function decodedAmounts(value: string | null): readonly string[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is string =>
            typeof item === "string" && UNSIGNED_INTEGER.test(item),
        )
      : [];
  } catch {
    return [];
  }
}

function grouped(value: string) {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function readableAmount(baseUnits: string, decimals: number | null) {
  const exact = formatTokenAmount(baseUnits, decimals);
  if (!exact) return null;

  const [whole = "0", fraction] = exact.split(".");
  if (!fraction || fraction.length <= 8) {
    return fraction ? `${grouped(whole)}.${fraction}` : grouped(whole);
  }

  return `≈${grouped(whole)}.${fraction.slice(0, 8)}`;
}

function liquidityActionLabel(
  chainId: number,
  call: DecodedCall,
  execution: Pick<ExecutionInsight, "tokenMovements">,
  tokenMetadata: TokenMetadataResult,
) {
  const amounts = decodedAmounts(parameterValue(call, ["amounts"], 0));
  if (amounts.length === 0) return "Add liquidity to a pool";

  const metadataByToken = new Map(
    tokenMetadata.items.map((item) => [item.token.toLowerCase(), item]),
  );
  const usedMovements = new Set<number>();
  const deposits = amounts.map((amount) => {
    const movementIndex = execution.tokenMovements.findIndex(
      (movement, index) =>
        !usedMovements.has(index) &&
        movement.direction === "outbound" &&
        movement.amount === amount,
    );
    if (movementIndex < 0) return null;

    usedMovements.add(movementIndex);
    const movement = execution.tokenMovements[movementIndex];
    if (!movement) return null;
    const metadata = metadataByToken.get(movement.token.toLowerCase());
    const displayAmount = readableAmount(amount, metadata?.decimals ?? null);
    if (!displayAmount) return null;

    const token = resolveTokenPresentation(
      chainId,
      movement.token,
      metadata?.symbol ?? null,
    );
    return `${displayAmount} ${token.symbol}`;
  });
  if (deposits.some((item) => item === null)) {
    return "Add liquidity to a pool";
  }

  const minimumMint = parameterValue(
    call,
    ["min_mint_amount", "minimum_mint_amount"],
    1,
  );
  const lpMovement = execution.tokenMovements.find(
    (movement, index) =>
      !usedMovements.has(index) &&
      movement.direction === "inbound" &&
      (movement.from.toLowerCase() === ZERO_ADDRESS ||
        resolveTokenPresentation(
          chainId,
          movement.token,
          metadataByToken.get(movement.token.toLowerCase())?.symbol ?? null,
        ).kind === "liquidity-position"),
  );
  const lpMetadata = lpMovement
    ? metadataByToken.get(lpMovement.token.toLowerCase())
    : null;
  const minimum =
    minimumMint && UNSIGNED_INTEGER.test(minimumMint)
      ? readableAmount(minimumMint, lpMetadata?.decimals ?? null)
      : null;

  return [
    `Add liquidity: ${deposits.join(" + ")}`,
    minimum ? `(minimum ${minimum} LP tokens)` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export function resolveTransactionActionLabel(input: {
  readonly chainId: number;
  readonly decoded: DecodedCall | null;
  readonly execution: Pick<ExecutionInsight, "tokenMovements">;
  readonly tokenMetadata: TokenMetadataResult;
}): string | null {
  if (!input.decoded) return null;
  if (methodName(input.decoded.method) === "add_liquidity") {
    return liquidityActionLabel(
      input.chainId,
      input.decoded,
      input.execution,
      input.tokenMetadata,
    );
  }
  return decodedCallSummary(input.decoded);
}
