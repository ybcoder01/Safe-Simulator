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

function createDatabase() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not configured. Connect a PostgreSQL database to this project.",
    );
  }

  const client = postgres(connectionString, databaseConnectionOptions);

  return drizzle(client, { schema });
}

let database: ReturnType<typeof createDatabase> | null = null;

export function getDatabase() {
  database ??= createDatabase();
  return database;
}

export type Database = ReturnType<typeof getDatabase>;
