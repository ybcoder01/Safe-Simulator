"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import type { SafeView } from "@/lib/api/safes";

interface ChainOption {
  readonly id: number;
  readonly name: string;
}

interface ApiErrorBody {
  readonly error?: { readonly message?: string };
}

function shortenAddress(address: string) {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

export function SafesClient({ chains }: { chains: readonly ChainOption[] }) {
  const [items, setItems] = useState<readonly SafeView[]>([]);
  const [chainId, setChainId] = useState(chains[0]?.id ?? 1);
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void fetch("/api/v1/safes", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as {
          data?: readonly SafeView[];
        } & ApiErrorBody;
        if (!response.ok)
          throw new Error(body.error?.message ?? "Could not load Safes.");
        if (active) {
          setItems(body.data ?? []);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof Error ? cause.message : "Could not load Safes.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function importSafe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/v1/safes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chainId, address }),
      });
      const body = (await response.json()) as {
        data?: SafeView;
      } & ApiErrorBody;
      if (!response.ok || !body.data)
        throw new Error(
          body.error?.message ?? "The Safe could not be imported.",
        );
      const imported = body.data;
      setItems((current) => [
        imported,
        ...current.filter(
          (item) =>
            item.address.toLowerCase() !== imported.address.toLowerCase() ||
            item.chainId !== imported.chainId,
        ),
      ]);
      setAddress("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The Safe could not be imported.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="safes-content">
      <section className="safes-heading">
        <div>
          <p className="eyebrow">Your watchlist</p>
          <h1>Safe accounts</h1>
          <p>
            Verify and bookmark public Safe accounts. Importing never requests a
            wallet signature.
          </p>
        </div>
        <span className="scope-note">Ethereum · XDC</span>
      </section>

      <form className="import-panel" onSubmit={importSafe}>
        <div className="import-copy">
          <span className="step-number">01</span>
          <div>
            <h2>Import by address</h2>
            <p>
              We verify deployed bytecode, owners, threshold, nonce, modules,
              and implementation before saving.
            </p>
          </div>
        </div>
        <div className="import-controls">
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
          <button className="button" disabled={submitting} type="submit">
            {submitting ? "Verifying…" : "Verify & import"}
          </button>
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>

      <section className="safe-list" aria-busy={loading}>
        <div className="list-heading">
          <h2>Imported Safes</h2>
          <span>{items.length} total</span>
        </div>
        {loading ? <div className="list-state">Loading bookmarks…</div> : null}
        {!loading && items.length === 0 ? (
          <div className="list-state">
            <div className="empty-icon" aria-hidden="true">
              ⌁
            </div>
            <h3>No Safes imported yet</h3>
            <p>
              Enter a contract address above to create your read-only watchlist.
            </p>
          </div>
        ) : null}
        {items.map((safe) => (
          <Link
            aria-label={`Open Safe ${safe.address}`}
            className="safe-card"
            href={`/safe/${safe.chainId}/${safe.address.toLowerCase()}`}
            key={`${safe.chainId}:${safe.address.toLowerCase()}`}
          >
            <div className="safe-avatar">0×</div>
            <div className="safe-identity">
              <span>{safe.chainId === 1 ? "Ethereum" : "XDC Network"}</span>
              <strong>{shortenAddress(safe.address)}</strong>
            </div>
            <div className="safe-stat">
              <span>Policy</span>
              <strong>
                {safe.threshold} of {safe.owners.length}
              </strong>
            </div>
            <div className="safe-stat">
              <span>Nonce</span>
              <strong>{safe.nonce}</strong>
            </div>
            <div className="safe-stat">
              <span>Version</span>
              <strong>{safe.version ?? "Unknown"}</strong>
            </div>
            <span className={`verified-pill sync-${safe.syncStatus}`}>
              {safe.syncStatus === "complete"
                ? "Synced"
                : safe.syncStatus === "failed"
                  ? "Sync failed"
                  : safe.syncStatus === "syncing"
                    ? "Syncing"
                    : "Queued"}
            </span>
          </Link>
        ))}
      </section>
    </div>
  );
}
