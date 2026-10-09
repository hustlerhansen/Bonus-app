import { createHash, randomUUID } from "node:crypto";
import { pool, type PoolClient } from "@workspace/db";
import {
  CreateV2RewardBody, ReviewV2RewardBody, RedeemV2RewardBody, ActionV2OrderBody,
  CreateV2RewardResponse, ListV2RewardsResponse, GetV2RewardResponse,
  ListV2OrdersResponse, RedeemV2RewardResponse, ReconcileV2RewardsResponse,
} from "@workspace/api-zod";
import { createPointsLedger, PointsError } from "./points";
import { currentEconomy } from "./economy";

type Database = Pick<typeof pool, "query" | "connect">;
const rewardProjection = `r.id,r.supplier_id AS "supplierId",s.name AS "supplierName",
  r.title,r.description,r.terms,r.points,r.stock_available AS stock,r.status`;
const orderProjection = `o.id,o.reward_id AS "rewardId",r.title,o.points,o.status,
  o.transaction_id AS "transactionId",o.created_at AS "createdAt",o.updated_at AS "updatedAt"`;
function validate<T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new PointsError(400, "Kontroller feltene. Ekstra felt er ikke tillatt.");
  return result.data!;
}
function dates(row: Record<string, unknown>) {
  return { ...row, createdAt: (row.createdAt as Date).toISOString(), updatedAt: (row.updatedAt as Date).toISOString() };
}

