import { createHash } from "node:crypto";
import { pool } from "@workspace/db";

type Transaction = {
  id: string; account_id: string; type: string; amount: number;
  source: string; reference: string; related_transaction_id: string | null;
  actor_id: string;
};
type Event = {
  sequence: string; transaction_id: string; status: string; delta: number;
  reserved_delta: number; actor_id: string;
};
type Wallet = { accountId?: string; balance?: number; reserved?: number; available?: number };
type Audit = {
  id: string; actor_id: string; action: string; entity_type: string; entity_id: string;
  account_id: string | null; request_key: string | null; before: Wallet | null; after: Wallet | null;
};
type Request = { idempotency_key: string; transaction_id: string; actor_id: string };
export type PointsSnapshot = {
  transactions: Transaction[]; events: Event[]; audits: Audit[]; requests: Request[];
};
export type PointsFinding = {
  code: string; accountRef: string | null; transactionRef: string | null;
  eventRef?: string; auditRef?: string;
};
export type PointsReport = {
  version: 1; checkedAt: string; status: "ok" | "drift"; requiresOperatorReview: boolean;
  counts: { transactions: number; events: number; audits: number; requests: number };
  findings: PointsFinding[];
};

// No raw identity, source/reference, request keys, reasons or error messages leave this module.
// Full SHA-256 references allow an operator to correlate IDs without exposing identities in logs.
export function pointsAccountRef(id: string) {
  return `account-sha256:${createHash("sha256").update(id).digest("hex")}`;
}
function technicalRef(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ? id : `sha256:${createHash("sha256").update(id).digest("hex")}`;
}

