import { createHmac, timingSafeEqual } from "node:crypto";
import { PointsError } from "./points";

export function verifyOfferSignature(raw: Buffer, secret: string | undefined, headers: {
  timestamp?: string; nonce?: string; signature?: string;
}, now = Date.now()) {
  const { timestamp, nonce, signature } = headers;
  if (!secret || secret.length < 32) throw new PointsError(503, "Partnerintegrasjonen er ikke konfigurert.");
  if (!timestamp || !/^[0-9]{10}$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 300 ||
    !nonce || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(nonce) ||
    !signature || !/^[0-9a-f]{64}$/i.test(signature)) {
    throw new PointsError(401, "Ugyldig eller utløpt partnersignatur.");
  }
  const expected = createHmac("sha256", secret).update(`${timestamp}.${nonce}.`).update(raw).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) throw new PointsError(401, "Ugyldig partnersignatur.");
  return { nonce, timestamp };
}
