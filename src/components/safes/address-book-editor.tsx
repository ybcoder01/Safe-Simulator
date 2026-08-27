"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { AddressBookView } from "@/lib/api/address-book";

interface Props {
  readonly chainId: number;
  readonly safeAddress: string;
  readonly initialEntries: readonly AddressBookView[];
}

interface ErrorBody {
  readonly error?: { readonly message?: string };
}

export function AddressBookEditor({
  chainId,
  safeAddress,
  initialEntries,
}: Props) {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [trust, setTrust] = useState<"trusted" | "flagged">("trusted");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endpoint = `/api/v1/safes/${chainId}/${safeAddress}/address-book`;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, label, trust }),
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
          (entry) =>
            entry.address.toLowerCase() !== saved.address.toLowerCase(),
        ),
        saved,
      ]);
      setAddress("");
      setLabel("");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save trust record.",
      );
    } finally {
      setSubmitting(false);
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
          (entry) =>
            entry.address.toLowerCase() !== entryAddress.toLowerCase(),
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
        <button className="button" disabled={submitting} type="submit">
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
                disabled={submitting}
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
