import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import pg from "pg";

if (!process.argv.includes("--development")) {
  throw new Error("Explicit --development required. Production migrations require a reviewed release procedure.");
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(20761008)");
  await client.query(`CREATE TABLE IF NOT EXISTS bonusplay_schema_migrations
    (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
  const dir = new URL("./migrations/", import.meta.url);
  for (const name of (await readdir(dir)).filter(n => n.endsWith(".sql")).sort()) {
    const sql = await readFile(new URL(name, dir), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const existing = await client.query("SELECT checksum FROM bonusplay_schema_migrations WHERE name=$1", [name]);
    if (existing.rowCount) {
      if (existing.rows[0].checksum !== checksum) throw new Error(`Applied migration changed: ${name}`);
      console.log(`Already applied: ${name}`);
      continue;
    }
    await client.query(sql);
    await client.query("INSERT INTO bonusplay_schema_migrations(name,checksum) VALUES($1,$2)", [name, checksum]);
    console.log(`Applied: ${name}`);
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
