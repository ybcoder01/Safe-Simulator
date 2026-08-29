import type { Address, ChainId, Hex, SafeTransaction } from "@/core/domain";
import {
  CANONICAL_PERMIT2_ADDRESS,
  extractApprovalRequests,
  type ApprovalRequest,
  type ApprovalStandard,
} from "@/core/analysis/tokens/approval-intents";
import type { ChainPort } from "@/core/ports";
import type { ContractInsight } from "@/lib/api/contract-insight";
import type { ExecutionInsight } from "@/lib/api/execution-insight";

const ERC20_ALLOWANCE_SELECTOR = "0xdd62ed3e";
const PERMIT2_ALLOWANCE_SELECTOR = "0x927da105";
const WORD_PATTERN = /^0x[0-9a-fA-F]{64,}$/;
const MAX_STATE_READS = 24;

export interface ApprovalRequestView {
  readonly standard: ApprovalStandard;
  readonly source: ApprovalRequest["source"];
  readonly method: string;
  readonly depth: number;
  readonly target: Address;
  readonly token: Address | null;
  readonly owner: Address | null;
  readonly spender: Address | null;
  readonly amount: string | null;
  readonly infinite: boolean | null;
  readonly expiration: string | null;
  readonly priorAmount: string | null;
  readonly newSpenderAtAnchor: boolean | null;
  readonly warning: string | null;
}

export interface ExecutedAllowanceView {
  readonly token: Address;
  readonly owner: Address;
  readonly spender: Address;
  readonly amount: string;
  readonly infinite: boolean;
  readonly logIndex: number;
  readonly priorAmount: string | null;
  readonly newSpenderAtAnchor: boolean | null;
  readonly warning: string | null;
}

export interface ApprovalRiskResult {
  readonly requests: readonly ApprovalRequestView[];
  readonly executedChanges: readonly ExecutedAllowanceView[];
  readonly limited: boolean;
  readonly anchor: {
    readonly type: "previous-block" | "latest-state" | "unavailable";
    readonly blockNumber: string | null;
  };
  readonly warnings: readonly string[];
}

interface AllowanceLookup {
  readonly standard: "erc20" | "permit2-allowance";
  readonly token: Address;
  readonly owner: Address;
  readonly spender: Address;
}

function paddedAddress(address: Address): string {
  return address.slice(2).toLowerCase().padStart(64, "0");
}

function allowanceData(lookup: AllowanceLookup): Hex {
  if (lookup.standard === "permit2-allowance") {
    return (PERMIT2_ALLOWANCE_SELECTOR +
      paddedAddress(lookup.owner) +
      paddedAddress(lookup.token) +
      paddedAddress(lookup.spender)) as Hex;
  }

  return (ERC20_ALLOWANCE_SELECTOR +
    paddedAddress(lookup.owner) +
    paddedAddress(lookup.spender)) as Hex;
}

function lookupTarget(lookup: AllowanceLookup): Address {
  return lookup.standard === "permit2-allowance"
    ? CANONICAL_PERMIT2_ADDRESS
    : lookup.token;
}

function decodedAllowance(value: Hex): bigint | null {
  if (!WORD_PATTERN.test(value)) return null;
  try {
    return BigInt("0x" + value.slice(2, 66));
  } catch {
    return null;
  }
}

function lookupKey(lookup: AllowanceLookup): string {
  return [
    lookup.standard,
    lookup.token.toLowerCase(),
    lookup.owner.toLowerCase(),
    lookup.spender.toLowerCase(),
  ].join(":");
}

function requestLookup(item: ApprovalRequest): AllowanceLookup | null {
  if (
    item.standard === "permit2-signature-transfer" ||
    !item.token ||
    !item.owner ||
    !item.spender
  ) {
    return null;
  }
  return {
    standard: item.standard,
    token: item.token,
    owner: item.owner,
    spender: item.spender,
  };
}

function stateAnchor(
  transaction: SafeTransaction,
  execution: ExecutionInsight,
): ApprovalRiskResult["anchor"] & { readonly callBlock: bigint | undefined } {
  if (transaction.status === "executed" && execution.blockNumber !== null) {
    try {
      const block = BigInt(execution.blockNumber);
      if (block > 0n) {
        return {
          type: "previous-block",
          blockNumber: (block - 1n).toString(),
          callBlock: block - 1n,
        };
      }
    } catch {
      // Fall through to unavailable.
    }
  }

  if (transaction.status === "pending") {
    return {
      type: "latest-state",
      blockNumber: null,
      callBlock: undefined,
    };
  }

  return {
    type: "unavailable",
    blockNumber: null,
    callBlock: undefined,
  };
}

