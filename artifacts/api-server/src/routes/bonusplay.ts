import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request } from "express";
import { eq, and } from "drizzle-orm";
import { db, activitiesTable, featureFlagsTable, auditLogsTable, analyticsEventsTable, notificationReadsTable } from "@workspace/db";
import {
  StartDemoSessionBody, StartDemoSessionResponse, EndDemoSessionResponse,
  GetBonusplayStateResponse, ClaimActivityBody, ClaimActivityResponse, ClaimDailyRewardResponse,
  CreateRedemptionBody, CreateRedemptionResponse, ResetDemoResponse,
  UpdateFeatureFlagParams, UpdateFeatureFlagBody, UpdateFeatureFlagResponse,
  UpdateMissionParams, UpdateMissionBody, UpdateMissionResponse, GetAdminDashboardResponse,
  GetAdminCatalogResponse, CreateCatalogItemBody, CreateCatalogItemResponse,
  UpdateCatalogItemParams, UpdateCatalogItemBody, UpdateCatalogItemResponse,
  MarkNotificationsReadBody, MarkNotificationsReadResponse, RecordAnalyticsEventBody, RecordAnalyticsEventResponse,
} from "@workspace/api-zod";
import { readSession, startSession, endSession, type DemoIdentity } from "../bonusplay/session";
import { createDemoUser } from "../bonusplay/seed";
import { getState, claimActivity, claimDaily, redeem, resetAccount, adminDashboard, DemoError } from "../bonusplay/service";
import { getCatalog, createItem, updateItem } from "../bonusplay/admin-catalog";
import { getAuth } from "@clerk/express";
import { pool } from "@workspace/db";
import { demoAccess } from "../v2/demo-access";

const router: IRouter = Router();
const limits = new Map<string, { since: number; count: number }>();
router.use("/bonusplay", (req, res, next) => {
  if (process.env.DEMO_MODE !== "true") {
    res.status(403).json({ error: "Demomodusen er deaktivert. Ekte innlogging og leverandører må konfigureres før lansering." });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    if (req.get("sec-fetch-site") === "cross-site") { res.status(403).json({ error: "Ugyldig forespørsel." }); return; }
    const key = `${req.ip}:${readSession(req)?.userId ?? "login"}`;
    const now = Date.now();
    const limit = limits.get(key);
    if (!limit || now - limit.since >= 60000) limits.set(key, { since: now, count: 1 });
    else if (++limit.count > 60) { res.status(429).json({ error: "For mange forespørsler. Prøv igjen om ett minutt." }); return; }
    if (limits.size > 1000) for (const [id, item] of limits) if (now - item.since > 60000) limits.delete(id);
  }
  next();
});

// Private demo: a valid signed demo cookie AND the same signed-in Clerk tester who is still on the list.
async function identity(req: Request, admin = false): Promise<DemoIdentity> {
  const session = readSession(req);
  if (!session || (admin && session.role !== "admin")) throw new DemoError(401, admin ? "Logg inn som demoadministrator for å fortsette." : "Logg inn i testversjonen for å fortsette.");
  if (getAuth(req).userId !== session.testerId) throw new DemoError(401, "Logg inn med testerkontoen din for å bruke testversjonen.");
  const access = await demoAccess(pool, session.testerId);
  if (!access.tester || (session.role === "admin" && !access.canAdmin)) throw new DemoError(401, "Du har ikke lenger tilgang til testversjonen.");
  return session;
}

