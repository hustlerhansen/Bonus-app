import express, { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import { ReceiveV2OfferCallbackParams } from "@workspace/api-zod";
import { offerService } from "../v2/offers";
import { PointsError } from "../v2/points";

// Dedicated server-to-server boundary, before JSON parser and Clerk middleware.
// No browser session, Origin exemption elsewhere, or demo-provider shortcut.
const router: IRouter = Router();
router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.removeHeader("Access-Control-Allow-Origin");
  res.removeHeader("Access-Control-Allow-Credentials");
  next();
});
router.use(rateLimit({
  windowMs: 60_000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false,
  message: { error: "For mange partnerforespørsler." },
}));
router.post("/:partnerId", express.raw({ type: "application/json", limit: "16kb" }), async (req, res) => {
  const params = ReceiveV2OfferCallbackParams.safeParse(req.params);
  if (!params.success || !Buffer.isBuffer(req.body)) throw new PointsError(400, "Ugyldig partner eller innholdstype.");
  res.json(await offerService.callback(params.data.partnerId, req.body, {
    timestamp: req.get("X-BP-Timestamp"), nonce: req.get("X-BP-Nonce"), signature: req.get("X-BP-Signature"),
  }));
});
export default router;
