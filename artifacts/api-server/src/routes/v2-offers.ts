import { Router, type IRouter } from "express";
import { GetV2OfferParams, ReviewV2OfferParams, StartV2OfferParams, ReviewV2ConversionParams } from "@workspace/api-zod";
import { requireAccount } from "../v2/accounts";
import { offerService } from "../v2/offers";
import { PointsError } from "../v2/points";

const router: IRouter = Router();
const adminRoles = ["ADMIN", "SUPER_ADMIN"] as const;
function parse<T>(schema: { safeParse: (value: unknown) => { success: boolean; data?: T } }, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new PointsError(400, "Ugyldig ID.");
  return result.data!;
}
router.get("/offers", async (req, res) => {
  const { userId } = await requireAccount(req);
  res.json(await offerService.listOffers(userId));
});
router.get("/offers/:offerId", async (req, res) => {
  const { userId } = await requireAccount(req);
  const { offerId } = parse(GetV2OfferParams, req.params);
  res.json(await offerService.detail(userId, offerId));
});
router.post("/offers/:offerId/start", async (req, res) => {
  const { userId } = await requireAccount(req);
  const { offerId } = parse(StartV2OfferParams, req.params);
  res.json(await offerService.start(userId, offerId, req.body));
});
router.get("/conversions", async (req, res) => {
  const { userId } = await requireAccount(req);
  res.json(await offerService.listConversions(userId));
});
router.get("/admin/offer-partners", async (req, res) => {
  const { userId } = await requireAccount(req, adminRoles);
  res.json(await offerService.partners(userId));
});
router.get("/admin/offers", async (req, res) => {
  const { userId } = await requireAccount(req, adminRoles);
  res.json(await offerService.listOffers(userId, true));
});
router.post("/admin/offers", async (req, res) => {
  const { userId } = await requireAccount(req, adminRoles);
  res.status(201).json(await offerService.create(userId, req.body));
});
router.post("/admin/offers/:offerId/review", async (req, res) => {
  const { userId } = await requireAccount(req, adminRoles);
  const { offerId } = parse(ReviewV2OfferParams, req.params);
  res.json(await offerService.reviewOffer(userId, offerId, req.body));
});
router.get("/admin/conversions", async (req, res) => {
  const { userId } = await requireAccount(req, adminRoles);
  res.json(await offerService.listConversions(userId, true));
});
router.post("/admin/conversions/:conversionId/review", async (req, res) => {
  const { userId } = await requireAccount(req, adminRoles);
  const { conversionId } = parse(ReviewV2ConversionParams, req.params);
  res.json(await offerService.reviewConversion(userId, conversionId, req.body));
});
export default router;