router.post("/bonusplay/demo-session", async (req, res): Promise<void> => {
  const input = StartDemoSessionBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Velg en gyldig demorolle." }); return; }
  const testerId = getAuth(req).userId;
  if (!testerId) { res.status(401).json({ error: "Testversjonen er privat. Logg inn med en testerkonto." }); return; }
  const access = await demoAccess(pool, testerId);
  if (!access.tester) { res.status(403).json({ error: "Kontoen din har ikke tilgang til testversjonen." }); return; }
  if (input.data.role === "admin" && !access.canAdmin) { res.status(403).json({ error: "Kontoen din har ikke tilgang til demoadministrasjon." }); return; }
  const session = startSession(req, res, input.data.role, testerId);
  await createDemoUser(session.userId);
  await db.insert(analyticsEventsTable).values({ id: randomUUID(), userId: session.userId, event: "login", sourceId: session.role });
  res.json(StartDemoSessionResponse.parse({ role: session.role, displayName: "Magnar" }));
});
router.post("/bonusplay/logout", async (req, res): Promise<void> => {
  endSession(req, res);
  res.json(EndDemoSessionResponse.parse({ ok: true }));
});
router.get("/bonusplay/state", async (req, res): Promise<void> => {
  res.json(GetBonusplayStateResponse.parse(await getState((await identity(req)))));
});
router.post("/bonusplay/claims", async (req, res): Promise<void> => {
  const session = (await identity(req));
  const input = ClaimActivityBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Ugyldig aktivitet eller forespørsels-ID." }); return; }
  res.json(ClaimActivityResponse.parse(await claimActivity(session, input.data.activityId, input.data.idempotencyKey)));
});
router.post("/bonusplay/daily-reward", async (req, res): Promise<void> => {
  res.json(ClaimDailyRewardResponse.parse(await claimDaily((await identity(req)))));
});
router.post("/bonusplay/redemptions", async (req, res): Promise<void> => {
  const session = (await identity(req));
  const input = CreateRedemptionBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Ugyldig demobelønning." }); return; }
  res.status(201).json(CreateRedemptionResponse.parse(await redeem(session, input.data.rewardId, input.data.idempotencyKey)));
});
router.post("/bonusplay/reset", async (req, res): Promise<void> => {
  res.json(ResetDemoResponse.parse(await resetAccount((await identity(req)))));
});
router.patch("/bonusplay/features/:key", async (req, res): Promise<void> => {
  const session = (await identity(req, true));
  const params = UpdateFeatureFlagParams.safeParse(req.params);
  const input = UpdateFeatureFlagBody.safeParse(req.body);
  if (!params.success || !input.success) { res.status(400).json({ error: "Ugyldig funksjonsinnstilling." }); return; }
  const [flag] = await db.update(featureFlagsTable).set(input.data).where(eq(featureFlagsTable.key, params.data.key)).returning();
  await db.insert(auditLogsTable).values({ id: randomUUID(), actor: session.userId, action: `FEATURE_${input.data.enabled ? "ENABLED" : "DISABLED"}`, sourceId: params.data.key });
  res.json(UpdateFeatureFlagResponse.parse(flag));
});
router.patch("/bonusplay/missions/:id", async (req, res): Promise<void> => {
  const session = (await identity(req, true));
  const params = UpdateMissionParams.safeParse(req.params);
  const input = UpdateMissionBody.safeParse(req.body);
  if (!params.success || !input.success || !Object.keys(input.data).length) { res.status(400).json({ error: "Ugyldig oppgaveinnstilling." }); return; }
  const [mission] = await db.update(activitiesTable).set(input.data).where(and(eq(activitiesTable.id, params.data.id), eq(activitiesTable.category, "mission"))).returning();
  if (!mission) { res.status(404).json({ error: "Oppgaven finnes ikke." }); return; }
  if (mission.id === "mission-referral") await db.update(activitiesTable).set(input.data).where(eq(activitiesTable.id, "referral-active"));
  await db.insert(auditLogsTable).values({ id: randomUUID(), actor: session.userId, action: "MISSION_UPDATED", sourceId: params.data.id });
  res.json(UpdateMissionResponse.parse({ ...mission, completed: false }));
});
router.get("/bonusplay/admin", async (req, res): Promise<void> => {
  res.json(GetAdminDashboardResponse.parse(await adminDashboard((await identity(req, true)))));
});
router.get("/bonusplay/admin/catalog", async (req, res): Promise<void> => {
  (await identity(req, true));
  res.json(GetAdminCatalogResponse.parse(await getCatalog()));
});
router.post("/bonusplay/admin/catalog", async (req, res): Promise<void> => {
  const session = (await identity(req, true));
  const input = CreateCatalogItemBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Kontroller feltene i skjemaet." }); return; }
  res.status(201).json(CreateCatalogItemResponse.parse(await createItem(session, input.data)));
});
router.patch("/bonusplay/admin/catalog/:id", async (req, res): Promise<void> => {
  const session = (await identity(req, true));
  const input = UpdateCatalogItemBody.safeParse(req.body);
  const params = UpdateCatalogItemParams.safeParse(req.params);
  if (!input.success || !params.success) { res.status(400).json({ error: "Kontroller feltene i skjemaet." }); return; }
  res.json(UpdateCatalogItemResponse.parse(await updateItem(session, params.data.id, input.data)));
});
router.post("/bonusplay/notifications/read", async (req, res): Promise<void> => {
  const session = (await identity(req));
  const input = MarkNotificationsReadBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Ugyldig varsel." }); return; }
  if (input.data.notificationIds.length) await db.insert(notificationReadsTable).values(input.data.notificationIds.map(notificationId => ({ userId: session.userId, notificationId }))).onConflictDoNothing();
  res.json(MarkNotificationsReadResponse.parse(await getState(session)));
});
router.post("/bonusplay/analytics", async (req, res): Promise<void> => {
  const session = (await identity(req));
  const input = RecordAnalyticsEventBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Ugyldig analysehendelse." }); return; }
  await db.insert(analyticsEventsTable).values({ id: randomUUID(), userId: session.userId, event: input.data.event, sourceId: input.data.sourceId ?? null });
  res.json(RecordAnalyticsEventResponse.parse({ ok: true }));
});

export default router;
