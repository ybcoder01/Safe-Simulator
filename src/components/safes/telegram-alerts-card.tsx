"use client";

import { useState } from "react";

interface TelegramAlertsCardProps {
  readonly chainId: number;
  readonly address: string;
  readonly enabled: boolean;
}

interface LinkResponse {
  readonly data?: { readonly url?: string };
  readonly error?: { readonly message?: string };
}

export function TelegramAlertsCard({
  chainId,
  address,
  enabled,
}: TelegramAlertsCardProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "opened">("idle");
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setStatus("loading");
    setError(null);
    try {
      const response = await fetch(
        `/api/v1/safes/${chainId}/${address}/telegram-link`,
        { method: "POST" },
      );
      const body = (await response.json()) as LinkResponse;
      const url = body.data?.url;
      if (!response.ok || !url) {
        throw new Error(
          body.error?.message ?? "Could not create a Telegram link.",
        );
      }
      window.open(url, "_blank", "noopener,noreferrer");
      setStatus("opened");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Telegram alerts are temporarily unavailable.",
      );
      setStatus("idle");
    }
  }

  return (
    <section className="telegram-alerts-card">
      <div>
        <p className="eyebrow">Before another owner signs</p>
        <h2>Get independent Telegram warnings</h2>
        <p>
          See the exact target, spender, signer addresses, and safety warnings
          whenever this Safe proposal changes.
        </p>
        <p className="telegram-alerts-note">
          The bot reads the canonical Safe payload independently from the
          signing website.
        </p>
      </div>
      <div className="telegram-alerts-action">
        {enabled ? (
          <span className="telegram-alerts-enabled">✓ Alerts enabled</span>
        ) : (
          <button
            className="button"
            disabled={status === "loading"}
            onClick={connect}
            type="button"
          >
            {status === "loading" ? "Creating link…" : "Connect Telegram"}
          </button>
        )}
        {status === "opened" ? (
          <p>Telegram opened. Press Start there to finish connecting.</p>
        ) : null}
        {error ? <p className="field-error">{error}</p> : null}
      </div>
    </section>
  );
}
