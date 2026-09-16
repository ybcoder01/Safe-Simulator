"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import {
  parseTransactionIntake,
  type TransactionIntakeResult,
} from "@/lib/transaction-intake";

interface ChainOption {
  readonly id: number;
  readonly name: string;
}

interface ApiErrorBody {
  readonly error?: { readonly message?: string };
}

interface TransactionReviewFormProps {
  readonly chains: readonly ChainOption[];
}

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const POLL_ATTEMPTS = 15;
const POLL_INTERVAL_MS = 2_000;

function pause(delayMs: number) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function responseMessage(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

export function TransactionReviewForm({ chains }: TransactionReviewFormProps) {
  const router = useRouter();
  const defaultChainId = chains[0]?.id ?? 1;
  const [chainId, setChainId] = useState(defaultChainId);
  const [address, setAddress] = useState("");
  const [safeTxHash, setSafeTxHash] = useState("");
  const [transactionReference, setTransactionReference] = useState("");
  const [intakeResult, setIntakeResult] =
    useState<TransactionIntakeResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fallbackPath, setFallbackPath] = useState<string | null>(null);

  function applyTransactionReference() {
    const result = parseTransactionIntake(transactionReference);
    setIntakeResult(result);
    if (result.chainId) setChainId(result.chainId);
    setAddress(result.safeAddress ?? "");
    setSafeTxHash(result.safeTxHash ?? "");
    setError(null);
    setFallbackPath(null);
  }

  async function reviewTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedAddress = address.trim();
    const normalizedHash = safeTxHash.trim();

    if (!ADDRESS_PATTERN.test(normalizedAddress)) {
      setError("Enter a 20-byte Safe address beginning with 0x.");
      return;
    }
    if (!HASH_PATTERN.test(normalizedHash)) {
      setError("Enter a 32-byte Safe transaction hash beginning with 0x.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setFallbackPath(null);
    setStatus("Verifying the Safe on-chain…");

    try {
      const importResponse = await fetch("/api/v1/safes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chainId, address: normalizedAddress }),
      });
      if (!importResponse.ok) {
        throw new Error(
          await responseMessage(
            importResponse,
            "The Safe could not be verified.",
          ),
        );
      }

      const safePath = `/safe/${chainId}/${normalizedAddress.toLowerCase()}`;
      const transactionPath = `${safePath}/tx/${normalizedHash.toLowerCase()}`;

      setStatus("Safe verified. Looking for the public transaction record…");

      for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
        const transactionResponse = await fetch(
          `/api/v1/safes/${chainId}/${normalizedAddress}/tx/${normalizedHash}`,
          { cache: "no-store" },
        );
        if (transactionResponse.ok) {
          setStatus("Transaction found. Opening the review…");
          router.push(transactionPath);
          return;
        }
        if (transactionResponse.status !== 404) {
          throw new Error(
            await responseMessage(
              transactionResponse,
              "Transaction analysis is temporarily unavailable.",
            ),
          );
        }
        if (attempt < POLL_ATTEMPTS - 1) {
          if (attempt === 4) {
            setStatus(
              "The Safe is syncing. Still waiting for this transaction…",
            );
          }
          await pause(POLL_INTERVAL_MS);
        }
      }

      setFallbackPath(safePath);
      throw new Error(
        "The Safe was verified and synchronization started, but this transaction is not indexed yet. You can open the dashboard while it finishes.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The transaction could not be opened.",
      );
    } finally {
      setSubmitting(false);
      setStatus(null);
    }
  }

  return (
    <form className="import-panel review-panel" onSubmit={reviewTransaction}>
      <div className="import-copy">
        <span className="step-number">01</span>
        <div>
          <h2>Review a transaction</h2>
          <p>
            Verify the Safe, locate its public transaction record, and open the
            existing read-only analysis. No wallet connection is requested.
          </p>
        </div>
      </div>
      <div className="transaction-link-intake">
        <label htmlFor="transaction-reference">Paste a transaction link</label>
        <div className="transaction-link-control">
          <input
            autoComplete="off"
            id="transaction-reference"
            inputMode="url"
            onChange={(event) => {
              setTransactionReference(event.target.value);
              setIntakeResult(null);
            }}
            placeholder="Safe Wallet, Safe Inspector, XDCScan, or Etherscan URL"
            spellCheck={false}
            value={transactionReference}
          />
          <button
            className="button button-small"
            disabled={!transactionReference.trim() || submitting}
            onClick={applyTransactionReference}
            type="button"
          >
            Use link
          </button>
        </div>
        <p className="field-hint">
          Parsed locally. The pasted site is never opened or contacted.
        </p>
        {intakeResult ? (
          <p
            className={`intake-result intake-result-${intakeResult.status}`}
            role={intakeResult.status === "invalid" ? "alert" : "status"}
          >
            {intakeResult.message}
          </p>
        ) : null}
      </div>
      <div className="import-controls review-controls">
        <label>
          Network
          <select
            value={chainId}
            onChange={(event) => setChainId(Number(event.target.value))}
          >
            {chains.map((chain) => (
              <option value={chain.id} key={chain.id}>
                {chain.name}
              </option>
            ))}
          </select>
        </label>
        <label className="address-field">
          Safe address
          <input
            autoComplete="off"
            inputMode="text"
            onChange={(event) => setAddress(event.target.value)}
            placeholder="0x…"
            required
            spellCheck={false}
            value={address}
          />
        </label>
        <label className="transaction-hash-field">
          Safe transaction hash
          <input
            autoComplete="off"
            inputMode="text"
            onChange={(event) => setSafeTxHash(event.target.value)}
            placeholder="0x…"
            required
            spellCheck={false}
            value={safeTxHash}
          />
        </label>
        <button className="button" disabled={submitting} type="submit">
          {submitting ? "Preparing review…" : "Review transaction"}
        </button>
      </div>
      {status ? (
        <p className="form-status" role="status">
          {status}
        </p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {fallbackPath ? (
        <Link className="text-link transaction-fallback" href={fallbackPath}>
          Open Safe dashboard <span aria-hidden="true">→</span>
        </Link>
      ) : null}
    </form>
  );
}
