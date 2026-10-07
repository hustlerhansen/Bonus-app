import pg from "pg";
import { randomUUID } from "node:crypto";

// Operator-only tool, never an HTTP endpoint. No first-account promotion.
const args = process.argv.slice(2);
const value = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const accountId = value("--account");
const role = value("--role");
const reason = value("--reason");
const operator = value("--operator");
if (!args.includes("--development") || !args.includes("--confirm") ||
    !accountId?.startsWith("user_") || !["USER", "PARTNER", "ADMIN", "SUPER_ADMIN"].includes(role) ||
    !reason || reason.trim().length < 10 || reason.length > 500 || !operator || operator.length > 120) {
  throw new Error("Requires --development --confirm --account <Clerk user ID> --role <role> --reason <10-500 chars> --operator <operator reference>. Never include secrets.");
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const result = await client.query("SELECT role,status,email_verified_at FROM v2_accounts WHERE id=$1 FOR UPDATE", [accountId]);
  const account = result.rows[0];
  if (!account || account.status !== "ACTIVE" || !account.email_verified_at) {
    throw new Error("Only an enrolled, active, verified account can be provisioned.");
  }
  if (account.role !== role) {
    await client.query("UPDATE v2_accounts SET role=$2 WHERE id=$1", [accountId, role]);
    await client.query(`INSERT INTO v2_audit_logs(id,actor_id,actor_role,action,entity_type,entity_id,metadata)
      VALUES($1,$2,'OPERATOR','ROLE_PROVISIONED','ACCOUNT',$3,$4)`,
      [randomUUID(), `operator:${operator}`, accountId, JSON.stringify({ before: { role: account.role }, after: { role }, reason: reason.trim() })]);
  }
  await client.query("COMMIT");
  console.log("Role provisioning committed for the selected development database.");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
