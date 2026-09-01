import { and, asc, desc, eq, gt, inArray, isNull, lt } from "drizzle-orm";

import type {
  Address,
  AddressBookEntry,
  AnalysisResult,
  CallNode,
  ContractMetadata,
  ExecutionEvidenceRecord,
  Hex,
  ModuleTransaction,
  Page,
  SafeMessage,
  SafeRef,
  SafeSnapshot,
  SafeTransaction,
  SimulationOutput,
  SyncCursor,
  TransferRecord,
} from "@/core/domain";
import type { PersistencePort } from "@/core/ports";

import type { Database } from "./client";
import {
  analysisResults,
  confirmations,
  contracts,
  executionEvidence,
  messages,
  moduleTransactions,
  profiles,
  profileAddressBook,
  profileSafes,
  rawTransfers,
  safeModules,
  safeOwners,
  safes,
  syncCursors,
  transactions,
} from "./schema";

type SafeRow = typeof safes.$inferSelect;
type TransactionRow = typeof transactions.$inferSelect;

const lowerAddress = (value: Address) => value.toLowerCase() as Address;
const asDate = (unixTime: number) => new Date(unixTime * 1_000);
const asUnixTime = (date: Date) => Math.floor(date.getTime() / 1_000);

function jsonWithBigInts(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_, item: unknown) =>
      typeof item === "bigint" ? item.toString() : item,
    ),
  ) as unknown;
}

function mapCallNode(node: Record<string, unknown>): CallNode {
  return {
    from: node.from as Address,
    to: node.to as Address,
    input: node.input as Hex,
    output: node.output as Hex | null,
    value: BigInt(node.value as string),
    operation: node.operation as CallNode["operation"],
    reverted: node.reverted as boolean,
    error: node.error as string | null,
    calls: (node.calls as Record<string, unknown>[]).map(mapCallNode),
  };
}

function mapSimulation(
  value: Record<string, unknown> | null,
): SimulationOutput | null {
  if (!value) return null;

  const simulation: SimulationOutput = {
    success: value.success as boolean,
    gasUsed: value.gasUsed === null ? null : BigInt(value.gasUsed as string),
    callTree: mapCallNode(value.callTree as Record<string, unknown>),
    logs: value.logs as SimulationOutput["logs"],
    storageChanges: value.storageChanges as SimulationOutput["storageChanges"],
    blockNumber: BigInt(value.blockNumber as string),
    blockHash: value.blockHash as Hex,
    error: value.error as string | null,
  };
  const coverage = value.traceCoverage as
    | SimulationOutput["traceCoverage"]
    | undefined;

  return coverage ? { ...simulation, traceCoverage: coverage } : simulation;
}

function mapAnalysis(value: unknown): AnalysisResult {
  const result = value as Record<string, unknown>;

  return {
    safeTxHash: result.safeTxHash as Hex,
    engineVersion: result.engineVersion as string,
    verdict: result.verdict as AnalysisResult["verdict"],
    findings: result.findings as AnalysisResult["findings"],
    simulation: mapSimulation(
      result.simulation as Record<string, unknown> | null,
    ),
    createdAt: result.createdAt as number,
    immutable: result.immutable as boolean,
  };
}

export class DrizzlePersistenceAdapter implements PersistencePort {
  constructor(private readonly db: Database) {}

