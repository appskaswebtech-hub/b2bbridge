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

export default function AdvancedSettingsPage() {
  return (
    <Page title="Advanced settings">
      <BlockStack gap="500">
        <Card padding="0">
          <Box
            padding="600"
            background="bg-surface"
            borderBlockEndWidth="025"
            borderColor="border"
          >
            <BlockStack gap="200">
              <InlineStack gap="200">
                <Badge tone="info">B2Bridge</Badge>
                <Badge tone="success">Connected</Badge>
              </InlineStack>
              <BlockStack gap="100">
                <Text as="h1" variant="headingXl">
                  Advanced settings
                </Text>
                <Text as="p" tone="subdued">
                  Review the deeper app controls that affect storefront
                  behavior, customer access, pricing, and checkout.
                </Text>
              </BlockStack>
            </BlockStack>
          </Box>
        </Card>

        <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
          <AdvancedSettingCard
            title="Theme integration"
            badge="Storefront"
            description="Manage the theme app embed for registration forms, wholesale prices, cart refresh, and checkout handling."
            action="Open theme settings"
            url="shopify://admin/themes/current/editor?context=apps"
          />
          <AdvancedSettingCard
            title="Wholesale pricing"
            badge="Rules"
            description="Configure global discounts, product/SKU rules, display placement, and Pro quantity-tier pricing."
            action="Configure pricing"
            url="/app/wholesale-pricing"
          />
          <AdvancedSettingCard
            title="Registration workflow"
            badge="Forms"
            description="Control storefront application forms, approval messages, post-registration behavior, and published form status."
            action="Manage forms"
            url="/app/registration-forms"
          />
          <AdvancedSettingCard
            title="Customer approvals"
            badge="Access"
            description="Review applicants, approve wholesale customers, and keep customer tags aligned with storefront pricing rules."
            action="Review customers"
            url="/app/customers"
          />
        </InlineGrid>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingLg">
              Billing controls
            </Text>
            <Text as="p" tone="subdued">
              Plan limits control how many forms, product rules, and Pro-only
              features are available to each merchant.
            </Text>
            <InlineStack align="end">
              <Button url="/app/billing">Manage billing</Button>
            </InlineStack>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
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
