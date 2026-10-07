import { Router } from "express";
import {
  GetV2AdminWalletParams, ListV2TransactionsQueryParams, ListV2AdminTransactionsParams,
  AdjustV2PointsParams, AdjustV2PointsBody, DecideV2PointsParams, DecideV2PointsBody,
  CompensateV2PointsParams, CompensateV2PointsBody,
} from "@workspace/api-zod";
import { requireAccount } from "../v2/accounts";
import { pointsLedger, PointsError } from "../v2/points";

const router = Router();
const adminRoles = ["ADMIN", "SUPER_ADMIN"] as const;
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
  await requireAccount(req, adminRoles);
  const { accountId } = parse(GetV2AdminWalletParams, req.params);
  res.json(await pointsLedger.wallet(accountId));
});
router.get("/admin/accounts/:accountId/transactions", async (req, res) => {
  await requireAccount(req, adminRoles);
  const { accountId } = parse(ListV2AdminTransactionsParams, req.params);
  const query = parse(ListV2TransactionsQueryParams.strict(), req.query);
  // Explicit target lookup ensures missing account is not presented as empty history.
  await pointsLedger.wallet(accountId);
  res.json(await pointsLedger.history(accountId, query.cursor, query.limit));
});
router.post("/admin/accounts/:accountId/adjustments", async (req, res) => {
  const { userId } = await requireAccount(req, adminRoles);
  const { accountId } = parse(AdjustV2PointsParams, req.params);
  const input = parse(AdjustV2PointsBody.strict(), req.body);
  res.json(await pointsLedger.execute({ ...input, kind: "adjust", accountId, actorId: userId }));
});
router.post("/admin/transactions/:transactionId/decision", async (req, res) => {
  const { userId } = await requireAccount(req, adminRoles);
  const { transactionId } = parse(DecideV2PointsParams, req.params);
  const input = parse(DecideV2PointsBody.strict(), req.body);
  res.json(await pointsLedger.execute({ ...input, kind: "decide", transactionId, actorId: userId }));
});
router.post("/admin/transactions/:transactionId/compensation", async (req, res) => {
  const { userId } = await requireAccount(req, adminRoles);
  const { transactionId } = parse(CompensateV2PointsParams, req.params);
  const input = parse(CompensateV2PointsBody.strict(), req.body);
  res.json(await pointsLedger.execute({ ...input, kind: "compensate", transactionId, actorId: userId }));
});
export default router;
