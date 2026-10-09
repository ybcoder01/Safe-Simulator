import Link from "next/link";

import {
  alertVerdictLabel,
  type StageComparison,
  type StageTimelineEntry,
} from "@/lib/alert-stage";

function formatTimestamp(timestamp: number): string {
  return `${new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(timestamp * 1_000))} UTC`;
}

interface TimelineProps {
  readonly entries: readonly StageTimelineEntry[];
  readonly findingTitle: (code: string) => string;
}

/**
 * Shows each stage the transaction went through and the alert (if any) that
 * described it, kept exactly as sent, ending at the transaction's present state.
 */
export function AlertStageTimeline({ entries, findingTitle }: TimelineProps) {
  const alerted = entries.filter((entry) => entry.alert !== null);
  const preExecutionAlert = alerted.find(
    (entry) => entry.stage.open && entry.alert !== null,
  );
  const concluded = entries.at(-1);
  const hasConcluded = concluded !== undefined && !concluded.stage.open;

  return (
    <section
      aria-labelledby="alert-timeline-title"
      className="detail-panel alert-timeline"
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Alert history</p>
          <h2 id="alert-timeline-title">What you were told, and when</h2>
        </div>
        <span>
          {alerted.length} {alerted.length === 1 ? "alert" : "alerts"} sent
        </span>
      </div>

      {preExecutionAlert && hasConcluded ? (
        <p className="alert-timeline-lede">
          You were alerted at{" "}
          <strong>{preExecutionAlert.stage.label.toLowerCase()}</strong>, while
          owners could still decide not to sign. The transaction has since
          reached <strong>{concluded.stage.label.toLowerCase()}</strong>. Each
          alert below is kept exactly as it was shown at that stage.
        </p>
      ) : (
        <p className="alert-timeline-lede">
          Each alert is kept exactly as it was shown at the stage it described.
        </p>
      )}

      <ol className="alert-timeline-list">
        {entries.map((entry) => (
          <li
            className={[
              "alert-timeline-step",
              entry.stage.open ? "alert-step-open" : "alert-step-concluded",
              entry.current ? "alert-step-current" : "",
            ].join(" ")}
            key={entry.key}
          >
            <span className="alert-timeline-marker" aria-hidden="true">
              {entry.alert ? "!" : "•"}
            </span>
            <div className="alert-timeline-body">
              <div className="alert-timeline-title">
                <strong>{entry.stage.label}</strong>
                {entry.current ? (
                  <span className="alert-now-pill">Now</span>
                ) : null}
              </div>
              <span className="alert-timeline-time">
                {entry.at === null
                  ? "Time not reported"
                  : formatTimestamp(entry.at)}
              </span>
              <p>{entry.stage.detail}</p>

              {entry.alert ? (
                <div className="alert-timeline-alert">
                  <span className="alert-timeline-alert-label">
                    Alert sent at this stage ·{" "}
                    {formatTimestamp(entry.alert.issuedAt)}
                  </span>
                  <strong>
                    {alertVerdictLabel(entry.alert.verdict, entry.alert.status)}
                  </strong>
                  {entry.alert.findingCodes.length > 0 ? (
                    <ul>
                      {entry.alert.findingCodes.slice(0, 3).map((code) => (
                        <li key={code}>{findingTitle(code)}</li>
                      ))}
                    </ul>
                  ) : null}
                  <Link
                    className="text-link"
                    href={`/alerts/verify/${encodeURIComponent(entry.alert.verificationId)}`}
                  >
                    Open the signed receipt
                  </Link>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

interface ComparisonProps {
  readonly comparison: StageComparison;
}

/** The "then versus now" banner for a single saved alert. */
export function AlertStageComparisonBanner({ comparison }: ComparisonProps) {
  return (
    <div
      className={`alert-stage-comparison ${comparison.changed ? "alert-stage-changed" : "alert-stage-same"}`}
      role="status"
    >
      <div>
        <strong>{comparison.headline}</strong>
        <p>{comparison.explanation}</p>
      </div>
      <dl>
        <div>
          <dt>When this alert was sent</dt>
          <dd>{comparison.then.label}</dd>
        </div>
        <div>
          <dt>Where the transaction is now</dt>
          <dd>{comparison.now ? comparison.now.label : "Unavailable"}</dd>
        </div>
      </dl>
    </div>
  );
}
