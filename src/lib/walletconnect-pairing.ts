export type WalletConnectPairingErrorCode =
  | "invalid"
  | "expired"
  | "nearly-expired";

export class WalletConnectPairingError extends Error {
  readonly code: WalletConnectPairingErrorCode;

  constructor(code: WalletConnectPairingErrorCode, message: string) {
    super(message);
    this.name = "WalletConnectPairingError";
    this.code = code;
  }
}

const TOPIC_PATTERN = /^[a-fA-F0-9]{64}$/;
const SYMMETRIC_KEY_PATTERN = /^[a-fA-F0-9]{64}$/;
const MINIMUM_REMAINING_LIFETIME_SECONDS = 10;

export function normalizeWalletConnectPairingUri(
  rawValue: string,
  nowMs = Date.now(),
): string {
  let value = rawValue.trim().replace(/\s+/g, "");

  if (/^wc%3A/i.test(value)) {
    try {
      value = decodeURIComponent(value);
    } catch {
      throw new WalletConnectPairingError(
        "invalid",
        "Paste a valid WalletConnect pairing link.",
      );
    }
  }

  const match = /^wc:([^@?]+)@(\d+)\?(.+)$/i.exec(value);
  if (!match) {
    throw new WalletConnectPairingError(
      "invalid",
      "Paste a valid WalletConnect pairing link.",
    );
  }

  const topic = match[1];
  const version = match[2];
  const query = match[3];
  if (!topic || !query || version !== "2" || !TOPIC_PATTERN.test(topic)) {
    throw new WalletConnectPairingError(
      "invalid",
      "Paste a valid WalletConnect v2 pairing link.",
    );
  }

  const params = new URLSearchParams(query);
  const symmetricKey = params.get("symKey");
  const relayProtocol = params.get("relay-protocol");
  const expiryValue = params.get("expiryTimestamp");
  const expiryTimestamp = expiryValue ? Number(expiryValue) : Number.NaN;

  if (
    !symmetricKey ||
    !SYMMETRIC_KEY_PATTERN.test(symmetricKey) ||
    relayProtocol !== "irn" ||
    !Number.isSafeInteger(expiryTimestamp)
  ) {
    throw new WalletConnectPairingError(
      "invalid",
      "Paste a complete WalletConnect pairing link from the dApp.",
    );
  }

  const secondsRemaining = expiryTimestamp - Math.floor(nowMs / 1_000);
  if (secondsRemaining <= 0) {
    throw new WalletConnectPairingError(
      "expired",
      "This WalletConnect link has expired. Generate a fresh link in the dApp and paste it here.",
    );
  }
  if (secondsRemaining < MINIMUM_REMAINING_LIFETIME_SECONDS) {
    throw new WalletConnectPairingError(
      "nearly-expired",
      "This WalletConnect link is about to expire. Generate a fresh link in the dApp and try again.",
    );
  }

  return value;
}

export function walletConnectPairingFailureMessage(cause: unknown): string {
  if (
    cause instanceof WalletConnectPairingError ||
    (cause instanceof Error &&
      /expired|pairing already exists|proposal expired/i.test(cause.message))
  ) {
    return cause.message;
  }

  return "WalletConnect could not establish the connection. Generate a fresh pairing link in the dApp and try again. If a fresh link fails immediately, check that this Preview domain is allowed in the Reown project.";
}