export function createRewardService(database: Database = pool) {
  const ledger = createPointsLedger(database);
  // Caller-owned transaction (approved request queue): same commercial lock, caller commits.
  async function within<T>(existing: PoolClient | undefined, run: (c: PoolClient) => Promise<T>) {
    if (!existing) return atomic(run);
    await existing.query("SELECT pg_advisory_xact_lock(20761012,4)");
    return run(existing);
  }
  async function atomic<T>(run: (c: PoolClient) => Promise<T>, readOnly = false) {
    const c = await database.connect();
    try {
      await c.query(readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN");
      // One bounded commercial write lane: lock before accounts/ledger to avoid cross-order deadlocks.
      if (!readOnly) await c.query("SELECT pg_advisory_xact_lock(20761012,4)");
      const result = await run(c);
      await c.query("COMMIT");
      return result;
    } catch (error) { await c.query("ROLLBACK"); throw error; }
    finally { c.release(); }
  }
  async function account(c: PoolClient, id: string, admin = false, target?: string, lock = true) {
    const rows = (await c.query(`SELECT id,role,status FROM v2_accounts WHERE id=ANY($1::text[])
      ORDER BY id ${lock ? "FOR UPDATE" : ""}`, [[id, ...(target ? [target] : [])]])).rows;
    const actor = rows.find(r => r.id === id);
    if (!actor || actor.status !== "ACTIVE" || (admin && !["ADMIN", "SUPER_ADMIN"].includes(actor.role))) {
      throw new PointsError(403, "Du har ikke tilgang til denne funksjonen.");
    }
    return actor;
  }
  async function gate(c: PoolClient, required = false) {
    const row = (await c.query(`SELECT e.phase1_cleared,e.clearance_reference,g.enabled,g.commercial_reference
      FROM v2_earn_gate e CROSS JOIN v2_redeem_gate g WHERE e.singleton AND g.singleton FOR SHARE OF e,g`)).rows[0];
    const enabled = !!(row?.phase1_cleared && row?.clearance_reference?.length >= 10 &&
      row?.enabled && row?.commercial_reference?.length >= 10);
    if (required && !enabled) throw new PointsError(503, "Innløsning er ikke aktivert. Sikkerhetskontroller og leverandøravtaler må godkjennes først.");
    return enabled;
  }
  async function reward(c: PoolClient, id: string, approvedOnly = false) {
    const row = (await c.query(`SELECT ${rewardProjection} FROM v2_rewards r JOIN v2_reward_suppliers s ON s.id=r.supplier_id
      WHERE r.id=$1 ${approvedOnly ? "AND r.status='approved' AND s.active" : ""}`, [id])).rows[0];
    if (!row) throw new PointsError(404, "Premien finnes ikke eller er ikke godkjent.");
    return CreateV2RewardResponse.parse(row);
  }
  async function order(c: PoolClient, id: string) {
    const row = (await c.query(`SELECT ${orderProjection} FROM v2_reward_orders o JOIN v2_rewards r ON r.id=o.reward_id WHERE o.id=$1`, [id])).rows[0];
    if (!row) throw new PointsError(404, "Bestillingen finnes ikke.");
    return RedeemV2RewardResponse.parse(dates(row));
  }
  async function audit(c: PoolClient, actor: { id: string; role: string }, action: string, id: string, metadata: unknown) {
    await c.query(`INSERT INTO v2_audit_logs(id,actor_id,actor_role,action,entity_type,entity_id,metadata)
      VALUES($1,$2,$3,$4,'REWARD',$5,$6)`, [randomUUID(), actor.id, actor.role, action, id, JSON.stringify(metadata)]);
  }
  async function replay(c: PoolClient, key: string, intent: unknown) {
    const fingerprint = createHash("sha256").update(JSON.stringify(intent)).digest("hex");
    const prior = (await c.query("SELECT * FROM v2_reward_requests WHERE request_key=$1", [key])).rows[0];
    if (prior && prior.fingerprint !== fingerprint) throw new PointsError(409, "Nøkkelen er brukt til en annen forespørsel.");
    return { fingerprint, prior };
  }
  async function remember(c: PoolClient, key: string, fingerprint: string, id: string) {
    await c.query("INSERT INTO v2_reward_requests(request_key,fingerprint,order_id) VALUES($1,$2,$3)", [key, fingerprint, id]);
  }
  async function list(actorId: string, admin = false) {
    return atomic(async c => {
      await account(c, actorId, admin);
      const rows = await c.query(`SELECT ${rewardProjection} FROM v2_rewards r JOIN v2_reward_suppliers s ON s.id=r.supplier_id
        ${admin ? "" : "WHERE r.status='approved' AND s.active"} ORDER BY r.created_at DESC,r.id`);
      return ListV2RewardsResponse.parse({ items: rows.rows, redeemEnabled: await gate(c) });
    });
  }
  async function detail(actorId: string, id: string) {
    return atomic(async c => {
      await account(c, actorId);
      return GetV2RewardResponse.parse({ reward: await reward(c, id, true), redeemEnabled: await gate(c) });
    });
  }
  async function suppliers(actorId: string) {
    return atomic(async c => {
      await account(c, actorId, true);
      return (await c.query("SELECT id,name FROM v2_reward_suppliers WHERE active ORDER BY name")).rows as { id: string; name: string }[];
    });
  }
  async function create(actorId: string, value: unknown) {
    const input = validate(CreateV2RewardBody.strict(), value);
    if (input.title.trim().length < 3 || [input.description, input.terms, input.approvalReference].some(x => x.trim().length < 10) ||
      !input.supplierSku.trim()) throw new PointsError(400, "Oppgi faktiske premievilkår og godkjenningsreferanse.");
    return atomic(async c => {
      const actor = await account(c, actorId, true);
      if (!(await c.query("SELECT id FROM v2_reward_suppliers WHERE id=$1 AND active FOR SHARE", [input.supplierId])).rowCount) {
        throw new PointsError(409, "Leverandøren må først godkjennes og konfigureres av operatøren.");
      }
      const id = randomUUID();
      await c.query(`INSERT INTO v2_rewards(id,supplier_id,supplier_sku,approval_reference,title,description,terms,points,stock_total,stock_available,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10)`, [id, input.supplierId, input.supplierSku.trim(), input.approvalReference.trim(),
        input.title.trim(), input.description.trim(), input.terms.trim(), input.points, input.stock, actorId]);
      await audit(c, actor, "REWARD_CREATED", id, input);
      return reward(c, id);
    });
  }
  async function review(actorId: string, id: string, value: unknown, existing?: PoolClient) {
    const input = validate(ReviewV2RewardBody.strict(), value);
    if (input.reason.trim().length < 10) throw new PointsError(400, "Oppgi en konkret begrunnelse.");
    return within(existing, async c => {
      const actor = await account(c, actorId, true);
      const current = await reward(c, id);
      if (current.status === input.status) return current;
      if (input.status === "approved" && current.status !== "draft") throw new PointsError(409, "Opprett en ny definisjon for ny godkjenning.");
      if (input.status === "approved" && !(await c.query("SELECT id FROM v2_reward_suppliers WHERE id=$1 AND active FOR SHARE", [current.supplierId])).rowCount) {
        throw new PointsError(409, "Leverandøren er ikke aktiv.");
      }
      await c.query("UPDATE v2_rewards SET status=$2 WHERE id=$1", [id, input.status]);
      await audit(c, actor, "REWARD_REVIEWED", id, { before: current.status, after: input.status, reason: input.reason.trim() });
      return reward(c, id);
    });
  }
  async function redeem(actorId: string, id: string, value: unknown) {
    const input = validate(RedeemV2RewardBody.strict(), value);
    return atomic(async c => {
      // Resolve integration actor, lock with owner in ledger order, then recheck supplier under lock.
      const initial = (await c.query(`SELECT s.integration_actor_id FROM v2_rewards r JOIN v2_reward_suppliers s ON s.id=r.supplier_id WHERE r.id=$1`, [id])).rows[0];
      if (!initial) throw new PointsError(404, "Premien finnes ikke.");
      await account(c, actorId, false, initial.integration_actor_id);
      const { fingerprint, prior } = await replay(c, input.idempotencyKey, ["redeem", actorId, id]);
      if (prior) return order(c, prior.order_id);
      await gate(c, true);
      if ((await c.query("SELECT 1 FROM v2_reward_risk_blocks WHERE account_id=$1 FOR SHARE", [actorId])).rowCount) {
        throw new PointsError(403, "Innløsning krever en risikovurdering. Kontakt support.");
      }
      const r = (await c.query(`SELECT r.*,s.active,s.integration_actor_id FROM v2_rewards r JOIN v2_reward_suppliers s ON s.id=r.supplier_id
        WHERE r.id=$1 FOR UPDATE OF r FOR SHARE OF s`, [id])).rows[0];
      if (!r || r.status !== "approved" || !r.active || r.integration_actor_id !== initial.integration_actor_id) {
        throw new PointsError(409, "Premien eller leverandøren er ikke aktiv.");
      }
      if (r.stock_available < 1) throw new PointsError(409, "Premien er utsolgt.");
      const orderId = randomUUID();
      const result = await ledger.execute({ kind: "record", actorId: r.integration_actor_id, accountId: actorId,
        type: "REDEEM", amount: -r.points, status: "pending", source: `reward:${r.supplier_id}`, reference: orderId,
        description: r.title, reason: "Brukerbekreftet innløsning med serverpris og lagerreservasjon",
        idempotencyKey: `reward-reserve:${orderId}` }, c);
      await c.query("UPDATE v2_rewards SET stock_available=stock_available-1 WHERE id=$1", [id]);
      await c.query(`INSERT INTO v2_reward_orders(id,reward_id,account_id,points,transaction_id) VALUES($1,$2,$3,$4,$5)`,
        [orderId, id, actorId, r.points, result.transaction.id]);
      await remember(c, input.idempotencyKey, fingerprint, orderId);
      await audit(c, { id: actorId, role: (await account(c, actorId)).role }, "REWARD_RESERVED", orderId,
        { rewardId: id, points: r.points, transactionId: result.transaction.id });
      return order(c, orderId);
    });
  }
  async function orders(actorId: string, admin = false) {
    return atomic(async c => {
      await account(c, actorId, admin);
      const rows = await c.query(`SELECT ${orderProjection}${admin ? ',o.account_id AS "accountId",r.supplier_id AS "supplierId",r.supplier_sku AS "supplierSku"' : ""}
        FROM v2_reward_orders o JOIN v2_rewards r ON r.id=o.reward_id
        ${admin ? "" : "WHERE o.account_id=$1"} ORDER BY o.sequence DESC`, admin ? [] : [actorId]);
      return ListV2OrdersResponse.parse({ items: rows.rows.map(dates) });
    });
  }
  async function action(actorId: string, id: string, value: unknown, existing?: PoolClient) {
    const input = validate(ActionV2OrderBody.strict(), value);
    const reason = input.reason.trim(), evidence = input.evidenceReference.trim();
    if (reason.length < 10 || evidence.length < 10) throw new PointsError(400, "Oppgi begrunnelse og verifiserbar leveringsreferanse.");
    if (input.action === "refund" && input.confirmedNotDelivered !== true) {
      throw new PointsError(400, "Bekreft dokumentert ikke-levering før refusjon.");
    }
    return within(existing, async c => {
      const initial = (await c.query("SELECT * FROM v2_reward_orders WHERE id=$1", [id])).rows[0];
      if (!initial) throw new PointsError(404, "Bestillingen finnes ikke.");
      const actor = await account(c, actorId, true, initial.account_id);
      const { fingerprint, prior } = await replay(c, input.idempotencyKey,
        ["action", actorId, id, input.action, reason, evidence, input.confirmedNotDelivered ?? false]);
      if (prior) return order(c, id);
      const o = (await c.query("SELECT * FROM v2_reward_orders WHERE id=$1 FOR UPDATE", [id])).rows[0];
      let status: string, refundId: string | null = null;
      if (input.action === "dispatch") {
        await gate(c, true);
        if (o.status !== "reserved") throw new PointsError(409, "Bestillingen er allerede behandlet.");
        if (o.account_id === actorId) throw new PointsError(403, "Administratorer kan ikke behandle egne bestillinger.");
        // High-value orders are dispatched only through the approval queue (caller-owned transaction).
        if (!existing && o.points >= (await currentEconomy(c)).highValueOrderPoints) {
          throw new PointsError(409, "Bestillingen har høy verdi og må sendes via godkjenningskøen.", { code: "USE_APPROVAL_QUEUE", action: "ORDER_DISPATCH" });
        }
        if ((await c.query("SELECT 1 FROM v2_reward_risk_blocks WHERE account_id=$1 FOR SHARE", [o.account_id])).rowCount) {
          throw new PointsError(403, "Risikosperren må avklares før levering.");
        }
        await reward(c, o.reward_id, true);
        // Settlement starts exactly once; supplier receives order UUID as delivery reference outside this API.
        await ledger.execute({ kind: "decide", actorId, transactionId: o.transaction_id, status: "approved",
          reason, idempotencyKey: `reward-dispatch:${id}` }, c);
        status = "delivering";
      } else if (input.action === "refund") {
        if (!["reserved", "delivering", "uncertain"].includes(o.status)) throw new PointsError(409, "Bestillingen kan ikke refunderes.");
        const result = await ledger.execute(o.status === "reserved"
          ? { kind: "decide", actorId, transactionId: o.transaction_id, status: "rejected", reason, idempotencyKey: `reward-release:${id}` }
          : { kind: "compensate", actorId, transactionId: o.transaction_id, type: "REFUND", reason, idempotencyKey: `reward-refund:${id}` }, c);
        refundId = o.status === "reserved" ? null : result.transaction.id;
        await c.query("UPDATE v2_rewards SET stock_available=stock_available+1 WHERE id=$1", [o.reward_id]);
        status = "refunded";
      } else if (input.action === "uncertain") {
        if (o.status !== "delivering") throw new PointsError(409, "Bare påbegynt levering kan settes til uavklart.");
        status = "uncertain";
      } else {
        if (!["delivering", "uncertain"].includes(o.status)) throw new PointsError(409, "Levering må være påbegynt før den bekreftes.");
        status = "delivered";
      }
      await c.query("UPDATE v2_reward_orders SET status=$2,refund_transaction_id=$3,updated_at=now() WHERE id=$1", [id, status, refundId]);
      await remember(c, input.idempotencyKey, fingerprint, id);
      await audit(c, actor, "REWARD_ORDER_ACTION", id, { before: o.status, after: status, reason, evidenceReference: evidence });
      return order(c, id);
    });
  }
  async function reconcile(actorId: string) {
    return atomic(async c => {
      await account(c, actorId, true, undefined, false);
      const issues: { code: string; reference: string }[] = [];
      const stock = await c.query(`SELECT r.id FROM v2_rewards r WHERE r.stock_available+
        (SELECT count(*) FROM v2_reward_orders o WHERE o.reward_id=r.id AND o.status<>'refunded')<>r.stock_total`);
      issues.push(...stock.rows.map(r => ({ code: "STOCK_MISMATCH", reference: r.id })));
      const financial = await c.query(`SELECT o.id FROM v2_reward_orders o JOIN v2_rewards r ON r.id=o.reward_id
        JOIN v2_points_transactions t ON t.id=o.transaction_id
        LEFT JOIN LATERAL(SELECT status FROM v2_points_events WHERE transaction_id=t.id ORDER BY sequence DESC LIMIT 1)e ON true
        LEFT JOIN v2_points_transactions f ON f.id=o.refund_transaction_id
        LEFT JOIN LATERAL(SELECT status FROM v2_points_events WHERE transaction_id=f.id ORDER BY sequence DESC LIMIT 1)fe ON true
        WHERE e.status IS NULL OR t.account_id<>o.account_id OR t.amount<>-o.points OR o.points<>r.points OR
          t.type<>'REDEEM' OR t.reference<>o.id::text OR t.source<>('reward:'||r.supplier_id) OR
          (o.status<>'refunded' AND o.refund_transaction_id IS NOT NULL) OR
          (o.status='reserved' AND e.status<>'pending') OR
          (o.status IN ('delivering','uncertain','delivered') AND e.status<>'approved') OR
          (o.status='refunded' AND NOT COALESCE(((e.status='rejected' AND o.refund_transaction_id IS NULL) OR
            (e.status='reversed' AND fe.status='approved' AND f.type='REFUND' AND f.amount=o.points AND f.account_id=o.account_id AND f.related_transaction_id=t.id)),false))`);
      issues.push(...financial.rows.map(r => ({ code: "ORDER_LEDGER_MISMATCH", reference: r.id })));
      const orphan = await c.query(`SELECT t.id FROM v2_points_transactions t WHERE t.type='REDEEM' AND t.source LIKE 'reward:%'
        AND NOT EXISTS(SELECT 1 FROM v2_reward_orders o WHERE o.transaction_id=t.id)`);
      issues.push(...orphan.rows.map(r => ({ code: "ORPHAN_REDEMPTION", reference: r.id })));
      return ReconcileV2RewardsResponse.parse({ ok: issues.length === 0, issues });
    }, true);
  }
  return { list, detail, suppliers, create, review, redeem, orders, action, reconcile };
}
export const rewardService = createRewardService();
