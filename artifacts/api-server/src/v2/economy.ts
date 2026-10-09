import { PointsError } from "./points";

type Reader = { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

export type EconomyConfig = {
  version: number; pointsPerNok: number; defaultShareBp: number; maxShareBp: number; minMarginBp: number;
  highRiskCooldownMinutes: number; highValueOrderPoints: number; dualControl: boolean;
  minAccountAgeDays: number; minVerifiedPointsBeforeRedeem: number; maxRedemptionsPerDay: number;
  maxRedeemPointsPerDay: number; createdBy: string; createdAt: string;
};
export type EconomyChange = Omit<EconomyConfig, "version" | "pointsPerNok" | "createdBy" | "createdAt">;

// Owner-approved bounds (2026-10-09). The database enforces the same limits.
export const ECONOMY_LIMITS = {
  pointsPerNok: 100, maxShareBp: 4000, minMarginBp: 5000, minCooldownMinutes: 60,
} as const;

const projection = `version,points_per_nok AS "pointsPerNok",default_share_bp AS "defaultShareBp",
  max_share_bp AS "maxShareBp",min_margin_bp AS "minMarginBp",high_risk_cooldown_minutes AS "highRiskCooldownMinutes",
  high_value_order_points AS "highValueOrderPoints",dual_control AS "dualControl",min_account_age_days AS "minAccountAgeDays",
  min_verified_points_before_redeem AS "minVerifiedPointsBeforeRedeem",max_redemptions_per_day AS "maxRedemptionsPerDay",
  max_redeem_points_per_day AS "maxRedeemPointsPerDay",created_by AS "createdBy",created_at AS "createdAt"`;

export async function currentEconomy(client: Reader): Promise<EconomyConfig> {
  const row = (await client.query(`SELECT ${projection} FROM v2_economy_config ORDER BY version DESC LIMIT 1`)).rows[0];
  if (!row) throw new PointsError(503, "Økonomikonfigurasjonen mangler. Kontakt operatør.");
  return { ...row, createdAt: (row.createdAt as Date).toISOString() } as EconomyConfig;
}

const int = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

export function validateEconomyChange(value: unknown): EconomyChange {
  const v = (value ?? {}) as Record<string, unknown>;
  const keys = ["defaultShareBp", "maxShareBp", "minMarginBp", "highRiskCooldownMinutes", "highValueOrderPoints", "dualControl",
    "minAccountAgeDays", "minVerifiedPointsBeforeRedeem", "maxRedemptionsPerDay", "maxRedeemPointsPerDay"];
  if (typeof value !== "object" || value === null || Object.keys(v).some(k => !keys.includes(k)) || keys.some(k => !(k in v))) {
    throw new PointsError(400, "Alle økonomifelt må oppgis, og ukjente felt er ikke tillatt.");
  }
  if (!int(v.maxShareBp, 0, ECONOMY_LIMITS.maxShareBp) || !int(v.defaultShareBp, 0, v.maxShareBp as number)) {
    throw new PointsError(400, "Brukerandelen kan maksimalt være 40 %, og standardandelen kan ikke overstige maksimum.");
  }
  if (!int(v.minMarginBp, ECONOMY_LIMITS.minMarginBp, 10000)) throw new PointsError(400, "Minstemarginen kan ikke være under 50 %.");
  if (!int(v.highRiskCooldownMinutes, ECONOMY_LIMITS.minCooldownMinutes, 10080)) {
    throw new PointsError(400, "Ventetiden for høyrisikohandlinger må være minst 60 minutter.");
  }
  if (!int(v.highValueOrderPoints, 1, 1_000_000) || typeof v.dualControl !== "boolean" || !int(v.minAccountAgeDays, 0, 365) ||
    !int(v.minVerifiedPointsBeforeRedeem, 0, 1_000_000) || !int(v.maxRedemptionsPerDay, 1, 100) ||
    !int(v.maxRedeemPointsPerDay, 1, 1_000_000)) throw new PointsError(400, "Kontroller grenseverdiene.");
  return Object.fromEntries(keys.map(k => [k, v[k]])) as EconomyChange;
}

export async function appendEconomyVersion(client: Reader, change: EconomyChange, actorId: string, requestId: string) {
  const current = await currentEconomy(client);
  const version = current.version + 1;
  await client.query(`INSERT INTO v2_economy_config(version,points_per_nok,default_share_bp,max_share_bp,min_margin_bp,
    high_risk_cooldown_minutes,high_value_order_points,dual_control,min_account_age_days,min_verified_points_before_redeem,
    max_redemptions_per_day,max_redeem_points_per_day,created_by,request_id)
    VALUES($1,100,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
  [version, change.defaultShareBp, change.maxShareBp, change.minMarginBp, change.highRiskCooldownMinutes,
    change.highValueOrderPoints, change.dualControl, change.minAccountAgeDays, change.minVerifiedPointsBeforeRedeem,
    change.maxRedemptionsPerDay, change.maxRedeemPointsPerDay, actorId, requestId]);
  return { version };
}
