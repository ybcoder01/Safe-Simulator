import type { SafeRef } from "@/core/domain";

export const REANALYSIS_REQUEST_WINDOW_MS = 15 * 60 * 1_000;

export type ReanalysisRequestState =
  | {
      readonly status: "idle";
      readonly message: null;
    }
  | {
      readonly status: "queued" | "error";
      readonly message: string;
    };

export const initialReanalysisRequestState: ReanalysisRequestState = {
  status: "idle",
  message: null,
};

export type ReanalysisRequestAction = (
  previousState: ReanalysisRequestState,
  formData: FormData,
) => Promise<ReanalysisRequestState>;

export function reanalysisRequestIdempotencyKey(
  safe: SafeRef,
  engineVersion: string,
  now = Date.now(),
): string {
  const bucket = Math.floor(now / REANALYSIS_REQUEST_WINDOW_MS);
  return [
    "reanalyze",
    "request",
    safe.chainId,
    safe.address.toLowerCase(),
    engineVersion,
    bucket,
  ].join(":");
}
