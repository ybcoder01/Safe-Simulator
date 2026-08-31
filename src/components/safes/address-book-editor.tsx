"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import {
  availableAddressBookSuggestions,
  suggestedAddressBookLabel,
  type AddressBookSuggestion,
  type AddressBookView,
} from "@/lib/api/address-book";

interface Props {
  readonly chainId: number;
  readonly safeAddress: string;
  readonly initialEntries: readonly AddressBookView[];
  readonly suggestions: readonly AddressBookSuggestion[];
}

interface ErrorBody {
  readonly error?: { readonly message?: string };
}

interface SaveInput {
  readonly address: string;
  readonly label: string;
  readonly trust: "trusted" | "flagged";
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

  async function persistEntry(input: SaveInput) {
    const response = await fetch(endpoint, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = (await response.json()) as {
      data?: AddressBookView;
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
      await persistEntry({ address, label, trust });
      setAddress("");
      setLabel("");
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
    <section className="detail-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Profile trust records</p>
          <h2>Address book</h2>
        </div>
        <span>{entries.length} configured</span>
      </div>
      <p className="trust-copy">
        These labels affect only this browser profile. Verified source alone
        never creates a trusted verdict, and critical evidence remains critical.
      </p>
      {availableSuggestions.length > 0 ? (
        <div className="trust-suggestions">
          <p>Classify addresses found in this transaction</p>
          {availableSuggestions.map((suggestion) => {
            const saving =
              quickSaving === suggestion.address.toLowerCase();
            return (
              <div
                className="trust-suggestion"
                key={suggestion.address.toLowerCase()}
              >
                <div>
                  <span>{suggestion.roles.join(" · ") || "involved address"}</span>
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
                <span>{entry.trust}</span>
                <strong>{entry.label}</strong>
                <code>{entry.address}</code>
              </div>
              <button
                disabled={busy}
                onClick={() => void remove(entry.address)}
                type="button"
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
