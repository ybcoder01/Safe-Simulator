import { z } from "zod";

export const PROFILE_COOKIE = "safe-inspector-profile";
export const PROFILE_MAX_AGE = 60 * 60 * 24 * 365;

const profileIdSchema = z.string().uuid();

export function parseProfileId(value: string | undefined): string | null {
  const result = profileIdSchema.safeParse(value);
  return result.success ? result.data : null;
}
