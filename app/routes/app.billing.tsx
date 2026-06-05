import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, Form, useLoaderData, useNavigation } from "react-router";

import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  InlineGrid,
  InlineStack,
  Page,
  Text,
} from "@shopify/polaris";

import { BILLING_PLANS, formatLimit, PLAN_DEFINITIONS } from "../billing";
import { getBillingStatus } from "../billing.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const billingStatus = await getBillingStatus(billing);

  return {
    currentPlan: billingStatus.currentPlan,
    plans: PLAN_DEFINITIONS,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const plan = String(formData.get("plan") || "");

  if (!BILLING_PLANS.includes(plan as (typeof BILLING_PLANS)[number])) {
    return data(
      { ok: false, error: "Select a valid billing plan." },
      { status: 400 },
    );
  }

  const returnUrl = new URL("/app/billing", request.url).toString();

  return billing.request({
    plan: plan as (typeof BILLING_PLANS)[number],
    isTest: process.env.SHOPIFY_BILLING_TEST === "true",
    returnUrl,
  });
};

export default function BillingPage() {
  const { currentPlan, plans } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const selectedPlan = String(navigation.formData?.get("plan") || "");
  const isSubmitting = navigation.state === "submitting";

  return (
    <Page title="Billing">
      <BlockStack gap="600">
        <Box
          padding="600"
          background="bg-surface"
          borderWidth="025"
          borderColor="border"
          borderRadius="200"
        >
          <InlineGrid
            columns={{ xs: 1, md: "minmax(0, 1fr) auto" }}
            gap="500"
            alignItems="center"
          >
            <BlockStack gap="300">
              <InlineStack gap="200" blockAlign="center">
                <Badge tone="info">B2Bridge billing</Badge>
                <Badge tone={currentPlan ? "success" : "attention"}>
                  {currentPlan ? `Active: ${currentPlan}` : "No active plan"}
                </Badge>
              </InlineStack>
              <Text as="h2" variant="headingXl">
                Choose the plan that matches your wholesale growth
              </Text>
              <Text as="p" tone="subdued">
                Start with a 7 day free trial on any plan. Plans control how
                many wholesale registration forms and product pricing rules your
                store can use.
              </Text>
            </BlockStack>
            <Box
              padding="400"
              background="bg-surface-secondary"
              borderWidth="025"
              borderColor="border"
              borderRadius="200"
              minWidth="220px"
            >
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">
                  Trial included
                </Text>
                <Text as="p" variant="headingLg">
                  7 days free
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Billing begins only after merchant approval in Shopify.
                </Text>
              </BlockStack>
            </Box>
          </InlineGrid>
        </Box>

        <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
          {plans.map((plan) => {
            const isCurrent = currentPlan === plan.name;
            const isRecommended = Boolean(plan.recommended);

            return (
              <Card key={plan.name}>
                <BlockStack gap="500">
                  <InlineStack align="space-between" blockAlign="start">
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingLg">
                        {plan.name}
                      </Text>
                      <Text as="p" tone="subdued">
                        {plan.tagline}
                      </Text>
                    </BlockStack>
                    <InlineStack gap="100">
                      {isRecommended ? (
                        <Badge tone="info">Recommended</Badge>
                      ) : null}
                      {isCurrent ? <Badge tone="success">Active</Badge> : null}
                    </InlineStack>
                  </InlineStack>

                  <BlockStack gap="200">
                    <InlineStack gap="100" blockAlign="end">
                      <Text as="p" variant="heading2xl">
                        {plan.price}
                      </Text>
                      <Box paddingBlockEnd="100">
                        <Text as="span" tone="subdued">
                          / 30 days
                        </Text>
                      </Box>
                    </InlineStack>
                    <Text as="p" tone="subdued">
                      {plan.description}
                    </Text>
                  </BlockStack>

                  <Box
                    padding="400"
                    borderWidth="025"
                    borderColor="border"
                    borderRadius="200"
                    background="bg-surface-secondary"
                  >
                    <BlockStack gap="200">
                      <InlineStack align="space-between">
                        <Text as="span" tone="subdued">
                          Registration forms
                        </Text>
                        <Text as="span" fontWeight="semibold">
                          {formatLimit(plan.limits.forms)}
                        </Text>
                      </InlineStack>
                      <InlineStack align="space-between">
                        <Text as="span" tone="subdued">
                          Product rules
                        </Text>
                        <Text as="span" fontWeight="semibold">
                          {formatLimit(plan.limits.products)}
                        </Text>
                      </InlineStack>
                      <InlineStack align="space-between">
                        <Text as="span" tone="subdued">
                          Free trial
                        </Text>
                        <Text as="span" fontWeight="semibold">
                          {plan.trialDays} days
                        </Text>
                      </InlineStack>
                    </BlockStack>
                  </Box>

                  <BlockStack gap="300">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Best for {plan.bestFor.toLowerCase()}.
                    </Text>
                    <Divider />
                    <BlockStack gap="200">
                      {plan.highlights.map((highlight) => (
                        <InlineStack
                          key={highlight}
                          gap="200"
                          blockAlign="start"
                          wrap={false}
                        >
                          <Box
                            as="span"
                            minWidth="8px"
                            minHeight="8px"
                            borderRadius="100"
                            background="bg-fill-success"
                          />
                          <Text as="span" variant="bodySm">
                            {highlight}
                          </Text>
                        </InlineStack>
                      ))}
                    </BlockStack>
                  </BlockStack>

                  <Form method="post">
                    <input type="hidden" name="plan" value={plan.name} />
                    <Button
                      submit
                      variant={isCurrent ? "secondary" : "primary"}
                      disabled={isCurrent}
                      loading={isSubmitting && selectedPlan === plan.name}
                      fullWidth
                    >
                      {isCurrent ? "Current plan" : `Start ${plan.name}`}
                    </Button>
                  </Form>
                </BlockStack>
              </Card>
            );
          })}
        </InlineGrid>

        <Box
          padding="500"
          background="bg-surface-secondary"
          borderWidth="025"
          borderColor="border"
          borderRadius="200"
        >
          <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
            <BlockStack gap="100">
              <Text as="p" fontWeight="semibold">
                Shopify secure approval
              </Text>
              <Text as="p" tone="subdued">
                Merchants approve the subscription inside Shopify before any
                charge is created.
              </Text>
            </BlockStack>
            <BlockStack gap="100">
              <Text as="p" fontWeight="semibold">
                Trial on every plan
              </Text>
              <Text as="p" tone="subdued">
                All plans include the same 7 day trial window, including Pro.
              </Text>
            </BlockStack>
            <BlockStack gap="100">
              <Text as="p" fontWeight="semibold">
                Limits apply automatically
              </Text>
              <Text as="p" tone="subdued">
                Form and product limits are enforced in B2Bridge after the
                active plan is detected.
              </Text>
            </BlockStack>
          </InlineGrid>
        </Box>
      </BlockStack>
    </Page>
  );
}
