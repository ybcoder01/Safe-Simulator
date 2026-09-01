import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const createdAt = timestamp("created_at", { withTimezone: true })
  .notNull()
  .defaultNow();
const address = (name: string) => varchar(name, { length: 42 });
const uint256 = (name: string) => text(name);

export const operationEnum = pgEnum("operation", ["call", "delegatecall"]);
export const transactionStatusEnum = pgEnum("transaction_status", [
  "pending",
  "executed",
  "failed",
  "replaced",
]);
export const verdictEnum = pgEnum("verdict", [
  "trusted",
  "known",
  "unverified",
  "flagged",
]);
export const syncStatusEnum = pgEnum("sync_status", [
  "idle",
  "running",
  "complete",
  "failed",
]);
export const syncStreamEnum = pgEnum("sync_stream", [
  "multisig",
  "module",
  "transfer",
  "message",
]);
export const trustLevelEnum = pgEnum("trust_level", ["trusted", "flagged"]);

export const safes = pgTable(
  "safes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chainId: integer("chain_id").notNull(),
    address: address("address").notNull(),
    threshold: integer("threshold").notNull(),
    nonce: uint256("nonce").notNull(),
    version: text("version"),
    guard: address("guard"),
    implementation: address("implementation"),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt,
  },
  (table) => [
    uniqueIndex("safes_chain_address_unique").on(table.chainId, table.address),
  ],
);

export const safeOwners = pgTable(
  "safe_owners",
  {
    safeId: uuid("safe_id")
      .notNull()
      .references(() => safes.id, { onDelete: "cascade" }),
    ownerAddress: address("owner_address").notNull(),
    addedAtBlock: bigint("added_at_block", { mode: "bigint" }),
  },
  (table) => [primaryKey({ columns: [table.safeId, table.ownerAddress] })],
);

export const safeModules = pgTable(
  "safe_modules",
  {
    safeId: uuid("safe_id")
      .notNull()
      .references(() => safes.id, { onDelete: "cascade" }),
    moduleAddress: address("module_address").notNull(),
  },
  (table) => [primaryKey({ columns: [table.safeId, table.moduleAddress] })],
);

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  createdAt,
});

export const profileSafes = pgTable(
  "profile_safes",
  {
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    safeId: uuid("safe_id")
      .notNull()
      .references(() => safes.id, { onDelete: "cascade" }),
    createdAt,
  },
  (table) => [primaryKey({ columns: [table.profileId, table.safeId] })],
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    safeId: uuid("safe_id")
      .notNull()
      .references(() => safes.id, { onDelete: "cascade" }),
    safeTxHash: varchar("safe_tx_hash", { length: 66 }).notNull(),
    nonce: uint256("nonce").notNull(),
    to: address("to").notNull(),
    value: uint256("value").notNull(),
    data: text("data").notNull(),
    operation: operationEnum("operation").notNull(),
    status: transactionStatusEnum("status").notNull(),
    proposedAt: timestamp("proposed_at", { withTimezone: true }).notNull(),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    executedTxHash: varchar("executed_tx_hash", { length: 66 }),
    blockNumber: bigint("block_number", { mode: "bigint" }),
    blockHash: varchar("block_hash", { length: 66 }),
    createdAt,
  },
  (table) => [
    uniqueIndex("transactions_safe_hash_unique").on(
      table.safeId,
      table.safeTxHash,
    ),
    index("transactions_safe_nonce_idx").on(table.safeId, table.nonce),
  ],
);

export const confirmations = pgTable(
  "confirmations",
  {
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    owner: address("owner").notNull(),
    signature: text("signature").notNull(),
    signedAt: timestamp("signed_at", { withTimezone: true }),
  },
  (table) => [primaryKey({ columns: [table.transactionId, table.owner] })],
);

export const moduleTransactions = pgTable("module_transactions", {
  transactionHash: varchar("transaction_hash", { length: 66 }).primaryKey(),
  safeId: uuid("safe_id")
    .notNull()
    .references(() => safes.id, { onDelete: "cascade" }),
  module: address("module").notNull(),
  to: address("to").notNull(),
  value: uint256("value").notNull(),
  data: text("data").notNull(),
  operation: operationEnum("operation").notNull(),
  blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
  executedAt: timestamp("executed_at", { withTimezone: true }).notNull(),
});

