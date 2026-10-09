export type V2Role = "USER" | "PARTNER" | "ADMIN" | "SUPER_ADMIN";
export type V2Status = "ACTIVE" | "SUSPENDED" | "DELETION_REQUESTED";
const roles: readonly string[] = ["USER", "PARTNER", "ADMIN", "SUPER_ADMIN"];

export function canAccess(role: string, status: string, allowed: readonly V2Role[]): boolean {
  // No implicit hierarchy: administrators do not become company owners.
  return status === "ACTIVE" && roles.includes(role) && allowed.includes(role as V2Role);
}

export function isSafeMutation(headers: { origin?: string; host?: string; fetchSite?: string }): boolean {
  if (headers.fetchSite === "cross-site") return false;
  if (!headers.origin || !headers.host) return false;
  try {
    const origin = new URL(headers.origin);
    const expected = new URL(`${origin.protocol}//${headers.host}`);
    return ["http:", "https:"].includes(origin.protocol) && origin.origin === expected.origin;
  } catch {
    return false;
  }
}

/** Clerk `factorVerificationAge`: [first factor minutes, second factor minutes]; -1 = never verified. */
export type FactorAge = readonly [number, number] | null | undefined;
export const STEP_UP_MINUTES = 10;
export type AdminMfaResult = "ok" | "mfa_required" | "reverify";

// Administrators must use a second factor; high-risk confirmations need a fresh one.
// Only a non-production environment may explicitly opt out for local development.
export function adminMfaStatus(age: FactorAge, opts: { strict?: boolean; enforce: boolean }): AdminMfaResult {
  if (!opts.enforce) return "ok";
  const second = Array.isArray(age) ? age[1] : -1;
  if (!Number.isFinite(second) || second < 0) return "mfa_required";
  if (opts.strict && second > STEP_UP_MINUTES) return "reverify";
  return "ok";
}

export function mfaEnforced(env: Record<string, string | undefined>): boolean {
  return !(env.V2_ADMIN_MFA === "off" && env.NODE_ENV !== "production");
}