/** Pure detector: financial corrections are deliberately not part of this interface. */
export function analyzePointsSnapshot(snapshot: PointsSnapshot, checkedAt: string): PointsReport {
  const { transactions, events, audits, requests } = snapshot;
  const findings: PointsFinding[] = [];
  const tx = new Map(transactions.map(t => [t.id, t]));
  const byTransaction = new Map<string, Event[]>();
  const orderedEvents = [...events].sort((a, b) => BigInt(a.sequence) < BigInt(b.sequence) ? -1 : 1);
  const report = (code: string, t?: Transaction, event?: Event, audit?: Audit) => {
    findings.push({
      code, accountRef: t ? pointsAccountRef(t.account_id) : null,
      transactionRef: t ? technicalRef(t.id) : event ? technicalRef(event.transaction_id) : audit ? technicalRef(audit.entity_id) : null,
      ...(event ? { eventRef: /^[0-9]+$/.test(event.sequence) ? event.sequence : technicalRef(event.sequence) } : {}),
      ...(audit ? { auditRef: technicalRef(audit.id) } : {}),
    });
  };
  // Running totals are derived in event order, never from potentially corrupt audit snapshots.
  const totals = new Map<string, { balance: number; reserved: number }>();
  const eventTotals = new Map<string, { before: Wallet; after: Wallet }>();
  for (const e of orderedEvents) {
    const t = tx.get(e.transaction_id);
    if (!t) { report("ORPHAN_EVENT", undefined, e); continue; }
    const list = byTransaction.get(t.id) ?? [];
    list.push(e); byTransaction.set(t.id, list);
    const before = totals.get(t.account_id) ?? { balance: 0, reserved: 0 };
    const after = { balance: before.balance + e.delta, reserved: before.reserved + e.reserved_delta };
    eventTotals.set(e.sequence, { before: { ...before }, after: { ...after } });
    totals.set(t.account_id, after);
    if (!Number.isSafeInteger(after.balance) || !Number.isSafeInteger(after.reserved) ||
      after.balance < 0 || after.reserved < 0 || after.balance < after.reserved) {
      report("ACCOUNT_BALANCE_INVARIANT", t, e);
    }
  }
  const compensations = new Map<string, Transaction[]>();
  const origins = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const origin = JSON.stringify([t.source, t.reference]);
    const group = origins.get(origin) ?? [];
    group.push(t); origins.set(origin, group);
    if (t.related_transaction_id) {
      const children = compensations.get(t.related_transaction_id) ?? [];
      children.push(t); compensations.set(t.related_transaction_id, children);
    }
  }
  for (const group of origins.values()) {
    if (group.length > 1) for (const t of group) report("DUPLICATE_ORIGIN", t);
  }
  for (const t of transactions) {
    const es = byTransaction.get(t.id) ?? [];
    if (!es.length) report("MISSING_EVENT", t);
    let previous: string | undefined;
    for (const e of es) {
      const valid = previous === undefined ? ["pending", "approved"].includes(e.status)
        : previous === "pending" ? ["approved", "rejected"].includes(e.status)
        : previous === "approved" && e.status === "reversed";
      if (!valid) report("INVALID_LIFECYCLE", t, e);
      const expectedDelta = e.status === "approved" ? t.amount : 0;
      const expectedReserve = t.amount < 0
        ? e.status === "pending" ? -t.amount
          : previous === "pending" && ["approved", "rejected"].includes(e.status) ? t.amount : 0
        : 0;
      if (e.delta !== expectedDelta || e.reserved_delta !== expectedReserve) report("EVENT_EFFECT_MISMATCH", t, e);
      previous = e.status;
    }
    const actualBalance = es.reduce((sum, e) => sum + e.delta, 0);
    const actualReserved = es.reduce((sum, e) => sum + e.reserved_delta, 0);
    const expectedBalance = es.some(e => e.status === "approved") ? t.amount : 0;
    const expectedReserved = previous === "pending" && t.amount < 0 ? -t.amount : 0;
    if (actualBalance !== expectedBalance || actualReserved !== expectedReserved) report("TRANSACTION_TOTAL_MISMATCH", t);
    const children = compensations.get(t.id) ?? [];
    if (children.length > 1) {
      report("DUPLICATE_COMPENSATION", t);
      for (const child of children) report("DUPLICATE_COMPENSATION", child);
    }
    if ((previous === "reversed") !== (children.length > 0)) report("COMPENSATION_LINK_MISMATCH", t);
    if (["REFUND", "REVERSAL"].includes(t.type)) {
      const original = t.related_transaction_id ? tx.get(t.related_transaction_id) : undefined;
      if (!original || original.account_id !== t.account_id || t.amount !== -original.amount ||
        ["REFUND", "REVERSAL"].includes(original.type) || (t.type === "REFUND" && original.amount >= 0) ||
        es.length !== 1 || es[0]?.status !== "approved" ||
        (byTransaction.get(original.id)?.at(-1)?.status !== "reversed")) {
        report("INVALID_COMPENSATION", t);
      }
    } else if (t.related_transaction_id) report("INVALID_COMPENSATION", t);
  }

  const coverage = new Map<string, number>();
  const auditKeys = new Map<string, Audit[]>();
  const requestsByKey = new Map<string, Request[]>();
  for (const r of requests) {
    const group = requestsByKey.get(r.idempotency_key) ?? [];
    group.push(r); requestsByKey.set(r.idempotency_key, group);
  }
  for (const audit of audits) {
    if (audit.request_key) {
      const group = auditKeys.get(audit.request_key) ?? [];
      group.push(audit); auditKeys.set(audit.request_key, group);
    }
  }
  for (const audit of audits) {
    const t = tx.get(audit.entity_id);
    if (!t) { report("ORPHAN_AUDIT", undefined, undefined, audit); continue; }
    if (audit.entity_type !== "POINTS_TRANSACTION") report("AUDIT_ENTITY_MISMATCH", t, undefined, audit);
    const es = byTransaction.get(t.id) ?? [];
    let matched: Event[] = [];
    if (["POINTS_RECORD", "POINTS_ADJUST"].includes(audit.action)) {
      if ((audit.action === "POINTS_ADJUST") !== (t.type === "ADJUSTMENT") ||
        ["REFUND", "REVERSAL"].includes(t.type)) report("AUDIT_ACTION_MISMATCH", t, undefined, audit);
      matched = es.slice(0, 1);
    } else if (audit.action === "POINTS_DECIDE") {
      matched = es.filter((e, i) => i === 1 && ["approved", "rejected"].includes(e.status) && es[0].status === "pending");
    } else if (audit.action === "POINTS_COMPENSATE") {
      const originalEvents = t.related_transaction_id ? byTransaction.get(t.related_transaction_id) ?? [] : [];
      matched = [...originalEvents.filter(e => e.status === "reversed"), ...es.slice(0, 1)];
      if (!["REFUND", "REVERSAL"].includes(t.type) || matched.length !== 2) report("AUDIT_ACTION_MISMATCH", t, undefined, audit);
    } else report("AUDIT_ACTION_MISMATCH", t, undefined, audit);
    const linkedRequests = audit.request_key ? requestsByKey.get(audit.request_key) ?? [] : [];
    if (linkedRequests.length !== 1 || linkedRequests[0]?.transaction_id !== t.id ||
      linkedRequests[0]?.actor_id !== audit.actor_id || audit.account_id !== t.account_id) {
      report("AUDIT_REQUEST_MISMATCH", t, undefined, audit);
    }
    if (!matched.length) report("AUDIT_WITHOUT_EVENT", t, undefined, audit);
    for (const e of matched) {
      coverage.set(e.sequence, (coverage.get(e.sequence) ?? 0) + 1);
      if (e.actor_id !== audit.actor_id) report("AUDIT_ACTOR_MISMATCH", t, e, audit);
    }
    if (["POINTS_RECORD", "POINTS_ADJUST", "POINTS_COMPENSATE"].includes(audit.action) && t.actor_id !== audit.actor_id) {
      report("AUDIT_ACTOR_MISMATCH", t, undefined, audit);
    }
    const ordered = matched.sort((a, b) => BigInt(a.sequence) < BigInt(b.sequence) ? -1 : 1);
    const before = ordered.length ? eventTotals.get(ordered[0].sequence)?.before : undefined;
    const after = ordered.length ? eventTotals.get(ordered.at(-1)!.sequence)?.after : undefined;
    const matchesWallet = (actual: Wallet | null, expected?: Wallet) =>
      !!actual && !!expected && actual.accountId === t.account_id &&
      actual.balance === expected.balance && actual.reserved === expected.reserved &&
      actual.available === expected.balance! - expected.reserved!;
    if (!matchesWallet(audit.before, before) || !matchesWallet(audit.after, after)) {
      report("AUDIT_BALANCE_MISMATCH", t, undefined, audit);
    }
  }
  for (const e of orderedEvents) {
    const count = coverage.get(e.sequence) ?? 0;
    if (count !== 1) report(count === 0 ? "EVENT_WITHOUT_AUDIT" : "EVENT_MULTIPLE_AUDITS", tx.get(e.transaction_id), e);
  }
  const requestKeys = new Set<string>();
  for (const r of requests) {
    const t = tx.get(r.transaction_id);
    if (!t) {
      findings.push({ code: "ORPHAN_REQUEST", accountRef: null, transactionRef: technicalRef(r.transaction_id) });
    }
    if (requestKeys.has(r.idempotency_key)) report("DUPLICATE_REQUEST", t);
    requestKeys.add(r.idempotency_key);
    if ((auditKeys.get(r.idempotency_key)?.length ?? 0) !== 1) report("REQUEST_AUDIT_CARDINALITY", t);
  }
  return {
    version: 1, checkedAt, status: findings.length ? "drift" : "ok",
    requiresOperatorReview: findings.length > 0,
    counts: { transactions: transactions.length, events: events.length, audits: audits.length, requests: requests.length },
    findings,
  };
}

