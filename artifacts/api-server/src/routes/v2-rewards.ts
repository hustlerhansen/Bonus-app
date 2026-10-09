import { Router, type IRouter } from "express";
import { GetV2OrderVoucherParams, GetV2RewardParams, RedeemV2RewardParams, ReviewV2RewardParams, ActionV2OrderParams } from "@workspace/api-zod";
import { requireAccount, requireAdmin } from "../v2/accounts";
import { rewardService } from "../v2/rewards";
import { PointsError } from "../v2/points";
const router: IRouter = Router();
function params<T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new PointsError(400, "Ugyldig ID.");
  return r.data!;
}
router.get("/rewards", async (req, res) => {
  res.json(await rewardService.list((await requireAccount(req)).userId));
});
router.get("/rewards/:rewardId", async (req, res) => {
  res.json(await rewardService.detail((await requireAccount(req)).userId, params(GetV2RewardParams, req.params).rewardId));
});
router.post("/rewards/:rewardId/redeem", async (req, res) => {
  res.json(await rewardService.redeem((await requireAccount(req)).userId, params(RedeemV2RewardParams, req.params).rewardId, req.body));
});
router.get("/orders/:orderId/voucher", async (req, res) => {
  const { userId } = await requireAccount(req);
  const { orderId } = params(GetV2OrderVoucherParams, req.params);
  res.json(await rewardService.voucher(userId, orderId));
});
router.get("/orders", async (req, res) => {
  res.json(await rewardService.orders((await requireAccount(req)).userId));
});
router.get("/admin/reward-suppliers", async (req, res) => {
  res.json(await rewardService.suppliers((await requireAdmin(req)).userId));
});
router.get("/admin/rewards", async (req, res) => {
  res.json(await rewardService.list((await requireAdmin(req)).userId, true));
});
router.post("/admin/rewards", async (req, res) => {
  res.status(201).json(await rewardService.create((await requireAdmin(req)).userId, req.body));
});
router.post("/admin/rewards/:rewardId/review", async (req, res) => {
  const { userId } = await requireAdmin(req);
  // Making a reward redeemable is high-risk and goes through the approval queue.
  if (req.body?.status === "approved") {
    throw new PointsError(409, "Godkjenning er en høyrisikohandling. Send den til godkjenningskøen.", { code: "USE_APPROVAL_QUEUE", action: "REWARD_APPROVAL" });
  }
  res.json(await rewardService.review(userId, params(ReviewV2RewardParams, req.params).rewardId, req.body));
});
router.get("/admin/orders", async (req, res) => {
  res.json(await rewardService.orders((await requireAdmin(req)).userId, true));
});
router.post("/admin/orders/:orderId/action", async (req, res) => {
  res.json(await rewardService.action((await requireAdmin(req)).userId, params(ActionV2OrderParams, req.params).orderId, req.body));
});
router.get("/admin/rewards/reconciliation", async (req, res) => {
  res.json(await rewardService.reconcile((await requireAdmin(req)).userId));
});
export default router;
