"use client";

import SafeAppsSDK from "@safe-global/safe-apps-sdk";
import { Core } from "@walletconnect/core";
import { buildApprovedNamespaces, getSdkError } from "@walletconnect/utils";
import { WalletKit } from "@reown/walletkit";
import { parseUnits } from "viem";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { EvidenceFindings } from "@/components/shared/evidence-findings";
import styles from "./safe-app-review.module.css";
import type { ManualSimulationView } from "@/lib/api/manual-simulation";

interface SafeContext {
  readonly address: string;
  readonly chainId: number;
  readonly owners: readonly string[];
  readonly threshold: number;
}

interface ApiResponse {
  readonly data?: ManualSimulationView;
  readonly error?: { readonly message?: string };
}

interface CapturedTransaction {
  readonly to: string;
  readonly value: string;
  readonly data: string;
}

interface PendingWalletRequest {
  readonly topic: string;
  readonly id: number;
  readonly chainId: string;
  readonly transaction: CapturedTransaction;
}

interface ConnectedDapp {
  readonly name: string;
  readonly url?: string;
  readonly icon?: string;
}

const SAFE_CONTEXT_TIMEOUT_MS = 8_000;
const REOWN_PROJECT_ID = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;
// This Preview-only wallet gateway receives the request but never signs or broadcasts it.
// eslint-disable-next-line safety/read-only-boundary
const SUPPORTED_METHODS = ["eth_sendTransaction"] as const;
const SUPPORTED_EVENTS = ["accountsChanged", "chainChanged"] as const;

let walletKitPromise: ReturnType<typeof WalletKit.init> | null = null;

function shorten(value: string) {
  return value.length > 20 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(
        () => reject(new Error("Safe did not provide an account context.")),
        timeoutMs,
      );
    }),
  ]);
}

function nativeSymbol(chainId: number) {
  return chainId === 1 ? "ETH" : chainId === 50 ? "XDC" : "native token";
}

function getWalletKit() {
  if (!REOWN_PROJECT_ID) {
    throw new Error(
      "WalletConnect is not configured for this Preview deployment.",
    );
  }
  walletKitPromise ??= WalletKit.init({
    core: new Core({ projectId: REOWN_PROJECT_ID }) as Parameters<
      typeof WalletKit.init
    >[0]["core"],
    metadata: {
      name: "Safe Inspector",
      description:
        "Review treasury transactions before opening Safe confirmation.",
      url: window.location.origin,
      icons: [`${window.location.origin}/icon.png`],
    },
  });
  return walletKitPromise;
}

function parseCapturedTransaction(value: unknown): CapturedTransaction {
  if (!value || typeof value !== "object") {
    throw new Error("The connected app sent an invalid transaction.");
  }
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.to !== "string" ||
    !/^0x[a-fA-F0-9]{40}$/.test(candidate.to)
  ) {
    throw new Error(
      "The connected app did not provide a valid target address.",
    );
  }
  const rawValue =
    typeof candidate.value === "string" && candidate.value.length > 0
      ? candidate.value
      : "0x0";
  let normalizedValue: string;
  try {
    normalizedValue = BigInt(rawValue).toString();
  } catch {
    throw new Error("The connected app provided an invalid native value.");
  }
  const data =
    typeof candidate.data === "string" && candidate.data.length > 0
      ? candidate.data
      : "0x";
  if (!/^0x(?:[a-fA-F0-9]{2})*$/.test(data)) {
    throw new Error("The connected app provided invalid calldata.");
  }
  return {
    to: candidate.to,
    value: normalizedValue,
    data,
  };
}

function jsonRpcResult(id: number, result: unknown) {
  return { id, jsonrpc: "2.0" as const, result };
}

function jsonRpcError(id: number, message: string) {
  return {
    id,
    jsonrpc: "2.0" as const,
    error: { code: 5000, message },
  };
}

function dappFromSession(session: {
  readonly peer?: {
    readonly metadata?: {
      readonly name?: string;
      readonly url?: string;
      readonly icons?: readonly string[];
    };
  };
}): ConnectedDapp {
  const metadata = session.peer?.metadata;
  return {
    name: metadata?.name ?? "Connected treasury app",
    ...(metadata?.url ? { url: metadata.url } : {}),
    ...(metadata?.icons?.[0] ? { icon: metadata.icons[0] } : {}),
  };
}

