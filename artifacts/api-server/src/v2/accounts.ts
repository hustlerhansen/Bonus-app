import { randomUUID, randomBytes } from "node:crypto";
import { clerkClient, getAuth } from "@clerk/express";
import type { Request } from "express";
import { pool, type PoolClient } from "@workspace/db";
import { GetV2AccountResponse } from "@workspace/api-zod";
import { DemoError } from "../bonusplay/service";
import { canAccess, type V2Role } from "./access-policy";

export const TERMS_VERSION = "v2-foundation-draft-2026-10-07";
export const PRIVACY_VERSION = "v2-foundation-draft-2026-10-07";

export function authenticated(req: Request) {
  const auth = getAuth(req);
  if (!auth.userId || !auth.sessionId) throw new DemoError(401, "Logg inn med en ekte BONUSPLAY-konto.");
  return { userId: auth.userId, sessionId: auth.sessionId };
}

const projection = `id,email,first_name AS "firstName",last_name AS "lastName",country,language,
  role,status,referral_code AS "referralCode",terms_version AS "termsVersion",privacy_version AS "privacyVersion",
  terms_accepted_at AS "termsAcceptedAt",privacy_accepted_at AS "privacyAcceptedAt",email_verified_at AS "emailVerifiedAt",
  created_at AS "createdAt",last_login_at AS "lastLoginAt"`;

export async function accountState(userId: string, client: PoolClient | typeof pool = pool) {
  const result = await client.query(`SELECT ${projection} FROM v2_accounts WHERE id=$1`, [userId]);
  const account = result.rows[0] ?? null;
  if (account) {
    for (const key of ["termsAcceptedAt", "privacyAcceptedAt", "emailVerifiedAt", "createdAt", "lastLoginAt"]) {
      account[key] = account[key].toISOString();
    }
  }
  return GetV2AccountResponse.parse({
    account, termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION,
    phase: "POINTS", commerceEnabled: false,
  });
}

export async function requireAccount(req: Request, allowed?: readonly V2Role[]) {
  const identity = authenticated(req);
  const state = await accountState(identity.userId);
  if (!state.account) throw new DemoError(403, "Fullfør kontoregistreringen først.");
  if (state.account.status !== "ACTIVE") throw new DemoError(403, "Kontoen er ikke aktiv. Kontakt support.");
  if (allowed && !canAccess(state.account.role, state.account.status, allowed)) {
    throw new DemoError(403, "Du har ikke tilgang til denne funksjonen.");
  }
  return { ...identity, account: state.account };
}

export async function enroll(req: Request, input: {
  firstName: string; lastName: string; country: string; language: string;
  termsVersion: string; privacyVersion: string;
}) {
  const identity = authenticated(req);
  if (input.termsVersion !== TERMS_VERSION || input.privacyVersion !== PRIVACY_VERSION) {
    throw new DemoError(409, "Vilkårene er oppdatert. Last siden på nytt før du fortsetter.");
  }
  // Trusted provider read: neither email nor verification status comes from the browser.
  const user = await clerkClient.users.getUser(identity.userId);
  const email = user.emailAddresses.find(e => e.id === user.primaryEmailAddressId);
  if (!email || email.verification?.status !== "verified") {
    throw new DemoError(403, "Bekreft e-postadressen din før du oppretter kontoen.");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(`INSERT INTO v2_accounts
      (id,email,first_name,last_name,country,language,referral_code,terms_version,privacy_version,
      terms_accepted_at,privacy_accepted_at,email_verified_at,last_session_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),now(),now(),$10)
      ON CONFLICT (id) DO NOTHING RETURNING id`,
      [identity.userId, email.emailAddress.toLowerCase(), input.firstName.trim(), input.lastName.trim(),
        input.country, input.language, `BP${randomBytes(12).toString("hex").toUpperCase()}`,
        TERMS_VERSION, PRIVACY_VERSION, identity.sessionId]);
    if (inserted.rowCount) {
      for (const [kind, version] of [["TERMS", TERMS_VERSION], ["PRIVACY", PRIVACY_VERSION]]) {
        await client.query("INSERT INTO v2_consents(id,account_id,kind,version) VALUES($1,$2,$3,$4)",
          [randomUUID(), identity.userId, kind, version]);
      }
      await client.query(`INSERT INTO v2_audit_logs(id,actor_id,actor_role,action,entity_type,entity_id,metadata)
        VALUES($1,$2,'USER','ACCOUNT_ENROLLED','ACCOUNT',$2,$3)`,
        [randomUUID(), identity.userId, JSON.stringify({ role: "USER", status: "ACTIVE", ageConfirmed: true })]);
    }
    const state = await accountState(identity.userId, client);
    if (state.account?.status !== "ACTIVE") throw new DemoError(403, "Kontoen er ikke aktiv.");
    await client.query("COMMIT");
    return state;
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505") throw new DemoError(409, "Denne kontoen er allerede registrert.");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateProfile(req: Request, input: { firstName: string; lastName: string; country: string; language: string }) {
  const identity = await requireAccount(req);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Status checked again under row lock: concurrent suspension wins before edit.
    const locked = await client.query("SELECT status,role FROM v2_accounts WHERE id=$1 FOR UPDATE", [identity.userId]);
    if (locked.rows[0]?.status !== "ACTIVE") throw new DemoError(403, "Kontoen er ikke aktiv.");
    await client.query(`UPDATE v2_accounts SET first_name=$2,last_name=$3,country=$4,language=$5 WHERE id=$1`,
      [identity.userId, input.firstName.trim(), input.lastName.trim(), input.country, input.language]);
    await client.query(`INSERT INTO v2_audit_logs(id,actor_id,actor_role,action,entity_type,entity_id,metadata)
      VALUES($1,$2,$3,'PROFILE_UPDATED','ACCOUNT',$2,$4)`,
      [randomUUID(), identity.userId, locked.rows[0].role, JSON.stringify({ fields: ["firstName", "lastName", "country", "language"] })]);
    const state = await accountState(identity.userId, client);
    await client.query("COMMIT");
    return state;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
