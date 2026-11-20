import SafeApiKit from "@safe-global/api-kit";
import { getAddress, zeroAddress } from "viem";

import type {
  Address,
  ChainId,
  Confirmation,
  DecodedCall,
  Hex,
  ModuleTransaction,
  Operation,
  Page,
  SafeExecutionPayload,
  SafeMessage,
  SafeRef,
  SafeTransaction,
  TokenBalance,
  TransferRecord,
} from "@/core/domain";
import type { SafeDataPort } from "@/core/ports";

const HOSTED_TRANSACTION_SERVICE_URLS: Partial<Record<ChainId, string>> = {
  1: "https://api.safe.global/tx-service/eth",
  50: "https://api.safe.global/tx-service/xdc",
};

export interface TransactionServiceConfig {
  readonly apiKey?: string;
  readonly serviceBaseUrl: string;
  readonly txServiceUrl?: string;
}

export interface QueueServiceConfig {
  readonly apiKey?: string;
  readonly serviceBaseUrl: string;
}

const DEFAULT_QUEUE_SERVICE_URL = "https://api.safe.global/queue";

export function queueServiceConfig(
  environment: NodeJS.ProcessEnv = process.env,
): QueueServiceConfig {
  const apiKey = environment.SAFE_API_KEY;
  return {
    ...(apiKey ? { apiKey } : {}),
    serviceBaseUrl: stripApiSuffix(
      environment.SAFE_QUEUE_SERVICE_URL ?? DEFAULT_QUEUE_SERVICE_URL,
    ),
  };
}

const stripApiSuffix = (url: string) =>
  url.replace(/\/api\/?$/, "").replace(/\/$/, "");

export function transactionServiceConfig(
  chainId: ChainId,
  environment: NodeJS.ProcessEnv = process.env,
): TransactionServiceConfig {
  const configuredUrl = environment[`SAFE_TX_SERVICE_URL_${chainId}`];
  const hostedUrl = HOSTED_TRANSACTION_SERVICE_URLS[chainId];
  const apiKey = environment.SAFE_API_KEY;

  if (!configuredUrl && !hostedUrl) {
    throw new Error(
      `SAFE_TX_SERVICE_URL_${chainId} is required for this chain.`,
    );
  }
  if (!configuredUrl && !apiKey) {
    throw new Error(
      "SAFE_API_KEY is required for the hosted Safe Transaction Service.",
    );
  }

  const serviceBaseUrl = stripApiSuffix(configuredUrl ?? hostedUrl!);
  return {
    ...(apiKey ? { apiKey } : {}),
    serviceBaseUrl,
    ...(configuredUrl ? { txServiceUrl: `${serviceBaseUrl}/api` } : {}),
  };
}

const asAddress = (value: string) => value.toLowerCase() as Address;
const asHex = (value: string | null | undefined) => (value ?? "0x") as Hex;
const asUnixTime = (value: string) =>
  Math.floor(new Date(value).getTime() / 1_000);
const operation = (value: number): Operation =>
  value === 1 ? "delegatecall" : "call";
const offsetFromCursor = (cursor: string | null) =>
  cursor ? Number.parseInt(cursor, 10) : 0;

export const SAFE_API_MAX_ATTEMPTS = 3;
export const SAFE_API_RETRY_BASE_MS = 1_000;
const SAFE_API_RETRY_MAX_MS = 10_000;

type Sleep = (delayMs: number) => Promise<void>;

function errorDetails(error: unknown) {
  if (typeof error !== "object" || error === null) return null;
  return error as {
    readonly status?: unknown;
    readonly retryAfter?: unknown;
    readonly response?: {
      readonly status?: unknown;
      readonly headers?: unknown;
    };
  };
}

function headerValue(headers: unknown, name: string): unknown {
  if (typeof headers !== "object" || headers === null) return undefined;
  const values = headers as Record<string, unknown>;
  const get = values.get;
  if (typeof get === "function") {
    return get.call(headers, name);
  }
  return values[name] ?? values[name.toLowerCase()];
}

