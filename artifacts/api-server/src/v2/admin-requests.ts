import { createHash, randomUUID } from "node:crypto";
import { pool, type PoolClient } from "@workspace/db";
import { createPointsLedger, PointsError } from "./points";
import { createOfferService } from "./offers";
import { createRewardService } from "./rewards";
import { appendEconomyVersion, currentEconomy, validateEconomyChange } from "./economy";

type Database = Pick<typeof pool, "query" | "connect">;
type Reader = Pick<PoolClient, "query">;
export const ADMIN_ACTIONS = ["POINTS_ADJUSTMENT", "POINTS_DECISION", "POINTS_COMPENSATION", "OFFER_APPROVAL",
  "REWARD_APPROVAL", "ORDER_DISPATCH", "ECONOMY_CONFIG", "MARKETING_BUDGET"] as const;
export type AdminAction = typeof ADMIN_ACTIONS[number];
type Payload = Record<string, unknown>;
type Deps = {
  clock?: () => number;
  secretFor?: (key: string) => string | undefined;
  extraExecutors?: Partial<Record<AdminAction, Executor>>;
  extraValidators?: Partial<Record<AdminAction, Validator>>;
};
export type Executor = (client: PoolClient, request: StoredRequest, actorId: string) => Promise<Record<string, unknown>>;
export type Validator = (client: Reader, payload: unknown, actorId: string) => Promise<{ payload: Payload; target: string | null }>;
export type StoredRequest = { id: string; action: AdminAction; payload: Payload; reason: string; requested_by: string;
  target_account_id: string | null; not_before: Date; requested_at: Date };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9_.:-]{16,128}$/;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Payload)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function exact(payload: unknown, keys: string[], optional: string[] = []): Payload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new PointsError(400, "Ugyldig forespørsel.");
  const p = payload as Payload;
  if (Object.keys(p).some(k => !keys.includes(k) && !optional.includes(k)) || keys.some(k => p[k] === undefined)) {
    throw new PointsError(400, "Forespørselen har manglende eller ukjente felt.");
  }
  return p;
}
const uuid = (v: unknown, label: string) => {
  if (typeof v !== "string" || !UUID.test(v)) throw new PointsError(400, `Ugyldig ${label}.`);
  return v.toLowerCase();
};

