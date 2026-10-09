import { createHash, randomUUID } from "node:crypto";
import { pool, type PoolClient } from "@workspace/db";
import { GetV2WalletResponse, ListV2TransactionsResponse } from "@workspace/api-zod";

export class PointsError extends Error {
  constructor(public status: number, message: string, public body?: Record<string, unknown>) { super(message); }
}

type PointsType = "EARN" | "REDEEM" | "REFERRAL" | "BONUS" | "ADJUSTMENT" | "REFUND" | "REVERSAL" | "EXPIRATION";
type CommandBase = { actorId: string; idempotencyKey: string; reason: string };
export type PointsCommand = CommandBase & (
  | { kind: "adjust"; accountId: string; amount: number; fundingBudgetId?: string }
  // Trusted server integration seam only; deliberately has no public HTTP route.
  | { kind: "record"; accountId: string; type: Exclude<PointsType, "REFUND" | "REVERSAL" | "ADJUSTMENT">;
      amount: number; status: "pending" | "approved"; source: string; reference: string; description: string }
  | { kind: "decide"; transactionId: string; status: "approved" | "rejected" }
  | { kind: "compensate"; transactionId: string; type: "REFUND" | "REVERSAL" }
);
type Database = Pick<typeof pool, "query" | "connect">;
type Reader = Pick<PoolClient, "query">;