function retryDelayMs(error: unknown, attempt: number): number {
  const details = errorDetails(error);
  const retryAfter =
    details?.retryAfter ??
    headerValue(details?.response?.headers, "retry-after");
  if (typeof retryAfter === "string") {
    const seconds = Number.parseFloat(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1_000, SAFE_API_RETRY_MAX_MS);
    }
  }
  return Math.min(SAFE_API_RETRY_BASE_MS * 2 ** attempt, SAFE_API_RETRY_MAX_MS);
}

function isRateLimited(error: unknown): boolean {
  const details = errorDetails(error);
  return details?.status === 429 || details?.response?.status === 429;
}

export async function withSafeApiRetry<T>(
  operation: () => Promise<T>,
  sleep: Sleep = (delayMs) =>
    new Promise((resolve) => setTimeout(resolve, delayMs)),
): Promise<T> {
  for (let attempt = 0; attempt < SAFE_API_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isRateLimited(error) || attempt === SAFE_API_MAX_ATTEMPTS - 1) {
        throw error;
      }
      await sleep(retryDelayMs(error, attempt));
    }
  }
  throw new Error("Safe API retry attempts exhausted.");
}

interface BalanceResponse {
  readonly tokenAddress: string | null;
  readonly balance: string;
  readonly token: {
    readonly decimals?: number;
    readonly symbol?: string;
  } | null;
}

interface QueueConfirmation {
  readonly owner: string;
  readonly signature: string;
  readonly created: string;
}

interface QueueMultisigTransaction {
  readonly safeTxHash: string;
  readonly chainId: string;
  readonly safe: string;
  readonly nonce: string;
  readonly to: string | null;
  readonly value: string;
  readonly data: string | null;
  readonly operation: number;
  readonly safeTxGas: string;
  readonly baseGas: string;
  readonly gasPrice: string;
  readonly gasToken: string | null;
  readonly refundReceiver: string | null;
  readonly failed: boolean;
  readonly txHash: string | null;
  readonly created: string;
  readonly modified: string;
  readonly confirmations: readonly QueueConfirmation[];
}

interface QueueMessage {
  readonly messageHash: string;
  readonly message: unknown;
  readonly created: string;
  readonly confirmations: readonly QueueConfirmation[];
}

interface QueuePage<T> {
  readonly count: number;
  readonly next: string | null;
  readonly results: readonly T[];
}

class SafeQueueRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfter: string | null,
  ) {
    super(message);
  }
}

function queueConfirmations(
  confirmations: readonly QueueConfirmation[],
): readonly Confirmation[] {
  return confirmations.map((confirmation) => ({
    owner: asAddress(confirmation.owner),
    signature: confirmation.signature as Hex,
    signedAt: asUnixTime(confirmation.created),
  }));
}

export function normalizeQueueTransaction(
  safe: SafeRef,
  item: QueueMultisigTransaction,
): SafeTransaction {
  return {
    safe,
    safeTxHash: item.safeTxHash as Hex,
    nonce: BigInt(item.nonce),
    to: asAddress(item.to ?? zeroAddress),
    value: BigInt(item.value),
    data: asHex(item.data),
    operation: operation(item.operation),
    status: item.txHash ? (item.failed ? "failed" : "executed") : "pending",
    confirmations: queueConfirmations(item.confirmations),
    proposedAt: asUnixTime(item.created),
    executedAt: item.txHash ? asUnixTime(item.modified) : null,
    executedTxHash: item.txHash as Hex | null,
    blockNumber: null,
    blockHash: null,
  };
}

interface SafeDecodedData {
  readonly method: string;
  readonly parameters: readonly SafeDecodedParameter[];
}

interface SafeDecodedParameter {
  readonly name: string;
  readonly type: string;
  readonly value: string;
  readonly valueDecoded?: readonly SafeDecodedValue[];
}

interface SafeDecodedValue {
  readonly to: string;
  readonly value: string;
  readonly data: string;
  readonly operation?: number;
  readonly dataDecoded?: SafeDecodedData;
}

interface DecodedCallContext {
  readonly to?: Address | null;
  readonly value?: string | null;
  readonly data?: Hex | null;
  readonly operation?: Operation | null;
}

