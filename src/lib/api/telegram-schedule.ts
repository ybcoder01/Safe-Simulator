import { createHash } from "node:crypto";

export const TELEGRAM_SWEEP_CRON = "*/2 * * * *";
export const TELEGRAM_SWEEP_SCHEDULE_ID = "telegram-watch-shared-v1";

export function legacyTelegramWatchScheduleId(
  chainId: number,
  address: string,
): string {
  const digest = createHash("sha256")
    .update(`telegram-watch:${chainId}:${address.toLowerCase()}`)
    .digest("hex");
  return `telegram-watch-${digest}`;
}
