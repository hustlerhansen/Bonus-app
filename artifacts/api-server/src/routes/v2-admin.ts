import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { ListV2AdminRequestsQueryParams, ListV2AdminAuditQueryParams, ConfirmV2AdminRequestParams, RejectV2AdminRequestParams } from "@workspace/api-zod";
import { requireAdmin } from "../v2/accounts";
import { adminRequests } from "../v2/admin-requests";
import { currentEconomy } from "../v2/economy";
import { PointsError } from "../v2/points";

const router: IRouter = Router();
function parse<T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new PointsError(400, "Kontroller feltene i forespørselen.");
  return r.data!;
}

router.get("/admin/requests", async (req, res) => {
  const { userId } = await requireAdmin(req);
  const q = parse(ListV2AdminRequestsQueryParams.strict(), req.query);
  res.json(await adminRequests.list(userId, q.status));
});
router.post("/admin/requests", async (req, res) => {
  const { userId } = await requireAdmin(req);
  res.status(202).json(await adminRequests.request(userId, req.body));
});
router.post("/admin/requests/:requestId/confirm", async (req, res) => {
  // Executing a high-risk action requires a freshly verified second factor.
  const { userId } = await requireAdmin(req, { strict: true });
  const { requestId } = parse(ConfirmV2AdminRequestParams, req.params);
  res.json(await adminRequests.confirm(userId, requestId));
});
router.post("/admin/requests/:requestId/reject", async (req, res) => {
  const { userId } = await requireAdmin(req);
  const { requestId } = parse(RejectV2AdminRequestParams, req.params);
  res.json(await adminRequests.reject(userId, requestId, req.body));
});

router.get("/admin/economy", async (req, res) => {
  await requireAdmin(req);
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const config = await currentEconomy(client);
    const totals = (await client.query(`SELECT COALESCE(sum(delta),0)::bigint AS balance,COALESCE(sum(reserved_delta),0)::bigint AS reserved
      FROM v2_points_events`)).rows[0];
    const pending = (await client.query(`SELECT COALESCE(sum(t.amount),0)::bigint AS pending FROM v2_points_transactions t
      JOIN LATERAL (SELECT status FROM v2_points_events WHERE transaction_id=t.id ORDER BY sequence DESC LIMIT 1) s ON true
      WHERE s.status='pending' AND t.amount>0`)).rows[0];
    const admins = (await client.query(`SELECT count(*)::int AS n FROM v2_accounts WHERE role IN ('ADMIN','SUPER_ADMIN') AND status='ACTIVE'`)).rows[0];
    await client.query("COMMIT");
    const balance = Number(totals.balance), reserved = Number(totals.reserved), pendingCredit = Number(pending.pending);
    res.json({ config, admins: admins.n, liability: {
      balancePoints: balance, reservedPoints: reserved, availablePoints: balance - reserved, pendingCreditPoints: pendingCredit,
      balanceNok: balance / config.pointsPerNok, pendingCreditNok: pendingCredit / config.pointsPerNok,
    } });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
});

router.get("/admin/audit", async (req, res) => {
  await requireAdmin(req);
  const q = parse(ListV2AdminAuditQueryParams.strict(), req.query);
  const limit = q.limit ?? 50;
  const before = q.before ? new Date(q.before) : null;
  if (before && Number.isNaN(before.getTime())) throw new PointsError(400, "Ugyldig tidspunkt.");
  const rows = (await pool.query(`SELECT id,actor_id AS "actorId",actor_role AS "actorRole",action,entity_type AS "entityType",
    entity_id AS "entityId",metadata,created_at AS "createdAt" FROM v2_audit_logs
    WHERE ($1::timestamptz IS NULL OR created_at<$1) ORDER BY created_at DESC,id DESC LIMIT $2`, [before, limit + 1])).rows;
  const items = rows.slice(0, limit).map(r => ({ ...r, createdAt: (r.createdAt as Date).toISOString() }));
  res.json({ items, nextBefore: rows.length > limit ? items[items.length - 1].createdAt : null });
});

export default router;
