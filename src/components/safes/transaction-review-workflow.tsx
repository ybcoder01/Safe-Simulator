"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import { CopyIdentifierButton } from "@/components/shared/copy-identifier-button";
import type { Finding } from "@/core/domain";
import { explorerAddressUrl } from "@/lib/explorer-links";
import { findingGuidance, findingReviewSummary } from "@/lib/finding-guidance";
import {
  createTransactionReviewRecord,
  findingCheckKey,
  loadTransactionReviewRecord,
  reviewRecordKey,
  reviewRecordMatchesEvidence,
  reviewReportFilename,
  saveTransactionReviewRecord,
  serializeReviewReport,
  type ReviewDecision,
  type TransactionReviewRecord,
} from "@/lib/review-record";

interface TransactionReviewWorkflowProps {
  readonly chainId: number;
  readonly evidenceVersion: string;
  readonly findings: readonly Finding[];
  readonly hasAddressBook: boolean;
  readonly safeAddress: string;
  readonly safeTxHash: string;
  readonly sourceEvidenceHref?: string | undefined;
}

type SaveStatus = "idle" | "dirty" | "saved" | "unavailable";

const DECISIONS: readonly {
  value: ReviewDecision;
  label: string;
  detail: string;
}[] = [
  {
    value: "proceed",
    label: "Reviewed — proceed",
    detail: "The available evidence matches the intended transaction.",
  },
  {
    value: "investigate",
    label: "Needs investigation",
    detail: "One or more checks still need independent verification.",
  },
  {
    value: "reject",
    label: "Reject",
    detail: "The transaction should not proceed in its current form.",
  },
];