export function SafeAppReview() {
  const sdkRef = useRef<SafeAppsSDK | null>(null);
  const walletKitRef = useRef<Awaited<
    ReturnType<typeof WalletKit.init>
  > | null>(null);
  const pendingRequestRef = useRef<PendingWalletRequest | null>(null);
  const [safe, setSafe] = useState<SafeContext | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [pairingUri, setPairingUri] = useState("");
  const [pairing, setPairing] = useState(false);
  const [connectedDapp, setConnectedDapp] = useState<ConnectedDapp | null>(
    null,
  );
  const [waitingForRequest, setWaitingForRequest] = useState(false);
  const [pendingRequest, setPendingRequest] =
    useState<PendingWalletRequest | null>(null);
  const [to, setTo] = useState("");
  const [nativeValue, setNativeValue] = useState("0");
  const [data, setData] = useState("0x");
  const [result, setResult] = useState<ManualSimulationView | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [proposalHash, setProposalHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const sdk = new SafeAppsSDK();
    sdkRef.current = sdk;

    void withTimeout(sdk.safe.getInfo(), SAFE_CONTEXT_TIMEOUT_MS)
      .then((info) => {
        if (!active) return;
        setSafe({
          address: info.safeAddress,
          chainId: Number(info.chainId),
          owners: info.owners,
          threshold: info.threshold,
        });
      })
      .catch((cause) => {
        if (!active) return;
        setContextError(
          cause instanceof Error
            ? cause.message
            : "Open this Preview URL as a Custom App inside Safe Global.",
        );
      });

    return () => {
      active = false;
    };
  }, []);

  const analyzeTransaction = useCallback(
    async (
      transaction: CapturedTransaction,
      chainId: number,
      safeAddress: string,
    ) => {
      setReviewing(true);
      setResult(null);
      setAcknowledged(false);
      setProposalHash(null);
      setError(null);

      try {
        const response = await fetch("/api/v1/safe-app/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chainId,
            safeAddress,
            to: transaction.to,
            value: transaction.value,
            data: transaction.data,
          }),
        });
        const body = (await response.json()) as ApiResponse;
        if (!response.ok || !body.data) {
          throw new Error(body.error?.message ?? "The draft review failed.");
        }
        setResult(body.data);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "The draft review is temporarily unavailable.",
        );
      } finally {
        setReviewing(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!safe || !REOWN_PROJECT_ID) return;
    let active = true;
    let removeListeners = () => {};

    void getWalletKit()
      .then((initializedKit) => {
        if (!active) return;
        walletKitRef.current = initializedKit;

        const sessions = Object.values(initializedKit.getActiveSessions());
        const session = sessions.find((candidate) =>
          Object.values(candidate.namespaces).some((namespace) =>
            namespace.accounts?.some(
              (account) =>
                account.toLowerCase() ===
                `eip155:${safe.chainId}:${safe.address.toLowerCase()}`,
            ),
          ),
        );
        if (session) {
          setConnectedDapp(dappFromSession(session));
          setWaitingForRequest(true);
        }

        const handleProposal = async (
          proposal: Parameters<
            Parameters<typeof initializedKit.on<"session_proposal">>[1]
          >[0],
        ) => {
          try {
            const chain = `eip155:${safe.chainId}`;
            const account = `${chain}:${safe.address.toLowerCase()}`;
            const namespaces = buildApprovedNamespaces({
              proposal: proposal.params,
              supportedNamespaces: {
                eip155: {
                  chains: [chain],
                  methods: [...SUPPORTED_METHODS],
                  events: [...SUPPORTED_EVENTS],
                  accounts: [account],
                },
              },
            });
            const session = await initializedKit.approveSession({
              id: proposal.id,
              namespaces,
            });
            if (!active) return;
            setConnectedDapp(dappFromSession(session));
            setWaitingForRequest(true);
            setPairing(false);
            setPairingUri("");
            setError(null);
          } catch (cause) {
            await initializedKit.rejectSession({
              id: proposal.id,
              reason: getSdkError("USER_REJECTED_METHODS"),
            });
            if (!active) return;
            setPairing(false);
            setError(
              cause instanceof Error
                ? cause.message
                : "The dApp requested unsupported wallet permissions.",
            );
          }
        };

        const handleRequest = async (
          event: Parameters<
            Parameters<typeof initializedKit.on<"session_request">>[1]
          >[0],
        ) => {
          const { topic, params, id } = event;
          if (pendingRequestRef.current) {
            await initializedKit.respondSessionRequest({
              topic,
              response: jsonRpcError(
                id,
                "Another transaction is already awaiting review.",
              ),
            });
            return;
          }
          try {
            if (params.chainId !== `eip155:${safe.chainId}`) {
              throw new Error("The request targets a different network.");
            }
            if (params.request.method !== SUPPORTED_METHODS[0]) {
              throw new Error("Only transaction requests are supported.");
            }
            const transaction = parseCapturedTransaction(
              Array.isArray(params.request.params)
                ? params.request.params[0]
                : undefined,
            );
            const raw = params.request.params as readonly unknown[];
            const sender =
              raw[0] && typeof raw[0] === "object"
                ? (raw[0] as Record<string, unknown>).from
                : undefined;
            if (
              typeof sender !== "string" ||
              sender.toLowerCase() !== safe.address.toLowerCase()
            ) {
              throw new Error(
                "The transaction sender is not the Safe currently open.",
              );
            }
            const request = {
              topic,
              id,
              chainId: params.chainId,
              transaction,
            };
            pendingRequestRef.current = request;
            if (!active) return;
            setPendingRequest(request);
            setWaitingForRequest(false);
            await analyzeTransaction(transaction, safe.chainId, safe.address);
          } catch (cause) {
            const message =
              cause instanceof Error
                ? cause.message
                : "The wallet request could not be reviewed.";
            await initializedKit.respondSessionRequest({
              topic,
              response: jsonRpcError(id, message),
            });
            if (!active) return;
            setError(message);
          }
        };

        const handleDelete = () => {
          if (!active) return;
          setConnectedDapp(null);
          setWaitingForRequest(false);
          setPendingRequest(null);
          pendingRequestRef.current = null;
        };

        initializedKit.on("session_proposal", handleProposal);
        initializedKit.on("session_request", handleRequest);
        initializedKit.on("session_delete", handleDelete);

        removeListeners = () => {
          initializedKit.off("session_proposal", handleProposal);
          initializedKit.off("session_request", handleRequest);
          initializedKit.off("session_delete", handleDelete);
        };
      })
      .catch((cause) => {
        if (!active) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "WalletConnect could not be initialized.",
        );
      });

    return () => {
      active = false;
      removeListeners();
    };
  }, [analyzeTransaction, safe]);

  function invalidateReview() {
    setResult(null);
    setAcknowledged(false);
    setProposalHash(null);
    setError(null);
  }

  async function pairDapp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const kit = walletKitRef.current;
    if (!kit) {
      setError("WalletConnect is not ready yet.");
      return;
    }
    const uri = pairingUri.trim();
    if (!uri.startsWith("wc:")) {
      setError("Paste a valid WalletConnect pairing link.");
      return;
    }
    setPairing(true);
    setError(null);
    try {
      await kit.pair({ uri });
    } catch (cause) {
      setPairing(false);
      setError(
        cause instanceof Error
          ? cause.message
          : "The dApp could not be paired.",
      );
    }
  }

  async function reviewManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!safe) return;
    try {
      const value = parseUnits(nativeValue.trim() || "0", 18).toString();
      await analyzeTransaction(
        { to: to.trim(), value, data: data.trim() },
        safe.chainId,
        safe.address,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The draft review failed.",
      );
    }
  }

  async function rejectPendingRequest() {
    const request = pendingRequestRef.current;
    const kit = walletKitRef.current;
    if (!request || !kit) return;
    await kit.respondSessionRequest({
      topic: request.topic,
      response: jsonRpcError(
        request.id,
        "Transaction rejected by Safe Inspector user.",
      ),
    });
    pendingRequestRef.current = null;
    setPendingRequest(null);
    setResult(null);
    setAcknowledged(false);
    setWaitingForRequest(true);
    setError(null);
  }

  async function propose() {
    if (!result || !sdkRef.current || result.verdict.verdict === "flagged") {
      return;
    }
    if (result.verdict.verdict === "unverified" && !acknowledged) {
      setError("Acknowledge the unresolved checks before continuing to Safe.");
      return;
    }

    setProposing(true);
    setError(null);
    try {
      const response = await sdkRef.current.txs.send({
        txs: [
          {
            to: result.request.to,
            value: result.request.value,
            data: result.request.data,
          },
        ],
      });
      setProposalHash(response.safeTxHash);

      const request = pendingRequestRef.current;
      const kit = walletKitRef.current;
      if (request && kit) {
        await kit.respondSessionRequest({
          topic: request.topic,
          response: jsonRpcResult(request.id, response.safeTxHash),
        });
        pendingRequestRef.current = null;
        setPendingRequest(null);
        setWaitingForRequest(true);
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Safe did not open the transaction confirmation.",
      );
    } finally {
      setProposing(false);
    }
  }

  if (contextError) {
    return (
      <section className="safe-app-state" role="alert">
        <p className="eyebrow">Safe context unavailable</p>
        <h1>Open this page inside Safe Global</h1>
        <p>{contextError}</p>
        <p>
          In Safe, choose Apps → My custom apps → Add custom Safe App, then
          paste this Preview URL.
        </p>
      </section>
    );
  }

  if (!safe) {
    return (
      <section className="safe-app-state" role="status">
        <p className="eyebrow">Connecting securely</p>
        <h1>Reading the selected Safe…</h1>
      </section>
    );
  }

  const blocked = result?.verdict.verdict === "flagged";
  const needsAcknowledgement = result?.verdict.verdict === "unverified";

  return (
    <div className="safe-app-layout">
      <section className="safe-app-context" aria-label="Selected Safe">
        <div>
          <span>Selected Safe</span>
          <strong>{shorten(safe.address)}</strong>
        </div>
        <div>
          <span>Network</span>
          <strong>
            {safe.chainId === 50 ? "XDC Network" : `Chain ${safe.chainId}`}
          </strong>
        </div>
        <div>
          <span>Signing policy</span>
          <strong>
            {safe.threshold} of {safe.owners.length}
          </strong>
        </div>
      </section>

      <section className="safe-app-intro">
        <p className="eyebrow">Automatic pre-signature review</p>
        <h1>Connect your treasury dApp once</h1>
        <p>
          Choose WalletConnect in the dApp that creates the transaction and
          paste its pairing link here once. Future transaction requests arrive
          with the target, value, and calldata already attached.
        </p>
      </section>

      <section className={styles.gateway} aria-live="polite">
        {connectedDapp ? (
          <div className={styles.connected}>
            <div>
              <span>Connected treasury dApp</span>
              <strong>{connectedDapp.name}</strong>
              {connectedDapp.url ? <small>{connectedDapp.url}</small> : null}
            </div>
            <span className={styles.live}>
              {waitingForRequest
                ? "Waiting for a transaction"
                : "Transaction captured"}
            </span>
          </div>
        ) : REOWN_PROJECT_ID ? (
          <form className={styles.pairing} onSubmit={pairDapp}>
            <label>
              WalletConnect pairing link
              <input
                autoComplete="off"
                onChange={(event) => setPairingUri(event.target.value)}
                placeholder="wc:…"
                required
                spellCheck={false}
                value={pairingUri}
              />
            </label>
            <button className="button" disabled={pairing} type="submit">
              {pairing ? "Pairing…" : "Connect dApp"}
            </button>
          </form>
        ) : (
          <div className="safe-app-stop" role="alert">
            <strong>WalletConnect needs one Preview setting.</strong>
            <p>
              Add NEXT_PUBLIC_REOWN_PROJECT_ID to the Preview environment, then
              redeploy this branch.
            </p>
          </div>
        )}
        <p className={styles.note}>
          Safe Inspector accepts only <code>eth_sendTransaction</code> for the
          Safe and network shown above. It never receives a private key.
        </p>
      </section>

      {reviewing ? (
        <section className="safe-app-state" role="status">
          <p className="eyebrow">Transaction captured</p>
          <h2>Running the security review…</h2>
          <p>Nothing has been sent to Safe for signature yet.</p>
        </section>
      ) : null}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {result ? (
        <section className="safe-app-result" aria-live="polite">
          <div className="safe-app-result-heading">
            <div>
              <p className="eyebrow">
                {pendingRequest ? "Captured automatically" : "Manual fallback"}
              </p>
              <h2>{result.verdict.headline}</h2>
            </div>
            <span
              className={`analysis-verdict analysis-verdict-${result.verdict.verdict}`}
            >
              {result.verdict.verdict}
            </span>
          </div>

          <div className="simulation-metrics">
            <div>
              <span>Target</span>
              <strong>
                {result.target.label ?? shorten(result.request.to)}
              </strong>
            </div>
            <div>
              <span>Action</span>
              <strong>{result.decoded?.method ?? "Raw calldata"}</strong>
            </div>
            <div>
              <span>Internal calls</span>
              <strong>{result.execution.internalCallCount}</strong>
            </div>
            <div>
              <span>Delegate calls</span>
              <strong>{result.execution.delegateCallCount}</strong>
            </div>
          </div>

          <EvidenceFindings findings={result.verdict.findings} showAddresses />

          {blocked ? (
            <div className="safe-app-stop" role="alert">
              <strong>Do not propose this transaction.</strong>
              <p>
                Critical evidence must be resolved before Safe Inspector will
                hand this draft to Safe.
              </p>
              {pendingRequest ? (
                <button
                  className="button button-secondary"
                  onClick={rejectPendingRequest}
                  type="button"
                >
                  Reject dApp request
                </button>
              ) : null}
            </div>
          ) : (
            <div className="safe-app-propose">
              {needsAcknowledgement ? (
                <label className="safe-app-acknowledgement">
                  <input
                    checked={acknowledged}
                    onChange={(event) => setAcknowledged(event.target.checked)}
                    type="checkbox"
                  />
                  <span>
                    I reviewed the unresolved checks and independently confirmed
                    the intended target and recipients.
                  </span>
                </label>
              ) : null}
              <div className={styles.actions}>
                <button
                  className="button"
                  disabled={
                    proposing || (needsAcknowledgement && !acknowledged)
                  }
                  onClick={propose}
                  type="button"
                >
                  {proposing
                    ? "Opening Safe confirmation…"
                    : "Continue to Safe confirmation"}
                </button>
                {pendingRequest ? (
                  <button
                    className="button button-secondary"
                    disabled={proposing}
                    onClick={rejectPendingRequest}
                    type="button"
                  >
                    Reject request
                  </button>
                ) : null}
              </div>
              <p>
                Safe Inspector does not sign. Safe Global will show the final
                native confirmation and collect owner signatures.
              </p>
            </div>
          )}

          {proposalHash ? (
            <p className="form-status" role="status">
              Draft handed to Safe. Safe transaction:{" "}
              <code>{shorten(proposalHash)}</code>
            </p>
          ) : null}
        </section>
      ) : null}

      <details className={styles.manual}>
        <summary>Advanced: review a transaction manually</summary>
        <p>
          Use this fallback only when a treasury system cannot connect through
          WalletConnect.
        </p>
        <form className="safe-app-form" onSubmit={reviewManual}>
          <label>
            Target address
            <input
              autoComplete="off"
              onChange={(event) => {
                setTo(event.target.value);
                invalidateReview();
              }}
              placeholder="0x…"
              required
              spellCheck={false}
              value={to}
            />
          </label>
          <label>
            Native value ({nativeSymbol(safe.chainId)})
            <input
              inputMode="decimal"
              onChange={(event) => {
                setNativeValue(event.target.value);
                invalidateReview();
              }}
              placeholder="0"
              required
              value={nativeValue}
            />
          </label>
          <label>
            Calldata
            <textarea
              onChange={(event) => {
                setData(event.target.value);
                invalidateReview();
              }}
              required
              rows={6}
              spellCheck={false}
              value={data}
            />
          </label>
          <button className="button" disabled={reviewing} type="submit">
            {reviewing ? "Running security review…" : "Review transaction"}
          </button>
        </form>
      </details>
    </div>
  );
}
