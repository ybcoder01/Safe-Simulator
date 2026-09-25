import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign,
  verify,
} from "node:crypto";

import type {
  Address,
  AnalysisResult,
  SafeTransaction,
  TelegramAlertReceipt,
  TelegramAlertReceiptPayload,
} from "@/core/domain";

const RECEIPT_VERSION = 1 as const;
const VERIFICATION_ID_PATTERN = /^[A-Za-z0-9_-]{32}$/;

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(",")}}`;
}

function digestPayload(payload: TelegramAlertReceiptPayload): string {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

function signingBytes(payloadDigest: string, signingKeyId: string): Buffer {
  return Buffer.from(
    `safe-inspector-alert-v1:${signingKeyId}:${payloadDigest}`,
  );
}

function publicKeyFor(signingKeyId: string) {
  const encodedKeys = JSON.parse(
    requiredEnvironment("ALERT_SIGNING_PUBLIC_KEYS"),
  ) as unknown;
  if (
    !encodedKeys ||
    typeof encodedKeys !== "object" ||
    Array.isArray(encodedKeys)
  ) {
    throw new Error("ALERT_SIGNING_PUBLIC_KEYS must be a JSON object.");
  }
  const encodedKey = (encodedKeys as Record<string, unknown>)[signingKeyId];
  if (typeof encodedKey !== "string" || !encodedKey) {
    throw new Error(`No public alert signing key exists for ${signingKeyId}.`);
  }
  return createPublicKey({
    key: Buffer.from(encodedKey, "base64"),
    format: "der",
    type: "spki",
  });
}

export function isTelegramVerificationId(value: string): boolean {
  return VERIFICATION_ID_PATTERN.test(value);
}

export function createTelegramAlertReceipt(input: {
  readonly transaction: SafeTransaction;
  readonly threshold: number;
  readonly analysis: AnalysisResult | null;
  readonly issuedAt: number;
}): TelegramAlertReceipt {
  const signingKeyId = requiredEnvironment("ALERT_SIGNING_KEY_ID");
  const payload: TelegramAlertReceiptPayload = {
    version: RECEIPT_VERSION,
    verificationId: randomBytes(24).toString("base64url"),
    issuedAt: input.issuedAt,
    chainId: input.transaction.safe.chainId,
    safeAddress: input.transaction.safe.address.toLowerCase() as Address,
    safeTxHash: input.transaction.safeTxHash,
    nonce: input.transaction.nonce.toString(),
    target: input.transaction.to.toLowerCase() as Address,
    value: input.transaction.value.toString(),
    calldata: input.transaction.data,
    operation: input.transaction.operation,
    status: input.transaction.status,
    signerAddresses: input.transaction.confirmations
      .map((confirmation) => confirmation.owner.toLowerCase() as Address)
      .sort(),
    threshold: input.threshold,
    verdict: input.analysis?.verdict ?? "unverified",
    findingCodes: (input.analysis?.findings ?? [])
      .filter((finding) => finding.severity !== "info")
      .map((finding) => finding.code)
      .sort(),
  };
  const payloadDigest = digestPayload(payload);
  const privateKey = createPrivateKey({
    key: Buffer.from(
      requiredEnvironment("ALERT_SIGNING_PRIVATE_KEY"),
      "base64",
    ),
    format: "der",
    type: "pkcs8",
  });
  const signature = sign(
    null,
    signingBytes(payloadDigest, signingKeyId),
    privateKey,
  ).toString("base64url");
  const receipt = { payload, payloadDigest, signature, signingKeyId };
  if (!verifyTelegramAlertReceipt(receipt)) {
    throw new Error("Alert signing keys do not match.");
  }
  return receipt;
}

export function verifyTelegramAlertReceipt(
  receipt: TelegramAlertReceipt,
): boolean {
  if (
    receipt.payload.version !== RECEIPT_VERSION ||
    !isTelegramVerificationId(receipt.payload.verificationId) ||
    digestPayload(receipt.payload) !== receipt.payloadDigest
  ) {
    return false;
  }
  try {
    return verify(
      null,
      signingBytes(receipt.payloadDigest, receipt.signingKeyId),
      publicKeyFor(receipt.signingKeyId),
      Buffer.from(receipt.signature, "base64url"),
    );
  } catch {
    return false;
  }
}
