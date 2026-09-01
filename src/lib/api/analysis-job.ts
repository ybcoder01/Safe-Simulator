[error] src/lib/api/analysis-job.ts: SyntaxError: Invalid character. (8:23)
[error]    6 | } from "@/lib/api/transaction-analysis";
[error]    7 |
[error] >  8 | interface AnalyzeJob {\n  readonly type: "analyze";\n  readonly safe: SafeRef;\n  readonly safeTxHash: string;\n}
[error]      |                       ^
[error]    9 |
[error]   10 | export type AnalyzeJobResult =
[error]   11 |   | {
