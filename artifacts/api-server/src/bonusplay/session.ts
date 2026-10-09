import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Request, Response, CookieOptions } from "express";

const COOKIE = "bonusplay_demo";
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
export interface DemoIdentity { userId: string; role: "user" | "admin"; expiresAt: number; testerId: string }
function cookieOptions(req: Request): CookieOptions {
  const local = ["localhost", "127.0.0.1"].includes(req.hostname);
  // The Preview is embedded. Partitioning permits its HTTPS cookie without
  // sharing a session with unrelated top-level sites.
  return { httpOnly: true, sameSite: local ? "lax" : "none", secure: !local, partitioned: !local, path: "/api" };
}

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET is required for signed demo sessions.");
  return value;
}
function signature(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}
export function readSession(req: Request): DemoIdentity | null {
  const token = req.headers.cookie?.split(";").map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!token) return null;
  const [payload, signed] = token.split(".");
  if (!payload || !signed || signed.length !== 64) return null;
  const expected = signature(payload);
  if (!timingSafeEqual(Buffer.from(signed), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as DemoIdentity;
    // Sessions issued before the demo became private carry no tester and are no longer valid.
    if (!parsed.userId || !parsed.testerId || !["user", "admin"].includes(parsed.role) || parsed.expiresAt < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}
export function startSession(req: Request, res: Response, role: "user" | "admin", testerId: string): DemoIdentity {
  const existing = readSession(req);
  const userId = existing?.testerId === testerId ? existing.userId : `demo-${randomUUID()}`;
  const identity: DemoIdentity = { userId, role, expiresAt: Date.now() + MAX_AGE, testerId };
  const payload = Buffer.from(JSON.stringify(identity)).toString("base64url");
  res.cookie(COOKIE, `${payload}.${signature(payload)}`, { ...cookieOptions(req), maxAge: MAX_AGE });
  return identity;
}
export function endSession(req: Request, res: Response): void {
  res.clearCookie(COOKIE, cookieOptions(req));
}
