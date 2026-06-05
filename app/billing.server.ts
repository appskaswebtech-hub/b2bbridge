import type { authenticate } from "./shopify.server";
import { BILLING_PLANS, getCurrentPlanName, getPlanLimits } from "./billing";

type Billing = Awaited<ReturnType<typeof authenticate.admin>>["billing"];

export function isBillingTestMode() {
  return process.env.SHOPIFY_BILLING_TEST !== "false";
}

export async function getBillingStatus(billing: Billing) {
  const billingCheck = await billing.check({
    plans: [...BILLING_PLANS],
    isTest: isBillingTestMode(),
  });
  const currentPlan = getCurrentPlanName(billingCheck.appSubscriptions);

  return {
    ...billingCheck,
    currentPlan,
    limits: getPlanLimits(currentPlan),
  };
}
