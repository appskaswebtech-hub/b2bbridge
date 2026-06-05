import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useRouteError } from "react-router";

import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  InlineGrid,
  InlineStack,
  Page,
  Text,
} from "@shopify/polaris";
import { boundary } from "@shopify/shopify-app-react-router/server";

import db from "../db.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [
    totalForms,
    activeForms,
    totalCustomers,
    approvedCustomers,
    pendingCustomers,
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
      select: {
        enabled: true,
        pricingMode: true,
        customerTag: true,
        globalDiscountPercent: true,
        globalDiscountAmount: true,
      },
    }),
  ]);

  return {
    totalForms,
    activeForms,
    totalCustomers,
    approvedCustomers,
    pendingCustomers,
    pricingSetting,
  };
};

export default function Index() {
  const {
    totalForms,
    activeForms,
    totalCustomers,
    approvedCustomers,
    pendingCustomers,
    pricingSetting,
  } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const pricingEnabled = Boolean(pricingSetting?.enabled);
  const pricingMode =
    pricingSetting?.pricingMode === "specific" ? "Specific rules" : "Global";
  const discountSummary = pricingSetting?.globalDiscountPercent
    ? `${pricingSetting.globalDiscountPercent}% global discount`
    : pricingSetting?.globalDiscountAmount
      ? `$${pricingSetting.globalDiscountAmount} global discount`
      : pricingEnabled
        ? "Product rules active"
        : "Not configured";

  return (
    <Page title="B2Bridge">
      <BlockStack gap="500">
        <Card padding="0">
          <Box
            padding="600"
            background="bg-surface-emphasis"
            borderBlockEndWidth="025"
            borderColor="border"
          >
            <InlineGrid
              columns={{ xs: 1, md: "minmax(0, 1fr) auto" }}
              gap="500"
              alignItems="center"
            >
              <BlockStack gap="200">
                <InlineStack gap="200">
                  <Badge tone="info">B2Bridge</Badge>
                  <Badge tone={pricingEnabled ? "success" : "attention"}>
                    {pricingEnabled ? "Pricing active" : "Pricing inactive"}
                  </Badge>
                </InlineStack>
                <BlockStack gap="100">
                  <Text as="h1" variant="heading2xl">
                    Wholesale command center
                  </Text>
                  <Text as="p" tone="subdued">
                    Run applications, approvals, and pricing rules from one
                    focused workspace.
                  </Text>
                </BlockStack>
              </BlockStack>

              <InlineStack gap="200">
                <Button onClick={() => navigate("/app/registration-forms")}>
                  Registration
                </Button>
                <Button onClick={() => navigate("/app/customers")}>
                  Approvals
                </Button>
                <Button
                  onClick={() => navigate("/app/wholesale-pricing")}
                  variant="primary"
                >
                  Pricing
                </Button>
              </InlineStack>
            </InlineGrid>
          </Box>
        </Card>

        <InlineGrid columns={{ xs: 1, sm: 2, lg: 4 }} gap="400">
          <MetricCard label="Forms created" value={String(totalForms)} />
          <MetricCard label="Forms live" value={String(activeForms)} />
          <MetricCard
            label="Wholesale approved"
            value={String(approvedCustomers)}
          />
          <MetricCard
            label="Awaiting review"
            value={String(pendingCustomers)}
          />
        </InlineGrid>

        <InlineGrid columns={{ xs: 1, lg: "minmax(0, 1fr) 360px" }} gap="400">
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingLg">
                  Daily workflow
                </Text>
                <Text as="p" tone="subdued">
                  Jump straight into the work merchants repeat most often.
                </Text>
              </BlockStack>

              <InlineGrid columns={{ xs: 1, sm: 2, lg: 4 }} gap="300">
                <ActionTile
                  title="Registration forms"
                  description="Design the storefront application and publish it through the theme."
                  action="Manage forms"
                  onAction={() => navigate("/app/registration-forms")}
                />
                <ActionTile
                  title="Customer approvals"
                  description="Review applications and mark wholesale accounts as approved."
                  action="Review applicants"
                  onAction={() => navigate("/app/customers")}
                />
                <ActionTile
                  title="Wholesale pricing"
                  description="Apply global discounts or product-level pricing rules."
                  action="Manage pricing"
                  onAction={() => navigate("/app/wholesale-pricing")}
                />
                <ActionTile
                  title="Advanced settings"
                  description="Open deeper controls for theme integration, checkout, billing, and storefront behavior."
                  action="Open settings"
                  onAction={() => navigate("/app/additional")}
                />
              </InlineGrid>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="300">
              <BlockStack gap="100">
                <Text as="h2" variant="headingLg">
                  Storefront pricing
                </Text>
                <Text as="p" tone="subdued">
                  Current wholesale pricing behavior for logged-in tagged
                  customers.
                </Text>
              </BlockStack>

              <InlineStack gap="200">
                <Badge tone={pricingEnabled ? "success" : "attention"}>
                  {pricingEnabled ? "Enabled" : "Disabled"}
                </Badge>
                <Badge>{pricingMode}</Badge>
              </InlineStack>

              <BlockStack gap="100">
                <Text as="p" fontWeight="semibold">
                  {discountSummary}
                </Text>
                <Text as="p" tone="subdued">
                  Eligible tag: {pricingSetting?.customerTag || "WHOLESALER"}
                </Text>
              </BlockStack>

              <Button onClick={() => navigate("/app/wholesale-pricing")}>
                Configure pricing
              </Button>
            </BlockStack>
          </Card>
        </InlineGrid>

        <Card>
          <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
            <StatusSummary
              label="Applicant records"
              value={String(totalCustomers)}
            />
            <StatusSummary label="Approved" value={String(approvedCustomers)} />
            <StatusSummary label="Pending" value={String(pendingCustomers)} />
          </InlineGrid>
        </Card>
      </BlockStack>
    </Page>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <BlockStack gap="100">
        <Text as="p" variant="heading2xl">
          {value}
        </Text>
        <Text as="p" tone="subdued">
          {label}
        </Text>
      </BlockStack>
    </Card>
  );
}

function ActionTile({
  title,
  description,
  action,
  onAction,
}: {
  title: string;
  description: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <Box
      padding="400"
      borderWidth="025"
      borderColor="border"
      borderRadius="200"
      background="bg-surface"
    >
      <BlockStack gap="300">
        <BlockStack gap="100">
          <Text as="h3" variant="headingMd">
            {title}
          </Text>
          <Text as="p" tone="subdued">
            {description}
          </Text>
        </BlockStack>
        <Button onClick={onAction}>{action}</Button>
      </BlockStack>
    </Box>
  );
}

function StatusSummary({ label, value }: { label: string; value: string }) {
  return (
    <BlockStack gap="100">
      <Text as="p" variant="headingXl">
        {value}
      </Text>
      <Text as="p" tone="subdued">
        {label}
      </Text>
    </BlockStack>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
