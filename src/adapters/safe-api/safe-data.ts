import SafeApiKit from "@safe-global/api-kit";
import { getAddress } from "viem";

import type {
  Address,
  ChainId,
  Confirmation,
  DecodedCall,
  Hex,
  ModuleTransaction,
  Operation,
  Page,
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

interface BalanceResponse {
  readonly tokenAddress: string | null;
  readonly balance: string;
  readonly token: {
    readonly decimals?: number;
    readonly symbol?: string;
  } | null;
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
            to: /^0x[0-9a-fA-F]{40}$/.test(item.to)
              ? asAddress(item.to)
              : null,
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

  async discoverSafesByOwner(
    chainId: ChainId,
    owner: Address,
  ): Promise<readonly SafeRef[]> {
    const response = await this.getClient(chainId).getSafesByOwner(owner);
    return response.safes.map((address) => ({
      chainId,
      address: asAddress(address),
    }));
  }

  async listMultisigTransactions(
    safe: SafeRef,
    cursor: string | null,
    limit: number,
  ): Promise<Page<SafeTransaction>> {
    const offset = offsetFromCursor(cursor);
    const response = await this.getClient(safe.chainId).getMultisigTransactions(
      safe.address,
      {
        limit,
        offset,
        ordering: "-created",
      },
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

  async listModuleTransactions(
    safe: SafeRef,
    cursor: string | null,
    limit: number,
  ): Promise<Page<ModuleTransaction>> {
    const offset = offsetFromCursor(cursor);
    const response = await this.getClient(safe.chainId).getModuleTransactions(
      safe.address,
      { limit, offset },
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
    const response = await this.getClient(safe.chainId).getIncomingTransactions(
      safe.address,
      { limit, offset },
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
    const response = await this.getClient(safe.chainId).getMessages(
      safe.address,
      { limit, offset, ordering: "-created" },
    );

    return {
      items: response.results.map((item) => ({
        safe,
        messageHash: item.messageHash as Hex,
        payload:
          typeof item.message === "string"
            ? item.message
            : JSON.stringify(item.message),
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

    const decoded = await this.getClient(safe.chainId).decodeData(
      data,
      getAddress(to),
    );
    return normalizeDecodedData(decoded, { to, data });
  }

  async getBalances(safe: SafeRef): Promise<readonly TokenBalance[]> {
    const request = balanceRequestConfig(safe);

    const response = await fetch(request.url, {
      ...(request.headers ? { headers: request.headers } : {}),
      signal: AbortSignal.timeout(12_000),
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
