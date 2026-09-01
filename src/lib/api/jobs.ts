import { getAddress } from "viem";
import { z } from "zod";

const safeRefSchema = z.object({
  chainId: z.number().int().positive(),
  address: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .transform((value) => getAddress(value)),
});

export const queueJobSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("sync-sweep"), cursor: z.string().nullable() }),
  z.object({
    type: z.literal("backfill"),
    safe: safeRefSchema,
    stream: z.enum(["multisig", "module", "transfer", "message"]),
  }),
  z.object({ type: z.literal("incremental-sync"), safe: safeRefSchema }),
  z.object({
    type: z.literal("analyze"),
    safe: safeRefSchema,
    safeTxHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  }),
  z.object({
    type: z.literal("reanalyze"),
    safe: safeRefSchema,
    engineVersion: z.string().min(1).max(100),
    cursor: z.string().max(4_096).nullable(),
    page: z.number().int().nonnegative(),
  }),
]);
