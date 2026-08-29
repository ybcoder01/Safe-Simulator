import type { Address, DecodedCall, Hex, SafeTransaction } from "../../domain";

export const CANONICAL_PERMIT2_ADDRESS =
  "0x000000000022d473030f116ddee9f6b43ac78ba3" as Address;

const ERC20_APPROVE_SELECTOR = "0x095ea7b3";
const PERMIT2_APPROVE_SELECTOR = "0x87517c45";
const PERMIT2_PERMIT_SINGLE_SELECTOR = "0x2b67b570";
const PERMIT2_PERMIT_BATCH_SELECTOR = "0x2a2d80d1";
const PERMIT2_TRANSFER_SINGLE_SELECTOR = "0x30f28b7a";
const PERMIT2_TRANSFER_BATCH_SELECTOR = "0xedd9444b";
const PERMIT2_WITNESS_SINGLE_SELECTOR = "0x137c29fe";
const PERMIT2_WITNESS_BATCH_SELECTOR = "0xfe8ec1a7";
const MAX_UINT160 = (1n << 160n) - 1n;
const MAX_UINT256 = (1n << 256n) - 1n;
const MAX_REQUESTS = 24;
const MAX_NESTED_DEPTH = 8;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const HEX_PATTERN = /^0x[0-9a-fA-F]*$/;

export type ApprovalStandard =
  | "erc20"
  | "permit2-allowance"
  | "permit2-signature-transfer";

export interface ApprovalRequest {
  readonly standard: ApprovalStandard;
  readonly source: "transaction-calldata" | "nested-calldata" | "decoded-call";
  readonly method: string;
  readonly depth: number;
  readonly target: Address;
  readonly token: Address | null;
  readonly owner: Address | null;
  readonly spender: Address | null;
  readonly amount: bigint | null;
  readonly infinite: boolean | null;
  readonly expiration: bigint | null;
  readonly warning: string | null;
}

function normalizedAddress(value: string | null | undefined): Address | null {
  if (!value || !ADDRESS_PATTERN.test(value)) return null;
  return value.toLowerCase() as Address;
}

function selector(data: Hex): string {
  return data.length >= 10 ? data.slice(0, 10).toLowerCase() : data.toLowerCase();
}

function word(data: Hex, index: number, baseBytes = 0): string | null {
  if (!HEX_PATTERN.test(data)) return null;
  const start = 2 + baseBytes * 2 + index * 64;
  const value = data.slice(start, start + 64);
  return value.length === 64 ? value : null;
}

function wordUint(data: Hex, index: number, baseBytes = 0): bigint | null {
  const value = word(data, index, baseBytes);
  if (!value) return null;
  try {
    return BigInt("0x" + value);
  } catch {
    return null;
  }
}

function wordAddress(data: Hex, index: number, baseBytes = 0): Address | null {
  const value = word(data, index, baseBytes);
  if (!value || !/^0{24}[0-9a-fA-F]{40}$/.test(value)) return null;
  return normalizedAddress("0x" + value.slice(-40));
}

function isPermit2(target: Address): boolean {
  return target.toLowerCase() === CANONICAL_PERMIT2_ADDRESS;
}

function request(
  values: Omit<ApprovalRequest, "warning"> & {
    readonly warning?: string | null;
  },
): ApprovalRequest {
  return { ...values, warning: values.warning ?? null };
}

function decodePermit2Batch(
  data: Hex,
  target: Address,
  source: ApprovalRequest["source"],
  depth: number,
): readonly ApprovalRequest[] {
  const owner = wordAddress(data, 0, 4);
  const tupleOffset = wordUint(data, 1, 4);
  if (
    !owner ||
    tupleOffset === null ||
    tupleOffset > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    return [];
  }

  const tupleStart = 4 + Number(tupleOffset);
  const detailsOffset = wordUint(data, 0, tupleStart);
  const spender = wordAddress(data, 1, tupleStart);
  if (
    detailsOffset === null ||
    detailsOffset > BigInt(Number.MAX_SAFE_INTEGER) ||
    !spender
  ) {
    return [];
  }

  const arrayStart = tupleStart + Number(detailsOffset);
  const length = wordUint(data, 0, arrayStart);
  if (length === null || length > BigInt(MAX_REQUESTS)) return [];

  const items: ApprovalRequest[] = [];
  for (let index = 0; index < Number(length); index += 1) {
    const itemStart = arrayStart + 32 + index * 128;
    const token = wordAddress(data, 0, itemStart);
    const amount = wordUint(data, 1, itemStart);
    const expiration = wordUint(data, 2, itemStart);
    if (!token || amount === null || expiration === null) continue;
    items.push(
      request({
        standard: "permit2-allowance",
        source,
        method: "permitBatch",
        depth,
        target,
        token,
        owner,
        spender,
        amount,
        infinite: amount === MAX_UINT160,
        expiration,
      }),
    );
  }
  return items;
}

