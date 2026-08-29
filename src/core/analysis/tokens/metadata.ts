import type { Hex } from "../../domain";

export const ERC20_DECIMALS_SELECTOR = "0x313ce567" as Hex;
export const ERC20_SYMBOL_SELECTOR = "0x95d89b41" as Hex;
export const MAX_DISPLAY_DECIMALS = 36;

const WORD_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const UNSIGNED_INTEGER_PATTERN = /^[0-9]+$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

function hexBytes(value: Hex): Uint8Array | null {
  const body = value.slice(2);
  if (body.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(body)) return null;

  const bytes = new Uint8Array(body.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(body.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function wordNumber(bytes: Uint8Array, offset: number): bigint | null {
  if (offset < 0 || offset + 32 > bytes.length) return null;

  let value = 0n;
  for (const byte of bytes.slice(offset, offset + 32)) {
    value = (value << 8n) | BigInt(byte);
  }
  return value;
}

function decodedText(bytes: Uint8Array): string | null {
  try {
    const value = new TextDecoder("utf-8", { fatal: true }).decode(bytes).trim();
    if (
      value.length === 0 ||
      [...value].length > 32 ||
      CONTROL_CHARACTER_PATTERN.test(value)
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function decodeTokenDecimals(value: Hex): number | null {
  if (!WORD_PATTERN.test(value)) return null;

  try {
    const decoded = BigInt(value);
    if (decoded > 255n) return null;
    return Number(decoded);
  } catch {
    return null;
  }
}

/**
 * Decodes the standard ABI string response and the common bytes32 fallback.
 * Oversized, malformed, non-UTF-8, and control-character symbols are rejected.
 */
export function decodeTokenSymbol(value: Hex): string | null {
  const bytes = hexBytes(value);
  if (!bytes) return null;

  if (bytes.length === 32) {
    let length = bytes.length;
    while (length > 0 && bytes[length - 1] === 0) length -= 1;
    return decodedText(bytes.slice(0, length));
  }

  const offsetValue = wordNumber(bytes, 0);
  if (
    offsetValue === null ||
    offsetValue > BigInt(Number.MAX_SAFE_INTEGER) ||
    offsetValue % 32n !== 0n
  ) {
    return null;
  }

  const offset = Number(offsetValue);
  const lengthValue = wordNumber(bytes, offset);
  if (
    lengthValue === null ||
    lengthValue > 64n ||
    lengthValue > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    return null;
  }

  const length = Number(lengthValue);
  const start = offset + 32;
  if (start + length > bytes.length) return null;
  return decodedText(bytes.slice(start, start + length));
}

export function formatTokenAmount(
  amount: string,
  decimals: number | null,
): string | null {
  if (
    !UNSIGNED_INTEGER_PATTERN.test(amount) ||
    decimals === null ||
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > MAX_DISPLAY_DECIMALS
  ) {
    return null;
  }

  const normalized = amount.replace(/^0+(?=\d)/, "");
  if (decimals === 0) return normalized;

  const padded = normalized.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction.length > 0 ? `${whole}.${fraction}` : whole;
}
