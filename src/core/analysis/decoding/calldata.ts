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
  const firstAmount = uintFromWord(calldataWord(data, 1));
  const secondAmount = uintFromWord(calldataWord(data, 2));

  if (selector === "0x095ea7b3" && firstAddress && firstAmount) {
    return withOperation(
      `Approve ${shortenAddress(firstAddress)} for ${firstAmount} base units`,
      operation,
    );
  }

  if (selector === "0xa9059cbb" && firstAddress && firstAmount) {
    return withOperation(
      `Transfer ${firstAmount} base units to ${shortenAddress(firstAddress)}`,
      operation,
    );
  }

  if (
    selector === "0x23b872dd" &&
    firstAddress &&
    secondAddress &&
    secondAmount
  ) {
    return withOperation(
      `Transfer ${secondAmount} base units from ${shortenAddress(firstAddress)} to ${shortenAddress(secondAddress)}`,
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
    names.includes(parameter.name.replace(/^_/, "").toLowerCase()),
  );
  return named?.value ?? call.parameters[index]?.value ?? null;
}

function methodName(method: string) {
  return method.split("(").at(0)?.toLowerCase() ?? method.toLowerCase();
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
  if (method === "execute") {
    return "Execute routed commands";
  }

  return `Call ${call.method}`;
}