export function createAdminRequestService(database: Database = pool, deps: Deps = {}) {
  const clock = deps.clock ?? (() => Date.now());
  const ledger = createPointsLedger(database);
  const offers = createOfferService(database, deps.secretFor);
  const rewards = createRewardService(database);

  async function genericTransaction(client: Reader, id: string, actorId: string, expected: "pending" | "approved") {
    const t = (await client.query(`SELECT t.id,t.account_id,t.source,t.type,t.amount,s.status FROM v2_points_transactions t
      JOIN LATERAL (SELECT status FROM v2_points_events WHERE transaction_id=t.id ORDER BY sequence DESC LIMIT 1) s ON true
      WHERE t.id=$1`, [id])).rows[0];
    if (!t) throw new PointsError(404, "Transaksjonen finnes ikke.");
    // Offer and reward money moves only through their dedicated, evidence-bound flows.
    if (/^(offer:|reward:)/.test(t.source)) throw new PointsError(409, "Tilbud og premier behandles i egne flyter, ikke som generisk poengsak.");
    if (t.status !== expected) throw new PointsError(409, expected === "pending" ? "Bare ventende transaksjoner kan behandles." : "Bare godkjente transaksjoner kan tilbakeføres.");
    if (t.account_id === actorId) throw new PointsError(403, "Administratorer kan ikke behandle poeng på egen konto.");
    return t;
  }

  const validators: Record<AdminAction, Validator> = {
    async POINTS_ADJUSTMENT(client, raw, actorId) {
      const p = exact(raw, ["accountId", "amount"], ["fundingBudgetId"]);
      if (typeof p.accountId !== "string" || !p.accountId || p.accountId.length > 128) throw new PointsError(400, "Ugyldig konto.");
      if (!Number.isInteger(p.amount) || p.amount === 0 || Math.abs(p.amount as number) > 1_000_000) {
        throw new PointsError(400, "Poeng må være et heltall fra -1 000 000 til 1 000 000, ulik null.");
      }
      // Positive adjustments have monetary value and must be funded by an approved marketing budget.
      if ((p.amount as number) > 0) {
        p.fundingBudgetId = uuid(p.fundingBudgetId, "markedsbudsjett (påkrevd for positive justeringer)");
        const b = (await client.query("SELECT valid_until>now() AS valid FROM v2_marketing_budgets WHERE id=$1", [p.fundingBudgetId])).rows[0];
        if (!b) throw new PointsError(404, "Markedsbudsjettet finnes ikke.");
        if (!b.valid) throw new PointsError(409, "Markedsbudsjettet er utløpt.");
      } else if (p.fundingBudgetId !== undefined) throw new PointsError(400, "Negative justeringer har ingen finansieringskilde.");
      if (p.accountId === actorId) throw new PointsError(403, "Administratorer kan ikke be om justering av egen konto.");
      if (!(await client.query("SELECT 1 FROM v2_accounts WHERE id=$1", [p.accountId])).rows.length) {
        throw new PointsError(404, "V2-kontoen finnes ikke.");
      }
      return { payload: p, target: p.accountId as string };
    },
    async POINTS_DECISION(client, raw, actorId) {
      const p = exact(raw, ["transactionId", "status"]);
      p.transactionId = uuid(p.transactionId, "transaksjon");
      if (!["approved", "rejected"].includes(p.status as string)) throw new PointsError(400, "Ugyldig beslutning.");
      const t = await genericTransaction(client, p.transactionId as string, actorId, "pending");
      return { payload: p, target: t.account_id as string };
    },
    async POINTS_COMPENSATION(client, raw, actorId) {
      const p = exact(raw, ["transactionId", "type"]);
      p.transactionId = uuid(p.transactionId, "transaksjon");
      if (!["REFUND", "REVERSAL"].includes(p.type as string)) throw new PointsError(400, "Ugyldig tilbakeføring.");
      const t = await genericTransaction(client, p.transactionId as string, actorId, "approved");
      return { payload: p, target: t.account_id as string };
    },
    async OFFER_APPROVAL(client, raw) {
      const p = exact(raw, ["offerId"]);
      p.offerId = uuid(p.offerId, "tilbud");
      const o = (await client.query("SELECT status FROM v2_offers WHERE id=$1", [p.offerId])).rows[0];
      if (!o) throw new PointsError(404, "Tilbudet finnes ikke.");
      if (o.status !== "draft") throw new PointsError(409, "Bare utkast kan sendes til godkjenning.");
      return { payload: p, target: null };
    },
    async REWARD_APPROVAL(client, raw) {
      const p = exact(raw, ["rewardId"]);
      p.rewardId = uuid(p.rewardId, "premie");
      const r = (await client.query("SELECT status FROM v2_rewards WHERE id=$1", [p.rewardId])).rows[0];
      if (!r) throw new PointsError(404, "Premien finnes ikke.");
      if (r.status !== "draft") throw new PointsError(409, "Bare utkast kan sendes til godkjenning.");
      return { payload: p, target: null };
    },
    async ORDER_DISPATCH(client, raw, actorId) {
      const p = exact(raw, ["orderId", "evidenceReference"]);
      p.orderId = uuid(p.orderId, "bestilling");
      if (typeof p.evidenceReference !== "string" || p.evidenceReference.trim().length < 10 || p.evidenceReference.length > 200) {
        throw new PointsError(400, "Oppgi en verifiserbar leveringsreferanse (10–200 tegn).");
      }
      p.evidenceReference = p.evidenceReference.trim();
      const o = (await client.query("SELECT account_id,status FROM v2_reward_orders WHERE id=$1", [p.orderId])).rows[0];
      if (!o) throw new PointsError(404, "Bestillingen finnes ikke.");
      if (o.status !== "reserved") throw new PointsError(409, "Bestillingen er allerede behandlet.");
      if (o.account_id === actorId) throw new PointsError(403, "Administratorer kan ikke behandle egne bestillinger.");
      return { payload: p, target: o.account_id as string };
    },
    async ECONOMY_CONFIG(_client, raw) {
      return { payload: validateEconomyChange(raw) as unknown as Payload, target: null };
    },
    async MARKETING_BUDGET(_client, raw) {
      const p = exact(raw, ["name", "purpose", "pointsTotal", "validUntil"]);
      const name = typeof p.name === "string" ? p.name.trim() : "", purpose = typeof p.purpose === "string" ? p.purpose.trim() : "";
      if (name.length < 3 || name.length > 120 || purpose.length < 10 || purpose.length > 500) {
        throw new PointsError(400, "Oppgi navn (3–120 tegn) og formål (10–500 tegn).");
      }
      if (!Number.isInteger(p.pointsTotal) || (p.pointsTotal as number) < 1 || (p.pointsTotal as number) > 10_000_000) {
        throw new PointsError(400, "Budsjettet må være mellom 1 og 10 000 000 BP.");
      }
      const until = new Date(String(p.validUntil));
      if (Number.isNaN(until.getTime()) || until.getTime() <= clock() || until.getTime() > clock() + 2 * 366 * 86400000) {
        throw new PointsError(400, "Gyldig til må være en fremtidig dato innen to år.");
      }
      return { payload: { name, purpose, pointsTotal: p.pointsTotal, validUntil: until.toISOString() }, target: null };
    },
    ...deps.extraValidators,
  };

  const executors: Record<AdminAction, Executor> = {
    async POINTS_ADJUSTMENT(client, r, actorId) {
      const res = await ledger.execute({ kind: "adjust", accountId: r.payload.accountId as string, amount: r.payload.amount as number,
        ...(r.payload.fundingBudgetId ? { fundingBudgetId: r.payload.fundingBudgetId as string } : {}),
        actorId, reason: r.reason, idempotencyKey: `adminreq:${r.id}` }, client);
      return { transactionId: res.transaction.id };
    },
    async POINTS_DECISION(client, r, actorId) {
      await genericTransaction(client, r.payload.transactionId as string, actorId, "pending");
      const res = await ledger.execute({ kind: "decide", transactionId: r.payload.transactionId as string,
        status: r.payload.status as "approved" | "rejected", actorId, reason: r.reason, idempotencyKey: `adminreq:${r.id}` }, client);
      return { transactionId: res.transaction.id };
    },
    async POINTS_COMPENSATION(client, r, actorId) {
      await genericTransaction(client, r.payload.transactionId as string, actorId, "approved");
      const res = await ledger.execute({ kind: "compensate", transactionId: r.payload.transactionId as string,
        type: r.payload.type as "REFUND" | "REVERSAL", actorId, reason: r.reason, idempotencyKey: `adminreq:${r.id}` }, client);
      return { transactionId: res.transaction.id };
    },
    async OFFER_APPROVAL(client, r, actorId) {
      await offers.reviewOffer(actorId, r.payload.offerId as string, { status: "approved", reason: r.reason }, client);
      return { offerId: r.payload.offerId };
    },
    async REWARD_APPROVAL(client, r, actorId) {
      await rewards.review(actorId, r.payload.rewardId as string, { status: "approved", reason: r.reason }, client);
      return { rewardId: r.payload.rewardId };
    },
    async ORDER_DISPATCH(client, r, actorId) {
      const o = await rewards.action(actorId, r.payload.orderId as string, { action: "dispatch", reason: r.reason,
        evidenceReference: r.payload.evidenceReference, idempotencyKey: r.id }, client);
      return { orderId: o.id, status: o.status };
    },
    async ECONOMY_CONFIG(client, r, actorId) {
      return appendEconomyVersion(client, validateEconomyChange(r.payload), actorId, r.id);
    },
    async MARKETING_BUDGET(client, r, actorId) {
      const id = randomUUID();
      await client.query(`INSERT INTO v2_marketing_budgets(id,name,purpose,points_total,valid_until,approved_by,request_id)
        VALUES($1,$2,$3,$4,$5,$6,$7)`, [id, r.payload.name, r.payload.purpose, r.payload.pointsTotal, r.payload.validUntil, actorId, r.id]);
      return { budgetId: id };
    },
    ...deps.extraExecutors,
  };

  async function atomic<T>(run: (c: PoolClient) => Promise<T>) {
    const c = await database.connect();
    try {
      await c.query("BEGIN");
      const result = await run(c);
      await c.query("COMMIT");
      return result;
    } catch (error) {
      await c.query("ROLLBACK");
      if ((error as { code?: string }).code === "23505") throw new PointsError(409, "Forespørselen er allerede behandlet.");
      throw error;
    } finally { c.release(); }
  }
  async function admin(client: Reader, id: string) {
    const a = (await client.query("SELECT id,role,status FROM v2_accounts WHERE id=$1", [id])).rows[0];
    if (!a || a.status !== "ACTIVE" || !["ADMIN", "SUPER_ADMIN"].includes(a.role)) throw new PointsError(403, "Du har ikke tilgang til denne funksjonen.");
    return a as { id: string; role: string };
  }
  async function audit(client: Reader, actor: { id: string; role: string }, action: string, id: string, metadata: unknown) {
    await client.query(`INSERT INTO v2_audit_logs(id,actor_id,actor_role,action,entity_type,entity_id,metadata)
      VALUES($1,$2,$3,$4,'ADMIN_REQUEST',$5,$6)`, [randomUUID(), actor.id, actor.role, action, id, JSON.stringify(metadata)]);
  }
  const viewSql = `SELECT r.id,r.action,r.payload,r.reason,r.requested_by AS "requestedBy",
    trim(a.first_name || ' ' || a.last_name) AS "requestedByName",r.target_account_id AS "targetAccountId",
    r.requested_at AS "requestedAt",r.not_before AS "notBefore",e.status,
    CASE WHEN e.status='pending' THEN NULL ELSE e.actor_id END AS "decidedBy",
    CASE WHEN e.status='pending' THEN NULL ELSE e.created_at END AS "decidedAt",e.note,e.result
    FROM v2_admin_requests r JOIN v2_accounts a ON a.id=r.requested_by
    JOIN LATERAL (SELECT * FROM v2_admin_request_events WHERE request_id=r.id ORDER BY sequence DESC LIMIT 1) e ON true`;
  function present(row: Record<string, unknown>, viewer: string, dual: boolean) {
    const notBefore = row.notBefore as Date;
    let blockedReason: string | null = null;
    if (row.status !== "pending") blockedReason = "Forespørselen er avsluttet.";
    else if (row.targetAccountId === viewer) blockedReason = "Du kan ikke godkjenne en fordel for egen konto.";
    else if (dual && row.requestedBy === viewer) blockedReason = "En annen administrator må bekrefte.";
    else if (clock() < notBefore.getTime()) blockedReason = "Ventetiden er ikke over.";
    const iso = (v: unknown) => (v ? (v as Date).toISOString() : null);
    return { ...row, requestedAt: iso(row.requestedAt), notBefore: iso(notBefore), decidedAt: iso(row.decidedAt),
      canConfirm: blockedReason === null, blockedReason };
  }
  async function view(client: Reader, id: string, viewer: string) {
    const row = (await client.query(`${viewSql} WHERE r.id=$1`, [id])).rows[0];
    if (!row) throw new PointsError(404, "Forespørselen finnes ikke.");
    return present(row, viewer, (await currentEconomy(client)).dualControl);
  }

  async function request(actorId: string, input: unknown) {
    const body = exact(input, ["action", "payload", "reason", "requestKey"]);
    const action = body.action as AdminAction;
    if (!ADMIN_ACTIONS.includes(action)) throw new PointsError(400, "Ukjent handling.");
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reason.length < 10 || reason.length > 500) throw new PointsError(400, "Oppgi en konkret begrunnelse (10–500 tegn).");
    if (typeof body.requestKey !== "string" || !KEY.test(body.requestKey)) throw new PointsError(400, "Ugyldig forespørselsnøkkel.");
    return atomic(async c => {
      const actor = await admin(c, actorId);
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,20761013))", [body.requestKey]);
      const { payload, target } = await validators[action](c, body.payload, actorId);
      const hash = createHash("sha256").update(canonical({ action, payload, reason })).digest("hex");
      const prior = (await c.query("SELECT id,payload_hash,requested_by FROM v2_admin_requests WHERE request_key=$1", [body.requestKey])).rows[0];
      if (prior) {
        if (prior.payload_hash !== hash || prior.requested_by !== actorId) throw new PointsError(409, "Nøkkelen er brukt til en annen forespørsel.");
        return view(c, prior.id, actorId);
      }
      const config = await currentEconomy(c);
      const id = randomUUID();
      await c.query(`INSERT INTO v2_admin_requests(id,action,payload,payload_hash,target_account_id,reason,requested_by,request_key,not_before)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()+make_interval(mins=>$9))`,
      [id, action, JSON.stringify(payload), hash, target, reason, actorId, body.requestKey, config.highRiskCooldownMinutes]);
      await c.query("INSERT INTO v2_admin_request_events(request_id,status,actor_id) VALUES($1,'pending',$2)", [id, actorId]);
      await audit(c, actor, "ADMIN_REQUEST_CREATED", id, { action, payload, reason, target, cooldownMinutes: config.highRiskCooldownMinutes });
      return view(c, id, actorId);
    });
  }

  async function confirm(actorId: string, id: string) {
    uuid(id, "forespørsel");
    return atomic(async c => {
      // Same commercial lane as reward writes, then the request itself.
      await c.query("SELECT pg_advisory_xact_lock(20761012,4)");
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,20761014))", [id]);
      const actor = await admin(c, actorId);
      const r = (await c.query("SELECT * FROM v2_admin_requests WHERE id=$1", [id])).rows[0] as StoredRequest | undefined;
      if (!r) throw new PointsError(404, "Forespørselen finnes ikke.");
      const latest = (await c.query("SELECT status FROM v2_admin_request_events WHERE request_id=$1 ORDER BY sequence DESC LIMIT 1", [id])).rows[0];
      if (latest?.status !== "pending") throw new PointsError(409, "Forespørselen er allerede avsluttet.");
      if (clock() < new Date(r.not_before).getTime()) throw new PointsError(409, "Ventetiden er ikke over. Prøv igjen senere.");
      if (r.target_account_id === actorId) throw new PointsError(403, "Du kan ikke godkjenne en fordel for egen konto.");
      const config = await currentEconomy(c);
      if (config.dualControl && r.requested_by === actorId) throw new PointsError(403, "En annen administrator må bekrefte denne handlingen.");
      const result = await executors[r.action](c, r, actorId);
      await c.query("INSERT INTO v2_admin_request_events(request_id,status,actor_id,result) VALUES($1,'executed',$2,$3)",
        [id, actorId, JSON.stringify(result)]);
      await audit(c, actor, "ADMIN_REQUEST_EXECUTED", id, { action: r.action, requestedBy: r.requested_by, result });
      return view(c, id, actorId);
    });
  }

  async function reject(actorId: string, id: string, value: unknown) {
    uuid(id, "forespørsel");
    const body = exact(value, ["note"]);
    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (note.length < 10 || note.length > 500) throw new PointsError(400, "Oppgi en begrunnelse (10–500 tegn).");
    return atomic(async c => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,20761014))", [id]);
      const actor = await admin(c, actorId);
      const r = (await c.query("SELECT requested_by FROM v2_admin_requests WHERE id=$1", [id])).rows[0];
      if (!r) throw new PointsError(404, "Forespørselen finnes ikke.");
      const latest = (await c.query("SELECT status FROM v2_admin_request_events WHERE request_id=$1 ORDER BY sequence DESC LIMIT 1", [id])).rows[0];
      if (latest?.status !== "pending") throw new PointsError(409, "Forespørselen er allerede avsluttet.");
      const status = r.requested_by === actorId ? "cancelled" : "rejected";
      await c.query("INSERT INTO v2_admin_request_events(request_id,status,actor_id,note) VALUES($1,$2,$3,$4)", [id, status, actorId, note]);
      await audit(c, actor, status === "cancelled" ? "ADMIN_REQUEST_CANCELLED" : "ADMIN_REQUEST_REJECTED", id, { note });
      return view(c, id, actorId);
    });
  }

  async function list(actorId: string, status?: string) {
    if (status !== undefined && !["pending", "executed", "rejected", "cancelled"].includes(status)) throw new PointsError(400, "Ugyldig status.");
    await admin(database, actorId);
    const rows = (await database.query(`${viewSql} ${status ? "WHERE e.status=$1" : ""} ORDER BY r.requested_at DESC LIMIT 100`,
      status ? [status] : [])).rows;
    const dual = (await currentEconomy(database)).dualControl;
    return { items: rows.map(r => present(r, actorId, dual)) };
  }

  return { request, confirm, reject, list, view: (actorId: string, id: string) => view(database, uuid(id, "forespørsel"), actorId) };
}
export const adminRequests = createAdminRequestService(pool, { secretFor: key => process.env[key] });
