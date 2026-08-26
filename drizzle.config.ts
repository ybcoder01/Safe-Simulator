import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run Drizzle migrations.");
}

export default defineConfig({
  dialect: "postgresql",
  out: "./drizzle",
  schema: "./src/adapters/db-drizzle/schema.ts",
  dbCredentials: { url: process.env.DATABASE_URL },
  strict: true,
  verbose: true,
});
