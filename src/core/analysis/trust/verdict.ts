import type { Verdict } from "../../domain";

const severity: Readonly<Record<Verdict, number>> = {
  trusted: 0,
  known: 1,
  unverified: 2,
  flagged: 3,
};

/** A transaction inherits the least-trusted verdict among every touched address. */
export function aggregateVerdict(verdicts: readonly Verdict[]): Verdict {
  return verdicts.reduce<Verdict>(
    (worst, current) => (severity[current] > severity[worst] ? current : worst),
    "trusted",
  );
}
