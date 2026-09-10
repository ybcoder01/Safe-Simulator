import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export const databaseConnectionOptions = {
  max: 1,
  idle_timeout: 5,
  connect_timeout: 10,
  max_lifetime: 60,
  prepare: false,
} as const;

type DatabaseEnvironment = {
  [key: string]: string | undefined;
  NEON_DATABASE_URL?: string;
};

export function resolveDatabaseConnectionString(
  environment: DatabaseEnvironment = process.env,
) {
  const connectionString = environment.NEON_DATABASE_URL?.trim();

  if (!connectionString) {
    throw new Error(
      "NEON_DATABASE_URL is not configured. Connect the Neon PostgreSQL database to this project.",
    );
  }

  return connectionString;
}

function createDatabase() {
  const connectionString = resolveDatabaseConnectionString();
  const client = postgres(connectionString, databaseConnectionOptions);

  return drizzle(client, { schema });
}

let database: ReturnType<typeof createDatabase> | null = null;

export function getDatabase() {
  database ??= createDatabase();
  return database;
}

export type Database = ReturnType<typeof getDatabase>;
