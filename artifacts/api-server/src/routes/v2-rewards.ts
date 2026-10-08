import { Router, type IRouter } from "express";
import { GetV2RewardParams, RedeemV2RewardParams, ReviewV2RewardParams, ActionV2OrderParams } from "@workspace/api-zod";
import { requireAccount } from "../v2/accounts";
import { rewardService } from "../v2/rewards";
import { PointsError } from "../v2/points";
const router: IRouter = Router();
const roles = ["ADMIN", "SUPER_ADMIN"] as const;
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
router.get("/orders", async (req, res) => {
  res.json(await rewardService.orders((await requireAccount(req)).userId));
});
router.get("/admin/reward-suppliers", async (req, res) => {
  res.json(await rewardService.suppliers((await requireAccount(req, roles)).userId));
});
router.get("/admin/rewards", async (req, res) => {
  res.json(await rewardService.list((await requireAccount(req, roles)).userId, true));
});
router.post("/admin/rewards", async (req, res) => {
  res.status(201).json(await rewardService.create((await requireAccount(req, roles)).userId, req.body));
});
router.post("/admin/rewards/:rewardId/review", async (req, res) => {
  res.json(await rewardService.review((await requireAccount(req, roles)).userId, params(ReviewV2RewardParams, req.params).rewardId, req.body));
});
router.get("/admin/orders", async (req, res) => {
  res.json(await rewardService.orders((await requireAccount(req, roles)).userId, true));
});
router.post("/admin/orders/:orderId/action", async (req, res) => {
  res.json(await rewardService.action((await requireAccount(req, roles)).userId, params(ActionV2OrderParams, req.params).orderId, req.body));
});
router.get("/admin/rewards/reconciliation", async (req, res) => {
  res.json(await rewardService.reconcile((await requireAccount(req, roles)).userId));
});
export default router;
