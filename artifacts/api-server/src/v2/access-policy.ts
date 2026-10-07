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
