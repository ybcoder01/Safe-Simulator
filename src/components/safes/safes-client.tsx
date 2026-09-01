"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import {
  parseBrowserWalletChainId,
  parseBrowserWalletOwner,
  type DiscoveredSafeView,
} from "@/lib/api/safe-discovery";
import { withoutSafe, type SafeView } from "@/lib/api/safes";

interface ChainOption {
  readonly id: number;
  readonly name: string;
}

interface ApiErrorBody {
  readonly error?: { readonly message?: string };
}

interface InjectedProvider {
  request(input: {
    readonly method: "eth_requestAccounts" | "eth_chainId";
  }): Promise<unknown>;
}

function getInjectedProvider(): InjectedProvider | null {
  if (typeof window === "undefined") return null;
  return (
    (window as Window & { readonly ethereum?: InjectedProvider }).ethereum ??
    null
  );
}

interface SafesClientProps {
  readonly chains: readonly ChainOption[];
  readonly removeSafe: (input: {
    readonly chainId: number;
    readonly address: string;
  }) => Promise<{ readonly ok: boolean; readonly error?: string }>;
}

function shortenAddress(address: string) {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

export function SafesClient({ chains, removeSafe }: SafesClientProps) {
  const defaultChainId = chains[0]?.id ?? 1;
  const [items, setItems] = useState<readonly SafeView[]>([]);
  const [chainId, setChainId] = useState(defaultChainId);
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [discoveryChainId, setDiscoveryChainId] = useState(defaultChainId);
  const [owner, setOwner] = useState("");
  const [discovered, setDiscovered] = useState<
    readonly DiscoveredSafeView[] | null
  >(null);
  const [discoveryTotal, setDiscoveryTotal] = useState(0);
  const [discoveryLimited, setDiscoveryLimited] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const [discoveryImporting, setDiscoveryImporting] = useState<string | null>(
    null,
  );
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

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

  async function requestImport(
    targetChainId: number,
    targetAddress: string,
  ): Promise<SafeView> {
    const response = await fetch("/api/v1/safes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chainId: targetChainId,
        address: targetAddress,
      }),
    });
    const body = (await response.json()) as {
      data?: SafeView;
    } & ApiErrorBody;
    if (!response.ok || !body.data) {
      throw new Error(body.error?.message ?? "The Safe could not be imported.");
    }

    const imported = body.data;
    setItems((current) => [
      imported,
      ...current.filter(
        (item) =>
          item.address.toLowerCase() !== imported.address.toLowerCase() ||
          item.chainId !== imported.chainId,
      ),
    ]);
    setDiscovered(
      (current) =>
        current?.map((safe) =>
          safe.chainId === imported.chainId &&
          safe.address.toLowerCase() === imported.address.toLowerCase()
            ? { ...safe, imported: true }
            : safe,
        ) ?? null,
    );
    return imported;
  }

  async function importSafe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await requestImport(chainId, address);
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

  async function useBrowserWallet() {
    setWalletLoading(true);
    setDiscoveryError(null);

    try {
      const provider = getInjectedProvider();
      if (!provider) {
        throw new Error("No injected browser wallet was found.");
      }

      let accounts: unknown;
      try {
        accounts = await provider.request({ method: "eth_requestAccounts" });
      } catch {
        throw new Error("Browser wallet access was not granted.");
      }

      const selectedOwner = parseBrowserWalletOwner(accounts);
      if (!selectedOwner) {
        throw new Error(
          "The browser wallet did not return a valid EVM account.",
        );
      }
      setOwner(selectedOwner);

      const unsupportedNetworkMessage =
        "Account loaded. Select Ethereum or XDC before discovery; the wallet network is unsupported.";
      try {
        const walletChainId = parseBrowserWalletChainId(
          await provider.request({ method: "eth_chainId" }),
        );
        if (!walletChainId) {
          setDiscoveryError(unsupportedNetworkMessage);
          return;
        }
        setDiscoveryChainId(walletChainId);
      } catch {
        setDiscoveryError(unsupportedNetworkMessage);
      }
    } catch (cause) {
      setDiscoveryError(
        cause instanceof Error
          ? cause.message
          : "The browser wallet could not provide an account.",
      );
    } finally {
      setWalletLoading(false);
    }
  }

  async function discoverSafes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDiscovering(true);
    setDiscoveryError(null);
    setDiscovered(null);

    try {
      const query = new URLSearchParams({
        chainId: discoveryChainId.toString(),
        owner,
      });
      const response = await fetch(`/api/v1/safes/discover?${query}`, {
        cache: "no-store",
      });
      const body = (await response.json()) as {
        readonly data?: readonly DiscoveredSafeView[];
        readonly total?: number;
        readonly limited?: boolean;
      } & ApiErrorBody;
      if (!response.ok || !body.data) {
        throw new Error(
          body.error?.message ?? "Safe discovery is temporarily unavailable.",
        );
      }

      setDiscovered(body.data);
      setDiscoveryTotal(body.total ?? body.data.length);
      setDiscoveryLimited(body.limited ?? false);
    } catch (cause) {
      setDiscoveryError(
        cause instanceof Error
          ? cause.message
          : "Safe discovery is temporarily unavailable.",
      );
    } finally {
      setDiscovering(false);
    }
  }

  async function importDiscovered(safe: DiscoveredSafeView) {
    const key = `${safe.chainId}:${safe.address.toLowerCase()}`;
    setDiscoveryImporting(key);
    setDiscoveryError(null);
    try {
      await requestImport(safe.chainId, safe.address);
    } catch (cause) {
      setDiscoveryError(
        cause instanceof Error
          ? cause.message
          : "The Safe could not be imported.",
      );
    } finally {
      setDiscoveryImporting(null);
    }
  }

  async function removeBookmarkedSafe(safe: SafeView) {
    const confirmed = window.confirm(
      "Remove this Safe from your watchlist? Its shared public history will not be deleted.",
    );
    if (!confirmed) return;

    const key = `${safe.chainId}:${safe.address.toLowerCase()}`;
    setRemoving(key);
    setError(null);
    try {
      const result = await removeSafe({
        chainId: safe.chainId,
        address: safe.address,
      });
      if (!result.ok) {
        throw new Error(result.error ?? "The Safe could not be removed.");
      }

      setItems((current) => withoutSafe(current, safe));
      setDiscovered(
        (current) =>
          current?.map((candidate) =>
            candidate.chainId === safe.chainId &&
            candidate.address.toLowerCase() === safe.address.toLowerCase()
              ? { ...candidate, imported: false }
              : candidate,
          ) ?? null,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The Safe could not be removed.",
      );
    } finally {
      setRemoving(null);
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

      <form className="import-panel discovery-panel" onSubmit={discoverSafes}>
        <div className="import-copy">
          <span className="step-number">02</span>
          <div>
            <h2>Discover by owner address</h2>
            <p>
              Look up public Safe Transaction Service records for an owner.
              Candidates are fully verified on-chain only when you import them.
            </p>
          </div>
        </div>
        <div className="import-controls">
          <label>
            Network
            <select
              value={discoveryChainId}
              onChange={(event) =>
                setDiscoveryChainId(Number(event.target.value))
              }
            >
              {chains.map((chain) => (
                <option value={chain.id} key={chain.id}>
                  {chain.name}
                </option>
              ))}
            </select>
          </label>
          <label className="address-field">
            Owner address
            <input
              autoComplete="off"
              inputMode="text"
              onChange={(event) => setOwner(event.target.value)}
              placeholder="0x…"
              required
              spellCheck={false}
              value={owner}
            />
          </label>
          <button
            className="button"
            disabled={discovering || walletLoading}
            type="submit"
          >
            {discovering ? "Discovering…" : "Discover Safes"}
          </button>
          <button
            aria-describedby="browser-wallet-discovery-note"
            className="wallet-discovery-button"
            disabled={discovering || walletLoading}
            onClick={() => void useBrowserWallet()}
            type="button"
          >
            {walletLoading ? "Reading wallet…" : "Use browser wallet"}
          </button>
        </div>
        <p
          className="wallet-discovery-note"
          id="browser-wallet-discovery-note"
        >
          Public account and network only · no signature or transaction request.
        </p>
        {discoveryError ? (
          <p className="form-error" role="alert">
            {discoveryError}
          </p>
        ) : null}
        {discovered !== null ? (
          <div className="discovery-results" aria-live="polite">
            <div className="discovery-summary">
              <strong>
                {discoveryTotal} Safe{discoveryTotal === 1 ? "" : "s"} reported
              </strong>
              {discoveryLimited ? (
                <span>Showing the first {discovered.length} results.</span>
              ) : (
                <span>Public service records only.</span>
              )}
            </div>
            {discovered.length === 0 ? (
              <div className="panel-empty">
                No Safes were reported for this owner on the selected network.
              </div>
            ) : (
              <div className="discovery-list">
                {discovered.map((safe) => {
                  const key = `${safe.chainId}:${safe.address.toLowerCase()}`;
                  return (
                    <div className="discovery-row" key={key}>
                      <div className="discovery-identity">
                        <span>
                          {safe.chainId === 1 ? "Ethereum" : "XDC Network"}
                        </span>
                        <code>{safe.address}</code>
                      </div>
                      {safe.imported ? (
                        <span className="verified-pill">Imported</span>
                      ) : (
                        <button
                          className="button button-small"
                          disabled={discoveryImporting !== null}
                          onClick={() => void importDiscovered(safe)}
                          type="button"
                        >
                          {discoveryImporting === key
                            ? "Verifying…"
                            : "Verify & import"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
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
        {items.map((safe) => {
          const key = `${safe.chainId}:${safe.address.toLowerCase()}`;
          return (
            <div className="safe-card-row" key={key}>
              <Link
                aria-label={`Open Safe ${safe.address}`}
                className="safe-card"
                href={`/safe/${safe.chainId}/${safe.address.toLowerCase()}`}
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
              <button
                aria-label={`Remove Safe ${safe.address} from watchlist`}
                className="safe-card-remove"
                disabled={removing !== null}
                onClick={() => void removeBookmarkedSafe(safe)}
                type="button"
              >
                {removing === key ? "Removing…" : "Remove"}
              </button>
            </div>
          );
        })}
      </section>
    </div>
  );
}
