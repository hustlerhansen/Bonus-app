import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db, activitiesTable, rewardsTable, eventsTable, auditLogsTable } from "@workspace/db";
import { CreateCatalogItemBody, UpdateCatalogItemBody, GetAdminCatalogResponse } from "@workspace/api-zod";
import type { DemoIdentity } from "./session";
import { DemoError } from "./service";

type Input = ReturnType<typeof CreateCatalogItemBody.parse>;
type Update = ReturnType<typeof UpdateCatalogItemBody.parse>;

export async function getCatalog() {
  const [activities, rewards, events] = await Promise.all([
    db.select().from(activitiesTable).where(inArray(activitiesTable.category, ["mission", "survey", "offer"])),
    db.select().from(rewardsTable),
    db.select().from(eventsTable),
  ]);
  return GetAdminCatalogResponse.parse([
    ...activities.map(a => ({ ...a, enabled: a.enabled })),
    ...rewards.map(r => ({ id: r.id, category: "reward", title: r.title, description: r.subtitle, enabled: r.available, cost: r.cost, nokAmount: r.nokAmount, rewardCategory: r.category })),
    ...events.map(e => ({ id: e.id, category: "event", title: e.title, description: e.description, enabled: e.enabled, target: e.target, endsAt: e.endsAt.toISOString() })),
  ]);
}

function economicCheck(cost: number, nokAmount: number): void {
  if (cost < nokAmount * 100) throw new DemoError(400, "Poengkostnaden kan ikke være lavere enn demoens verdi (100 poeng per krone).");
}
async function audit(identity: DemoIdentity, action: string, id: string): Promise<void> {
  await db.insert(auditLogsTable).values({ id: randomUUID(), actor: identity.userId, action, sourceId: id });
}

export async function createItem(identity: DemoIdentity, input: Input) {
  const id = `${input.category}-${randomUUID().slice(0, 8)}`;
  if (input.category === "reward") {
    const cost = input.cost ?? 10000, nokAmount = input.nokAmount ?? 100;
    economicCheck(cost, nokAmount);
    await db.insert(rewardsTable).values({
      id, title: input.title, subtitle: `${input.description || `${nokAmount} kr`} • Demo`,
      cost, nokAmount, category: input.rewardCategory || "Gavekort", available: input.enabled ?? true,
    });
  } else if (input.category === "event") {
    const endsAt = input.endsAt ? new Date(String(input.endsAt)) : new Date(Date.now() + 7 * 86400000);
    if (!Number.isFinite(endsAt.getTime())) throw new DemoError(400, "Velg en gyldig sluttdato.");
    await db.insert(eventsTable).values({ id, title: input.title, description: input.description ?? "", target: input.target ?? 500, endsAt, enabled: input.enabled ?? true });
  } else {
    await db.insert(activitiesTable).values({
      id, category: input.category, title: input.title, description: input.description ?? "",
      type: input.category === "survey" ? "SURVEY" : input.category === "offer" ? "OFFER" : input.type ?? "DAILY_CHALLENGE",
      points: input.points ?? 20, xp: input.xp ?? 5, gems: input.gems ?? 5, minutes: input.minutes ?? 3, enabled: input.enabled ?? true,
    });
  }
  await audit(identity, "CATALOG_CREATED", id);
  return (await getCatalog()).find(item => item.id === id);
}

export async function updateItem(identity: DemoIdentity, id: string, input: Update) {
  const current = (await getCatalog()).find(item => item.id === id);
  if (!current) throw new DemoError(404, "Elementet finnes ikke.");
  if (!Object.keys(input).length) throw new DemoError(400, "Ingen endringer ble sendt.");
  if (current.category === "reward") {
    const cost = input.cost ?? current.cost ?? 10000, nokAmount = input.nokAmount ?? current.nokAmount ?? 100;
    economicCheck(cost, nokAmount);
    await db.update(rewardsTable).set({
      title: input.title ?? current.title, subtitle: input.description === undefined ? current.description : `${input.description} • Demo`,
      cost, nokAmount, category: input.rewardCategory ?? current.rewardCategory, available: input.enabled ?? current.enabled,
    }).where(eq(rewardsTable.id, id));
  } else if (current.category === "event") {
    const endsAt = new Date(String(input.endsAt ?? current.endsAt));
    if (!Number.isFinite(endsAt.getTime())) throw new DemoError(400, "Velg en gyldig sluttdato.");
    await db.update(eventsTable).set({ title: input.title ?? current.title, description: input.description ?? current.description, enabled: input.enabled ?? current.enabled, target: input.target ?? current.target, endsAt }).where(eq(eventsTable.id, id));
  } else {
    const update = {
      title: input.title ?? current.title, description: input.description ?? current.description, enabled: input.enabled ?? current.enabled,
      type: current.category === "survey" ? "SURVEY" : current.category === "offer" ? "OFFER" : input.type ?? current.type,
      points: input.points ?? current.points, xp: input.xp ?? current.xp, gems: input.gems ?? current.gems, minutes: input.minutes ?? current.minutes,
    };
    await db.update(activitiesTable).set(update).where(eq(activitiesTable.id, id));
    if (id === "mission-referral") await db.update(activitiesTable).set({ points: update.points, xp: update.xp, enabled: update.enabled }).where(eq(activitiesTable.id, "referral-active"));
  }
  await audit(identity, "CATALOG_UPDATED", id);
  return (await getCatalog()).find(item => item.id === id);
}
