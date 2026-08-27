import type { Address, Hex, LogEntry } from "../../domain";

export const ERC20_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as Hex;
export const ERC20_APPROVAL_TOPIC =
  "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925" as Hex;

const MAX_UINT256 = (1n << 256n) - 1n;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const WORD_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const PADDED_ADDRESS_PATTERN = /^0x0{24}[0-9a-fA-F]{40}$/;

export interface TokenMovement {
  readonly token: Address;
  readonly from: Address;
  readonly to: Address;
  readonly amount: bigint;
  readonly direction: "inbound" | "outbound" | "self" | "external";
  readonly logIndex: number;
}

export interface AllowanceChange {
  readonly token: Address;
  readonly owner: Address;
  readonly spender: Address;
  readonly amount: bigint;
  readonly infinite: boolean;
  readonly logIndex: number;
}

export interface TokenEventFacts {
  readonly movements: readonly TokenMovement[];
  readonly allowances: readonly AllowanceChange[];
}

function topicAddress(topic: Hex | undefined): Address | null {
  if (!topic || !PADDED_ADDRESS_PATTERN.test(topic)) return null;
  return `0x${topic.slice(-40).toLowerCase()}` as Address;
}

function wordValue(data: Hex): bigint | null {
  if (!WORD_PATTERN.test(data)) return null;

  try {
    return BigInt(data);
  } catch {
    return null;
  }
}

function tokenAddress(address: Address): Address | null {
  return ADDRESS_PATTERN.test(address) ? address : null;
}

function movementDirection(
  from: Address,
  to: Address,
  safe: Address,
): TokenMovement["direction"] {
  const normalizedSafe = safe.toLowerCase();
  const fromSafe = from.toLowerCase() === normalizedSafe;
  const toSafe = to.toLowerCase() === normalizedSafe;

  if (fromSafe && toSafe) return "self";
  if (fromSafe) return "outbound";
  if (toSafe) return "inbound";
  return "external";
}

/**
 * Extracts only canonical ERC-20-shaped Transfer and Approval events.
 *
 * Four-topic ERC-721 variants and malformed logs are deliberately ignored.
 * Event presence is evidence emitted by the log address, not proof that the
 * emitting contract follows the ERC-20 standard.
 */
export function extractTokenEventFacts(
  logs: readonly LogEntry[],
  safe: Address,
): TokenEventFacts {
  const movements: TokenMovement[] = [];
  const allowances: AllowanceChange[] = [];

  for (const log of logs) {
    if (log.topics.length !== 3) continue;

    const token = tokenAddress(log.address);
    const first = topicAddress(log.topics[1]);
    const second = topicAddress(log.topics[2]);
    const amount = wordValue(log.data);
    if (!token || !first || !second || amount === null) continue;

    const signature = log.topics[0]?.toLowerCase();

    if (signature === ERC20_TRANSFER_TOPIC) {
      movements.push({
        token,
        from: first,
        to: second,
        amount,
        direction: movementDirection(first, second, safe),
        logIndex: log.logIndex,
      });
      continue;
    }

    if (signature === ERC20_APPROVAL_TOPIC) {
      allowances.push({
        token,
        owner: first,
        spender: second,
        amount,
        infinite: amount === MAX_UINT256,
        logIndex: log.logIndex,
      });
    }
  }

  return { movements, allowances };
}
