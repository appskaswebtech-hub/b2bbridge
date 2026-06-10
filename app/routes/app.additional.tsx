import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

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

import { formatLimit, getPlanDefinition, hasTierPricingPlan } from "../billing";
import { getBillingStatus } from "../billing.server";
import db from "../db.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const billingStatus = await getBillingStatus(billing);
  const [
    totalForms,
    activeForms,
    totalApplicants,
    approvedApplicants,
    pendingApplicants,
    pricingSetting,
  ] = await Promise.all([
    db.wholesaleForm.count({ where: { shop: session.shop } }),
    db.wholesaleForm.count({ where: { shop: session.shop, status: "active" } }),
    db.wholesaleFormSubmission.count({ where: { shop: session.shop } }),
    db.wholesaleFormSubmission.count({
      where: { shop: session.shop, status: "approved" },
    }),
    db.wholesaleFormSubmission.count({
      where: { shop: session.shop, status: { not: "approved" } },
    }),
    db.wholesalePricingSetting.findUnique({
      where: { shop: session.shop },
      include: { productRules: true },
    }),
  ]);
  const plan = getPlanDefinition(billingStatus.currentPlan);

  return {
    billing: {
      currentPlan: billingStatus.currentPlan,
      limits: billingStatus.limits,
      plan,
      canUseTierPricing: hasTierPricingPlan(billingStatus.currentPlan),
    },
    forms: {
      total: totalForms,
      active: activeForms,
    },
    applicants: {
      total: totalApplicants,
      approved: approvedApplicants,
      pending: pendingApplicants,
    },
    pricing: {
      enabled: Boolean(pricingSetting?.enabled),
      mode: pricingSetting?.pricingMode || "global",
      customerTag: pricingSetting?.customerTag || "WHOLESALER",
      productRules: pricingSetting?.productRules.length || 0,
      hasTierRules: Boolean(
        pricingSetting?.productRules.some(
          (rule) => rule.tierPricingJson && rule.tierPricingJson !== "[]",
        ),
      ),
      globalDiscountPercent: pricingSetting?.globalDiscountPercent || "",
      globalDiscountAmount: pricingSetting?.globalDiscountAmount || "",
    },
  };
};