export const moduleAnalysisResults = pgTable(
  "module_analysis_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionHash: varchar("transaction_hash", { length: 66 })
      .notNull()
      .references(() => moduleTransactions.transactionHash, {
        onDelete: "cascade",
      }),
    engineVersion: text("engine_version").notNull(),
    verdict: verdictEnum("verdict").notNull(),
    findings: jsonb("findings").notNull(),
    result: jsonb("result").notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("module_analysis_transaction_version_unique").on(
      table.transactionHash,
      table.engineVersion,
    ),
  ],
);

export const rawTransfers = pgTable(
  "raw_transfers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    safeId: uuid("safe_id")
      .notNull()
      .references(() => safes.id, { onDelete: "cascade" }),
    transactionHash: varchar("transaction_hash", { length: 66 }).notNull(),
    token: address("token"),
    from: address("from").notNull(),
    to: address("to").notNull(),
    amount: uint256("amount").notNull(),
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("raw_transfers_identity_unique").on(
      table.safeId,
      table.transactionHash,
      table.token,
      table.from,
      table.to,
      table.amount,
    ),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    safeId: uuid("safe_id")
      .notNull()
      .references(() => safes.id, { onDelete: "cascade" }),
    messageHash: varchar("message_hash", { length: 66 }).notNull(),
    payload: text("payload").notNull(),
    confirmations: jsonb("confirmations")
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("messages_safe_hash_unique").on(
      table.safeId,
      table.messageHash,
    ),
  ],
);

export const analysisResults = pgTable(
  "analysis_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    engineVersion: text("engine_version").notNull(),
    verdict: verdictEnum("verdict").notNull(),
    findings: jsonb("findings").notNull(),
    stateDiff: jsonb("state_diff").notNull(),
    callTree: jsonb("call_tree"),
    result: jsonb("result").notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("analysis_transaction_version_unique").on(
      table.transactionId,
      table.engineVersion,
    ),
  ],
);

export const executionEvidence = pgTable(
  "execution_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    engineVersion: text("engine_version").notNull(),
    blockHash: varchar("block_hash", { length: 66 }).notNull(),
    evidence: jsonb("evidence").notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("execution_evidence_transaction_version_block_unique").on(
      table.transactionId,
      table.engineVersion,
      table.blockHash,
    ),
  ],
);

export const tokenTransfers = pgTable("token_transfers", {
  id: uuid("id").primaryKey().defaultRandom(),
  transactionId: uuid("transaction_id")
    .notNull()
    .references(() => transactions.id, { onDelete: "cascade" }),
  token: address("token").notNull(),
  from: address("from").notNull(),
  to: address("to").notNull(),
  amount: uint256("amount").notNull(),
  direction: text("direction").notNull(),
});

export const approvals = pgTable("approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  transactionId: uuid("transaction_id")
    .notNull()
    .references(() => transactions.id, { onDelete: "cascade" }),
  token: address("token").notNull(),
  spender: address("spender").notNull(),
  amount: uint256("amount").notNull(),
  isInfinite: boolean("is_infinite").notNull(),
  method: text("method").notNull(),
});

export const contracts = pgTable(
  "contracts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chainId: integer("chain_id").notNull(),
    address: address("address").notNull(),
    label: text("label"),
    isVerified: boolean("is_verified").notNull().default(false),
    implementation: address("implementation"),
    abi: jsonb("abi"),
    storageLayout: jsonb("storage_layout"),
    source: text("source").notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("contracts_chain_address_unique").on(
      table.chainId,
      table.address,
    ),
  ],
);

export const addressBook = pgTable(
  "address_book",
  {
    safeId: uuid("safe_id")
      .notNull()
      .references(() => safes.id, { onDelete: "cascade" }),
    address: address("address").notNull(),
    label: text("label").notNull(),
    trustLevel: trustLevelEnum("trust_level").notNull(),
    createdAt,
  },
  (table) => [primaryKey({ columns: [table.safeId, table.address] })],
);

export const profileAddressBook = pgTable(
  "profile_address_book",
  {
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    safeId: uuid("safe_id")
      .notNull()
      .references(() => safes.id, { onDelete: "cascade" }),
    address: address("address").notNull(),
    label: text("label").notNull(),
    trustLevel: trustLevelEnum("trust_level").notNull(),
    createdAt,
  },
  (table) => [
    primaryKey({
      columns: [table.profileId, table.safeId, table.address],
    }),
  ],
);

export const syncCursors = pgTable(
  "sync_cursors",
  {
    safeId: uuid("safe_id")
      .notNull()
      .references(() => safes.id, { onDelete: "cascade" }),
    stream: syncStreamEnum("stream").notNull(),
    cursor: text("cursor"),
    status: syncStatusEnum("status").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.safeId, table.stream] })],
);