export function normalizeDecodedData(
  decoded: SafeDecodedData,
  context: DecodedCallContext = {},
): DecodedCall {
  return {
    method: decoded.method,
    parameters: decoded.parameters.map((parameter) => ({
      name: parameter.name,
      type: parameter.type,
      value: parameter.value,
      nestedCalls: (parameter.valueDecoded ?? []).map((item) =>
        normalizeDecodedData(
          item.dataDecoded ?? { method: "Unknown call", parameters: [] },
          {
            to: /^0x[0-9a-fA-F]{40}$/.test(item.to) ? asAddress(item.to) : null,
            value: item.value,
            data: asHex(item.data),
            operation: operation(item.operation ?? 0),
          },
        ),
      ),
    })),
    to: context.to ?? null,
    value: context.value ?? null,
    data: context.data ?? null,
    operation: context.operation ?? null,
  };
}

export interface BalanceRequestConfig {
  readonly headers?: Readonly<Record<string, string>>;
  readonly url: string;
}

export function balanceRequestConfig(
  safe: SafeRef,
  environment: NodeJS.ProcessEnv = process.env,
): BalanceRequestConfig {
  const { apiKey, serviceBaseUrl } = transactionServiceConfig(
    safe.chainId,
    environment,
  );

  return {
    ...(apiKey ? { headers: { Authorization: `Bearer ${apiKey}` } } : {}),
    url: `${serviceBaseUrl}/api/v1/safes/${getAddress(safe.address)}/balances/`,
  };
}

export function normalizeDiscoveredSafes(
  chainId: ChainId,
  values: readonly string[],
): readonly SafeRef[] {
  const safes = new Map<string, SafeRef>();
  for (const value of values) {
    try {
      const address = getAddress(value).toLowerCase() as Address;
      safes.set(address, { chainId, address });
    } catch {
      // Malformed upstream entries are ignored rather than exposed as addresses.
    }
  }
  return [...safes.values()];
}

export class SafeApiAdapter implements SafeDataPort {
  private readonly clients = new Map<ChainId, SafeApiKit>();

  private getClient(chainId: ChainId) {
    const existing = this.clients.get(chainId);
    if (existing) return existing;

    const { apiKey, txServiceUrl } = transactionServiceConfig(chainId);
    const client = new SafeApiKit({
      chainId: BigInt(chainId),
      ...(txServiceUrl ? { txServiceUrl } : {}),
      ...(apiKey ? { apiKey } : {}),
    });
    this.clients.set(chainId, client);
    return client;
  }