export function createPointsReconciler(database: Pick<typeof pool, "connect"> = pool) {
  return async function reconcile(options: { scheduled?: boolean } = {}): Promise<PointsReport | null> {
    const client = await database.connect();
    try {
      // Every SELECT below observes the same committed ledger, including audit and request rows.
      // Read-only at the database level is a second guard against accidental correction code.
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query("SET LOCAL statement_timeout = '60s'");
      if (options.scheduled) {
        const lock = await client.query("SELECT pg_try_advisory_xact_lock(20761009, 7) AS acquired");
        if (!lock.rows[0].acquired) { await client.query("ROLLBACK"); return null; }
      }
      const timestamp = await client.query("SELECT transaction_timestamp() AS checked_at");
      const transactions = await client.query(`SELECT id,account_id,type,amount,source,reference,
        related_transaction_id,actor_id FROM v2_points_transactions ORDER BY sequence`);
      const events = await client.query(`SELECT sequence::text,transaction_id,status,delta,reserved_delta,actor_id
        FROM v2_points_events ORDER BY sequence`);
      const requests = await client.query("SELECT idempotency_key,transaction_id,actor_id FROM v2_points_requests");
      const audits = await client.query(`SELECT id,actor_id,action,entity_type,entity_id,metadata->>'accountId' AS account_id,
        metadata->>'requestKey' AS request_key,metadata->'before' AS before,metadata->'after' AS after
        FROM v2_audit_logs WHERE entity_type='POINTS_TRANSACTION' OR action LIKE 'POINTS\\_%' ESCAPE '\\'`);
      const result = analyzePointsSnapshot({
        transactions: transactions.rows, events: events.rows, requests: requests.rows, audits: audits.rows,
      }, timestamp.rows[0].checked_at.toISOString());
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error; // Callers must surface failure, never report an unavailable scan as healthy.
    } finally { client.release(); }
  };
}
