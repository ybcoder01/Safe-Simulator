import type { Finding } from "@/core/domain";
import { findingGuidance, findingReviewSummary } from "@/lib/finding-guidance";

interface EvidenceFindingsProps {
  readonly findings: readonly Finding[];
  readonly showAddresses?: boolean;
}

export function EvidenceFindings({
  findings,
  showAddresses = false,
}: EvidenceFindingsProps) {
  const summary = findingReviewSummary(findings);

  return (
    <div className="evidence-guidance">
      <div className={`review-guidance review-guidance-${summary.tone}`}>
        <span>Recommended decision</span>
        <strong>{summary.title}</strong>
        <p>{summary.detail}</p>
      </div>

      <div className="simulation-findings">
        {findings.map((finding, index) => {
          const guidance = findingGuidance(finding);
          return (
            <article
              className={`finding finding-${finding.severity}`}
              key={`${finding.code}-${index}`}
            >
              <span>{finding.severity}</span>
              <div className="finding-copy">
                <strong>{finding.title}</strong>
                <p>{finding.detail}</p>
                {showAddresses && finding.addresses.length > 0 ? (
                  <code>{finding.addresses.join(" · ")}</code>
                ) : null}
                <div className="finding-next-step">
                  <span>{guidance.label}</span>
                  <p>{guidance.action}</p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
