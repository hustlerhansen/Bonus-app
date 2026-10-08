import { build } from "esbuild";
import { mkdir } from "node:fs/promises";

// Operator-only process using the configured database. No HTTP route, mutation or schema DDL.
// Bundle TS with the same resolver as the server; keep startup/import failures sanitized as well.
let pool;
try {
  const out = new URL("../.cache/points-reconciliation-cli.mjs", import.meta.url);
  await mkdir(new URL("../.cache/", import.meta.url), { recursive: true });
  await build({
    stdin: { contents: 'export { createPointsReconciler } from "./src/v2/points-reconciliation"; export { pool } from "@workspace/db";',
      resolveDir: new URL("../", import.meta.url).pathname, loader: "ts" },
    outfile: out.pathname, bundle: true, platform: "node", format: "esm", logLevel: "silent",
    external: ["pg-native"],
    banner: { js: "import {createRequire} from 'node:module'; const require=createRequire(import.meta.url);" },
  });
  const module = await import(out.href);
  pool = module.pool;
  const report = await module.createPointsReconciler()();
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.requiresOperatorReview ? 2 : 0;
} catch {
  console.error(JSON.stringify({ code: "POINTS_RECONCILIATION_FAILED", requiresOperatorReview: true }));
  process.exitCode = 1;
} finally {
  if (pool) await pool.end();
}
