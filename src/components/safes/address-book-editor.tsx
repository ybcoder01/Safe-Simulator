"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import {
  availableAddressBookSuggestions,
  suggestedAddressBookLabel,
  type AddressBookSuggestion,
  type AddressBookReviewView,
} from "@/lib/api/address-book";

interface Props {
  readonly chainId: number;
  readonly safeAddress: string;
  readonly initialEntries: readonly AddressBookReviewView[];
  readonly suggestions: readonly AddressBookSuggestion[];
}

interface ErrorBody {
  readonly error?: { readonly message?: string };
}

interface SaveInput {
  readonly address: string;
  readonly label: string;
  readonly purpose?: string;
  readonly trust: "trusted" | "flagged";
}

function formatSince(timestamp: number): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(timestamp * 1_000));
}

export function AddressBookEditor({
  chainId,
  safeAddress,
  initialEntries,
  suggestions,
}: Props) {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [purpose, setPurpose] = useState("");
  const [trust, setTrust] = useState<"trusted" | "flagged">("trusted");
  const [submitting, setSubmitting] = useState(false);
  const [quickSaving, setQuickSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endpoint = `/api/v1/safes/${chainId}/${safeAddress}/address-book`;
  const availableSuggestions = availableAddressBookSuggestions(
    suggestions,
    entries,
  );
  const busy = submitting || quickSaving !== null;
  const approvalsNeeded = entries.filter(
    (entry) =>
      entry.status === "pending" && entry.currentUserDecision !== "trusted",
  );

  async function persistEntry(input: SaveInput) {
    const response = await fetch(endpoint, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = (await response.json()) as {
      data?: AddressBookReviewView;
    } & ErrorBody;
    if (!response.ok || !body.data) {
      throw new Error(body.error?.message ?? "Could not save trust record.");
    }

    const saved = body.data;
    setEntries((current) => [
      ...current.filter(
        (entry) => entry.address.toLowerCase() !== saved.address.toLowerCase(),
      ),
      saved,
    ]);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await persistEntry({ address, label, purpose, trust });
      setAddress("");
      setLabel("");
      setPurpose("");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save trust record.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function classify(
    suggestion: AddressBookSuggestion,
    classification: "trusted" | "flagged",
  ) {
    setQuickSaving(suggestion.address.toLowerCase());
    setError(null);

    try {
      await persistEntry({
        address: suggestion.address,
        label: suggestedAddressBookLabel(suggestion),
        trust: classification,
      });
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save trust record.",
      );
    } finally {
      setQuickSaving(null);
    }
  }

  async function remove(entryAddress: string) {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: entryAddress }),
      });
      const body = (await response.json()) as ErrorBody;
      if (!response.ok) {
        throw new Error(
          body.error?.message ?? "Could not remove trust record.",
        );
      }
      setEntries((current) =>
        current.filter(
          (entry) => entry.address.toLowerCase() !== entryAddress.toLowerCase(),
        ),
      );
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not remove trust record.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="detail-panel" id="address-book">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Owner trust reviews</p>
          <h2>Address book</h2>
        </div>
        <span>{entries.length} configured</span>
      </div>
      <p className="trust-copy">
        Trust is shared at the Safe level. An address becomes trusted only after
        the number of current owners approving it reaches this Safe&apos;s
        signing threshold. Critical evidence remains critical.
      </p>
      <p className="trust-copy">
        A newly trusted address is shown as &ldquo;only just trusted&rdquo; for
        24 hours, unless this Safe has paid it before. That gives your team time
        to confirm the address with the person who asked for the payment.
      </p>
      {approvalsNeeded.length > 0 ? (
        <div className="form-notice" role="status">
          <strong>Your review is needed.</strong> {approvalsNeeded.length}{" "}
          {approvalsNeeded.length === 1 ? "address is" : "addresses are"}{" "}
          waiting for enough Safe-owner approvals before becoming trusted.
        </div>
      ) : null}
      {availableSuggestions.length > 0 ? (
        <div className="trust-suggestions">
          <p>Classify addresses found in this transaction</p>
          {availableSuggestions.map((suggestion) => {
            const saving = quickSaving === suggestion.address.toLowerCase();
            return (
              <div
                className="trust-suggestion"
                key={suggestion.address.toLowerCase()}
              >
                <div>
                  <span>
                    {suggestion.roles.join(" · ") || "involved address"}
                  </span>
                  <strong>{suggestedAddressBookLabel(suggestion)}</strong>
                  <code>{suggestion.address}</code>
                </div>
                <div className="trust-suggestion-actions">
                  <button
                    disabled={busy}
                    onClick={() => void classify(suggestion, "trusted")}
                    type="button"
                  >
                    {saving ? "Saving…" : "Trust"}
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => void classify(suggestion, "flagged")}
                    type="button"
                  >
                    {saving ? "Saving…" : "Flag"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      <form className="trust-form" onSubmit={save}>
        <label>
          Address
          <input
            autoComplete="off"
            onChange={(event) => setAddress(event.target.value)}
            placeholder="0x…"
            required
            spellCheck={false}
            value={address}
          />
        </label>
        <label>
          Label
          <input
            maxLength={80}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Protocol or counterparty"
            required
            value={label}
          />
        </label>
        <label>
          What is it for? (optional)
          <input
            maxLength={120}
            onChange={(event) => setPurpose(event.target.value)}
            placeholder="Payroll, exchange deposit, vendor invoices"
            value={purpose}
          />
        </label>
        <label>
          Classification
          <select
            onChange={(event) =>
              setTrust(event.target.value as "trusted" | "flagged")
            }
            value={trust}
          >
            <option value="trusted">Trusted</option>
            <option value="flagged">Flagged</option>
          </select>
        </label>
        <button className="button" disabled={busy} type="submit">
          {submitting ? "Saving…" : "Save record"}
        </button>
      </form>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="trust-records">
        {entries.length === 0 ? (
          <div className="panel-empty">
            No explicit trust records exist for this profile and Safe.
          </div>
        ) : (
          entries.map((entry) => (
            <div className="trust-record" key={entry.address.toLowerCase()}>
              <div>
                <span>{entry.status}</span>
                <strong>{entry.label}</strong>
                {entry.purpose ? <em>{entry.purpose}</em> : null}
                <code>{entry.address}</code>
                <small>
                  {entry.trustedApprovals} of {entry.requiredApprovals} owner
                  approvals
                  {entry.flaggedApprovals > 0
                    ? ` · ${entry.flaggedApprovals} owner flag${entry.flaggedApprovals === 1 ? "" : "s"}`
                    : ""}
                </small>
                <small>Updated {formatSince(entry.updatedAt)}</small>
                <small>
                  Your decision: {entry.currentUserDecision ?? "not reviewed"}
                </small>
              </div>
              <div className="trust-suggestion-actions">
                {entry.currentUserDecision !== "trusted" ? (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void persistEntry({
                        address: entry.address,
                        label: entry.label,
                        ...(entry.purpose ? { purpose: entry.purpose } : {}),
                        trust: "trusted",
                      })
                    }
                    type="button"
                  >
                    Approve trust
                  </button>
                ) : null}
                {entry.currentUserDecision ? (
                  <button
                    disabled={busy}
                    onClick={() => void remove(entry.address)}
                    type="button"
                  >
                    Withdraw my decision
                  </button>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