function decodePermit2TransferBatch(
  data: Hex,
  target: Address,
  source: ApprovalRequest["source"],
  depth: number,
): readonly ApprovalRequest[] {
  const permitOffset = wordUint(data, 0, 4);
  const owner = wordAddress(data, 2, 4);
  if (
    permitOffset === null ||
    permitOffset > BigInt(Number.MAX_SAFE_INTEGER) ||
    !owner
  ) {
    return [];
  }

  const permitStart = 4 + Number(permitOffset);
  const permissionsOffset = wordUint(data, 0, permitStart);
  if (
    permissionsOffset === null ||
    permissionsOffset > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    return [];
  }

  const arrayStart = permitStart + Number(permissionsOffset);
  const length = wordUint(data, 0, arrayStart);
  if (length === null || length > BigInt(MAX_REQUESTS)) return [];

  const items: ApprovalRequest[] = [];
  for (let index = 0; index < Number(length); index += 1) {
    const itemStart = arrayStart + 32 + index * 64;
    const token = wordAddress(data, 0, itemStart);
    const amount = wordUint(data, 1, itemStart);
    if (!token || amount === null) continue;
    items.push(
      request({
        standard: "permit2-signature-transfer",
        source,
        method: "permitTransferFromBatch",
        depth,
        target,
        token,
        owner,
        spender: null,
        amount,
        infinite: amount === MAX_UINT256,
        expiration: null,
        warning:
          "The permitted spender is caller-dependent and cannot be established from this call alone.",
      }),
    );
  }
  return items;
}

function decodeRaw(
  target: Address,
  data: Hex,
  owner: Address | null,
  source: ApprovalRequest["source"],
  depth: number,
): readonly ApprovalRequest[] {
  const callSelector = selector(data);

  if (callSelector === ERC20_APPROVE_SELECTOR) {
    const spender = wordAddress(data, 0, 4);
    const amount = wordUint(data, 1, 4);
    if (!spender || amount === null) return [];
    return [
      request({
        standard: "erc20",
        source,
        method: "approve",
        depth,
        target,
        token: target,
        owner,
        spender,
        amount,
        infinite: amount === MAX_UINT256,
        expiration: null,
      }),
    ];
  }

  if (!isPermit2(target)) return [];

  if (callSelector === PERMIT2_APPROVE_SELECTOR) {
    const token = wordAddress(data, 0, 4);
    const spender = wordAddress(data, 1, 4);
    const amount = wordUint(data, 2, 4);
    const expiration = wordUint(data, 3, 4);
    if (!token || !spender || amount === null || expiration === null) return [];
    return [
      request({
        standard: "permit2-allowance",
        source,
        method: "approve",
        depth,
        target,
        token,
        owner,
        spender,
        amount,
        infinite: amount === MAX_UINT160,
        expiration,
      }),
    ];
  }

  if (callSelector === PERMIT2_PERMIT_SINGLE_SELECTOR) {
    const signedOwner = wordAddress(data, 0, 4);
    const token = wordAddress(data, 1, 4);
    const amount = wordUint(data, 2, 4);
    const expiration = wordUint(data, 3, 4);
    const spender = wordAddress(data, 5, 4);
    if (
      !signedOwner ||
      !token ||
      amount === null ||
      expiration === null ||
      !spender
    ) {
      return [];
    }
    return [
      request({
        standard: "permit2-allowance",
        source,
        method: "permit",
        depth,
        target,
        token,
        owner: signedOwner,
        spender,
        amount,
        infinite: amount === MAX_UINT160,
        expiration,
      }),
    ];
  }

  if (callSelector === PERMIT2_PERMIT_BATCH_SELECTOR) {
    return decodePermit2Batch(data, target, source, depth);
  }

  if (
    callSelector === PERMIT2_TRANSFER_SINGLE_SELECTOR ||
    callSelector === PERMIT2_WITNESS_SINGLE_SELECTOR
  ) {
    const token = wordAddress(data, 0, 4);
    const amount = wordUint(data, 1, 4);
    const signedOwner = wordAddress(data, 6, 4);
    if (!token || amount === null || !signedOwner) return [];
    return [
      request({
        standard: "permit2-signature-transfer",
        source,
        method:
          callSelector === PERMIT2_WITNESS_SINGLE_SELECTOR
            ? "permitWitnessTransferFrom"
            : "permitTransferFrom",
        depth,
        target,
        token,
        owner: signedOwner,
        spender: null,
        amount,
        infinite: amount === MAX_UINT256,
        expiration: null,
        warning:
          "The permitted spender is caller-dependent and cannot be established from this call alone.",
      }),
    ];
  }

  if (
    callSelector === PERMIT2_TRANSFER_BATCH_SELECTOR ||
    callSelector === PERMIT2_WITNESS_BATCH_SELECTOR
  ) {
    return decodePermit2TransferBatch(data, target, source, depth);
  }

  return [];
}

