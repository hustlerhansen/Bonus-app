import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import { pool } from "@workspace/db";
import { EnrollV2AccountBody, UpdateV2AccountBody } from "@workspace/api-zod";
import { authenticated, accountState, enroll, requireAccount, updateProfile } from "../v2/accounts";
import { isSafeMutation } from "../v2/access-policy";
import { getClerkProxyHost } from "../middlewares/clerkProxyMiddleware";

const router: IRouter = Router();
router.use("/v2", rateLimit({
  windowMs: 60_000, limit: 90, standardHeaders: "draft-8", legacyHeaders: false,
  message: { error: "For mange forespørsler. Prøv igjen om ett minutt." },
}));
router.use("/v2", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  // V2 is same-origin only. Global legacy CORS headers cannot open V2 data.
  res.removeHeader("Access-Control-Allow-Origin");
  res.removeHeader("Access-Control-Allow-Credentials");
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !isSafeMutation({
    origin: req.get("origin"), host: getClerkProxyHost(req) ?? req.get("host"),
    fetchSite: req.get("sec-fetch-site"),
  })) {
    res.status(403).json({ error: "Ugyldig opprinnelse. Bruk skjemaet på BONUSPLAY-nettsiden." });
    return;
  }
  next();
});

router.get("/v2/me", async (req, res) => {
  const identity = authenticated(req);
  await pool.query(`UPDATE v2_accounts SET last_login_at=now(),last_session_id=$2
    WHERE id=$1 AND last_session_id<>$2`, [identity.userId, identity.sessionId]);
  const state = await accountState(identity.userId);
  if (state.account?.status && state.account.status !== "ACTIVE") {
    res.status(403).json({ error: "Kontoen er ikke aktiv. Kontakt support." });
    return;
  }
  res.json(state);
});

router.post("/v2/enroll", async (req, res) => {
  authenticated(req);
  const input = EnrollV2AccountBody.strict().safeParse(req.body);
  if (!input.success || !input.data.firstName.trim() || !input.data.lastName.trim()) {
    res.status(400).json({ error: "Kontroller navn, land, alder og samtykker." });
    return;
  }
  res.status(201).json(await enroll(req, input.data));
});

router.patch("/v2/me", async (req, res) => {
  authenticated(req);
  const input = UpdateV2AccountBody.strict().safeParse(req.body);
  if (!input.success || !input.data.firstName.trim() || !input.data.lastName.trim()) {
    res.status(400).json({ error: "Kontroller profilfeltene. Rolle og saldo kan ikke endres her." });
    return;
  }
  res.json(await updateProfile(req, input.data));
});
router.get("/v2/admin/access", async (req, res) => {
  const identity = await requireAccount(req, ["ADMIN", "SUPER_ADMIN"]);
  res.json({ ok: true, role: identity.account.role });
});
router.get("/v2/partner/access", async (req, res) => {
  const identity = await requireAccount(req, ["PARTNER"]);
  res.json({ ok: true, role: identity.account.role });
});
export default router;
