export const BASIC_PLAN = "Basic plan";
export const ADVANCE_PLAN = "Advance plan";
export const PRO_PLAN = "Pro plan";
export const BILLING_PLANS = [BASIC_PLAN, ADVANCE_PLAN, PRO_PLAN] as const;
export const SHOPIFY_ADMIN_APP_HANDLE = "b2bridge-4";

export type PlanName = (typeof BILLING_PLANS)[number];

export type PlanLimits = {
  forms: number | null;
  products: number | null;
};

export type PlanDefinition = {
  name: PlanName;
  price: string;
  amount: number;
  tagline: string;
  description: string;
  trialDays: number;
  limits: PlanLimits;
  highlights: string[];
  bestFor: string;
  recommended?: boolean;
};

export const PLAN_DEFINITIONS: PlanDefinition[] = [
  {
    name: BASIC_PLAN,
    price: "$15.99",
    amount: 15.99,
    tagline: "Start selling B2B",
    description:
      "For small wholesale programs that need a clean registration flow and a focused pricing setup.",
    trialDays: 7,
    limits: {
      forms: 2,
      products: 200,
    },
    highlights: [
      "Create up to 2 wholesale forms",
      "Manage pricing for 200 products",
      "Customer approval and tagging tools",
      "Theme app block support",
    ],
    bestFor: "New or small B2B stores",
  },
  {
    name: ADVANCE_PLAN,
    price: "$39.99",
    amount: 39.99,
    tagline: "Grow your wholesale program",
    description:
      "For active B2B stores that need more forms, broader product coverage, and room to scale.",
    trialDays: 7,
    limits: {
      forms: 10,
      products: 500,
    },
    highlights: [
      "Create up to 10 wholesale forms",
      "Manage pricing for 500 products",
      "Dedicated product and SKU pricing rules",
      "Flexible storefront display controls",
    ],
    bestFor: "Growing wholesale catalogs",
    recommended: true,
  },
  {
    name: PRO_PLAN,
    price: "$49.99",
    amount: 49.99,
    tagline: "Scale without limits",
    description:
      "For established wholesale operations that need unlimited forms and catalog-wide flexibility.",
    trialDays: 7,
    limits: {
      forms: null,
      products: null,
    },
    highlights: [
      "Unlimited wholesale forms",
      "Unlimited product pricing rules",
      "Best fit for large B2B catalogs",
      "Full access to B2Bridge workflows",
    ],
    bestFor: "High-volume B2B stores",
  },
];

const planByName = new Map(PLAN_DEFINITIONS.map((plan) => [plan.name, plan]));

export const defaultPlanLimits: PlanLimits = {
  forms: 0,
  products: 0,
};

export function formatLimit(limit: number | null) {
  return limit === null ? "Unlimited" : String(limit);
}

export function getPlanDefinition(planName?: string | null) {
  return planName ? planByName.get(planName as PlanName) : undefined;
}

export function getPlanLimits(planName?: string | null): PlanLimits {
  return getPlanDefinition(planName)?.limits || defaultPlanLimits;
}

export function isWithinLimit(currentCount: number, limit: number | null) {
  return limit === null || currentCount < limit;
}

export function hasProPlan(planName?: string | null) {
  return planName === PRO_PLAN;
}

export function getCurrentPlanName(
  appSubscriptions: { name: string }[] = [],
): PlanName | null {
  const activePlan = PLAN_DEFINITIONS.find((plan) =>
    appSubscriptions.some((subscription) => subscription.name === plan.name),
  );

  return activePlan?.name || null;
}

export function createShopifyAdminAppUrl(shop: string, path = "/app") {
  const shopHandle = shop.replace(".myshopify.com", "");
  const appPath = path.startsWith("/") ? path : `/${path}`;

  return `https://admin.shopify.com/store/${shopHandle}/apps/${SHOPIFY_ADMIN_APP_HANDLE}${appPath}`;
}