export default function AdvancedSettingsPage() {
  const { billing, forms, applicants, pricing } =
    useLoaderData<typeof loader>();
  const formLimit = formatLimit(billing.limits.forms);
  const productLimit = formatLimit(billing.limits.products);
  const pricingMode =
    pricing.mode === "specific" ? "Product/SKU rules" : "Global discount";
  const globalDiscount = pricing.globalDiscountPercent
    ? `${pricing.globalDiscountPercent}% off`
    : pricing.globalDiscountAmount
      ? `$${pricing.globalDiscountAmount} off`
      : "Not set";

  return (
    <Page
      title="Advanced settings"
      primaryAction={{
        content: "Open theme editor",
        url: "shopify://admin/themes/current/editor?context=apps",
      }}
      secondaryActions={[
        {
          content: "Billing",
          url: "/app/billing",
        },
      ]}
    >
      <BlockStack gap="500">
        <Card padding="0">
          <Box
            padding="600"
            background="bg-surface"
            borderBlockEndWidth="025"
            borderColor="border"
          >
            <InlineGrid
              columns={{ xs: 1, md: "minmax(0, 1fr) auto" }}
              gap="400"
              alignItems="center"
            >
              <BlockStack gap="200">
                <InlineStack gap="200">
                  <Badge tone="info">B2Bridge settings</Badge>
                  <Badge tone={billing.currentPlan ? "success" : "attention"}>
                    {billing.currentPlan || "No active plan"}
                  </Badge>
                  <Badge tone={pricing.enabled ? "success" : "warning"}>
                    {pricing.enabled ? "Storefront pricing on" : "Pricing off"}
                  </Badge>
                </InlineStack>
                <BlockStack gap="100">
                  <Text as="h1" variant="headingXl">
                    App configuration overview
                  </Text>
                  <Text as="p" tone="subdued">
                    Check plan limits, storefront pricing, form publishing, and
                    customer approval status from one place.
                  </Text>
                </BlockStack>
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
                    Advance+ feature
                  </Text>
                  <Text as="p" fontWeight="semibold">
                    Tier-based pricing
                  </Text>
                  <Badge tone={billing.canUseTierPricing ? "success" : "info"}>
                    {billing.canUseTierPricing ? "Available" : "Upgrade to Advance"}
                  </Badge>
                </BlockStack>
              </Box>
            </InlineGrid>
          </Box>
        </Card>

        <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
          <SettingMetric
            label="Forms"
            value={`${forms.total} / ${formLimit}`}
            detail={`${forms.active} active storefront form${
              forms.active === 1 ? "" : "s"
            }`}
          />
          <SettingMetric
            label="Product rules"
            value={`${pricing.productRules} / ${productLimit}`}
            detail={
              pricing.hasTierRules
                ? "Tier pricing rules saved"
                : "No tier rules saved yet"
            }
          />
          <SettingMetric
            label="Applicants"
            value={String(applicants.total)}
            detail={`${applicants.approved} approved, ${applicants.pending} pending`}
          />
        </InlineGrid>

        <InlineGrid columns={{ xs: 1, lg: "minmax(0, 1fr) 380px" }} gap="400">
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingLg">
                  Storefront pricing settings
                </Text>
                <Badge tone={pricing.enabled ? "success" : "attention"}>
                  {pricing.enabled ? "Enabled" : "Disabled"}
                </Badge>
              </InlineStack>

              <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                <SettingRow label="Pricing mode" value={pricingMode} />
                <SettingRow label="Eligible tag" value={pricing.customerTag} />
                <SettingRow
                  label="Global discount"
                  value={pricing.mode === "global" ? globalDiscount : "Paused"}
                />
                <SettingRow
                  label="Quantity tiers"
                  value={
                    billing.canUseTierPricing
                      ? pricing.hasTierRules
                        ? "Configured"
                        : "Available"
                      : "Advance plan and higher"
                  }
                />
              </InlineGrid>

              <Divider />

              <InlineStack align="end">
                <Button url="/app/wholesale-pricing" variant="primary">
                  Configure pricing
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingLg">
                Current plan
              </Text>
              <BlockStack gap="100">
                <Text as="p" variant="headingXl">
                  {billing.currentPlan || "No plan selected"}
                </Text>
                <Text as="p" tone="subdued">
                  {billing.plan?.description ||
                    "Choose a billing plan to publish forms and pricing rules."}
                </Text>
              </BlockStack>
              <Divider />
              <SettingRow label="Form limit" value={formLimit} />
              <SettingRow label="Product limit" value={productLimit} />
              <SettingRow
                label="Free trial"
                value={billing.plan ? `${billing.plan.trialDays} days` : "7 days"}
              />
              <InlineStack align="end">
                <Button url="/app/billing">Manage billing</Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </InlineGrid>

        <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
          <AdvancedSettingCard
            title="Theme integration"
            badge="Storefront"
            description="Enable the B2Bridge theme app embed to render forms, wholesale prices, cart refresh, and draft checkout behavior."
            action="Open theme settings"
            url="shopify://admin/themes/current/editor?context=apps"
          />
          <AdvancedSettingCard
            title="Registration workflow"
            badge="Forms"
            description="Control application forms, approval messages, post-registration behavior, and published form status."
            action="Manage forms"
            url="/app/registration-forms"
          />
          <AdvancedSettingCard
            title="Customer approvals"
            badge="Access"
            description="Review applicants, approve wholesale customers, and keep customer tags aligned with storefront pricing."
            action="Review customers"
            url="/app/customers"
          />
          <AdvancedSettingCard
            title="Plan and limits"
            badge="Billing"
            description="Upgrade when merchants need more forms, more product rules, or Advance tier-based pricing."
            action="View plans"
            url="/app/billing"
          />
        </InlineGrid>
      </BlockStack>
    </Page>
  );
}

function SettingMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card>
      <BlockStack gap="100">
        <Text as="p" tone="subdued">
          {label}
        </Text>
        <Text as="p" variant="headingXl">
          {value}
        </Text>
        <Text as="p" variant="bodySm" tone="subdued">
          {detail}
        </Text>
      </BlockStack>
    </Card>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <Box
      padding="300"
      borderWidth="025"
      borderColor="border"
      borderRadius="200"
      background="bg-surface-secondary"
    >
      <BlockStack gap="050">
        <Text as="p" variant="bodySm" tone="subdued">
          {label}
        </Text>
        <Text as="p" fontWeight="semibold">
          {value}
        </Text>
      </BlockStack>
    </Box>
  );
}

function AdvancedSettingCard({
  title,
  badge,
  description,
  action,
  url,
}: {
  title: string;
  badge: string;
  description: string;
  action: string;
  url: string;
}) {
  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h2" variant="headingLg">
            {title}
          </Text>
          <Badge tone="info">{badge}</Badge>
        </InlineStack>
        <Text as="p" tone="subdued">
          {description}
        </Text>
        <InlineStack align="end">
          <Button url={url}>{action}</Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}
