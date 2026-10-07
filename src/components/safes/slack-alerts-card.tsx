"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface SlackAlertStatusView {
  readonly state: "active" | "paused" | "disconnected";
  readonly channels: readonly string[];
  readonly lastPolledAt: number | null;
  readonly lastAlertAt: number | null;
  readonly healthError: string | null;
}

interface SlackAlertsCardProps {
  readonly chainId: number;
  readonly address: string;
  readonly status: SlackAlertStatusView;
}

interface ApiResponse {
  readonly data?: { readonly command?: string; readonly message?: string };
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

export function SlackAlertsCard({
  chainId,
  address,
  status,
}: SlackAlertsCardProps) {
  const router = useRouter();
  const [pending, setPending] = useState<ControlAction | "connect" | null>(
    null,
  );
  const [command, setCommand] = useState<string | null>(null);
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
        `/api/v1/safes/${chainId}/${address}/slack-link`,
        { method: "POST" },
      );
      const body = await readResponse(response);
      if (!response.ok || !body.data?.command) {
        throw new Error(
          body.error?.message ?? "Could not create a Slack code.",
        );
      }
      setCommand(body.data.command);
      setMessage(
        "Copy this one-use command into the Slack channel that should receive alerts. It expires in ten minutes.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Slack alerts are temporarily unavailable.",
      );
    } finally {
      setPending(null);
    }
  }

  async function copyCommand() {
    if (!command) return;
    await navigator.clipboard.writeText(command);
    setMessage("Command copied. Paste it into the destination Slack channel.");
  }

  async function control(action: ControlAction) {
    if (
      action === "disconnect" &&
      !window.confirm(
        "Disconnect Slack alerts for this Safe? Existing signed alert reports will remain available.",
      )
    )
      return;
    setPending(action);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/v1/safes/${chainId}/${address}/slack-alerts`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      const body = await readResponse(response);
      if (!response.ok) {
        throw new Error(
          body.error?.message ??
            "The Slack alert setting could not be changed.",
        );
      }
      setMessage(body.data?.message ?? "Slack alert setting updated.");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The Slack alert setting could not be changed.",
      );
    } finally {
      setPending(null);
    }
  }

  const connected = status.state !== "disconnected";

  return (
    <section className="telegram-alerts-card" aria-labelledby="slack-title">
      <div className="telegram-alerts-heading">
        <div>
          <p className="eyebrow">Notify your signer channel</p>
          <h2 id="slack-title">Slack alert control center</h2>
          <p>
            Send the same independently verified Safe warnings to a Slack
            channel.
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
            <span>Connected channel</span>
            <strong>{status.channels.join(", ")}</strong>
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
          Connect a Slack channel to notify co-signers after owner approvals and
          status changes.
        </p>
      )}

      {status.healthError ? (
        <div className="telegram-health-error" role="alert">
          <strong>Delivery needs attention</strong>
          <p>{status.healthError}</p>
        </div>
      ) : null}

      {command ? (
        <div className="slack-link-command">
          <strong>One-use Slack command</strong>
          <p>
            <code>{command}</code>
          </p>
          <button
            className="button button-secondary"
            onClick={copyCommand}
            type="button"
          >
            Copy command
          </button>
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
            {pending === "connect" ? "Creating code…" : "Connect Slack"}
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
              Connect another channel
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
        Slack is notification-only. Always verify the signed report on the
        official Safe Inspector domain before signing.
      </p>
    </section>
  );
}
