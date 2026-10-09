import { createHash, randomUUID } from "node:crypto";
import { pool, type PoolClient } from "@workspace/db";
import {
  CreateV2OfferBody, ReviewV2OfferBody, ReviewV2ConversionBody, ReceiveV2OfferCallbackBody,
  StartV2OfferBody, ListV2OffersResponse, GetV2OfferResponse, CreateV2OfferResponse,
  ListV2ConversionsResponse, ReviewV2ConversionResponse,
  ReverseV2ConversionBody, ReverseV2ConversionResponse,
} from "@workspace/api-zod";
import { createPointsLedger, PointsError } from "./points";
import { verifyOfferSignature } from "./offer-signature";

type Database = Pick<typeof pool, "query" | "connect">;
type Reader = Pick<PoolClient, "query">;
const offerProjection = `o.id,o.partner_id AS "partnerId",p.name AS "partnerName",p.logo_url AS "partnerLogoUrl",
  o.title,o.description,o.terms,o.points,o.status,o.created_at AS "createdAt",o.destination_url AS "destinationUrl",
  o.category,o.requirements,o.completion_steps AS "completionSteps",o.estimated_minutes AS "estimatedMinutes",
  o.approval_days AS "approvalDays",o.expires_at AS "expiresAt"`;
const conversionProjection = `v.id,c.offer_id AS "offerId",o.title AS "offerTitle",c.points,v.status,
  v.partner_status AS "partnerStatus",v.transaction_id AS "transactionId",v.created_at AS "createdAt",v.updated_at AS "updatedAt",
  c.account_id AS "accountId",v.partner_id AS "partnerId",v.event_id AS "eventId",v.click_id AS "clickId",
  COALESCE((SELECT jsonb_agg(jsonb_build_object('status',r.status,'reason',r.reason,'actorId',r.actor_id,
    'compensationTransactionId',r.compensation_transaction_id,'createdAt',r.created_at))
    FROM v2_offer_reversal_events r WHERE r.conversion_id=v.id),'[]'::jsonb) AS "reversalEvents"`;
function serialize(row: Record<string, unknown>) {
  return { ...row, createdAt: (row.createdAt as Date).toISOString(),
    ...("expiresAt" in row ? { expiresAt: row.expiresAt ? (row.expiresAt as Date).toISOString() : null } : {}),
    ...("updatedAt" in row ? { updatedAt: (row.updatedAt as Date).toISOString() } : {}) };
}
function validate<T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new PointsError(400, "Kontroller feltene. Ekstra felt er ikke tillatt.");
  return r.data!;
}
function destination(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new PointsError(400, "Partnerlenken må være en gyldig HTTPS-adresse."); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.searchParams.has("bp_click")) {
    throw new PointsError(400, "Partnerlenken må bruke HTTPS uten brukerinformasjon, fragment eller bp_click.");
  }
  return url;
}

