import type { Address } from "@/core/domain";
import type { CachePort } from "@/core/ports";

const XDC_CHAIN_ID = 50;
const XDC_SCAN_API_URL = "https://api.xdcscan.io/api";
const MAX_REFERENCES = 16;
const LOOKUP_CONCURRENCY = 4;
const CACHE_TTL_SECONDS = 21_600;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

type VerificationStatus =
  | "verified"
  | "unverified"
  | "unavailable"
  | "not-applicable";

export interface XdcContractVerificationView {
  readonly address: Address;
  readonly status: VerificationStatus;
  readonly contractName: string | null;
  readonly compilerVersion: string | null;
  readonly isProxy: boolean | null;
  readonly implementation: Address | null;
  readonly warning: string | null;
}

export interface XdcContractVerificationResult {
  readonly source: "xdcscan";
  readonly items: readonly XdcContractVerificationView[];
  readonly requestedCount: number;
  readonly limited: boolean;
  readonly warnings: readonly string[];
}

export interface XdcContractReferences {
  readonly transactionTarget: string;
  readonly decodedAddresses: readonly string[];
  readonly nestedTargets: readonly (string | null)[];
  readonly traceTargets: readonly (string | null | undefined)[];
  readonly logEmitters: readonly string[];
  readonly storageContracts: readonly string[];
  readonly tokenContracts: readonly string[];
  readonly approvalContracts: readonly (string | null)[];
}

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

function normalizedAddress(value: string | null | undefined): Address | null {
  return value && ADDRESS_PATTERN.test(value)
    ? (value.toLowerCase() as Address)
    : null;
}

function uniqueAddresses(values: readonly (string | null | undefined)[]) {
  const unique = new Map<string, Address>();
  for (const value of values) {
    const address = normalizedAddress(value);
    if (address) unique.set(address, address);
  }
  return [...unique.values()];
}

export function collectXdcContractReferences(
  input: XdcContractReferences,
): readonly Address[] {
  return uniqueAddresses([
    input.transactionTarget,
    ...input.decodedAddresses,
    ...input.nestedTargets,
    ...input.traceTargets,
    ...input.logEmitters,
    ...input.storageContracts,
    ...input.tokenContracts,
    ...input.approvalContracts,
  ]);
}

function safeText(value: unknown, maximumLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maximumLength) : null;
}

function firstImplementation(record: Record<string, unknown>): Address | null {
  const direct =
    safeText(record.ImplementationAddress, 42) ??
    safeText(record.Implementation, 42);
  const normalized = normalizedAddress(direct);
  if (normalized) return normalized;

  if (!Array.isArray(record.ImplementationAddresses)) return null;
  for (const candidate of record.ImplementationAddresses) {
    const address = normalizedAddress(safeText(candidate, 42));
    if (address) return address;
  }
  return null;
}

function unavailable(
  address: Address,
  warning: string,
): XdcContractVerificationView {
  return {
    address,
    status: "unavailable",
    contractName: null,
    compilerVersion: null,
    isProxy: null,
    implementation: null,
    warning,
  };
}

function parseResponse(
  address: Address,
  payload: unknown,
): XdcContractVerificationView {
  if (!payload || typeof payload !== "object") {
    return unavailable(address, "XDCScan returned a malformed response.");
  }

  const response = payload as Record<string, unknown>;
  const result = response.result;
  if (
    typeof result === "string" &&
    result.toLowerCase().includes("not verified")
  ) {
    return {
      ...unavailable(address, "No verified source is published on XDCScan."),
      status: "unverified",
    };
  }
  if (!Array.isArray(result) || !result[0] || typeof result[0] !== "object") {
    return unavailable(address, "XDCScan did not return source-code evidence.");
  }

  const record = result[0] as Record<string, unknown>;
  const sourceCode = safeText(record.SourceCode, 2);
  const verified = sourceCode !== null;
  const proxyValue = safeText(record.IsProxy, 12)?.toLowerCase() ?? null;
  const isProxy =
    proxyValue === "true" || proxyValue === "1"
      ? true
      : proxyValue === "false" || proxyValue === "0"
        ? false
        : null;

  return {
    address,
    status: verified ? "verified" : "unverified",
    contractName: verified ? safeText(record.ContractName, 160) : null,
    compilerVersion: verified ? safeText(record.CompilerVersion, 160) : null,
    isProxy: verified ? isProxy : null,
    implementation: verified ? firstImplementation(record) : null,
    warning: verified ? null : "No verified source is published on XDCScan.",
  };
}

