import type { Address, ChainId, SafeSnapshot } from "../domain";
import { enqueueSafeSync } from "../ingestion/backfill";
import type { ChainPort, PersistencePort, QueuePort } from "../ports";

type ImportPersistence = Pick<PersistencePort, "bookmarkSafe" | "upsertSafe">;

export type SafeImportErrorCode =
  | "not_contract"
  | "not_safe"
  | "invalid_safe_configuration";

export class SafeImportError extends Error {
  constructor(
    readonly code: SafeImportErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "SafeImportError";
  }
}

export class ImportSafeService {
  constructor(
    private readonly chain: ChainPort,
    private readonly persistence: ImportPersistence,
    private readonly queue: QueuePort,
  ) {}

  async execute(input: {
    chainId: ChainId;
    address: Address;
    profileId: string;
  }): Promise<SafeSnapshot> {
    const safeRef = { chainId: input.chainId, address: input.address } as const;
    const code = await this.chain.getCode(input.chainId, input.address);

    if (code === "0x") {
      throw new SafeImportError(
        "not_contract",
        "The address has no deployed contract code on this chain.",
      );
    }

    let snapshot: SafeSnapshot;
    try {
      snapshot = await this.chain.getSafeSnapshot(safeRef);
    } catch (cause) {
      throw new SafeImportError(
        "not_safe",
        "The contract does not expose the required Safe owner, threshold, and nonce reads.",
        { cause },
      );
    }

    if (
      snapshot.owners.length === 0 ||
      snapshot.threshold < 1 ||
      snapshot.threshold > snapshot.owners.length
    ) {
      throw new SafeImportError(
        "invalid_safe_configuration",
        "The contract returned an invalid Safe owner/threshold configuration.",
      );
    }

    await this.persistence.upsertSafe(snapshot);
    await this.persistence.bookmarkSafe(input.profileId, safeRef);
    await enqueueSafeSync(safeRef, this.queue, "import");
    return snapshot;
  }
}