export function createPointsLedger(database: Database = pool) {
  async function wallet(accountId: string, client: Reader = database) {
    // One MVCC snapshot for all totals: no mixed balance/reservation reads.
    const r = await client.query(`WITH totals AS (
      SELECT COALESCE(sum(e.delta),0) balance,COALESCE(sum(e.reserved_delta),0) reserved
      FROM v2_points_events e JOIN v2_points_transactions t ON t.id=e.transaction_id WHERE t.account_id=$1
    ), lifecycle AS (
      SELECT COALESCE(sum(t.amount) FILTER (WHERE s.status='pending' AND t.amount>0),0) pending,
        COALESCE(sum(t.amount) FILTER (WHERE s.status='approved' AND t.type IN ('EARN','REFERRAL','BONUS')),0) earned,
        COALESCE(sum(-t.amount) FILTER (WHERE s.status='approved' AND t.type='REDEEM'),0) redeemed
      FROM v2_points_transactions t JOIN LATERAL (
        SELECT status FROM v2_points_events WHERE transaction_id=t.id ORDER BY sequence DESC LIMIT 1
      ) s ON true WHERE t.account_id=$1
    )
    SELECT a.id,totals.*,lifecycle.* FROM v2_accounts a CROSS JOIN totals CROSS JOIN lifecycle WHERE a.id=$1`, [accountId]);
    const row = r.rows[0];
    if (!row) throw new PointsError(404, "V2-kontoen finnes ikke.");
    const balance = Number(row.balance), reserved = Number(row.reserved);
    const result = { accountId, balance, reserved, available: balance - reserved,
      pending: Number(row.pending), lifetimeEarned: Number(row.earned), lifetimeRedeemed: Number(row.redeemed) };
    if (Object.values(result).some(v => typeof v === "number" && !Number.isSafeInteger(v))) {
      throw new PointsError(409, "Saldoen er utenfor støttet område. Kontakt administrator.");
    }
    if (balance < 0 || reserved < 0 || result.available < 0) {
      throw new PointsError(409, "Ikke nok tilgjengelige BonusPoints.");
    }
    return GetV2WalletResponse.parse(result);
  }

  const projection = `t.id,t.sequence::text,t.account_id AS "accountId",t.type,t.amount,t.source,t.reference,
    t.description,t.reason,t.related_transaction_id AS "relatedTransactionId",t.actor_id AS "actorId",
    t.created_at AS "createdAt",s.status,s.created_at AS "updatedAt",
    (SELECT jsonb_agg(jsonb_build_object('status',e.status,'delta',e.delta,'reservedDelta',e.reserved_delta,
      'reason',e.reason,'actorId',e.actor_id,'createdAt',e.created_at) ORDER BY e.sequence)
      FROM v2_points_events e WHERE e.transaction_id=t.id) AS events`;
  function serialize(row: Record<string, unknown>) {
    return { ...row, createdAt: (row.createdAt as Date).toISOString(), updatedAt: (row.updatedAt as Date).toISOString() };
  }
  async function transaction(id: string, client: Reader) {
    const r = await client.query(`SELECT ${projection} FROM v2_points_transactions t
      JOIN LATERAL (SELECT status,created_at FROM v2_points_events WHERE transaction_id=t.id ORDER BY sequence DESC LIMIT 1) s ON true
      WHERE t.id=$1`, [id]);
    if (!r.rows[0]) throw new PointsError(404, "Transaksjonen finnes ikke.");
    return ListV2TransactionsResponse.shape.items.element.parse(serialize(r.rows[0]));
  }
  async function history(accountId: string, cursor?: string, limit = 20) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 ||
      (cursor !== undefined && (!/^[1-9][0-9]{0,18}$/.test(cursor) || BigInt(cursor) > 9223372036854775807n))) {
      throw new PointsError(400, "Ugyldig side eller sidestørrelse.");
    }
    const r = await database.query(`SELECT ${projection} FROM v2_points_transactions t
      JOIN LATERAL (SELECT status,created_at FROM v2_points_events WHERE transaction_id=t.id ORDER BY sequence DESC LIMIT 1) s ON true
      WHERE t.account_id=$1 AND ($2::bigint IS NULL OR t.sequence<$2::bigint)
      ORDER BY t.sequence DESC LIMIT $3`, [accountId, cursor ?? null, limit + 1]);
    const rows = r.rows.slice(0, limit).map(serialize);
    return ListV2TransactionsResponse.parse({
      items: rows, nextCursor: r.rows.length > limit ? String(r.rows[limit - 1].sequence) : null,
    });
  }

  // Internal services may compose ledger writes with their own transaction.
  // Authorization, locks, idempotency and audit still run; caller owns rollback.
  async function executeInternal(input: PointsCommand, existingClient?: PoolClient, offerConversionId?: string) {
    const cmd = { ...input, reason: input.reason.trim() };
    if (!existingClient && /^(offer-|reward-)/.test(cmd.idempotencyKey)) {
      throw new PointsError(400, "Denne forespørselsnøkkelen er reservert for tilbudsintegrasjonen.");
    }
    if (cmd.reason.length < 10 || cmd.reason.length > 500 ||
      !/^[A-Za-z0-9_.:-]{16,128}$/.test(cmd.idempotencyKey)) throw new PointsError(400, "Begrunnelse eller forespørselsnøkkel er ugyldig.");
    if ("amount" in cmd && (!Number.isInteger(cmd.amount) || cmd.amount === 0 || Math.abs(cmd.amount) > 1_000_000)) {
      throw new PointsError(400, "Poeng må være et heltall fra -1 000 000 til 1 000 000, ulik null.");
    }
    if (cmd.kind === "record") {
      const credit = ["EARN", "REFERRAL", "BONUS"].includes(cmd.type);
      if (!["EARN", "REDEEM", "REFERRAL", "BONUS", "EXPIRATION"].includes(cmd.type) ||
        !["pending", "approved"].includes(cmd.status) || (credit ? cmd.amount < 0 : cmd.amount > 0) ||
        !cmd.source.trim() || cmd.source.length > 128 || !cmd.reference.trim() || cmd.reference.length > 128 ||
        !cmd.description.trim() || cmd.description.length > 500) throw new PointsError(400, "Ugyldig servertransaksjon.");
    }
    if (cmd.kind === "decide" && !["approved", "rejected"].includes(cmd.status)) throw new PointsError(400, "Ugyldig beslutning.");
    if (cmd.kind === "compensate" && !["REFUND", "REVERSAL"].includes(cmd.type)) throw new PointsError(400, "Ugyldig tilbakeføring.");
    // Canonical property order: replay equality is about intent, not JSON key order.
    const fingerprint = createHash("sha256").update(JSON.stringify(Object.fromEntries(
      Object.entries(cmd).sort(([a], [b]) => a.localeCompare(b)),
    ))).digest("hex");
    const client = existingClient ?? await database.connect();
    try {
      if (!existingClient) await client.query("BEGIN");
      // Serialize the global request key even when different accounts are targeted.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,20761009))", [cmd.idempotencyKey]);
      const original = "transactionId" in cmd ? await transaction(cmd.transactionId, client) : null;
      const accountId = "accountId" in cmd ? cmd.accountId : original!.accountId;
      // Sorted locks avoid actor/target cross-adjustment deadlocks.
      const locked = await client.query(`SELECT id,role,status FROM v2_accounts
        WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE`, [[cmd.actorId, accountId]]);
      const actor = locked.rows.find(a => a.id === cmd.actorId);
      if (!actor || actor.status !== "ACTIVE" || !["ADMIN", "SUPER_ADMIN"].includes(actor.role)) {
        throw new PointsError(403, "Bare aktive V2-administratorer kan endre poeng.");
      }
      const target = locked.rows.find(a => a.id === accountId);
      if (!target) throw new PointsError(404, "V2-kontoen finnes ikke.");
      // Administrators never decide their own financial benefit. Only a pending,
      // integration-recorded entry (e.g. a reservation) may name the actor's own account.
      if (cmd.actorId === accountId && (cmd.kind !== "record" || cmd.status !== "pending")) {
        throw new PointsError(403, "Administratorer kan ikke behandle poeng på egen konto.");
      }
      // Trusted reward cleanup must also refund/release an account suspended after ordering.
      const rewardCleanup = !!existingClient && cmd.idempotencyKey.startsWith("reward-") &&
        (cmd.kind === "compensate" || (cmd.kind === "decide" && cmd.status === "rejected")) &&
        original?.source.startsWith("reward:");
      if (target.status !== "ACTIVE" && !rewardCleanup) throw new PointsError(403, "Mottakerkontoen er ikke aktiv.");
      const previous = await client.query("SELECT fingerprint,transaction_id FROM v2_points_requests WHERE idempotency_key=$1", [cmd.idempotencyKey]);
      if (previous.rows[0]) {
        if (previous.rows[0].fingerprint !== fingerprint) throw new PointsError(409, "Nøkkelen er allerede brukt til en annen forespørsel.");
        const result = ({ transaction: await transaction(previous.rows[0].transaction_id, client),
          wallet: await wallet(accountId, client), replayed: true });
        if (!existingClient) await client.query("COMMIT");
        return result;
      }
      const before = await wallet(accountId, client);
      let id: string;
      async function event(transactionId: string, status: string, delta: number, reservedDelta: number) {
        await client.query(`INSERT INTO v2_points_events(transaction_id,status,delta,reserved_delta,reason,actor_id)
          VALUES($1,$2,$3,$4,$5,$6)`, [transactionId, status, delta, reservedDelta, cmd.reason, cmd.actorId]);
      }
      if (cmd.kind === "decide") {
        // Re-read after account lock: another decision can have won during lock acquisition.
        const current = await transaction(cmd.transactionId, client);
        if (!existingClient && /^(offer:|reward:)/.test(current.source)) {
          throw new PointsError(409, "Tilbudspoeng må behandles gjennom konverteringskontrollen.");
        }
        if (current.status !== "pending") throw new PointsError(409, "Bare ventende transaksjoner kan behandles.");
        id = current.id;
        await event(id, cmd.status, cmd.status === "approved" ? current.amount : 0, current.amount < 0 ? current.amount : 0);
      } else {
        id = randomUUID();
        let type: PointsType, amount: number, status: "pending" | "approved", source: string, reference: string, description: string;
        let related: string | null = null;
        if (cmd.kind === "compensate") {
          const current = await transaction(cmd.transactionId, client);
          if (current.source.startsWith("offer:")) {
            // Only the dedicated conversion flow may compensate offer credit.
            // Never trust an HTTP-provided source, amount or conversion binding.
            const binding = existingClient && offerConversionId && cmd.type === "REVERSAL"
              ? await client.query(`SELECT 1 FROM v2_offer_conversions v JOIN v2_offer_clicks c ON c.id=v.click_id
                WHERE v.id=$1 AND v.transaction_id=$2 AND v.status='verified' AND v.partner_status='verified'
                  AND c.account_id=$3 AND c.points=$4 AND 'offer:' || v.partner_id=$5 AND v.event_id=$6`,
              [offerConversionId, current.id, current.accountId, current.amount, current.source, current.reference])
              : null;
            if (!binding?.rowCount || current.type !== "EARN") {
              throw new PointsError(409, "Tilbudspoeng må reverseres gjennom konverteringskontrollen.");
            }
          }
          if (current.source.startsWith("reward:") && !existingClient) {
            throw new PointsError(409, "Premiekompensasjon krever en egen innløsnings- og tilbakeføringsflyt.");
          }
          if (current.status !== "approved" || ["REFUND", "REVERSAL"].includes(current.type)) {
            throw new PointsError(409, "Transaksjonen kan ikke tilbakeføres flere ganger.");
          }
          if (cmd.type === "REFUND" && current.amount >= 0) throw new PointsError(409, "Bare trekk kan refunderes.");
          type = cmd.type; amount = -current.amount; status = "approved";
          related = current.id; source = "compensation"; reference = current.id;
          description = type === "REFUND" ? "Full refusjon av poengtrekk" : "Tilbakeføring av transaksjon";
          await event(current.id, "reversed", 0, 0);
        } else if (cmd.kind === "adjust") {
          type = "ADJUSTMENT"; amount = cmd.amount; status = "approved";
          source = "admin-adjustment"; reference = cmd.idempotencyKey; description = "Administratorjustering";
        } else {
          ({ type, amount, status, source, reference, description } = cmd);
        }
        const reserve = status === "pending" && amount < 0 ? -amount : 0;
        if ((status === "approved" && amount < 0 && before.available < -amount) || reserve > before.available) {
          throw new PointsError(409, "Ikke nok tilgjengelige BonusPoints.");
        }
        await client.query(`INSERT INTO v2_points_transactions
          (id,account_id,type,amount,source,reference,description,reason,related_transaction_id,actor_id)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [id, accountId, type, amount, source, reference, description, cmd.reason, related, cmd.actorId]);
        await event(id, status, status === "approved" ? amount : 0, reserve);
      }
      const after = await wallet(accountId, client);
      await client.query(`INSERT INTO v2_audit_logs(id,actor_id,actor_role,action,entity_type,entity_id,metadata)
        VALUES($1,$2,$3,$4,'POINTS_TRANSACTION',$5,$6)`,
        [randomUUID(), cmd.actorId, actor.role, `POINTS_${cmd.kind.toUpperCase()}`, id,
          JSON.stringify({ accountId, reason: cmd.reason, before, after, requestKey: cmd.idempotencyKey })]);
      await client.query(`INSERT INTO v2_points_requests(idempotency_key,fingerprint,transaction_id,actor_id)
        VALUES($1,$2,$3,$4)`, [cmd.idempotencyKey, fingerprint, id, cmd.actorId]);
      const result = ({ transaction: await transaction(id, client), wallet: after, replayed: false });
      if (!existingClient) await client.query("COMMIT");
      return result;
    } catch (error) {
      if (!existingClient) await client.query("ROLLBACK");
      if ((error as { code?: string }).code === "23505") throw new PointsError(409, "Kilden eller transaksjonen er allerede bokført.");
      throw error;
    } finally { if (!existingClient) client.release(); }
  }
  async function execute(input: PointsCommand, existingClient?: PoolClient) {
    return executeInternal(input, existingClient);
  }
  // Server-only capability, requiring a conversion and caller-owned transaction.
  async function reverseOffer(conversionId: string, input: CommandBase & { transactionId: string }, client: PoolClient) {
    return executeInternal({ ...input, kind: "compensate", type: "REVERSAL" }, client, conversionId);
  }
  return { wallet, history, execute, reverseOffer };
}

export const pointsLedger = createPointsLedger();