function cacheKey(address: Address) {
  return `xdcscan-source-verification:v1:${address}`;
}

async function fetchVerification(
  cache: Pick<CachePort, "get" | "set">,
  address: Address,
  fetcher: FetchLike,
): Promise<XdcContractVerificationView> {
  try {
    const cached = await cache.get<XdcContractVerificationView>(
      cacheKey(address),
    );
    if (
      cached?.address === address &&
      (cached.status === "verified" || cached.status === "unverified")
    ) {
      return cached;
    }
  } catch {
    // Explorer evidence remains available when cache reads fail.
  }

  const url = new URL(XDC_SCAN_API_URL);
  url.searchParams.set("module", "contract");
  url.searchParams.set("action", "getsourcecode");
  url.searchParams.set("address", address);
  const apiKey = process.env.XDCSCAN_API_KEY?.trim();
  if (apiKey) url.searchParams.set("apikey", apiKey);

  let view: XdcContractVerificationView;
  try {
    const response = await fetcher(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(6_000),
    });
    if (!response.ok) {
      return unavailable(
        address,
        `XDCScan source lookup returned HTTP ${response.status}.`,
      );
    }
    view = parseResponse(address, await response.json());
  } catch {
    return unavailable(address, "XDCScan source lookup was unavailable.");
  }

  if (view.status === "verified" || view.status === "unverified") {
    try {
      await cache.set(cacheKey(address), view, CACHE_TTL_SECONDS);
    } catch {
      // A cache write failure cannot change the explorer result.
    }
  }
  return view;
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  task: (value: T) => Promise<R>,
): Promise<readonly R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;

  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      const value = values[index];
      if (value !== undefined) results[index] = await task(value);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () =>
      worker(),
    ),
  );
  return results;
}

export async function resolveXdcContractVerification(
  cache: Pick<CachePort, "get" | "set">,
  chainId: number,
  references: readonly string[],
  fetcher: FetchLike = fetch,
): Promise<XdcContractVerificationResult> {
  const candidates = uniqueAddresses(references);
  if (chainId !== XDC_CHAIN_ID) {
    return {
      source: "xdcscan",
      items: [],
      requestedCount: candidates.length,
      limited: false,
      warnings: [
        "XDCScan source verification applies only to XDC Network mainnet.",
      ],
    };
  }

  const selected = candidates.slice(0, MAX_REFERENCES);
  let limited = candidates.length > selected.length;
  const items = [
    ...(await mapWithConcurrency(selected, LOOKUP_CONCURRENCY, (address) =>
      fetchVerification(cache, address, fetcher),
    )),
  ];

  const seen = new Set(items.map((item) => item.address));
  const implementations = uniqueAddresses(
    items.map((item) => item.implementation),
  ).filter((address) => !seen.has(address));
  const availableSlots = Math.max(0, MAX_REFERENCES - items.length);
  const selectedImplementations = implementations.slice(0, availableSlots);
  if (implementations.length > selectedImplementations.length) limited = true;

  items.push(
    ...(await mapWithConcurrency(
      selectedImplementations,
      LOOKUP_CONCURRENCY,
      (address) => fetchVerification(cache, address, fetcher),
    )),
  );

  const warnings = [
    "XDCScan verification reports published source-code matching, not protocol trust, correctness, or safety.",
  ];
  if (items.some((item) => item.status === "unavailable")) {
    warnings.push(
      "One or more explorer lookups were unavailable; no verification status was inferred.",
    );
  }
  if (limited) {
    warnings.push(
      `Source verification is limited to ${MAX_REFERENCES} referenced addresses per request.`,
    );
  }

  return {
    source: "xdcscan",
    items,
    requestedCount: candidates.length,
    limited,
    warnings,
  };
}
