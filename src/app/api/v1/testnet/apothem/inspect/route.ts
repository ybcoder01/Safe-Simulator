import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient,
  defineChain,
  fallback,
  getAddress,
  http,
  type Hex,
} from "viem";
import { z } from "zod";

import { getRateLimitPort } from "@/container";
import {
  APOTHEM_CHAIN_ID,
  APOTHEM_EXPLORER_URL,
  APOTHEM_PUBLIC_RPC_URLS,
  apothemSelector,
  classifyApothemCall,
  unwrapSafeExecution,
  type ApothemInspection,
} from "@/lib/testnet/apothem";
import {
  checkRequestRateLimit,
  MANUAL_SIMULATION_RATE_LIMIT,
  rateLimitHeaders,
} from "@/lib/api/rate-limit";

const requestSchema = z.object({
  transactionHash: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/)
    .transform((value) => value as Hex),
});

const apothem = defineChain({
  id: APOTHEM_CHAIN_ID,
  name: "XDC Apothem",
  nativeCurrency: { name: "Test XDC", symbol: "TXDC", decimals: 18 },
  rpcUrls: {
    default: { http: [...APOTHEM_PUBLIC_RPC_URLS] },
  },
  blockExplorers: {
    default: { name: "XDCScan Testnet", url: APOTHEM_EXPLORER_URL },
  },
  testnet: true,
});

function configuredRpcUrls() {
  return [
    ...new Set([
      ...(process.env.RPC_URL_51 ?? "")
        .split(",")
        .map((url) => url.trim())
        .filter(Boolean),
      ...APOTHEM_PUBLIC_RPC_URLS,
    ]),
  ];
}

function sameOrigin(request: NextRequest): boolean {
  return request.headers.get("origin") === request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json(
      { error: { message: "Cross-origin Apothem inspection is not allowed." } },
      { status: 403 },
    );
  }

  const rateLimit = await checkRequestRateLimit(
    getRateLimitPort(),
    request,
    MANUAL_SIMULATION_RATE_LIMIT,
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: { message: "Too many testnet inspections. Try again later." } },
      {
        status: 429,
        headers: rateLimitHeaders(MANUAL_SIMULATION_RATE_LIMIT, rateLimit),
      },
    );
  }

  const input = requestSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json(
      { error: { message: "Enter a valid 32-byte Apothem transaction hash." } },
      { status: 400 },
    );
  }

  const client = createPublicClient({
    chain: apothem,
    transport: fallback(
      configuredRpcUrls().map((url) =>
        http(url, { retryCount: 0, timeout: 5_000 }),
      ),
    ),
  });

  try {
    const transaction = await client.getTransaction({
      hash: input.data.transactionHash,
    });
    const outerTarget = transaction.to ? getAddress(transaction.to) : null;
    if (!outerTarget) {
      return NextResponse.json(
        {
          error: {
            message:
              "Contract-creation transactions are not supported by this inspector.",
          },
        },
        { status: 422 },
      );
    }

    const effectiveCall = unwrapSafeExecution(
      outerTarget,
      transaction.value,
      transaction.input,
    );
    const findings = classifyApothemCall(effectiveCall);
    const receipt = await client
      .getTransactionReceipt({ hash: transaction.hash })
      .catch(() => null);
    const status =
      receipt === null
        ? "pending"
        : receipt.status === "success"
          ? "success"
          : "reverted";

    const inspection: ApothemInspection = {
      network: "XDC Apothem",
      chainId: 51,
      transactionHash: transaction.hash,
      explorerUrl: `${APOTHEM_EXPLORER_URL}/tx/${transaction.hash}`,
      status,
      blockNumber: receipt?.blockNumber.toString() ?? null,
      sender: getAddress(transaction.from),
      outerTarget,
      effectiveCall: {
        target: effectiveCall.target,
        value: effectiveCall.value.toString(),
        valueTxdc:
          Number(effectiveCall.value) === 0
            ? "0"
            : (Number(effectiveCall.value) / 1e18).toLocaleString("en", {
                maximumFractionDigits: 8,
              }),
        operation: effectiveCall.operation,
        selector: apothemSelector(effectiveCall.data),
        wrappedBySafe: effectiveCall.wrappedBySafe,
      },
      verdict: findings.some((finding) => finding.severity === "critical")
        ? "stop"
        : "review",
      findings,
    };

    return NextResponse.json({ data: inspection });
  } catch (error) {
    console.error("Apothem transaction inspection failed.", {
      transactionHash: input.data.transactionHash,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        error: {
          message:
            "The transaction could not be read from XDC Apothem. Confirm the hash and try again after it is broadcast.",
        },
      },
      { status: 503 },
    );
  }
}
