import {
  concatHex,
  encodeFunctionData,
  zeroAddress,
  type Address as ViemAddress,
  type Hex as ViemHex,
} from "viem";

import type {
  Address,
  CallRequest,
  SafeExecutionPayload,
  SafeSnapshot,
  SafeTransaction,
} from "@/core/domain";

const safeExecutionAbi = [
  {
    type: "function",
    name: "execTransaction",
    stateMutability: "payable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
      { name: "operation", type: "uint8" },
      { name: "safeTxGas", type: "uint256" },
      { name: "baseGas", type: "uint256" },
      { name: "gasPrice", type: "uint256" },
      { name: "gasToken", type: "address" },
      { name: "refundReceiver", type: "address" },
      { name: "signatures", type: "bytes" },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
] as const;

export type SafeExecutionRequestResult =
  | {
      readonly ok: true;
      readonly request: CallRequest;
      readonly signerCount: number;
      readonly threshold: number;
    }
  | { readonly ok: false; readonly reason: string };

function sameAddress(left: Address, right: Address): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function isStaticSafeSignature(signature: ViemHex): boolean {
  if (signature.length !== 132) return false;
  return Number.parseInt(signature.slice(-2), 16) !== 0;
}

function payloadMatches(
  transaction: SafeTransaction,
  payload: SafeExecutionPayload,
): boolean {
  return (
    transaction.safe.chainId === payload.safe.chainId &&
    sameAddress(transaction.safe.address, payload.safe.address) &&
    transaction.safeTxHash.toLowerCase() === payload.safeTxHash.toLowerCase() &&
    transaction.nonce === payload.nonce &&
    sameAddress(transaction.to, payload.to) &&
    transaction.value === payload.value &&
    transaction.data.toLowerCase() === payload.data.toLowerCase() &&
    transaction.operation === payload.operation
  );
}

export function buildSafeExecutionRequest(
  transaction: SafeTransaction,
  payload: SafeExecutionPayload,
  snapshot: SafeSnapshot,
): SafeExecutionRequestResult {
  if (!payloadMatches(transaction, payload)) {
    return {
      ok: false,
      reason:
        "The live Safe Transaction Service payload does not match the stored transaction.",
    };
  }
  if (
    snapshot.chainId !== transaction.safe.chainId ||
    !sameAddress(snapshot.address, transaction.safe.address)
  ) {
    return {
      ok: false,
      reason: "The current Safe snapshot does not match this transaction.",
    };
  }
  if (snapshot.nonce !== transaction.nonce) {
    return {
      ok: false,
      reason:
        snapshot.nonce < transaction.nonce
          ? "This pending transaction is not the Safe's next executable nonce."
          : "This pending transaction nonce is older than the Safe's current nonce.",
    };
  }
  if (snapshot.threshold < 1) {
    return { ok: false, reason: "The current Safe threshold is invalid." };
  }

  const owners = new Set(snapshot.owners.map((owner) => owner.toLowerCase()));
  const confirmations = new Map<
    string,
    SafeExecutionPayload["confirmations"][number]
  >();
  for (const confirmation of payload.confirmations) {
    const key = confirmation.owner.toLowerCase();
    if (
      owners.has(key) &&
      isStaticSafeSignature(confirmation.signature as ViemHex)
    ) {
      confirmations.set(key, confirmation);
    }
  }

  const selected = [...confirmations.values()]
    .sort((left, right) => (BigInt(left.owner) < BigInt(right.owner) ? -1 : 1))
    .slice(0, snapshot.threshold);

  if (selected.length < snapshot.threshold) {
    return {
      ok: false,
      reason:
        "A complete Safe execution check requires the current threshold of supported owner signatures.",
    };
  }

  const prevalidated = selected.find(
    (confirmation) => confirmation.signature.slice(-2).toLowerCase() === "01",
  );
  const caller = prevalidated?.owner ?? selected[0]!.owner;
  const signatures = concatHex(
    selected.map((confirmation) => confirmation.signature as ViemHex),
  );

  return {
    ok: true,
    signerCount: selected.length,
    threshold: snapshot.threshold,
    request: {
      from: caller,
      to: transaction.safe.address,
      value: 0n,
      data: encodeFunctionData({
        abi: safeExecutionAbi,
        functionName: "execTransaction",
        args: [
          payload.to as ViemAddress,
          payload.value,
          payload.data as ViemHex,
          payload.operation === "delegatecall" ? 1 : 0,
          payload.safeTxGas,
          payload.baseGas,
          payload.gasPrice,
          (payload.gasToken ?? zeroAddress) as ViemAddress,
          (payload.refundReceiver ?? zeroAddress) as ViemAddress,
          signatures,
        ],
      }),
    },
  };
}

export { safeExecutionAbi };