  private async findSafeRow(ref: SafeRef): Promise<SafeRow | null> {
    const [row] = await this.db
      .select()
      .from(safes)
      .where(
        and(
          eq(safes.chainId, ref.chainId),
          eq(safes.address, lowerAddress(ref.address)),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  private async requireSafeRow(ref: SafeRef): Promise<SafeRow> {
    const row = await this.findSafeRow(ref);
    if (!row)
      throw new Error(
        `Safe ${ref.chainId}:${ref.address} has not been persisted.`,
      );
    return row;
  }

  private async hydrateSafe(row: SafeRow): Promise<SafeSnapshot> {
    const [ownerRows, moduleRows] = await Promise.all([
      this.db.select().from(safeOwners).where(eq(safeOwners.safeId, row.id)),
      this.db.select().from(safeModules).where(eq(safeModules.safeId, row.id)),
    ]);

    return {
      chainId: row.chainId,
      address: row.address as Address,
      owners: ownerRows.map((owner) => owner.ownerAddress as Address),
      threshold: row.threshold,
      nonce: BigInt(row.nonce),
      version: row.version,
      guard: row.guard as Address | null,
      modules: moduleRows.map((item) => item.moduleAddress as Address),
      implementation: row.implementation as Address | null,
      observedAt: asUnixTime(row.observedAt),
    };
  }

  async upsertSafe(snapshot: SafeSnapshot): Promise<void> {
    const normalizedAddress = lowerAddress(snapshot.address);
    await this.db
      .insert(safes)
      .values({
        chainId: snapshot.chainId,
        address: normalizedAddress,
        threshold: snapshot.threshold,
        nonce: snapshot.nonce.toString(),
        version: snapshot.version,
        guard: snapshot.guard ? lowerAddress(snapshot.guard) : null,
        implementation: snapshot.implementation
          ? lowerAddress(snapshot.implementation)
          : null,
        observedAt: asDate(snapshot.observedAt),
      })
      .onConflictDoUpdate({
        target: [safes.chainId, safes.address],
        set: {
          threshold: snapshot.threshold,
          nonce: snapshot.nonce.toString(),
          version: snapshot.version,
          guard: snapshot.guard ? lowerAddress(snapshot.guard) : null,
          implementation: snapshot.implementation
            ? lowerAddress(snapshot.implementation)
            : null,
          observedAt: asDate(snapshot.observedAt),
        },
      });

    const row = await this.requireSafeRow({
      chainId: snapshot.chainId,
      address: normalizedAddress,
    });
    await Promise.all([
      this.db.delete(safeOwners).where(eq(safeOwners.safeId, row.id)),
      this.db.delete(safeModules).where(eq(safeModules.safeId, row.id)),
    ]);

    if (snapshot.owners.length > 0) {
      await this.db.insert(safeOwners).values(
        snapshot.owners.map((owner) => ({
          safeId: row.id,
          ownerAddress: lowerAddress(owner),
        })),
      );
    }
    if (snapshot.modules.length > 0) {
      await this.db.insert(safeModules).values(
        snapshot.modules.map((module) => ({
          safeId: row.id,
          moduleAddress: lowerAddress(module),
        })),
      );
    }
  }

  async findSafe(ref: SafeRef): Promise<SafeSnapshot | null> {
    const row = await this.findSafeRow(ref);
    return row ? this.hydrateSafe(row) : null;
  }

  async listSafesForProfile(
    profileId: string,
  ): Promise<readonly SafeSnapshot[]> {
    const rows = await this.db
      .select({ safe: safes })
      .from(profileSafes)
      .innerJoin(safes, eq(profileSafes.safeId, safes.id))
      .where(eq(profileSafes.profileId, profileId))
      .orderBy(desc(profileSafes.createdAt));

    return Promise.all(rows.map(({ safe }) => this.hydrateSafe(safe)));
  }

  async listSafes(
    cursor: string | null,
    limit: number,
  ): Promise<Page<SafeSnapshot>> {
    const rows = await this.db
      .select()
      .from(safes)
      .where(cursor ? gt(safes.id, cursor) : undefined)
      .orderBy(asc(safes.id))
      .limit(limit + 1);
    const hasNext = rows.length > limit;
    const pageRows = hasNext ? rows.slice(0, limit) : rows;

    return {
      items: await Promise.all(pageRows.map((row) => this.hydrateSafe(row))),
      nextCursor:
        hasNext && pageRows.length > 0
          ? pageRows[pageRows.length - 1]!.id
          : null,
      total: null,
    };
  }

  async bookmarkSafe(profileId: string, safe: SafeRef): Promise<void> {
    const row = await this.requireSafeRow(safe);
    await this.db
      .insert(profiles)
      .values({ id: profileId })
      .onConflictDoNothing();
    await this.db
      .insert(profileSafes)
      .values({ profileId, safeId: row.id })
      .onConflictDoNothing();
  }

  async unbookmarkSafe(profileId: string, safe: SafeRef): Promise<void> {
    const row = await this.findSafeRow(safe);
    if (!row) return;

    await this.db
      .delete(profileSafes)
      .where(
        and(
          eq(profileSafes.profileId, profileId),
          eq(profileSafes.safeId, row.id),
        ),
      );
  }

  private async transactionFromRow(
    row: TransactionRow,
  ): Promise<SafeTransaction> {
    const [safe, confirmationRows] = await Promise.all([
      this.db.select().from(safes).where(eq(safes.id, row.safeId)).limit(1),
      this.db
        .select()
        .from(confirmations)
        .where(eq(confirmations.transactionId, row.id)),
    ]);
    const safeRow = safe[0];
    if (!safeRow)
      throw new Error(
        `Transaction ${row.safeTxHash} points to a missing Safe.`,
      );

    return {
      safe: { chainId: safeRow.chainId, address: safeRow.address as Address },
      safeTxHash: row.safeTxHash as Hex,
      nonce: BigInt(row.nonce),
      to: row.to as Address,
      value: BigInt(row.value),
      data: row.data as Hex,
      operation: row.operation,
      status: row.status,
      confirmations: confirmationRows.map((item) => ({
        owner: item.owner as Address,
        signature: item.signature as Hex,
        signedAt: item.signedAt ? asUnixTime(item.signedAt) : null,
      })),
      proposedAt: asUnixTime(row.proposedAt),
      executedAt: row.executedAt ? asUnixTime(row.executedAt) : null,
      executedTxHash: row.executedTxHash as Hex | null,
      blockNumber: row.blockNumber,
      blockHash: row.blockHash as Hex | null,
    };
  }

  async upsertTransactions(items: readonly SafeTransaction[]): Promise<void> {
    for (const item of items) {
      const safe = await this.requireSafeRow(item.safe);
      await this.db
        .insert(transactions)
        .values({
          safeId: safe.id,
          safeTxHash: item.safeTxHash,
          nonce: item.nonce.toString(),
          to: lowerAddress(item.to),
          value: item.value.toString(),
          data: item.data,
          operation: item.operation,
          status: item.status,
          proposedAt: asDate(item.proposedAt),
          executedAt: item.executedAt ? asDate(item.executedAt) : null,
          executedTxHash: item.executedTxHash,
          blockNumber: item.blockNumber,
          blockHash: item.blockHash,
        })
        .onConflictDoUpdate({
          target: [transactions.safeId, transactions.safeTxHash],
          set: {
            status: item.status,
            executedAt: item.executedAt ? asDate(item.executedAt) : null,
            executedTxHash: item.executedTxHash,
            blockNumber: item.blockNumber,
            blockHash: item.blockHash,
          },
        });

      const [transaction] = await this.db
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.safeId, safe.id),
            eq(transactions.safeTxHash, item.safeTxHash),
          ),
        )
        .limit(1);
      if (!transaction)
        throw new Error(`Could not reload transaction ${item.safeTxHash}.`);

      for (const confirmation of item.confirmations) {
        await this.db
          .insert(confirmations)
          .values({
            transactionId: transaction.id,
            owner: lowerAddress(confirmation.owner),
            signature: confirmation.signature,
            signedAt: confirmation.signedAt
              ? asDate(confirmation.signedAt)
              : null,
          })
          .onConflictDoUpdate({
            target: [confirmations.transactionId, confirmations.owner],
            set: {
              signature: confirmation.signature,
              signedAt: confirmation.signedAt
                ? asDate(confirmation.signedAt)
                : null,
            },
          });
      }
    }
  }

