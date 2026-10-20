/** The most addresses one source-evidence request may carry. */
export const MAX_SOURCE_EVIDENCE_ADDRESSES = 16;

/**
 * The JSON body the browser sends for a transaction's contract references.
 * A transaction can reference more addresses than one request accepts, and the
 * target is always first, so the list is cut rather than rejected.
 */
export function sourceEvidenceRequestBody(
  references: readonly string[],
): string {
  return JSON.stringify({
    addresses: references.slice(0, MAX_SOURCE_EVIDENCE_ADDRESSES),
  });
}