export function TransactionReviewWorkflow({
  chainId,
  evidenceVersion,
  findings,
  hasAddressBook,
  safeAddress,
  safeTxHash,
  sourceEvidenceHref,
}: TransactionReviewWorkflowProps) {
  const storageKey = reviewRecordKey(chainId, safeAddress, safeTxHash);
  const summary = findingReviewSummary(findings);
  const [completedChecks, setCompletedChecks] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [decision, setDecision] = useState<ReviewDecision | "">("");
  const [notes, setNotes] = useState("");
  const [savedRecord, setSavedRecord] =
    useState<TransactionReviewRecord | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function refreshRecord() {
      const record = loadTransactionReviewRecord(localStorage, storageKey);
      if (!record) return;
      const currentKeys = new Set(
        findings.map((finding, index) => findingCheckKey(finding, index)),
      );
      setCompletedChecks(
        new Set(record.completedChecks.filter((key) => currentKeys.has(key))),
      );
      setDecision(record.decision);
      setNotes(record.notes);
      setSavedRecord(record);
      if (reviewRecordMatchesEvidence(record, evidenceVersion, findings)) {
        setStatus("saved");
      } else {
        setStatus("dirty");
        setError(
          "The evidence changed after this review was saved. Re-check the findings and save a new record.",
        );
      }
    }

    refreshRecord();
  }, [evidenceVersion, findings, storageKey]);

  const checkKeys = useMemo(
    () => findings.map((finding, index) => findingCheckKey(finding, index)),
    [findings],
  );
  const completedCount = checkKeys.filter((key) =>
    completedChecks.has(key),
  ).length;

  function markDirty() {
    setStatus("dirty");
    setError(null);
  }

  function toggleCheck(key: string) {
    setCompletedChecks((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    markDirty();
  }

  function saveReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!decision) {
      setError("Choose a reviewer decision before saving the record.");
      return;
    }

    const record = createTransactionReviewRecord({
      chainId,
      safeAddress,
      safeTxHash,
      evidenceVersion,
      decision,
      notes,
      completedChecks,
      findings,
    });
    if (!saveTransactionReviewRecord(localStorage, storageKey, record)) {
      setStatus("unavailable");
      setError("The review record could not be saved in this browser.");
      return;
    }
    setSavedRecord(record);
    setStatus("saved");
    setError(null);
  }

  function exportReport() {
    if (!savedRecord || status !== "saved") return;
    const blob = new Blob([serializeReviewReport(savedRecord)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = reviewReportFilename(savedRecord);
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="detail-panel review-workflow" id="review-workflow">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Reviewer workflow</p>
          <h2>Complete and record this review</h2>
        </div>
        <span>
          {completedCount} of {checkKeys.length} checks
        </span>
      </div>
      <p className="review-workflow-intro">
        This record is saved only in this browser profile. It documents the
        review; it cannot approve, sign, or execute the Safe transaction.
      </p>

      <div className={`review-guidance review-guidance-${summary.tone}`}>
        <span>Current recommendation</span>
        <strong>{summary.title}</strong>
        <p>{summary.detail}</p>
      </div>

      <form onSubmit={saveReview}>
        <fieldset className="review-checklist">
          <legend>Evidence checks</legend>
          {findings.map((finding, index) => {
            const key = findingCheckKey(finding, index);
            const guidance = findingGuidance(finding);
            const addresses = [...new Set(finding.addresses)];
            return (
              <article className="review-check" key={key}>
                <label>
                  <input
                    checked={completedChecks.has(key)}
                    onChange={() => toggleCheck(key)}
                    type="checkbox"
                  />
                  <span>
                    <strong>{guidance.label}</strong>
                    <small>
                      {finding.severity} · {finding.title}
                    </small>
                  </span>
                </label>
                <p>{guidance.action}</p>
                <div className="review-check-actions">
                  {addresses.map((address) => {
                    const explorerUrl = explorerAddressUrl(chainId, address);
                    return (
                      <span className="review-address-action" key={address}>
                        {explorerUrl ? (
                          <a
                            className="text-link"
                            href={explorerUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Open {address.slice(0, 8)}… ↗
                          </a>
                        ) : (
                          <code>{address}</code>
                        )}
                        <CopyIdentifierButton
                          label={`Copy finding address ${address}`}
                          value={address}
                        />
                      </span>
                    );
                  })}
                  {sourceEvidenceHref ? (
                    <a className="text-link" href={sourceEvidenceHref}>
                      Review source evidence
                    </a>
                  ) : null}
                  {hasAddressBook && addresses.length > 0 ? (
                    <a className="text-link" href="#address-book">
                      Trust or flag address
                    </a>
                  ) : null}
                </div>
              </article>
            );
          })}
        </fieldset>

        <fieldset className="review-decision-options">
          <legend>Reviewer decision</legend>
          {DECISIONS.map((option) => (
            <label key={option.value}>
              <input
                checked={decision === option.value}
                name="review-decision"
                onChange={() => {
                  setDecision(option.value);
                  markDirty();
                }}
                type="radio"
                value={option.value}
              />
              <span>
                <strong>{option.label}</strong>
                <small>{option.detail}</small>
              </span>
            </label>
          ))}
        </fieldset>

        <label className="review-notes">
          Reviewer notes
          <textarea
            maxLength={1_000}
            onChange={(event) => {
              setNotes(event.target.value);
              markDirty();
            }}
            placeholder="Record independent sources checked, unresolved questions, or the reason for the decision."
            value={notes}
          />
          <span>{notes.length}/1000</span>
        </label>

        <div className="review-record-actions">
          <button className="button" type="submit">
            Save review record
          </button>
          <button
            className="button button-secondary"
            disabled={!savedRecord || status !== "saved"}
            onClick={exportReport}
            type="button"
          >
            Export JSON report
          </button>
          <span aria-live="polite">
            {status === "saved"
              ? `Saved ${savedRecord ? new Date(savedRecord.reviewedAt).toLocaleString() : ""}`
              : status === "dirty"
                ? "Unsaved changes"
                : status === "unavailable"
                  ? "Browser storage unavailable"
                  : "Not yet saved"}
          </span>
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </section>
  );
}