async function readPriorAllowances(
  chain: Pick<ChainPort, "call">,
  chainId: ChainId,
  lookups: readonly AllowanceLookup[],
  anchor: ReturnType<typeof stateAnchor>,
): Promise<Map<string, bigint | null>> {
  const values = new Map<string, bigint | null>();
  if (anchor.type === "unavailable") return values;

  const unique = [
    ...new Map(lookups.map((item) => [lookupKey(item), item])).values(),
  ].slice(0, MAX_STATE_READS);
  await Promise.all(
    unique.map(async (lookup) => {
      let amount: bigint | null = null;
      try {
        amount = decodedAllowance(
          await chain.call(
            chainId,
            {
              to: lookupTarget(lookup),
              data: allowanceData(lookup),
            },
            anchor.callBlock,
          ),
        );
      } catch {
        amount = null;
      }
      values.set(lookupKey(lookup), amount);
    }),
  );
  return values;
}

function stateWarning(
  prior: bigint | null,
  anchor: ApprovalRiskResult["anchor"],
  existing: string | null,
): string | null {
  if (existing) return existing;
  if (prior === null && anchor.type !== "unavailable") {
    return "The prior allowance could not be read; new-spender status remains unknown.";
  }
  return null;
}

export async function resolveApprovalRisk(
  chain: Pick<ChainPort, "call">,
  transaction: SafeTransaction,
  contract: Pick<ContractInsight, "decoded">,
  execution: ExecutionInsight,
): Promise<ApprovalRiskResult> {
  const extracted = extractApprovalRequests(transaction, contract.decoded);
  const anchorWithBlock = stateAnchor(transaction, execution);
  const anchor: ApprovalRiskResult["anchor"] = {
    type: anchorWithBlock.type,
    blockNumber: anchorWithBlock.blockNumber,
  };
  const executedLookups = execution.allowanceChanges.map((change) => ({
    standard: "erc20" as const,
    token: change.token as Address,
    owner: change.owner as Address,
    spender: change.spender as Address,
  }));
  const requestLookups = extracted.items.flatMap((item) => {
    const lookup = requestLookup(item);
    return lookup ? [lookup] : [];
  });
  const allLookups = [...executedLookups, ...requestLookups];
  const prior = await readPriorAllowances(
    chain,
    transaction.safe.chainId,
    allLookups,
    anchorWithBlock,
  );
  const limited =
    extracted.limited ||
    new Set(allLookups.map(lookupKey)).size > MAX_STATE_READS;

  const requests = extracted.items.map((item): ApprovalRequestView => {
    const lookup = requestLookup(item);
    const priorAmount = lookup ? (prior.get(lookupKey(lookup)) ?? null) : null;
    return {
      ...item,
      amount: item.amount?.toString() ?? null,
      expiration: item.expiration?.toString() ?? null,
      priorAmount: priorAmount?.toString() ?? null,
      newSpenderAtAnchor: priorAmount === null ? null : priorAmount === 0n,
      warning: stateWarning(priorAmount, anchor, item.warning),
    };
  });

  const executedChanges = execution.allowanceChanges.map(
    (change): ExecutedAllowanceView => {
      const lookup: AllowanceLookup = {
        standard: "erc20",
        token: change.token as Address,
        owner: change.owner as Address,
        spender: change.spender as Address,
      };
      const priorAmount = prior.get(lookupKey(lookup)) ?? null;
      return {
        token: lookup.token,
        owner: lookup.owner,
        spender: lookup.spender,
        amount: change.amount,
        infinite: change.infinite,
        logIndex: change.logIndex,
        priorAmount: priorAmount?.toString() ?? null,
        newSpenderAtAnchor: priorAmount === null ? null : priorAmount === 0n,
        warning: stateWarning(priorAmount, anchor, null),
      };
    },
  );

  const warnings: string[] = [];
  if (anchor.type === "previous-block") {
    warnings.push(
      "New-spender status compares against the previous block. Earlier transactions in the execution block are outside this comparison.",
    );
  } else if (anchor.type === "latest-state") {
    warnings.push(
      "New-spender status compares against latest state at read time and may change before execution.",
    );
  } else {
    warnings.push(
      "No trustworthy allowance-state anchor is available; new-spender status remains unknown.",
    );
  }
  if (limited) {
    warnings.push(
      "Approval inspection reached its safety bound; additional requests or state reads remain unenriched.",
    );
  }
  warnings.push(
    "Calldata describes requested authorization. Receipt events separately prove emitted allowance changes.",
  );

  return {
    requests,
    executedChanges,
    limited,
    anchor,
    warnings,
  };
}