export function createOfferService(database: Database = pool, secretFor = (key: string) => process.env[key]) {
  const ledger = createPointsLedger(database);
  async function atomic<T>(run: (client: PoolClient) => Promise<T>) {
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      const result = await run(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      if ((error as { code?: string }).code === "23505") throw new PointsError(409, "Hendelsen eller forespørselen er allerede registrert.");
      throw error;
    } finally { client.release(); }
  }
  async function account(id: string, client: Reader, admin = false, targetId?: string) {
    // Same ordered locks as the financial engine, before offer/conversion locks.
    const rows = await client.query(`SELECT id,role,status FROM v2_accounts
      WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE`, [[id, ...(targetId ? [targetId] : [])]]);
    const actor = rows.rows.find(r => r.id === id);
    if (!actor || actor.status !== "ACTIVE" || (admin && !["ADMIN", "SUPER_ADMIN"].includes(actor.role))) {
      throw new PointsError(403, "Du har ikke tilgang til denne funksjonen.");
    }
    if (targetId && !rows.rows.some(r => r.id === targetId && r.status === "ACTIVE")) {
      throw new PointsError(403, "Mottakerkontoen er ikke aktiv.");
    }
    return actor;
  }
  async function gate(client: Reader = database, required = false) {
    const r = await client.query("SELECT * FROM v2_earn_gate WHERE singleton=true FOR SHARE");
    const enabled = !!(r.rows[0]?.phase1_cleared && r.rows[0]?.earn_enabled && r.rows[0]?.clearance_reference?.length >= 10);
    if (required && !enabled) throw new PointsError(503, "Opptjening er ikke aktivert. Tidligere sikkerhets- og innloggingskontroller må avklares først.");
    return enabled;
  }
  async function audit(client: Reader, actor: { id: string; role: string }, action: string, id: string, metadata: unknown) {
    await client.query(`INSERT INTO v2_audit_logs(id,actor_id,actor_role,action,entity_type,entity_id,metadata)
      VALUES($1,$2,$3,$4,'OFFER',$5,$6)`,
    [randomUUID(), actor.id, actor.role, action, id, JSON.stringify(metadata)]);
  }
  async function offer(id: string, client: Reader, approvedOnly = false) {
    const r = await client.query(`SELECT ${offerProjection} FROM v2_offers o JOIN v2_offer_partners p ON p.id=o.partner_id
      WHERE o.id=$1 ${approvedOnly ? "AND o.status='approved' AND p.active=true AND (o.expires_at IS NULL OR o.expires_at>now())" : ""}`, [id]);
    if (!r.rows[0]) throw new PointsError(404, "Tilbudet finnes ikke eller er ikke godkjent.");
    return CreateV2OfferResponse.parse(serialize(r.rows[0]));
  }
  async function conversion(id: string, client: Reader) {
    const r = await client.query(`SELECT ${conversionProjection} FROM v2_offer_conversions v
      JOIN v2_offer_clicks c ON c.id=v.click_id JOIN v2_offers o ON o.id=c.offer_id WHERE v.id=$1`, [id]);
    if (!r.rows[0]) throw new PointsError(404, "Konverteringen finnes ikke.");
    return ReviewV2ConversionResponse.parse(serialize(r.rows[0]));
  }
  async function listOffers(actorId: string, admin = false) {
    return atomic(async client => {
      await account(actorId, client, admin);
      const r = await client.query(`SELECT ${offerProjection} FROM v2_offers o JOIN v2_offer_partners p ON p.id=o.partner_id
        ${admin ? "" : "WHERE o.status='approved' AND p.active=true AND (o.expires_at IS NULL OR o.expires_at>now())"} ORDER BY o.created_at DESC,o.id DESC LIMIT 100`);
      return ListV2OffersResponse.parse({ items: r.rows.map(serialize), earnEnabled: await gate(client) });
    });
  }
  async function detail(actorId: string, id: string) {
    return atomic(async client => {
      await account(actorId, client);
      return GetV2OfferResponse.parse({ offer: await offer(id, client, true), earnEnabled: await gate(client) });
    });
  }
  async function partners(actorId: string) {
    return atomic(async client => {
      await account(actorId, client, true);
      return (await client.query("SELECT id,name FROM v2_offer_partners WHERE active=true ORDER BY name")).rows;
    });
  }
  async function create(actorId: string, value: unknown) {
    const input = validate(CreateV2OfferBody.strict(), value);
    destination(input.destinationUrl);
    if (![input.description, input.terms, input.requirements, input.completionSteps].every(s => s.trim().length >= 10) ||
      input.title.trim().length < 3) throw new PointsError(400, "Fyll ut tilbudsteksten.");
    if (input.expiresAt && new Date(input.expiresAt).getTime() <= Date.now()) throw new PointsError(400, "Utløpsdato må være i fremtiden.");
    return atomic(async client => {
      const actor = await account(actorId, client, true);
      const partner = await client.query("SELECT id FROM v2_offer_partners WHERE id=$1 AND active=true FOR SHARE", [input.partnerId]);
      if (!partner.rowCount) throw new PointsError(400, "Partneren må konfigureres og godkjennes av operatøren først.");
      const id = randomUUID();
      await client.query(`INSERT INTO v2_offers(id,partner_id,title,description,terms,points,destination_url,created_by,
        category,requirements,completion_steps,estimated_minutes,approval_days,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [id, input.partnerId, input.title.trim(), input.description.trim(), input.terms.trim(), input.points, input.destinationUrl, actorId,
        input.category, input.requirements.trim(), input.completionSteps.trim(), input.estimatedMinutes, input.approvalDays, input.expiresAt ?? null]);
      await audit(client, actor, "OFFER_CREATED", id, input);
      return offer(id, client);
    });
  }
  // `existing`: run inside a caller-owned transaction (the approved high-risk request queue).
  async function reviewOffer(actorId: string, id: string, value: unknown, existing?: PoolClient) {
    const input = validate(ReviewV2OfferBody.strict(), value);
    if (input.reason.trim().length < 10) throw new PointsError(400, "Oppgi en konkret begrunnelse.");
    return (existing ? (run: (c: PoolClient) => Promise<unknown>) => run(existing) : atomic)(async (client: PoolClient) => {
      const actor = await account(actorId, client, true);
      const r = await client.query("SELECT status FROM v2_offers WHERE id=$1 FOR UPDATE", [id]);
      if (!r.rowCount) throw new PointsError(404, "Tilbudet finnes ikke.");
      const before = r.rows[0].status;
      if (before === input.status) return offer(id, client);
      if (before === "rejected" || (input.status === "approved" && before !== "draft")) {
        throw new PointsError(409, "Opprett et nytt tilbud hvis vilkår eller godkjenning skal endres.");
      }
      await client.query("UPDATE v2_offers SET status=$2 WHERE id=$1", [id, input.status]);
      await audit(client, actor, "OFFER_REVIEWED", id, { before, after: input.status, reason: input.reason.trim() });
      return offer(id, client);
    });
  }
  async function start(actorId: string, id: string, value: unknown) {
    const input = validate(StartV2OfferBody.strict(), value);
    return atomic(async client => {
      await gate(client, true);
      await account(actorId, client);
      const r = await client.query(`SELECT o.*,p.active FROM v2_offers o JOIN v2_offer_partners p ON p.id=o.partner_id
        WHERE o.id=$1 FOR SHARE OF o,p`, [id]);
      const row = r.rows[0];
      if (!row || row.status !== "approved" || !row.active ||
        (row.expires_at && row.expires_at.getTime() <= Date.now())) throw new PointsError(404, "Tilbudet er ikke aktivt og godkjent.");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,20761010))", [input.idempotencyKey]);
      const prior = await client.query("SELECT * FROM v2_offer_clicks WHERE request_key=$1", [input.idempotencyKey]);
      if (prior.rows[0] && (prior.rows[0].account_id !== actorId || prior.rows[0].offer_id !== id)) {
        throw new PointsError(409, "Nøkkelen er brukt til et annet tilbud eller en annen konto.");
      }
      const clickId = prior.rows[0]?.id ?? randomUUID();
      if (!prior.rowCount) await client.query(`INSERT INTO v2_offer_clicks(id,offer_id,account_id,request_key,points)
        VALUES($1,$2,$3,$4,$5)`, [clickId, id, actorId, input.idempotencyKey, row.points]);
      const url = destination(row.destination_url);
      url.searchParams.set("bp_click", clickId);
      return { clickId, redirectUrl: url.href };
    });
  }
  async function listConversions(actorId: string, admin = false) {
    return atomic(async client => {
      await account(actorId, client, admin);
      const r = await client.query(`SELECT ${conversionProjection} FROM v2_offer_conversions v
        JOIN v2_offer_clicks c ON c.id=v.click_id JOIN v2_offers o ON o.id=c.offer_id
        ${admin ? "" : "WHERE c.account_id=$1"} ORDER BY v.created_at DESC,v.id DESC LIMIT 100`, admin ? [] : [actorId]);
      return ListV2ConversionsResponse.parse({ items: r.rows.map(serialize) });
    });
  }
  async function callback(partnerId: string, raw: Buffer, headers: { timestamp?: string; nonce?: string; signature?: string }) {
    const config = (await database.query("SELECT * FROM v2_offer_partners WHERE id=$1 AND active=true", [partnerId])).rows[0];
    if (!config) throw new PointsError(401, "Ukjent partnerintegrasjon.");
    const verified = verifyOfferSignature(raw, secretFor(config.secret_env_key), headers);
    let value: unknown;
    try { value = JSON.parse(raw.toString("utf8")); } catch { throw new PointsError(400, "Ugyldig JSON."); }
    const input = validate(ReceiveV2OfferCallbackBody.strict(), value);
    return atomic(async client => {
      await gate(client, true);
      // Serializes callback receipts/events per partner, including concurrent new IDs.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,20761011))", [partnerId]);
      const p = (await client.query("SELECT * FROM v2_offer_partners WHERE id=$1 AND active=true FOR SHARE", [partnerId])).rows[0];
      if (!p || p.secret_env_key !== config.secret_env_key || p.integration_actor_id !== config.integration_actor_id) {
        throw new PointsError(409, "Partnerkonfigurasjonen er endret. Prøv igjen.");
      }
      await client.query(`INSERT INTO v2_offer_callback_receipts(partner_id,nonce,payload_hash) VALUES($1,$2,$3)`,
        [partnerId, verified.nonce, createHash("sha256").update(raw).digest("hex")]);
      const c = (await client.query(`SELECT c.*,o.partner_id,o.title FROM v2_offer_clicks c
        JOIN v2_offers o ON o.id=c.offer_id WHERE c.id=$1 AND o.partner_id=$2`, [input.clickId, partnerId])).rows[0];
      if (!c) throw new PointsError(404, "Klikket tilhører ikke denne partneren.");
      const actor = await account(p.integration_actor_id, client, true, c.account_id);
      const o = (await client.query("SELECT status FROM v2_offers WHERE id=$1 FOR SHARE", [c.offer_id])).rows[0];
      if (o.status !== "approved") throw new PointsError(409, "Tilbudet er ikke lenger godkjent.");
      let v = (await client.query("SELECT * FROM v2_offer_conversions WHERE partner_id=$1 AND event_id=$2 FOR UPDATE",
        [partnerId, input.eventId])).rows[0];
      if (v && v.click_id !== input.clickId) throw new PointsError(409, "Partnerhendelsen er allerede knyttet til et annet klikk.");
      if (v && v.partner_status !== input.status && v.partner_status !== "pending") {
        throw new PointsError(409, "Bekreftet eller avvist partnerbevis kan ikke endres.");
      }
      if (v && v.partner_status === input.status) return conversion(v.id, client);
      if (!v) {
        const id = randomUUID();
        const reward = await ledger.execute({ kind: "record", actorId: actor.id, accountId: c.account_id,
          type: "EARN", amount: c.points, status: "pending", source: `offer:${partnerId}`, reference: input.eventId,
          description: c.title, reason: "Signert partnerbevis; avventer administratorgodkjenning",
          idempotencyKey: `offer-record:${id}` }, client);
        await client.query(`INSERT INTO v2_offer_conversions(id,partner_id,event_id,click_id,transaction_id,partner_status)
          VALUES($1,$2,$3,$4,$5,$6)`, [id, partnerId, input.eventId, input.clickId, reward.transaction.id, input.status]);
        v = { id, transaction_id: reward.transaction.id, status: "pending" };
      }
      if (input.status === "rejected" && v.status === "pending") {
        await ledger.execute({ kind: "decide", actorId: actor.id, transactionId: v.transaction_id,
          status: "rejected", reason: "Partneren avviste den signerte konverteringen",
          idempotencyKey: `offer-partner-reject:${v.id}` }, client);
      }
      await client.query(`UPDATE v2_offer_conversions SET partner_status=$2,
        status=CASE WHEN $2='rejected' THEN 'rejected' ELSE status END,updated_at=now() WHERE id=$1`, [v.id, input.status]);
      await audit(client, actor, "OFFER_CALLBACK", v.id, { partnerId, eventId: input.eventId, partnerStatus: input.status });
      return conversion(v.id, client);
    });
  }
  async function reviewConversion(actorId: string, id: string, value: unknown) {
    const input = validate(ReviewV2ConversionBody.strict(), value);
    if (input.reason.trim().length < 10) throw new PointsError(400, "Oppgi en konkret begrunnelse.");
    return atomic(async client => {
      await gate(client, true);
      const initial = (await client.query(`SELECT v.*,c.account_id,c.offer_id FROM v2_offer_conversions v
        JOIN v2_offer_clicks c ON c.id=v.click_id WHERE v.id=$1`, [id])).rows[0];
      if (!initial) throw new PointsError(404, "Konverteringen finnes ikke.");
      const actor = await account(actorId, client, true, initial.account_id);
      const o = (await client.query(`SELECT o.status,p.active FROM v2_offers o JOIN v2_offer_partners p ON p.id=o.partner_id
        WHERE o.id=$1 FOR SHARE OF o,p`, [initial.offer_id])).rows[0];
      const v = (await client.query("SELECT * FROM v2_offer_conversions WHERE id=$1 FOR UPDATE", [id])).rows[0];
      if (v.status === input.status) return conversion(id, client);
      if (v.status !== "pending") throw new PointsError(409, "Konverteringen er allerede behandlet.");
      if (input.status === "verified" && (v.partner_status !== "verified" || o.status !== "approved" || !o.active)) {
        throw new PointsError(409, "Godkjent tilbud og verifisert partnerbevis kreves før poeng kan godkjennes.");
      }
      await ledger.execute({ kind: "decide", actorId, transactionId: v.transaction_id,
        status: input.status === "verified" ? "approved" : "rejected", reason: input.reason,
        idempotencyKey: `offer-review:${id}:${input.status}` }, client);
      await client.query("UPDATE v2_offer_conversions SET status=$2,updated_at=now() WHERE id=$1", [id, input.status]);
      await audit(client, actor, "OFFER_CONVERSION_REVIEWED", id,
        { before: "pending", after: input.status, reason: input.reason.trim() });
      return conversion(id, client);
    });
  }
  async function reverseConversion(actorId: string, id: string, value: unknown) {
    const input = validate(ReverseV2ConversionBody.strict(), value);
    const reason = input.reason.trim();
    if (reason.length < 10) throw new PointsError(400, "Oppgi en konkret begrunnelse.");
    return atomic(async client => {
      // Correct existing liabilities even while new earning is paused.
      // No gate write, partner activation or fresh callback is required.
      const initial = (await client.query(`SELECT v.transaction_id,c.account_id FROM v2_offer_conversions v
        JOIN v2_offer_clicks c ON c.id=v.click_id WHERE v.id=$1`, [id])).rows[0];
      if (!initial) throw new PointsError(404, "Konverteringen finnes ikke.");
      const actor = await account(actorId, client, true, initial.account_id);
      const v = (await client.query("SELECT * FROM v2_offer_conversions WHERE id=$1 FOR UPDATE", [id])).rows[0];
      if (!["verified", "reversed"].includes(v.status) || v.partner_status !== "verified") {
        throw new PointsError(409, "Bare allerede verifiserte konverteringer kan reverseres.");
      }
      // A disjoint internal namespace prevents generic points requests from
      // colliding with this flow's account -> conversion -> ledger lock order.
      const key = `offer-reverse:${createHash("sha256").update(input.idempotencyKey).digest("hex")}`;
      const beforeWallet = await ledger.wallet(initial.account_id, client);
      const result = await ledger.reverseOffer(id, { actorId, transactionId: v.transaction_id, reason,
        idempotencyKey: key }, client);
      if (!result.replayed) {
        await client.query(`INSERT INTO v2_offer_reversal_events(conversion_id,compensation_transaction_id,actor_id,reason)
          VALUES($1,$2,$3,$4)`, [id, result.transaction.id, actorId, reason]);
        await client.query("UPDATE v2_offer_conversions SET status='reversed',updated_at=now() WHERE id=$1", [id]);
        await audit(client, actor, "OFFER_CONVERSION_REVERSED", id, {
          before: "verified", after: "reversed", partnerStatus: v.partner_status, reason,
          transactionId: v.transaction_id, compensationTransactionId: result.transaction.id,
          beforeWallet,
          afterWallet: result.wallet,
        });
      }
      return ReverseV2ConversionResponse.parse({ conversion: await conversion(id, client),
        compensation: result.transaction, wallet: result.wallet, replayed: result.replayed });
    });
  }
  return { listOffers, detail, partners, create, reviewOffer, start, listConversions, callback, reviewConversion, reverseConversion };
}
export const offerService = createOfferService();
