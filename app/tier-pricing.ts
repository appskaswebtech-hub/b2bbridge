export type TierPricingRule = {
  minQuantity: number;
  discountPercent: number;
};

export const defaultTierPricingRules: TierPricingRule[] = [
  { minQuantity: 10, discountPercent: 10 },
  { minQuantity: 50, discountPercent: 20 },
  { minQuantity: 100, discountPercent: 30 },
];

export function parseTierPricingJson(value?: string | null) {
  try {
    const parsed = JSON.parse(value || "[]");
    const tiers = Array.isArray(parsed) ? parsed : [];

    return sanitizeTierPricingRules(tiers);
  } catch {
    return [];
  }
}

export function sanitizeTierPricingRules(value: unknown) {
  const tiers = Array.isArray(value) ? value : [];
  const byQuantity = new Map<number, TierPricingRule>();

  for (const tier of tiers) {
    const minQuantity = Math.floor(Number(tier?.minQuantity));
    const discountPercent = Number(tier?.discountPercent);

    if (
      !Number.isFinite(minQuantity) ||
      !Number.isFinite(discountPercent) ||
      minQuantity < 2 ||
      discountPercent <= 0
    ) {
      continue;
    }

    byQuantity.set(minQuantity, {
      minQuantity,
      discountPercent: Math.min(discountPercent, 100),
    });
  }

  return Array.from(byQuantity.values()).sort(
    (first, second) => first.minQuantity - second.minQuantity,
  );
}

export function getBestTierPricingRule(
  tiers: TierPricingRule[],
  quantity: number,
) {
  return tiers
    .filter((tier) => quantity >= tier.minQuantity)
    .sort((first, second) => second.minQuantity - first.minQuantity)[0];
}