  async upsertModuleTransactions(
    items: readonly ModuleTransaction[],
  ): Promise<void> {
    for (const item of items) {
      const safe = await this.requireSafeRow(item.safe);
      await this.db
        .insert(moduleTransactions)
        .values({
          transactionHash: item.transactionHash,
          safeId: safe.id,
          module: lowerAddress(item.module),
          to: lowerAddress(item.to),
          value: item.value.toString(),
          data: item.data,
          operation: item.operation,
          blockNumber: item.blockNumber,
          executedAt: asDate(item.executedAt),
        })
        .onConflictDoNothing();
    }
  }

  async upsertTransfers(items: readonly TransferRecord[]): Promise<void> {
    for (const item of items) {
      const safe = await this.requireSafeRow(item.safe);
      await this.db
        .insert(rawTransfers)
        .values({
          safeId: safe.id,
          transactionHash: item.transactionHash,
          token: item.token ? lowerAddress(item.token) : null,
          from: lowerAddress(item.from),
          to: lowerAddress(item.to),
          amount: item.amount.toString(),
          blockNumber: item.blockNumber,
          timestamp: asDate(item.timestamp),
        })
        .onConflictDoNothing();
    }
  }

  async upsertMessages(items: readonly SafeMessage[]): Promise<void> {
    for (const item of items) {
      const safe = await this.requireSafeRow(item.safe);
      await this.db
        .insert(messages)
        .values({
          safeId: safe.id,
          messageHash: item.messageHash,
          payload: item.payload,
          confirmations: jsonWithBigInts(item.confirmations),
          createdAt: asDate(item.createdAt),
        })
        .onConflictDoUpdate({
          target: [messages.safeId, messages.messageHash],
          set: { confirmations: jsonWithBigInts(item.confirmations) },
        });
    }
  }

