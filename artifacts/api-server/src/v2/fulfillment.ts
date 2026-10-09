import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { PointsError } from "./points";

// Gift-card vouchers are secrets: encrypted at rest with an application key (never in the
// database, logs, audit metadata or e-mail) and bound to their order id as authenticated data.
export const VOUCHER_KEY_VERSION = 1;
export type VoucherInput = { kind: "code" | "link"; value: string };

export function voucherKeyFromEnv(env: Record<string, string | undefined> = process.env): Buffer | undefined {
  const raw = env.V2_VOUCHER_KEY;
  if (!raw) return undefined;
  const key = Buffer.from(raw, "base64");
  return key.length === 32 ? key : undefined;
}
function requireKey(key: Buffer | undefined) {
  if (!key || key.length !== 32) throw new PointsError(503, "Sikker lagring av gavekort er ikke konfigurert. Kontakt drift.");
  return key;
}

export function validateVoucher(value: unknown): VoucherInput {
  const v = value as Partial<VoucherInput> | undefined;
  const text = typeof v?.value === "string" ? v.value.trim() : "";
  if (!v || !["code", "link"].includes(v.kind as string) || text.length < 4 || text.length > 2000 || /[\u0000-\u001f]/.test(text)) {
    throw new PointsError(400, "Oppgi gavekortets kode eller lenke fra leverandøren.");
  }
  if (v.kind === "link") {
    let url: URL;
    try { url = new URL(text); } catch { throw new PointsError(400, "Gavekortlenken må være en gyldig HTTPS-adresse."); }
    if (url.protocol !== "https:") throw new PointsError(400, "Gavekortlenken må være en gyldig HTTPS-adresse.");
  }
  return { kind: v.kind as VoucherInput["kind"], value: text };
}

export function encryptVoucher(key: Buffer | undefined, orderId: string, voucher: VoucherInput) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", requireKey(key), iv);
  cipher.setAAD(Buffer.from(`${orderId}:${voucher.kind}`));
  const ciphertext = Buffer.concat([cipher.update(voucher.value, "utf8"), cipher.final()]);
  return { ciphertext, iv, tag: cipher.getAuthTag(), keyVersion: VOUCHER_KEY_VERSION };
}

export function decryptVoucher(key: Buffer | undefined, orderId: string, row: { kind: string; ciphertext: Buffer; iv: Buffer; tag: Buffer }) {
  const decipher = createDecipheriv("aes-256-gcm", requireKey(key), row.iv);
  decipher.setAAD(Buffer.from(`${orderId}:${row.kind}`));
  decipher.setAuthTag(row.tag);
  return Buffer.concat([decipher.update(row.ciphertext), decipher.final()]).toString("utf8");
}

/**
 * Supplier fulfilment seam. The MVP only has manual delivery: dispatch records the decision and an
 * administrator completes the purchase in the supplier portal. An automatic supplier adapter can
 * be added here later; the database currently only allows `manual` suppliers.
 */
export interface FulfillmentProvider { mode: "manual" | "api"; afterDispatch(orderId: string): Promise<{ automatic: boolean }> }
const manual: FulfillmentProvider = { mode: "manual", async afterDispatch() { return { automatic: false }; } };
export function fulfillmentProvider(mode: string): FulfillmentProvider {
  if (mode === "manual") return manual;
  throw new PointsError(503, "Automatisk gavekortlevering er ikke aktivert.");
}
