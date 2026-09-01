"use client";

import { useEffect, useState } from "react";

interface CopyIdentifierButtonProps {
  readonly label: string;
  readonly value: string;
}

type CopyStatus = "idle" | "copied" | "unavailable";

export function CopyIdentifierButton({
  label,
  value,
}: CopyIdentifierButtonProps) {
  const [status, setStatus] = useState<CopyStatus>("idle");

  useEffect(() => {
    if (status === "idle") return;

    const timeout = window.setTimeout(() => setStatus("idle"), 2_500);
    return () => window.clearTimeout(timeout);
  }, [status]);

  async function copyValue() {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value);
      setStatus("copied");
    } catch {
      setStatus("unavailable");
    }
  }

  const buttonText =
    status === "copied"
      ? "Copied"
      : status === "unavailable"
        ? "Unavailable"
        : "Copy";
  const announcement =
    status === "copied"
      ? `${label} copied.`
      : status === "unavailable"
        ? `${label} could not be copied.`
        : "";

  return (
    <span className="copy-identifier-control">
      <button
        aria-label={label}
        className="copy-identifier-button"
        onClick={() => void copyValue()}
        type="button"
      >
        {buttonText}
      </button>
      <span aria-live="polite" className="loading-status-text">
        {announcement}
      </span>
    </span>
  );
}