  private async messageFromRow(
    row: typeof messages.$inferSelect,
  ): Promise<SafeMessage> {
    const [safe] = await this.db
      .select()
      .from(safes)
      .where(eq(safes.id, row.safeId))
      .limit(1);
    if (!safe) {
      throw new Error(`Message ${row.messageHash} points to a missing Safe.`);
    }

    return {
      safe: { chainId: safe.chainId, address: safe.address as Address },
      messageHash: row.messageHash as Hex,
      payload: row.payload,
      confirmations: row.confirmations as SafeMessage["confirmations"],
      createdAt: asUnixTime(row.createdAt),
    };
  }

  async listMessages(
    safeRef: SafeRef,
    cursor: string | null,
    limit: number,
  ): Promise<Page<SafeMessage>> {
    const safe = await this.requireSafeRow(safeRef);
    const predicate = cursor
      ? and(
          eq(messages.safeId, safe.id),
          lt(messages.createdAt, new Date(cursor)),
        )
      : eq(messages.safeId, safe.id);
    const rows = await this.db
      .select()
      .from(messages)
      .where(predicate)
      .orderBy(desc(messages.createdAt))
      .limit(limit + 1);
    const hasNext = rows.length > limit;
    const pageRows = hasNext ? rows.slice(0, limit) : rows;

    return {
      items: await Promise.all(pageRows.map((row) => this.messageFromRow(row))),
      nextCursor:
        hasNext && pageRows.length > 0
          ? pageRows[pageRows.length - 1]!.createdAt.toISOString()
          : null,
      total: null,
    };
  }

