import type { DecodedCall, Hex, Operation } from "../../domain";

const SELECTOR_LENGTH = 10;
const WORD_LENGTH = 64;

function calldataWord(data: Hex, index: number) {
  const start = SELECTOR_LENGTH + index * WORD_LENGTH;
  const word = data.slice(start, start + WORD_LENGTH);
  return word.length === WORD_LENGTH ? word : null;
}

function addressFromWord(word: string | null) {
  return word ? `0x${word.slice(-40)}` : null;
}

function uintFromWord(word: string | null) {
  if (!word) return null;

  try {
    return BigInt(`0x${word}`).toString();
  } catch {
    return null;
  }
}

function shortenAddress(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function withOperation(summary: string, operation: Operation) {
  return operation === "delegatecall" ? `Delegate: ${summary}` : summary;
}

/**
 * Produces deterministic summaries for common calls without network access.
 * Unknown selectors stay explicit instead of being guessed.
 */
export function knownCallSummary(data: Hex, operation: Operation) {
  const selector = data.slice(0, SELECTOR_LENGTH).toLowerCase();
  const firstAddress = addressFromWord(calldataWord(data, 0));
  const secondAddress = addressFromWord(calldataWord(data, 1));
  const firstWordAmount = uintFromWord(calldataWord(data, 0));
  const secondWordAmount = uintFromWord(calldataWord(data, 1));
  const thirdWordAmount = uintFromWord(calldataWord(data, 2));

  if (selector === "0x095ea7b3" && firstAddress && secondWordAmount) {
    return withOperation(
      `Approve ${shortenAddress(firstAddress)} for ${secondWordAmount} base units`,
      operation,
    );
  }

  if (selector === "0xa9059cbb" && firstAddress && secondWordAmount) {
    return withOperation(
      `Transfer ${secondWordAmount} base units to ${shortenAddress(firstAddress)}`,
      operation,
    );
  }

  if (
    selector === "0x23b872dd" &&
    firstAddress &&
    secondAddress &&
    thirdWordAmount
  ) {
    return withOperation(
      `Transfer ${thirdWordAmount} base units from ${shortenAddress(firstAddress)} to ${shortenAddress(secondAddress)}`,
      operation,
    );
  }

  if (
    selector === "0x0b4c7e4d" &&
    firstWordAmount &&
    secondWordAmount &&
    thirdWordAmount
  ) {
    return withOperation(
      `Add liquidity to a two-asset pool (${firstWordAmount} and ${secondWordAmount} base units; minimum ${thirdWordAmount} LP base units)`,
      operation,
    );
  }

  if (selector === "0x3593564c") {
    return withOperation("Execute routed commands", operation);
  }

  return null;
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

function methodName(method: string) {
  return method.split("(").at(0)?.toLowerCase() ?? method.toLowerCase();
}

function encodedBatchSelectors(call: DecodedCall): readonly string[] {
  const bytesArray = call.parameters.find(
    (parameter) => parameter.type === "bytes[]",
  );
  if (!bytesArray) return [];

  try {
    const values = JSON.parse(bytesArray.value) as unknown;
    return Array.isArray(values)
      ? values.flatMap((value) =>
          typeof value === "string" && /^0x[0-9a-f]{8}/i.test(value)
            ? [value.slice(0, 10).toLowerCase()]
            : [],
        )
      : [];
  } catch {
    return [];
  }
}

function encodedBatchSummary(call: DecodedCall): string | null {
  const selectors = encodedBatchSelectors(call);
  if (selectors.length === 0) return null;
  const includes = (selector: string) => selectors.includes(selector);

  if (
    includes("0x5eac01df") &&
    includes("0x39f47693") &&
    includes("0x24a084df")
  ) {
    return "Withdraw wrapped native assets, unwrap them, and send native assets to the recipient";
  }
  if (
    includes("0x6c665a55") &&
    includes("0x39f47693") &&
    includes("0x24a084df")
  ) {
    return "Borrow wrapped native assets, unwrap them, and send native assets to the recipient";
  }
  if (
    includes("0x23b872dd") &&
    includes("0xe1f21c67") &&
    includes("0xf19ed6be")
  ) {
    return "Move tokens into a lending market and deposit them";
  }
  if (
    includes("0xbf376c7a") &&
    includes("0xe1f21c67") &&
    includes("0x22867d78")
  ) {
    return "Wrap native assets and repay a lending position";
  }

  return `Batch of ${selectors.length} encoded calls`;
}

export function decodedCallSummary(call: DecodedCall) {
  const method = methodName(call.method);
  const target = parameterValue(call, ["spender", "to", "recipient"], 0);
  const source = parameterValue(call, ["from", "sender"], 0);
  const amount = parameterValue(call, ["amount", "value", "wad"], 1);
  const nestedCount = call.parameters.reduce(
    (total, parameter) => total + parameter.nestedCalls.length,
    0,
  );

  if (method === "approve" && target && amount) {
    return `Approve ${shortenAddress(target)} for ${amount} base units`;
  }
  if (method === "transfer" && target && amount) {
    return `Transfer ${amount} base units to ${shortenAddress(target)}`;
  }
  if (method === "transferfrom" && source && target && amount) {
    return `Transfer ${amount} base units from ${shortenAddress(source)} to ${shortenAddress(target)}`;
  }
  if (method === "multisend" && nestedCount > 0) {
    return `Batch of ${nestedCount} decoded calls`;
  }
  if (method === "multicall") {
    return encodedBatchSummary(call) ?? "Call a batch of contract actions";
  }
  if (method === "add_liquidity") {
    const amounts = parameterValue(call, ["amounts"], 0);
    const minimumMint = parameterValue(
      call,
      ["min_mint_amount", "minimum_mint_amount"],
      1,
    );
    if (amounts && minimumMint) {
      const readableAmounts = amounts
        .replace(/^\[/, "")
        .replace(/\]$/, "")
        .replaceAll('"', "")
        .replaceAll(",", " and ");
      return `Add liquidity to a pool (${readableAmounts} base units; minimum ${minimumMint} LP base units)`;
    }
    return "Add liquidity to a pool";
  }
  if (method === "execute") {
    return "Execute routed commands";
  }

  return `Call ${call.method}`;
}
