"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface TelegramAlertStatusView {
  readonly state: "active" | "paused" | "disconnected";
  readonly chats: readonly string[];
  readonly lastPolledAt: number | null;
  readonly lastAlertAt: number | null;
  readonly healthError: string | null;
}

interface TelegramAlertsCardProps {
  readonly chainId: number;
  readonly address: string;
  readonly status: TelegramAlertStatusView;
}

interface ApiResponse {
  readonly data?: { readonly url?: string; readonly message?: string };
  readonly error?: { readonly message?: string };
}

type ControlAction = "check" | "test" | "pause" | "resume" | "disconnect";

function formatTime(timestamp: number | null): string {
  if (timestamp === null) return "Not recorded yet";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(timestamp * 1_000));
}

export function TelegramAlertsCard({
  chainId,
  address,
  status,
}: TelegramAlertsCardProps) {
  const router = useRouter();
  const [pending, setPending] = useState<ControlAction | "connect" | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function readResponse(response: Response): Promise<ApiResponse> {
    return (await response.json().catch(() => ({}))) as ApiResponse;
  }

  async function connect() {
    setPending("connect");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/v1/safes/${chainId}/${address}/telegram-link`,
        { method: "POST" },
      );
      const body = await readResponse(response);
      const url = body.data?.url;
      if (!response.ok || !url) {
        throw new Error(
          body.error?.message ?? "Could not create a Telegram link.",
        );
      }
      window.open(url, "_blank", "noopener,noreferrer");
      setMessage("Telegram opened. Press Start there to finish connecting.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Telegram alerts are temporarily unavailable.",
      );
    } finally {
      setPending(null);
    }
  }

  async function control(action: ControlAction) {
    if (
      action === "disconnect" &&
      !window.confirm(
        "Disconnect Telegram alerts for this Safe? Existing signed alert reports will remain available.",
      )
    ) {
      return;
    }

    setPending(action);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/v1/safes/${chainId}/${address}/telegram-alerts`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      const body = await readResponse(response);
      if (!response.ok) {
        throw new Error(
          body.error?.message ?? "The alert setting could not be changed.",
        );
      }
      setMessage(body.data?.message ?? "Alert setting updated.");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The alert setting could not be changed.",
      );
    } finally {
      setPending(null);
    }
  }

  const connected = status.state !== "disconnected";

  return (
    <section className="telegram-alerts-card" aria-labelledby="telegram-title">
      <div className="telegram-alerts-heading">
        <div>
          <p className="eyebrow">Before another owner signs</p>
          <h2 id="telegram-title">Telegram alert control center</h2>
          <p>
            Monitor this Safe independently and test delivery without creating
            or signing a blockchain transaction.
          </p>
        </div>
        <span className={`telegram-alert-state state-${status.state}`}>
          {status.state === "active"
            ? "● Monitoring active"
            : status.state === "paused"
              ? "Ⅱ Alerts paused"
              : "○ Not connected"}
        </span>
      </div>

      {connected ? (
        <div className="telegram-alert-grid">
          <article>
            <span>Connected chat</span>
            <strong>{status.chats.join(", ")}</strong>
          </article>
          <article>
            <span>Last monitoring check</span>
            <strong>{formatTime(status.lastPolledAt)} UTC</strong>
          </article>
          <article>
            <span>Last transaction alert</span>
            <strong>{formatTime(status.lastAlertAt)} UTC</strong>
          </article>
        </div>
      ) : (
        <p className="telegram-alerts-note">
          Connect Telegram to notify co-signers after owner approvals and
          transaction status changes.
        </p>
      )}

      {status.healthError ? (
        <div className="telegram-health-error" role="alert">
          <strong>Delivery needs attention</strong>
          <p>{status.healthError}</p>
        </div>
      ) : null}

      <div className="telegram-alert-controls">
        {status.state === "active" ? (
          <>
            <button
              className="button"
              disabled={pending !== null}
              onClick={() => control("test")}
              type="button"
            >
              {pending === "test" ? "Sending…" : "Send test alert"}
            </button>
            <button
              className="button button-secondary"
              disabled={pending !== null}
              onClick={() => control("check")}
              type="button"
            >
              {pending === "check" ? "Checking…" : "Check now"}
            </button>
            <button
              className="button button-secondary"
              disabled={pending !== null}
              onClick={() => control("pause")}
              type="button"
            >
              Pause alerts
            </button>
          </>
        ) : status.state === "paused" ? (
          <button
            className="button"
            disabled={pending !== null}
            onClick={() => control("resume")}
            type="button"
          >
            {pending === "resume" ? "Resuming…" : "Resume alerts"}
          </button>
        ) : (
          <button
            className="button"
            disabled={pending !== null}
            onClick={connect}
            type="button"
          >
            {pending === "connect" ? "Creating link…" : "Connect Telegram"}
          </button>
        )}

        {connected ? (
          <>
            <button
              className="button-link"
              disabled={pending !== null}
              onClick={connect}
              type="button"
            >
              Connect another chat
            </button>
            <button
              className="button-link button-link-danger"
              disabled={pending !== null}
              onClick={() => control("disconnect")}
              type="button"
            >
              Disconnect
            </button>
          </>
        ) : null}
      </div>

      {message ? (
        <p className="form-success" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="telegram-alerts-note">
        Telegram is notification-only. Always verify the signed report on the
        official Safe Inspector domain before signing.
      </p>
    </section>
  );
}