  private async queueRequest<T>(path: string): Promise<T> {
    const { apiKey, serviceBaseUrl } = queueServiceConfig();
    return withSafeApiRetry(async () => {
      const response = await fetch(`${serviceBaseUrl}${path}`, {
        headers: {
          Accept: "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) {
        throw new SafeQueueRequestError(
          `Safe Queue Service request failed with status ${response.status}.`,
          response.status,
          response.headers.get("retry-after"),
        );
      }
      return (await response.json()) as T;
    });
  }

  private async queueTransactionPage(
    safe: SafeRef,
    cursor: string | null,
    limit: number,
    executableOnly: boolean,
  ): Promise<Page<SafeTransaction>> {
    const offset = offsetFromCursor(cursor);
    const params = new URLSearchParams({
      limit: String(Math.min(limit, 100)),
      offset: String(offset),
      nonceOrder: executableOnly ? "asc" : "desc",
    });
    const path = executableOnly
      ? `/api/v1/multisig-transactions/queue?safes=${getAddress(safe.address)}:${safe.chainId}&${params}`
      : `/api/v1/safes/${getAddress(safe.address)}/multisig-transactions?chainId=${safe.chainId}&${params}`;
    const response = await this.queueRequest<
      QueuePage<QueueMultisigTransaction>
    >(path);
    return {
      items: response.results.map((item) =>
        normalizeQueueTransaction(safe, item),
      ),
      nextCursor: response.next
        ? String(offset + response.results.length)
        : null,
      total: response.count,
    };
  }

  async discoverSafesByOwner(
    chainId: ChainId,
    owner: Address,
  ): Promise<readonly SafeRef[]> {
    const response = await withSafeApiRetry(() =>
      this.getClient(chainId).getSafesByOwner(owner),
    );
    return normalizeDiscoveredSafes(chainId, response.safes);
  }

  async listMultisigTransactions(
    safe: SafeRef,
    cursor: string | null,
    limit: number,
  ): Promise<Page<SafeTransaction>> {
    const offset = offsetFromCursor(cursor);
    const response = await withSafeApiRetry(() =>
      this.getClient(safe.chainId).getMultisigTransactions(safe.address, {
        executed: true,
        limit,
        offset,
        ordering: "-created",
      }),
    );

    return {
      items: response.results.map((item) => ({
        safe,
        safeTxHash: item.safeTxHash as Hex,
        nonce: BigInt(item.nonce),
        to: asAddress(item.to),
        value: BigInt(item.value),
        data: asHex(item.data),
        operation: operation(item.operation),
        status: item.isExecuted
          ? item.isSuccessful === false
            ? "failed"
            : "executed"
          : "pending",
        confirmations: (item.confirmations ?? []).map<Confirmation>(
          (confirmation) => ({
            owner: asAddress(confirmation.owner),
            signature: confirmation.signature as Hex,
            signedAt: asUnixTime(confirmation.submissionDate),
          }),
        ),
        proposedAt: asUnixTime(item.submissionDate),
        executedAt: item.executionDate ? asUnixTime(item.executionDate) : null,
        executedTxHash: item.transactionHash as Hex | null,
        blockNumber:
          item.blockNumber === null ? null : BigInt(item.blockNumber),
        blockHash: null,
      })),
      nextCursor: response.next
        ? String(offset + response.results.length)
        : null,
      total: response.count,
    };
  }

  async listPendingMultisigTransactions(
    safe: SafeRef,
    cursor: string | null,
    limit: number,
  ): Promise<Page<SafeTransaction>> {
    return this.queueTransactionPage(safe, cursor, limit, true);
  }

  async listQueuedMultisigTransactions(
    safe: SafeRef,
    cursor: string | null,
    limit: number,
  ): Promise<Page<SafeTransaction>> {
    return this.queueTransactionPage(safe, cursor, limit, false);
  }

  async getMultisigTransaction(
    safe: SafeRef,
    safeTxHash: Hex,
  ): Promise<SafeExecutionPayload | null> {
    try {
      const item = await this.queueRequest<QueueMultisigTransaction>(
        `/api/v1/multisig-transactions/${safeTxHash}`,
      );
      if (
        asAddress(item.safe) !== asAddress(safe.address) ||
        Number(item.chainId) !== safe.chainId
      ) {
        return null;
      }
      return {
        safe,
        safeTxHash: item.safeTxHash as Hex,
        nonce: BigInt(item.nonce),
        to: asAddress(item.to ?? zeroAddress),
        value: BigInt(item.value),
        data: asHex(item.data),
        operation: operation(item.operation),
        safeTxGas: BigInt(item.safeTxGas),
        baseGas: BigInt(item.baseGas),
        gasPrice: BigInt(item.gasPrice),
        gasToken: item.gasToken ? asAddress(item.gasToken) : null,
        refundReceiver: item.refundReceiver
          ? asAddress(item.refundReceiver)
          : null,
        confirmations: queueConfirmations(item.confirmations),
      };
    } catch (error) {
      if (!(error instanceof SafeQueueRequestError) || error.status !== 404) {
        throw error;
      }
    }

    const item = await withSafeApiRetry(() =>
      this.getClient(safe.chainId).getTransaction(safeTxHash),
    );
    if (asAddress(item.safe) !== asAddress(safe.address)) return null;

    return {
      safe,
      safeTxHash: item.safeTxHash as Hex,
      nonce: BigInt(item.nonce),
      to: asAddress(item.to),
      value: BigInt(item.value),
      data: asHex(item.data),
      operation: operation(item.operation),
      safeTxGas: BigInt(item.safeTxGas),
      baseGas: BigInt(item.baseGas),
      gasPrice: BigInt(item.gasPrice),
      gasToken: item.gasToken ? asAddress(item.gasToken) : null,
      refundReceiver: item.refundReceiver
        ? asAddress(item.refundReceiver)
        : null,
      confirmations: (item.confirmations ?? []).map<Confirmation>(
        (confirmation) => ({
          owner: asAddress(confirmation.owner),
          signature: confirmation.signature as Hex,
          signedAt: asUnixTime(confirmation.submissionDate),
        }),
      ),
    };
  }

  async listModuleTransactions(
    safe: SafeRef,
    cursor: string | null,
    limit: number,
  ): Promise<Page<ModuleTransaction>> {
    const offset = offsetFromCursor(cursor);
    const response = await withSafeApiRetry(() =>
      this.getClient(safe.chainId).getModuleTransactions(safe.address, {
        limit,
        offset,
      }),
    );
    const items = response.results.flatMap<ModuleTransaction>((item) => {
      if (!item.transactionHash || item.blockNumber === undefined) return [];
      return [
        {
          safe,
          module: asAddress(item.module),
          transactionHash: item.transactionHash as Hex,
          to: asAddress(item.to),
          value: BigInt(item.value),
          data: asHex(item.data),
          operation: operation(item.operation),
          blockNumber: BigInt(item.blockNumber),
          executedAt: asUnixTime(item.executionDate),
        },
      ];
    });

    return {
      items,
      nextCursor: response.next
        ? String(offset + response.results.length)
        : null,
      total: response.count,
    };
  }

  async listTransfers(
    safe: SafeRef,
    cursor: string | null,
    limit: number,
  ): Promise<Page<TransferRecord>> {
    const offset = offsetFromCursor(cursor);
    const response = await withSafeApiRetry(() =>
      this.getClient(safe.chainId).getIncomingTransactions(safe.address, {
        limit,
        offset,
      }),
    );

    return {
      items: response.results.map((item) => ({
        safe,
        transactionHash: item.transactionHash as Hex,
        token: item.tokenAddress ? asAddress(item.tokenAddress) : null,
        from: asAddress(item.from),
        to: asAddress(item.to),
        amount: BigInt(item.value ?? "1"),
        blockNumber: BigInt(item.blockNumber),
        timestamp: asUnixTime(item.executionDate),
      })),
      nextCursor: response.next
        ? String(offset + response.results.length)
        : null,
      total: response.count,
    };
  }

  async listMessages(
    safe: SafeRef,
    cursor: string | null,
    limit: number,
  ): Promise<Page<SafeMessage>> {
    const offset = offsetFromCursor(cursor);
    const params = new URLSearchParams({
      chainId: String(safe.chainId),
      limit: String(Math.min(limit, 100)),
      offset: String(offset),
    });
    const response = await this.queueRequest<QueuePage<QueueMessage>>(
      `/api/v1/safes/${getAddress(safe.address)}/messages?${params}`,
    );

    return {
      items: response.results.map((item) => ({
        safe,
        messageHash: item.messageHash as Hex,
        payload:
          typeof item.message === "string"
            ? item.message
            : (JSON.stringify(item.message) ?? "null"),
        confirmations: item.confirmations.map((confirmation) => ({
          owner: asAddress(confirmation.owner),
          signature: confirmation.signature as Hex,
          signedAt: asUnixTime(confirmation.created),
        })),
        createdAt: asUnixTime(item.created),
      })),
      nextCursor: response.next
        ? String(offset + response.results.length)
        : null,
      total: response.count,
    };
  }

  async decodeTransactionData(
    safe: SafeRef,
    to: Address,
    data: Hex,
  ): Promise<DecodedCall | null> {
    if (data === "0x") return null;

    const decoded = await withSafeApiRetry(() =>
      this.getClient(safe.chainId).decodeData(data, getAddress(to)),
    );
    return normalizeDecodedData(decoded, { to, data });
  }

  async getBalances(safe: SafeRef): Promise<readonly TokenBalance[]> {
    const request = balanceRequestConfig(safe);

    const response = await withSafeApiRetry(async () => {
      const candidate = await fetch(request.url, {
        ...(request.headers ? { headers: request.headers } : {}),
        signal: AbortSignal.timeout(12_000),
      });
      if (candidate.status === 429) {
        const error = new Error("Safe balance request was rate limited.");
        Object.assign(error, {
          status: candidate.status,
          retryAfter: candidate.headers.get("retry-after"),
        });
        throw error;
      }
      return candidate;
    });
    if (!response.ok)
      throw new Error(
        `Safe balance request failed with status ${response.status}.`,
      );
    const balances = (await response.json()) as BalanceResponse[];
    return balances.map((item) => ({
      token: item.tokenAddress ? asAddress(item.tokenAddress) : null,
      amount: BigInt(item.balance),
      decimals: item.token?.decimals ?? 18,
      symbol: item.token?.symbol ?? "Native",
    }));
  }
}