  async findMessage(
    safeRef: SafeRef,
    messageHash: Hex,
  ): Promise<SafeMessage | null> {
    const safe = await this.findSafeRow(safeRef);
    if (!safe) return null;
    const [row] = await this.db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.safeId, safe.id),
          eq(messages.messageHash, messageHash),
        ),
      )
      .limit(1);
    return row ? this.messageFromRow(row) : null;
  }

  async listTransactions(
    safeRef: SafeRef,
    cursor: string | null,
    limit: number,
  ): Promise<Page<SafeTransaction>> {
    const safe = await this.requireSafeRow(safeRef);
    const predicate = cursor
      ? and(
          eq(transactions.safeId, safe.id),
          lt(transactions.proposedAt, new Date(cursor)),
        )
      : eq(transactions.safeId, safe.id);
    const rows = await this.db
      .select()
      .from(transactions)
      .where(predicate)
      .orderBy(desc(transactions.proposedAt))
      .limit(limit + 1);
    const hasNext = rows.length > limit;
    const pageRows = hasNext ? rows.slice(0, limit) : rows;

    return {
      items: await Promise.all(
        pageRows.map((row) => this.transactionFromRow(row)),
      ),
      nextCursor:
        hasNext && pageRows.length > 0
          ? pageRows[pageRows.length - 1]!.proposedAt.toISOString()
          : null,
      total: null,
    };
  }

  async findTransaction(
    safeRef: SafeRef,
    safeTxHash: Hex,
  ): Promise<SafeTransaction | null> {
    const safe = await this.findSafeRow(safeRef);
    if (!safe) return null;
    const [row] = await this.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.safeId, safe.id),
          eq(transactions.safeTxHash, safeTxHash),
        ),
      )
      .limit(1);
    return row ? this.transactionFromRow(row) : null;
  }

  async saveExecutionEvidence(record: ExecutionEvidenceRecord): Promise<void> {
    const safe = await this.requireSafeRow(record.safe);
    const [transaction] = await this.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.safeId, safe.id),
          eq(transactions.safeTxHash, record.safeTxHash),
        ),
      )
      .limit(1);
    if (!transaction) {
      throw new Error(
        `Cannot persist execution evidence for unknown transaction ${record.safeTxHash}.`,
      );
    }
    if (
      transaction.blockHash &&
      transaction.blockHash.toLowerCase() !== record.blockHash.toLowerCase()
    ) {
      throw new Error(
        `Execution evidence block does not match transaction ${record.safeTxHash}.`,
      );
    }

    if (!transaction.blockHash) {
      await this.db
        .update(transactions)
        .set({ blockHash: record.blockHash })
        .where(
          and(
            eq(transactions.id, transaction.id),
            isNull(transactions.blockHash),
          ),
        );
      const [anchored] = await this.db
        .select({ blockHash: transactions.blockHash })
        .from(transactions)
        .where(eq(transactions.id, transaction.id))
        .limit(1);
      if (
        anchored?.blockHash?.toLowerCase() !== record.blockHash.toLowerCase()
      ) {
        throw new Error(
          `Execution evidence block does not match transaction ${record.safeTxHash}.`,
        );
      }
    }

    await this.db
      .insert(executionEvidence)
      .values({
        transactionId: transaction.id,
        engineVersion: record.engineVersion,
        blockHash: record.blockHash,
        evidence: jsonWithBigInts(record.simulation),
        createdAt: asDate(record.createdAt),
      })
      .onConflictDoNothing({
        target: [
          executionEvidence.transactionId,
          executionEvidence.engineVersion,
          executionEvidence.blockHash,
        ],
      });
  }

  async findExecutionEvidence(
    safeRef: SafeRef,
    safeTxHash: Hex,
    engineVersion: string,
    blockHash: Hex,
  ): Promise<ExecutionEvidenceRecord | null> {
    const safe = await this.findSafeRow(safeRef);
    if (!safe) return null;

    const [row] = await this.db
      .select({
        evidence: executionEvidence.evidence,
        createdAt: executionEvidence.createdAt,
      })
      .from(executionEvidence)
      .innerJoin(
        transactions,
        eq(executionEvidence.transactionId, transactions.id),
      )
      .where(
        and(
          eq(transactions.safeId, safe.id),
          eq(transactions.safeTxHash, safeTxHash),
          eq(executionEvidence.engineVersion, engineVersion),
          eq(executionEvidence.blockHash, blockHash),
        ),
      )
      .limit(1);
    if (!row) return null;

    const simulation = mapSimulation(
      row.evidence as Record<string, unknown> | null,
    );
    return simulation
      ? {
          safe: safeRef,
          safeTxHash,
          engineVersion,
          blockHash,
          simulation,
          createdAt: asUnixTime(row.createdAt),
        }
      : null;
  }

  async saveAnalysis(result: AnalysisResult): Promise<void> {
    const [transaction] = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.safeTxHash, result.safeTxHash))
      .limit(1);
    if (!transaction)
      throw new Error(
        `Cannot persist analysis for unknown transaction ${result.safeTxHash}.`,
      );
    await this.db
      .insert(analysisResults)
      .values({
        transactionId: transaction.id,
        engineVersion: result.engineVersion,
        verdict: result.verdict,
        findings: jsonWithBigInts(result.findings),
        stateDiff: jsonWithBigInts(result.simulation?.storageChanges ?? []),
        callTree: jsonWithBigInts(result.simulation?.callTree ?? null),
        result: jsonWithBigInts(result),
      })
      .onConflictDoUpdate({
        target: [analysisResults.transactionId, analysisResults.engineVersion],
        set: {
          verdict: result.verdict,
          findings: jsonWithBigInts(result.findings),
          stateDiff: jsonWithBigInts(result.simulation?.storageChanges ?? []),
          callTree: jsonWithBigInts(result.simulation?.callTree ?? null),
          result: jsonWithBigInts(result),
        },
      });
  }

  async findAnalysis(
    safeTxHash: Hex,
    engineVersion: string,
  ): Promise<AnalysisResult | null> {
    const [row] = await this.db
      .select({ result: analysisResults.result })
      .from(analysisResults)
      .innerJoin(
        transactions,
        eq(analysisResults.transactionId, transactions.id),
      )
      .where(
        and(
          eq(transactions.safeTxHash, safeTxHash),
          eq(analysisResults.engineVersion, engineVersion),
        ),
      )
      .limit(1);
    return row ? mapAnalysis(row.result) : null;
  }

  async findAnalyses(
    safeRef: SafeRef,
    safeTxHashes: readonly Hex[],
    engineVersion: string,
  ): Promise<readonly AnalysisResult[]> {
    if (safeTxHashes.length === 0) return [];

    const safe = await this.findSafeRow(safeRef);
    if (!safe) return [];

    const rows = await this.db
      .select({ result: analysisResults.result })
      .from(analysisResults)
      .innerJoin(
        transactions,
        eq(analysisResults.transactionId, transactions.id),
      )
      .where(
        and(
          eq(transactions.safeId, safe.id),
          inArray(transactions.safeTxHash, [...safeTxHashes]),
          eq(analysisResults.engineVersion, engineVersion),
        ),
      );
    return rows.map((row) => mapAnalysis(row.result));
  }

  async saveSyncCursor(cursor: SyncCursor): Promise<void> {
    const safe = await this.requireSafeRow(cursor.safe);
    await this.db
      .insert(syncCursors)
      .values({
        safeId: safe.id,
        stream: cursor.stream,
        cursor: cursor.cursor,
        status: cursor.status,
        updatedAt: asDate(cursor.updatedAt),
      })
      .onConflictDoUpdate({
        target: [syncCursors.safeId, syncCursors.stream],
        set: {
          cursor: cursor.cursor,
          status: cursor.status,
          updatedAt: asDate(cursor.updatedAt),
        },
      });
  }

  async findSyncCursor(
    safeRef: SafeRef,
    stream: SyncCursor["stream"],
  ): Promise<SyncCursor | null> {
    const safe = await this.findSafeRow(safeRef);
    if (!safe) return null;
    const [row] = await this.db
      .select()
      .from(syncCursors)
      .where(
        and(eq(syncCursors.safeId, safe.id), eq(syncCursors.stream, stream)),
      )
      .limit(1);
    return row
      ? {
          safe: safeRef,
          stream: row.stream,
          cursor: row.cursor,
          status: row.status,
          updatedAt: asUnixTime(row.updatedAt),
        }
      : null;
  }

  async upsertContract(metadata: ContractMetadata): Promise<void> {
    await this.db
      .insert(contracts)
      .values({
        chainId: metadata.chainId,
        address: lowerAddress(metadata.address),
        label: metadata.label,
        isVerified: metadata.verified,
        implementation: metadata.implementation
          ? lowerAddress(metadata.implementation)
          : null,
        abi: jsonWithBigInts(metadata.abi),
        storageLayout: jsonWithBigInts(metadata.storageLayout),
        source: metadata.source,
      })
      .onConflictDoUpdate({
        target: [contracts.chainId, contracts.address],
        set: {
          label: metadata.label,
          isVerified: metadata.verified,
          implementation: metadata.implementation
            ? lowerAddress(metadata.implementation)
            : null,
          abi: jsonWithBigInts(metadata.abi),
          storageLayout: jsonWithBigInts(metadata.storageLayout),
          source: metadata.source,
        },
      });
  }

  private async requireProfileBookmark(
    profileId: string,
    safeId: string,
  ): Promise<void> {
    const [bookmark] = await this.db
      .select({ profileId: profileSafes.profileId })
      .from(profileSafes)
      .where(
        and(
          eq(profileSafes.profileId, profileId),
          eq(profileSafes.safeId, safeId),
        ),
      )
      .limit(1);
    if (!bookmark) {
      throw new Error("Trust records require a bookmarked Safe.");
    }
  }

  async listAddressBookEntries(
    profileId: string,
    safeRef: SafeRef,
  ): Promise<readonly AddressBookEntry[]> {
    const safe = await this.findSafeRow(safeRef);
    if (!safe) return [];

    const rows = await this.db
      .select()
      .from(profileAddressBook)
      .where(
        and(
          eq(profileAddressBook.profileId, profileId),
          eq(profileAddressBook.safeId, safe.id),
        ),
      )
      .orderBy(asc(profileAddressBook.address));

    return rows.map((row) => ({
      address: row.address as Address,
      label: row.label,
      trust: row.trustLevel,
    }));
  }

  async setAddressBookEntry(
    profileId: string,
    safeRef: SafeRef,
    entryAddress: Address,
    label: string,
    trust: "trusted" | "flagged",
  ): Promise<void> {
    const safe = await this.requireSafeRow(safeRef);
    await this.requireProfileBookmark(profileId, safe.id);
    await this.db
      .insert(profileAddressBook)
      .values({
        profileId,
        safeId: safe.id,
        address: lowerAddress(entryAddress),
        label,
        trustLevel: trust,
      })
      .onConflictDoUpdate({
        target: [
          profileAddressBook.profileId,
          profileAddressBook.safeId,
          profileAddressBook.address,
        ],
        set: { label, trustLevel: trust },
      });
  }

  async removeAddressBookEntry(
    profileId: string,
    safeRef: SafeRef,
    entryAddress: Address,
  ): Promise<void> {
    const safe = await this.findSafeRow(safeRef);
    if (!safe) return;
    await this.db
      .delete(profileAddressBook)
      .where(
        and(
          eq(profileAddressBook.profileId, profileId),
          eq(profileAddressBook.safeId, safe.id),
          eq(profileAddressBook.address, lowerAddress(entryAddress)),
        ),
      );
  }
}
