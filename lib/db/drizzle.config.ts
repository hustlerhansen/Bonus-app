// Not used for schema changes: `pnpm --filter @workspace/db run migrate:dev` applies reviewed SQL migrations.
// Running drizzle-kit push against a V2 database would try to drop migration-owned sequences.
import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  // Demo tables only. V2 schema files are typed views of migration-owned tables.
  schema: ["users", "wallet", "catalog", "activity", "redemptions", "admin", "progress"]
    .map(name => path.join(__dirname, `./src/schema/${name}.ts`)),
  dialect: "postgresql",
  // V2 tables (triggers, CHECKs, append-only history) are owned by the reviewed SQL
  // migrations in ./migrations. `push` must never see, alter or drop them.
  tablesFilter: ["!v2_*", "!bonusplay_schema_migrations"],
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
