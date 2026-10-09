import { Router } from "express";
import {
  GetV2AdminWalletParams, ListV2TransactionsQueryParams, ListV2AdminTransactionsParams,
  AdjustV2PointsParams, AdjustV2PointsBody, DecideV2PointsParams, DecideV2PointsBody,
  CompensateV2PointsParams, CompensateV2PointsBody,
} from "@workspace/api-zod";
import { requireAccount, requireAdmin } from "../v2/accounts";
import { pointsLedger, PointsError } from "../v2/points";
import { adminRequests } from "../v2/admin-requests";

const router = Router();
// Validation errors stay deliberate 400s, not generic application errors.
function parse<T>(schema: { safeParse: (input: unknown) => { success: boolean; data?: T } }, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new PointsError(400, "Kontroller feltene i forespørselen.");
  return result.data!;
}
router.get("/wallet", async (req, res) => {
  const { userId } = await requireAccount(req);
  res.json(await pointsLedger.wallet(userId));
});
router.get("/transactions", async (req, res) => {
  const { userId } = await requireAccount(req);
  const query = parse(ListV2TransactionsQueryParams.strict(), req.query);
  res.json(await pointsLedger.history(userId, query.cursor, query.limit));
});
router.get("/admin/accounts/:accountId/wallet", async (req, res) => {
  await requireAdmin(req);
  const { accountId } = parse(GetV2AdminWalletParams, req.params);
  res.json(await pointsLedger.wallet(accountId));
});
router.get("/admin/accounts/:accountId/transactions", async (req, res) => {
  await requireAdmin(req);
  const { accountId } = parse(ListV2AdminTransactionsParams, req.params);
  const query = parse(ListV2TransactionsQueryParams.strict(), req.query);
  // Explicit target lookup ensures missing account is not presented as empty history.
  await pointsLedger.wallet(accountId);
  res.json(await pointsLedger.history(accountId, query.cursor, query.limit));
});
router.post("/admin/accounts/:accountId/adjustments", async (req, res) => {
  const { userId } = await requireAdmin(req);
  const { accountId } = parse(AdjustV2PointsParams, req.params);
  const input = parse(AdjustV2PointsBody.strict(), req.body);
  // High-risk: recorded now, executed only after cooldown and an MFA-verified confirmation.
  res.status(202).json(await adminRequests.request(userId, { action: "POINTS_ADJUSTMENT",
    payload: { accountId, amount: input.amount }, reason: input.reason, requestKey: input.idempotencyKey }));
});
router.post("/admin/transactions/:transactionId/decision", async (req, res) => {
  const { userId } = await requireAdmin(req);
  const { transactionId } = parse(DecideV2PointsParams, req.params);
  const input = parse(DecideV2PointsBody.strict(), req.body);
  res.status(202).json(await adminRequests.request(userId, { action: "POINTS_DECISION",
    payload: { transactionId, status: input.status }, reason: input.reason, requestKey: input.idempotencyKey }));
});
router.post("/admin/transactions/:transactionId/compensation", async (req, res) => {
  const { userId } = await requireAdmin(req);
  const { transactionId } = parse(CompensateV2PointsParams, req.params);
  const input = parse(CompensateV2PointsBody.strict(), req.body);
  res.status(202).json(await adminRequests.request(userId, { action: "POINTS_COMPENSATION",
    payload: { transactionId, type: input.type }, reason: input.reason, requestKey: input.idempotencyKey }));
});
export default router;