function parameter(
  call: DecodedCall,
  names: readonly string[],
  index: number,
): string | null {
  const named = call.parameters.find((item) =>
    names.includes(item.name.replace(/^_/, "").toLowerCase()),
  );
  return named?.value ?? call.parameters[index]?.value ?? null;
}

function decodedFallback(
  call: DecodedCall,
  source: ApprovalRequest["source"],
  depth: number,
): readonly ApprovalRequest[] {
  const target = call.to ? normalizedAddress(call.to) : null;
  if (!target) return [];

  const method = call.method.split("(")[0]?.toLowerCase();
  if (method === "approve") {
    if (isPermit2(target)) {
      const token = normalizedAddress(parameter(call, ["token"], 0));
      const spender = normalizedAddress(parameter(call, ["spender"], 1));
      const amountValue = parameter(call, ["amount"], 2);
      const expirationValue = parameter(call, ["expiration"], 3);
      try {
        if (!token || !spender || amountValue === null) return [];
        const amount = BigInt(amountValue);
        return [
          request({
            standard: "permit2-allowance",
            source,
            method: "approve",
            depth,
            target,
            token,
            owner: null,
            spender,
            amount,
            infinite: amount === MAX_UINT160,
            expiration:
              expirationValue === null ? null : BigInt(expirationValue),
            warning:
              "The approval owner cannot be established from this decoded call alone.",
          }),
        ];
      } catch {
        return [];
      }
    }

    const spender = normalizedAddress(parameter(call, ["spender"], 0));
    const amountValue = parameter(call, ["amount", "value", "wad"], 1);
    try {
      if (!spender || amountValue === null) return [];
      const amount = BigInt(amountValue);
      return [
        request({
          standard: "erc20",
          source,
          method: "approve",
          depth,
          target,
          token: target,
          owner: null,
          spender,
          amount,
          infinite: amount === MAX_UINT256,
          expiration: null,
          warning:
            "The approval owner cannot be established from this decoded call alone.",
        }),
      ];
    } catch {
      return [];
    }
  }

  if (isPermit2(target) && method === "permit") {
    return [
      request({
        standard: "permit2-allowance",
        source,
        method: "permit",
        depth,
        target,
        token: null,
        owner: null,
        spender: null,
        amount: null,
        infinite: null,
        expiration: null,
        warning:
          "Permit2 allowance parameters were decoded structurally but are unavailable as normalized scalar values.",
      }),
    ];
  }

  if (
    isPermit2(target) &&
    (method === "permittransferfrom" ||
      method === "permitwitnesstransferfrom")
  ) {
    return [
      request({
        standard: "permit2-signature-transfer",
        source,
        method: call.method,
        depth,
        target,
        token: null,
        owner: null,
        spender: null,
        amount: null,
        infinite: null,
        expiration: null,
        warning:
          "Permit2 signature-transfer parameters could not be normalized from this decoded call.",
      }),
    ];
  }

  return [];
}

function nestedCalls(call: DecodedCall): readonly DecodedCall[] {
  return call.parameters.flatMap((item) => item.nestedCalls);
}

function requestKey(item: ApprovalRequest): string {
  return [
    item.standard,
    item.method,
    item.depth,
    item.target,
    item.token ?? "",
    item.owner ?? "",
    item.spender ?? "",
    item.amount?.toString() ?? "",
  ].join(":");
}

export function extractApprovalRequests(
  transaction: Pick<SafeTransaction, "safe" | "to" | "data">,
  decoded: DecodedCall | null,
): {
  readonly items: readonly ApprovalRequest[];
  readonly limited: boolean;
} {
  const items: ApprovalRequest[] = [
    ...decodeRaw(
      transaction.to,
      transaction.data,
      transaction.safe.address,
      "transaction-calldata",
      0,
    ),
  ];
  let visited = 0;
  let limited = false;

  function visit(call: DecodedCall, depth: number) {
    if (depth > MAX_NESTED_DEPTH || visited >= MAX_REQUESTS) {
      limited = true;
      return;
    }
    visited += 1;

    const target = call.to ? normalizedAddress(call.to) : null;
    const raw =
      target && call.data
        ? decodeRaw(target, call.data, null, "nested-calldata", depth)
        : [];
    items.push(
      ...(raw.length > 0
        ? raw
        : decodedFallback(call, "decoded-call", depth)),
    );

    for (const child of nestedCalls(call)) visit(child, depth + 1);
  }

  if (decoded) {
    for (const call of nestedCalls(decoded)) visit(call, 1);
  }

  const unique = [...new Map(items.map((item) => [requestKey(item), item])).values()];
  if (unique.length > MAX_REQUESTS) limited = true;
  return { items: unique.slice(0, MAX_REQUESTS), limited };
}
