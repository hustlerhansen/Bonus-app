import { randomUUID } from "node:crypto";

/** Demo providers never call external services or send real monetary rewards. */
export interface ProviderResult {
  providerEventId: string;
  verified: boolean;
  grossRevenueOre: number;
  providerCostOre: number;
}
export interface AdProvider { verifyCompletion(sourceId: string, rewardCostOre: number): Promise<ProviderResult> }
export interface SurveyProvider { verifyCompletion(sourceId: string, rewardCostOre: number): Promise<ProviderResult> }
export interface OfferProvider { verifyCompletion(sourceId: string, rewardCostOre: number): Promise<ProviderResult> }
export interface RewardProvider { orderReward(redemptionId: string): Promise<{ status: "PENDING" }> }

class MockActivityProvider implements AdProvider, SurveyProvider, OfferProvider {
  async verifyCompletion(sourceId: string, rewardCostOre: number): Promise<ProviderResult> {
    const grossRevenueOre = Math.ceil(rewardCostOre * 2.5);
    return { providerEventId: `demo:${sourceId}:${randomUUID()}`, verified: true, grossRevenueOre, providerCostOre: Math.floor(grossRevenueOre * 0.2) };
  }
}
export class MockAdProvider extends MockActivityProvider {}
export class MockSurveyProvider extends MockActivityProvider {}
export class MockOfferProvider extends MockActivityProvider {}
export class MockRewardProvider implements RewardProvider {
  async orderReward(_redemptionId: string): Promise<{ status: "PENDING" }> {
    return { status: "PENDING" };
  }
}
export const providers = {
  ad: new MockAdProvider(),
  survey: new MockSurveyProvider(),
  offer: new MockOfferProvider(),
  reward: new MockRewardProvider(),
};
