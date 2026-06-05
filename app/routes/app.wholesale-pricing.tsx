import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { useEffect, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";

import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  ChoiceList,
  Divider,
  InlineGrid,
  InlineStack,
  Page,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";

import db from "../db.server";
import { authenticate } from "../shopify.server";
import { formatLimit, hasProPlan, isWithinLimit } from "../billing";
import { getBillingStatus } from "../billing.server";
import {
  defaultTierPricingRules,
  parseTierPricingJson,
  sanitizeTierPricingRules,
} from "../tier-pricing";

type ProductSelectionOption = {
  label: string;
  value: Record<string, string>;
};

type PricingRule = {
  id: string;
  productTitle: string;
  productHandle: string | null;
  variantSku: string | null;
  variantTitle: string | null;
  discountPercent: string | null;
  discountAmount: string | null;
  fixedPrice: string | null;
  tierPricingJson: string;
};

function cleanPercent(value: FormDataEntryValue | null) {
  const number = Number(String(value || "").trim());

  if (!Number.isFinite(number) || number <= 0) {
    return "";
  }

  return String(Math.min(number, 100));
}

function cleanMoney(value: FormDataEntryValue | null) {
  const number = Number(String(value || "").trim());

  if (!Number.isFinite(number) || number <= 0) {
    return "";
  }

  return number.toFixed(2);
}

function cleanChoice(
  value: FormDataEntryValue | null,
  allowedValues: string[],
  fallback: string,
) {
  const choice = String(value || "").trim();

  return allowedValues.includes(choice) ? choice : fallback;
}

function cleanFontSize(value: FormDataEntryValue | null, fallback: string) {
  const number = Number(String(value || "").trim());

  if (!Number.isFinite(number) || number < 10 || number > 36) {
    return fallback;
  }

  return String(number);
}

function cleanColor(value: FormDataEntryValue | null, fallback: string) {
  const color = String(value || "").trim();

  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function cleanSelector(value: FormDataEntryValue | null) {
  const selector = String(value || "").trim();

  return selector.slice(0, 160);
}

async function requireSetting(shop: string) {
  return db.wholesalePricingSetting.upsert({
    where: { shop },
    update: {},
    create: { shop },
    include: { productRules: { orderBy: { createdAt: "desc" } } },
  });
}

function parseProductSelections(value: FormDataEntryValue | null) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    const products = Array.isArray(parsed) ? parsed : [parsed];

    return products
      .map((product) => ({
        productGid: String(product.productGid || ""),
        productHandle: String(product.productHandle || ""),
        productTitle: String(product.productTitle || ""),
        variantGid: String(product.variantGid || ""),
        variantSku: String(product.variantSku || ""),
        variantTitle: String(product.variantTitle || ""),
      }))
      .filter((product) => product.productGid && product.productTitle);
  } catch {
    return [];
  }
}

function parseTierPricingForm(formData: FormData) {
  return sanitizeTierPricingRules(
    [0, 1, 2].map((index) => ({
      minQuantity: formData.get(`tierMinQuantity${index}`),
      discountPercent: formData.get(`tierDiscountPercent${index}`),
    })),
  );
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const billingStatus = await getBillingStatus(billing);
  const setting = await requireSetting(session.shop);

  return {
    billing: {
      currentPlan: billingStatus.currentPlan,
      limits: billingStatus.limits,
      hasActivePayment: billingStatus.hasActivePayment,
    },
    setting,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "save_settings");
  const setting = await requireSetting(session.shop);

  if (intent === "save_settings") {
    const globalPriceMode = String(
      formData.get("globalPriceMode") || "percent",
    );
    const pricingMode =
      String(formData.get("pricingMode") || "global") === "specific"
        ? "specific"
        : "global";

    await db.wholesalePricingSetting.update({
      where: { id: setting.id },
      data: {
        enabled: formData.get("enabled") === "on",
        customerTag:
          String(formData.get("customerTag") || "").trim() || "WHOLESALER",
        pricingMode,
        globalDiscountPercent:
          globalPriceMode === "percent"
            ? cleanPercent(formData.get("globalDiscountPercent"))
            : "",
        globalDiscountAmount:
          globalPriceMode === "amount"
            ? cleanMoney(formData.get("globalDiscountAmount"))
            : "",
        productPriceStyle: cleanChoice(
          formData.get("productPriceStyle"),
          ["simple", "card", "pill"],
          "simple",
        ),
        productPricePlacement: cleanChoice(
          formData.get("productPricePlacement"),
          ["replace_price", "below_title", "above_form", "custom_selector"],
          "replace_price",
        ),
        productShowLabel: formData.get("productShowLabel") === "on",
        productShowCompare: formData.get("productShowCompare") === "on",
        productShowDiscount: formData.get("productShowDiscount") === "on",
        productFontSize: cleanFontSize(formData.get("productFontSize"), "18"),
        productAccentColor: cleanColor(
          formData.get("productAccentColor"),
          "#111827",
        ),
        productPriceSelector: cleanSelector(
          formData.get("productPriceSelector"),
        ),
        collectionPriceStyle: cleanChoice(
          formData.get("collectionPriceStyle"),
          ["compact", "simple", "card", "pill"],
          "compact",
        ),
        collectionPricePlacement: cleanChoice(
          formData.get("collectionPricePlacement"),
          ["replace_price", "below_title", "below_image", "custom_selector"],
          "replace_price",
        ),
        collectionShowLabel: formData.get("collectionShowLabel") === "on",
        collectionShowCompare: formData.get("collectionShowCompare") === "on",
        collectionShowDiscount: formData.get("collectionShowDiscount") === "on",
        collectionFontSize: cleanFontSize(
          formData.get("collectionFontSize"),
          "13",
        ),
        collectionAccentColor: cleanColor(
          formData.get("collectionAccentColor"),
          "#111827",
        ),
        collectionCardSelector: cleanSelector(
          formData.get("collectionCardSelector"),
        ),
        collectionPriceSelector: cleanSelector(
          formData.get("collectionPriceSelector"),
        ),
      },
    });

    return { ok: true, message: "Wholesale pricing settings saved." };
  }

  if (intent === "add_rule") {
    const billingStatus = await getBillingStatus(billing);
    const canUseTierPricing = hasProPlan(billingStatus.currentPlan);
    const selectedProducts = parseProductSelections(formData.get("products"));
    const priceMode = String(formData.get("priceMode") || "percent");
    const tierPricingRules =
      priceMode === "tier" ? parseTierPricingForm(formData) : [];
    const discountPercent =
      priceMode === "percent"
        ? cleanPercent(formData.get("discountPercent"))
        : "";
    const discountAmount =
      priceMode === "amount" ? cleanMoney(formData.get("discountAmount")) : "";

    if (selectedProducts.length === 0) {
      return {
        ok: false,
        error: "Select at least one product from your store.",
      };
    }

    if (priceMode === "tier" && !canUseTierPricing) {
      return {
        ok: false,
        error: "Tier-based wholesale pricing is available on the Pro plan.",
      };
    }

    if (
      !discountPercent &&
      !discountAmount &&
      tierPricingRules.length === 0
    ) {
      return {
        ok: false,
        error: "Add a discount percentage, amount off, or tier pricing rule.",
      };
    }

    const existingRules = await db.wholesaleProductPricingRule.findMany({
      where: {
        shop: session.shop,
        settingId: setting.id,
      },
      select: {
        productGid: true,
        variantGid: true,
      },
    });
    const existingKeys = new Set(
      existingRules.map((rule) => rule.variantGid || rule.productGid || ""),
    );
    const newRuleCount = selectedProducts.filter(
      (product) =>
        !existingKeys.has(product.variantGid || product.productGid || ""),
    ).length;

    if (
      billingStatus.limits.products !== null &&
      existingRules.length + newRuleCount > billingStatus.limits.products
    ) {
      return {
        ok: false,
        error: `Your current plan allows ${formatLimit(
          billingStatus.limits.products,
        )} product pricing rules. Upgrade your plan to add more products.`,
      };
    }

    for (const selectedProduct of selectedProducts) {
      await db.wholesaleProductPricingRule.deleteMany({
        where: {
          shop: session.shop,
          settingId: setting.id,
          ...(selectedProduct.variantGid
            ? { variantGid: selectedProduct.variantGid }
            : { productGid: selectedProduct.productGid }),
        },
      });

      await db.wholesaleProductPricingRule.create({
        data: {
          shop: session.shop,
          settingId: setting.id,
          productGid: selectedProduct.productGid,
          productHandle: selectedProduct.productHandle,
          productTitle: selectedProduct.productTitle,
          variantGid: selectedProduct.variantGid,
          variantSku: selectedProduct.variantSku,
          variantTitle: selectedProduct.variantTitle,
          discountPercent,
          discountAmount,
          fixedPrice: "",
          tierPricingJson: JSON.stringify(tierPricingRules),
        },
      });
    }

    return {
      ok: true,
      message: `${selectedProducts.length} product pricing rule${
        selectedProducts.length === 1 ? "" : "s"
      } saved.`,
    };
  }

  if (intent === "update_rule") {
    const billingStatus = await getBillingStatus(billing);
    const canUseTierPricing = hasProPlan(billingStatus.currentPlan);
    const ruleId = String(formData.get("ruleId") || "");
    const rulePriceMode = String(formData.get("rulePriceMode") || "percent");
    const tierPricingRules =
      rulePriceMode === "tier" ? parseTierPricingForm(formData) : [];
    const discountPercent =
      rulePriceMode === "percent"
        ? cleanPercent(formData.get("ruleDiscountPercent"))
        : "";
    const discountAmount =
      rulePriceMode === "amount"
        ? cleanMoney(formData.get("ruleDiscountAmount"))
        : "";

    if (rulePriceMode === "tier" && !canUseTierPricing) {
      return {
        ok: false,
        error: "Tier-based wholesale pricing is available on the Pro plan.",
      };
    }

    if (
      !discountPercent &&
      !discountAmount &&
      tierPricingRules.length === 0
    ) {
      return {
        ok: false,
        error: "Add a discount percentage, amount off, or tier pricing rule.",
      };
    }

    await db.wholesaleProductPricingRule.updateMany({
      where: {
        id: ruleId,
        shop: session.shop,
      },
      data: {
        discountPercent,
        discountAmount,
        fixedPrice: "",
        tierPricingJson: JSON.stringify(tierPricingRules),
      },
    });

    return { ok: true, message: "Product pricing rule updated." };
  }

  if (intent === "delete_rule") {
    const ruleId = String(formData.get("ruleId") || "");

    await db.wholesaleProductPricingRule.deleteMany({
      where: {
        id: ruleId,
        shop: session.shop,
      },
    });

    return { ok: true, message: "Product pricing rule deleted." };
  }

  return { ok: false, error: "Unknown pricing action." };
};

function PricingRuleEditor({
  rule,
  isSubmitting,
  canUseTierPricing,
}: {
  rule: PricingRule;
  isSubmitting: boolean;
  canUseTierPricing: boolean;
}) {
  const savedTierPricingRules = parseTierPricingJson(rule.tierPricingJson);
  const initialTierPricingRules = savedTierPricingRules.length
    ? savedTierPricingRules
    : defaultTierPricingRules;
  const [rulePriceMode, setRulePriceMode] = useState(
    savedTierPricingRules.length
      ? "tier"
      : rule.discountAmount
        ? "amount"
        : "percent",
  );
  const [ruleDiscountPercent, setRuleDiscountPercent] = useState(
    rule.discountPercent || "",
  );
  const [ruleDiscountAmount, setRuleDiscountAmount] = useState(
    rule.discountAmount || "",
  );
  const ruleDetails = [
    rule.variantTitle && rule.variantTitle !== "Default Title"
      ? rule.variantTitle
      : "",
    rule.variantSku ? `SKU ${rule.variantSku}` : "",
    rule.productHandle,
  ]
    .filter(Boolean)
    .join(" · ");

  function changeRulePriceMode(value: string) {
    setRulePriceMode(value);

    if (value === "percent") {
      setRuleDiscountAmount("");
    } else if (value === "amount") {
      setRuleDiscountPercent("");
    } else {
      setRuleDiscountAmount("");
      setRuleDiscountPercent("");
    }
  }

  return (
    <Box
      padding="300"
      borderWidth="025"
      borderColor="border"
      borderRadius="200"
      background="bg-surface"
    >
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="start">
          <BlockStack gap="050">
            <Text as="p" fontWeight="semibold">
              {rule.productTitle}
            </Text>
            {ruleDetails ? (
              <Text as="p" variant="bodySm" tone="subdued">
                {ruleDetails}
              </Text>
            ) : null}
          </BlockStack>
          <Form method="post">
            <input type="hidden" name="intent" value="delete_rule" />
            <input type="hidden" name="ruleId" value={rule.id} />
            <Button tone="critical" submit>
              Delete
            </Button>
          </Form>
        </InlineStack>

        <InlineStack gap="200">
          {savedTierPricingRules.length ? (
            <Badge tone="info">Tier pricing</Badge>
          ) : null}
          {rule.discountPercent ? (
            <Badge tone="success">{`${rule.discountPercent}% off`}</Badge>
          ) : null}
          {rule.discountAmount ? (
            <Badge tone="info">{`$${rule.discountAmount} off`}</Badge>
          ) : null}
          {rule.fixedPrice ? (
            <Badge tone="info">{`Fixed $${rule.fixedPrice}`}</Badge>
          ) : null}
        </InlineStack>

        <Form method="post">
          <input type="hidden" name="intent" value="update_rule" />
          <input type="hidden" name="ruleId" value={rule.id} />
          <input type="hidden" name="rulePriceMode" value={rulePriceMode} />
          <BlockStack gap="300">
            <InlineGrid
              columns={{ xs: 1, sm: "140px minmax(0, 1fr)" }}
              gap="300"
            >
              <Select
                label="Discount type"
                options={[
                  { label: "Percentage", value: "percent" },
                  { label: "Amount off", value: "amount" },
                  { label: "Quantity tiers", value: "tier" },
                ]}
                value={rulePriceMode}
                onChange={changeRulePriceMode}
              />
              {rulePriceMode === "tier" ? (
                <TierPricingFields
                  disabled={!canUseTierPricing}
                  tiers={initialTierPricingRules}
                  namePrefix="tier"
                />
              ) : rulePriceMode === "percent" ? (
                <TextField
                  label="Percentage"
                  name="ruleDiscountPercent"
                  type="number"
                  min={0}
                  max={100}
                  suffix="%"
                  value={ruleDiscountPercent}
                  onChange={setRuleDiscountPercent}
                  autoComplete="off"
                />
              ) : (
                <TextField
                  label="Amount off"
                  name="ruleDiscountAmount"
                  type="number"
                  min={0}
                  prefix="$"
                  value={ruleDiscountAmount}
                  onChange={setRuleDiscountAmount}
                  autoComplete="off"
                />
              )}
            </InlineGrid>
            {rulePriceMode === "tier" && !canUseTierPricing ? (
              <Banner tone="warning">
                Tier-based wholesale pricing is a Pro plan feature.
              </Banner>
            ) : null}
            <InlineStack align="end">
              <Button
                submit
                loading={isSubmitting}
                disabled={rulePriceMode === "tier" && !canUseTierPricing}
              >
                Save rule
              </Button>
            </InlineStack>
          </BlockStack>
        </Form>
      </BlockStack>
    </Box>
  );
}

function TierPricingFields({
  disabled,
  tiers,
  namePrefix,
}: {
  disabled: boolean;
  tiers: { minQuantity: number; discountPercent: number }[];
  namePrefix: "tier";
}) {
  const normalizedTiers = Array.from(
    { length: 3 },
    (_, index) => tiers[index] || defaultTierPricingRules[index],
  );

  return (
    <BlockStack gap="200">
      {normalizedTiers.map((tier, index) => (
        <InlineGrid
          key={index}
          columns={{ xs: 1, sm: "minmax(0, 1fr) minmax(0, 1fr)" }}
          gap="200"
        >
          <TextField
            label={`Tier ${index + 1} minimum quantity`}
            name={`${namePrefix}MinQuantity${index}`}
            type="number"
            min={2}
            value={String(tier.minQuantity)}
            disabled={disabled}
            autoComplete="off"
          />
          <TextField
            label={`Tier ${index + 1} discount`}
            name={`${namePrefix}DiscountPercent${index}`}
            type="number"
            min={0}
            max={100}
            suffix="%"
            value={String(tier.discountPercent)}
            disabled={disabled}
            autoComplete="off"
          />
        </InlineGrid>
      ))}
    </BlockStack>
  );
}

export default function WholesalePricingPage() {
  const { billing, setting } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const isSubmitting = navigation.state === "submitting";
  const draftStorageKey = `b2bridge:wholesale-pricing-draft:${setting.shop}`;
  const [enabled, setEnabled] = useState(setting.enabled);
  const [customerTag, setCustomerTag] = useState(setting.customerTag);
  const [pricingMode, setPricingMode] = useState<string[]>(
    setting.pricingMode === "specific" ? ["specific"] : ["global"],
  );
  const [globalDiscountPercent, setGlobalDiscountPercent] = useState(
    setting.globalDiscountPercent || "",
  );
  const [globalPriceMode, setGlobalPriceMode] = useState<string[]>(
    setting.globalDiscountAmount ? ["amount"] : ["percent"],
  );
  const [globalDiscountAmount, setGlobalDiscountAmount] = useState(
    setting.globalDiscountAmount || "",
  );
  const [productPriceStyle, setProductPriceStyle] = useState<string[]>([
    setting.productPriceStyle || "simple",
  ]);
  const [productPricePlacement, setProductPricePlacement] = useState<string[]>([
    setting.productPricePlacement || "replace_price",
  ]);
  const [productShowLabel, setProductShowLabel] = useState(
    setting.productShowLabel,
  );
  const [productShowCompare, setProductShowCompare] = useState(
    setting.productShowCompare,
  );
  const [productShowDiscount, setProductShowDiscount] = useState(
    setting.productShowDiscount,
  );
  const [productFontSize, setProductFontSize] = useState(
    setting.productFontSize || "18",
  );
  const [productAccentColor, setProductAccentColor] = useState(
    setting.productAccentColor || "#111827",
  );
  const [productPriceSelector, setProductPriceSelector] = useState(
    setting.productPriceSelector || "",
  );
  const [collectionPriceStyle, setCollectionPriceStyle] = useState<string[]>([
    setting.collectionPriceStyle || "compact",
  ]);
  const [collectionPricePlacement, setCollectionPricePlacement] = useState<
    string[]
  >([setting.collectionPricePlacement || "replace_price"]);
  const [collectionShowLabel, setCollectionShowLabel] = useState(
    setting.collectionShowLabel,
  );
  const [collectionShowCompare, setCollectionShowCompare] = useState(
    setting.collectionShowCompare,
  );
  const [collectionShowDiscount, setCollectionShowDiscount] = useState(
    setting.collectionShowDiscount,
  );
  const [collectionFontSize, setCollectionFontSize] = useState(
    setting.collectionFontSize || "13",
  );
  const [collectionAccentColor, setCollectionAccentColor] = useState(
    setting.collectionAccentColor || "#111827",
  );
  const [collectionCardSelector, setCollectionCardSelector] = useState(
    setting.collectionCardSelector || "",
  );
  const [collectionPriceSelector, setCollectionPriceSelector] = useState(
    setting.collectionPriceSelector || "",
  );
  const [selectedProducts, setSelectedProducts] = useState<
    ProductSelectionOption[]
  >([]);
  const [priceMode, setPriceMode] = useState<string[]>(["percent"]);
  const [discountPercent, setDiscountPercent] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [draftReady, setDraftReady] = useState(false);
  const productRuleLimitLabel = formatLimit(billing.limits.products);
  const canUseTierPricing = hasProPlan(billing.currentPlan);
  const canAddProductRule = isWithinLimit(
    setting.productRules.length,
    billing.limits.products,
  );

  function changeGlobalPriceMode(value: string[]) {
    setGlobalPriceMode(value);

    if (value[0] === "percent") {
      setGlobalDiscountAmount("");
    } else {
      setGlobalDiscountPercent("");
    }
  }

  function changePriceMode(value: string[]) {
    setPriceMode(value);

    if (value[0] === "percent") {
      setDiscountAmount("");
    } else if (value[0] === "amount") {
      setDiscountPercent("");
    } else {
      setDiscountAmount("");
      setDiscountPercent("");
    }
  }

  useEffect(() => {
    try {
      const savedDraft = window.localStorage.getItem(draftStorageKey);

      if (savedDraft) {
        const draft = JSON.parse(savedDraft);

        if (Array.isArray(draft.selectedProducts)) {
          setSelectedProducts(draft.selectedProducts);
        }

        if (
          draft.priceMode === "amount" ||
          draft.priceMode === "percent" ||
          draft.priceMode === "tier"
        ) {
          setPriceMode([draft.priceMode]);
        }

        setDiscountPercent(String(draft.discountPercent || ""));
        setDiscountAmount(String(draft.discountAmount || ""));
      }
    } catch {
      window.localStorage.removeItem(draftStorageKey);
    } finally {
      setDraftReady(true);
    }
  }, [draftStorageKey]);

  useEffect(() => {
    if (!draftReady) {
      return;
    }

    window.localStorage.setItem(
      draftStorageKey,
      JSON.stringify({
        selectedProducts,
        priceMode: priceMode[0] || "percent",
        discountPercent,
        discountAmount,
      }),
    );
  }, [
    discountAmount,
    discountPercent,
    draftReady,
    draftStorageKey,
    priceMode,
    selectedProducts,
  ]);

  useEffect(() => {
    if (
      actionData?.ok &&
      actionData.message?.includes("product pricing rule") &&
      actionData.message?.endsWith("saved.")
    ) {
      setSelectedProducts([]);
      setPriceMode(["percent"]);
      setDiscountPercent("");
      setDiscountAmount("");
      window.localStorage.removeItem(draftStorageKey);
    }
  }, [actionData, draftStorageKey]);

  async function openProductPicker() {
    const selection = await shopify.resourcePicker({
      type: "product",
      action: "select",
      multiple: true,
    });

    if (!selection?.length) {
      return;
    }

    const pickedProducts = selection.flatMap((product) => {
      const variants = product.variants?.length
        ? product.variants
        : [undefined];

      return variants.map((variant) => {
        const variantTitle =
          variant?.title && variant.title !== "Default Title"
            ? variant.title
            : "";
        const sku = variant?.sku || "";
        const label = [product.title, variantTitle, sku ? `SKU ${sku}` : ""]
          .filter(Boolean)
          .join(" · ");

        return {
          label,
          value: {
            productGid: product.id,
            productHandle: product.handle,
            productTitle: product.title,
            variantGid: variant?.id || "",
            variantSku: sku,
            variantTitle: variant?.title || "",
          },
        };
      });
    });
    const uniqueProducts = Array.from(
      new Map(
        pickedProducts.map((product) => [
          product.value.variantGid || product.value.productGid,
          product,
        ]),
      ).values(),
    );

    setSelectedProducts(uniqueProducts);
  }

  return (
    <Page title="Wholesale pricing">
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
                  <Badge tone="info">B2Bridge</Badge>
                  <Badge tone={setting.enabled ? "success" : "attention"}>
                    {setting.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                  <Badge tone={billing.currentPlan ? "success" : "attention"}>
                    {billing.currentPlan || "No plan"}
                  </Badge>
                </InlineStack>
                <BlockStack gap="100">
                  <Text as="h1" variant="headingXl">
                    Wholesale pricing
                  </Text>
                  <Text as="p" tone="subdued">
                    Control which logged-in customers see wholesale pricing and
                    how discounts are applied across the catalog.
                  </Text>
                </BlockStack>
              </BlockStack>
            </InlineGrid>
          </Box>
        </Card>

        {actionData?.ok ? (
          <Banner tone="success">{actionData.message}</Banner>
        ) : null}

        {actionData?.ok === false ? (
          <Banner tone="critical">{actionData.error}</Banner>
        ) : null}

        <InlineGrid columns={{ xs: 1, lg: "minmax(0, 1fr) 380px" }} gap="400">
          <BlockStack gap="400">
            <Form method="post">
              <input type="hidden" name="intent" value="save_settings" />
              <input
                type="hidden"
                name="pricingMode"
                value={pricingMode[0] || "global"}
              />
              <input
                type="hidden"
                name="globalPriceMode"
                value={globalPriceMode[0] || "percent"}
              />
              <input
                type="hidden"
                name="productPriceStyle"
                value={productPriceStyle[0] || "simple"}
              />
              <input
                type="hidden"
                name="productPricePlacement"
                value={productPricePlacement[0] || "replace_price"}
              />
              <input
                type="hidden"
                name="collectionPriceStyle"
                value={collectionPriceStyle[0] || "compact"}
              />
              <input
                type="hidden"
                name="collectionPricePlacement"
                value={collectionPricePlacement[0] || "replace_price"}
              />
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingLg">
                      Pricing strategy
                    </Text>
                    <Text as="p" tone="subdued">
                      Choose whether wholesale customers receive one
                      catalog-wide discount or targeted product/SKU rules.
                    </Text>
                  </BlockStack>

                  <Checkbox
                    label="Enable wholesale pricing on storefront"
                    checked={enabled}
                    onChange={setEnabled}
                  />
                  {enabled ? (
                    <input type="hidden" name="enabled" value="on" />
                  ) : null}

                  <TextField
                    label="Eligible customer tag"
                    name="customerTag"
                    value={customerTag}
                    onChange={setCustomerTag}
                    autoComplete="off"
                    helpText="Logged-in customers with this Shopify tag can see wholesale prices."
                  />

                  <ChoiceList
                    title="Discount coverage"
                    choices={[
                      {
                        label: "Global discount for every product",
                        value: "global",
                        helpText:
                          "Use one wholesale discount across the entire storefront catalog.",
                      },
                      {
                        label: "Specific product and SKU rules",
                        value: "specific",
                        helpText:
                          "Only selected products or variants receive wholesale pricing.",
                      },
                    ]}
                    selected={pricingMode}
                    onChange={setPricingMode}
                  />

                  {pricingMode[0] === "global" ? (
                    <>
                      <ChoiceList
                        title="Global discount type"
                        choices={[
                          {
                            label: "Percentage off",
                            value: "percent",
                          },
                          {
                            label: "Fixed amount off",
                            value: "amount",
                          },
                        ]}
                        selected={globalPriceMode}
                        onChange={changeGlobalPriceMode}
                      />

                      <Box maxWidth="320px">
                        {globalPriceMode[0] === "percent" ? (
                          <TextField
                            label="Percentage off"
                            name="globalDiscountPercent"
                            type="number"
                            min={0}
                            max={100}
                            suffix="%"
                            value={globalDiscountPercent}
                            onChange={setGlobalDiscountPercent}
                            autoComplete="off"
                          />
                        ) : (
                          <TextField
                            label="Amount off"
                            name="globalDiscountAmount"
                            type="number"
                            min={0}
                            prefix="$"
                            value={globalDiscountAmount}
                            onChange={setGlobalDiscountAmount}
                            autoComplete="off"
                          />
                        )}
                      </Box>
                    </>
                  ) : null}

                  <InlineStack align="end">
                    <Button variant="primary" submit loading={isSubmitting}>
                      Save pricing settings
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Card>

              <Box paddingBlockStart="400">
                <Card>
                  <BlockStack gap="500">
                    <InlineStack align="space-between" blockAlign="start">
                      <BlockStack gap="100">
                        <Text as="h2" variant="headingLg">
                          Storefront display
                        </Text>
                        <Text as="p" tone="subdued">
                          Set product page and collection card pricing styles
                          independently. Start with the recommended defaults,
                          then use custom selectors only for stubborn themes.
                        </Text>
                      </BlockStack>
                      <Badge tone="info">Theme safe</Badge>
                    </InlineStack>

                    <InlineGrid columns={{ xs: 1, lg: 2 }} gap="400">
                      <Box
                        padding="400"
                        borderWidth="025"
                        borderColor="border"
                        borderRadius="200"
                        background="bg-surface"
                      >
                        <BlockStack gap="400">
                          <InlineStack
                            align="space-between"
                            blockAlign="center"
                          >
                            <BlockStack gap="050">
                              <Text as="h3" variant="headingMd">
                                Product page
                              </Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                Best for product detail pages: simple and close
                                to the theme price.
                              </Text>
                            </BlockStack>
                            <Badge tone="success">Recommended</Badge>
                          </InlineStack>

                          <Box
                            padding="300"
                            borderWidth="025"
                            borderColor="border"
                            borderRadius="200"
                            background="bg-surface-secondary"
                          >
                            <BlockStack gap="100">
                              {productShowLabel ? (
                                <Text as="p" variant="bodySm" tone="subdued">
                                  Wholesale price
                                </Text>
                              ) : null}
                              <p
                                style={{
                                  color: productAccentColor,
                                  fontSize: "20px",
                                  fontWeight: 650,
                                  lineHeight: 1.2,
                                  margin: 0,
                                }}
                              >
                                US$1,314.98
                              </p>
                              {productShowCompare ? (
                                <Text as="p" variant="bodySm" tone="subdued">
                                  Retail US$2,629.95
                                </Text>
                              ) : null}
                              {productShowDiscount ? (
                                <InlineStack>
                                  <Badge tone="success">50% off</Badge>
                                </InlineStack>
                              ) : null}
                            </BlockStack>
                          </Box>

                          <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                            <Select
                              label="Appearance"
                              options={[
                                { label: "Simple text", value: "simple" },
                                { label: "Soft card", value: "card" },
                                { label: "Pill", value: "pill" },
                              ]}
                              value={productPriceStyle[0] || "simple"}
                              onChange={(value) =>
                                setProductPriceStyle([value])
                              }
                            />
                            <Select
                              label="Position"
                              options={[
                                {
                                  label: "Replace theme price",
                                  value: "replace_price",
                                },
                                {
                                  label: "Below product title",
                                  value: "below_title",
                                },
                                {
                                  label: "Above add to cart",
                                  value: "above_form",
                                },
                                {
                                  label: "Custom selector",
                                  value: "custom_selector",
                                },
                              ]}
                              value={
                                productPricePlacement[0] || "replace_price"
                              }
                              onChange={(value) =>
                                setProductPricePlacement([value])
                              }
                            />
                          </InlineGrid>

                          <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                            <TextField
                              label="Price size"
                              name="productFontSize"
                              type="number"
                              min={10}
                              max={36}
                              suffix="px"
                              value={productFontSize}
                              onChange={setProductFontSize}
                              autoComplete="off"
                            />
                            <TextField
                              label="Price color"
                              name="productAccentColor"
                              value={productAccentColor}
                              onChange={setProductAccentColor}
                              autoComplete="off"
                              helpText="Use a hex color."
                            />
                          </InlineGrid>

                          <InlineStack gap="300">
                            <Checkbox
                              label="Label"
                              checked={productShowLabel}
                              onChange={setProductShowLabel}
                            />
                            <Checkbox
                              label="Retail"
                              checked={productShowCompare}
                              onChange={setProductShowCompare}
                            />
                            <Checkbox
                              label="Badge"
                              checked={productShowDiscount}
                              onChange={setProductShowDiscount}
                            />
                          </InlineStack>

                          {productShowLabel ? (
                            <input
                              type="hidden"
                              name="productShowLabel"
                              value="on"
                            />
                          ) : null}
                          {productShowCompare ? (
                            <input
                              type="hidden"
                              name="productShowCompare"
                              value="on"
                            />
                          ) : null}
                          {productShowDiscount ? (
                            <input
                              type="hidden"
                              name="productShowDiscount"
                              value="on"
                            />
                          ) : null}

                          {productPricePlacement[0] === "custom_selector" ? (
                            <TextField
                              label="Product price selector"
                              name="productPriceSelector"
                              value={productPriceSelector}
                              onChange={setProductPriceSelector}
                              autoComplete="off"
                              helpText="Example: .product__price"
                            />
                          ) : (
                            <input
                              type="hidden"
                              name="productPriceSelector"
                              value={productPriceSelector}
                            />
                          )}
                        </BlockStack>
                      </Box>

                      <Box
                        padding="400"
                        borderWidth="025"
                        borderColor="border"
                        borderRadius="200"
                        background="bg-surface"
                      >
                        <BlockStack gap="400">
                          <InlineStack
                            align="space-between"
                            blockAlign="center"
                          >
                            <BlockStack gap="050">
                              <Text as="h3" variant="headingMd">
                                Collection cards
                              </Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                Keep cards compact so prices do not collide with
                                neighboring products.
                              </Text>
                            </BlockStack>
                            <Badge tone="success">Recommended</Badge>
                          </InlineStack>

                          <Box
                            padding="300"
                            borderWidth="025"
                            borderColor="border"
                            borderRadius="200"
                            background="bg-surface-secondary"
                          >
                            <BlockStack gap="050">
                              {collectionShowLabel ? (
                                <Text as="p" variant="bodySm" tone="subdued">
                                  Wholesale price
                                </Text>
                              ) : null}
                              <p
                                style={{
                                  color: collectionAccentColor,
                                  fontSize: "14px",
                                  fontWeight: 650,
                                  lineHeight: 1.25,
                                  margin: 0,
                                }}
                              >
                                US$1,314.98
                              </p>
                              {collectionShowCompare ? (
                                <Text as="p" variant="bodySm" tone="subdued">
                                  Retail US$2,629.95
                                </Text>
                              ) : null}
                              {collectionShowDiscount ? (
                                <InlineStack>
                                  <Badge tone="success">50% off</Badge>
                                </InlineStack>
                              ) : null}
                            </BlockStack>
                          </Box>

                          <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                            <Select
                              label="Appearance"
                              options={[
                                { label: "Compact", value: "compact" },
                                { label: "Simple text", value: "simple" },
                                { label: "Soft card", value: "card" },
                                { label: "Pill", value: "pill" },
                              ]}
                              value={collectionPriceStyle[0] || "compact"}
                              onChange={(value) =>
                                setCollectionPriceStyle([value])
                              }
                            />
                            <Select
                              label="Position"
                              options={[
                                {
                                  label: "Replace theme price",
                                  value: "replace_price",
                                },
                                {
                                  label: "Below title",
                                  value: "below_title",
                                },
                                {
                                  label: "Below image",
                                  value: "below_image",
                                },
                                {
                                  label: "Custom selector",
                                  value: "custom_selector",
                                },
                              ]}
                              value={
                                collectionPricePlacement[0] || "replace_price"
                              }
                              onChange={(value) =>
                                setCollectionPricePlacement([value])
                              }
                            />
                          </InlineGrid>

                          <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                            <TextField
                              label="Price size"
                              name="collectionFontSize"
                              type="number"
                              min={10}
                              max={36}
                              suffix="px"
                              value={collectionFontSize}
                              onChange={setCollectionFontSize}
                              autoComplete="off"
                            />
                            <TextField
                              label="Price color"
                              name="collectionAccentColor"
                              value={collectionAccentColor}
                              onChange={setCollectionAccentColor}
                              autoComplete="off"
                              helpText="Use a hex color."
                            />
                          </InlineGrid>

                          <InlineStack gap="300">
                            <Checkbox
                              label="Label"
                              checked={collectionShowLabel}
                              onChange={setCollectionShowLabel}
                            />
                            <Checkbox
                              label="Retail"
                              checked={collectionShowCompare}
                              onChange={setCollectionShowCompare}
                            />
                            <Checkbox
                              label="Badge"
                              checked={collectionShowDiscount}
                              onChange={setCollectionShowDiscount}
                            />
                          </InlineStack>

                          {collectionShowLabel ? (
                            <input
                              type="hidden"
                              name="collectionShowLabel"
                              value="on"
                            />
                          ) : null}
                          {collectionShowCompare ? (
                            <input
                              type="hidden"
                              name="collectionShowCompare"
                              value="on"
                            />
                          ) : null}
                          {collectionShowDiscount ? (
                            <input
                              type="hidden"
                              name="collectionShowDiscount"
                              value="on"
                            />
                          ) : null}

                          {collectionPricePlacement[0] === "custom_selector" ? (
                            <BlockStack gap="300">
                              <TextField
                                label="Collection card selector"
                                name="collectionCardSelector"
                                value={collectionCardSelector}
                                onChange={setCollectionCardSelector}
                                autoComplete="off"
                                helpText="Optional. Example: .product-card-wrapper"
                              />
                              <TextField
                                label="Collection price selector"
                                name="collectionPriceSelector"
                                value={collectionPriceSelector}
                                onChange={setCollectionPriceSelector}
                                autoComplete="off"
                                helpText="Example: .price"
                              />
                            </BlockStack>
                          ) : (
                            <>
                              <input
                                type="hidden"
                                name="collectionCardSelector"
                                value={collectionCardSelector}
                              />
                              <input
                                type="hidden"
                                name="collectionPriceSelector"
                                value={collectionPriceSelector}
                              />
                            </>
                          )}
                        </BlockStack>
                      </Box>
                    </InlineGrid>

                    <InlineStack align="end">
                      <Button variant="primary" submit loading={isSubmitting}>
                        Save storefront display
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </Card>
              </Box>
            </Form>

            {pricingMode[0] === "specific" ? (
              <Form method="post">
                <input type="hidden" name="intent" value="add_rule" />
                <input
                  type="hidden"
                  name="priceMode"
                  value={priceMode[0] || "percent"}
                />
                <input
                  type="hidden"
                  name="products"
                  value={JSON.stringify(
                    selectedProducts.map((product) => product.value),
                  )}
                />
                <Card>
                  <BlockStack gap="400">
                    <BlockStack gap="100">
                      <Text as="h2" variant="headingLg">
                        Product and SKU rules
                      </Text>
                      <Text as="p" tone="subdued">
                        Select products or variants and assign dedicated
                        wholesale discounts.
                      </Text>
                    </BlockStack>

                    {!canAddProductRule ? (
                      <Banner
                        tone="warning"
                        action={{
                          content: "Upgrade plan",
                          url: "/app/billing",
                        }}
                      >
                        Your current plan allows {productRuleLimitLabel} product
                        pricing rules. Upgrade to add more products.
                      </Banner>
                    ) : null}

                    <BlockStack gap="300">
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="050">
                          <Text as="p" fontWeight="semibold">
                            Product selection
                          </Text>
                          <Text as="p" tone="subdued">
                            Pick one or more products from the Shopify catalog.
                          </Text>
                        </BlockStack>
                        <Button
                          onClick={
                            canAddProductRule ? openProductPicker : undefined
                          }
                          url={!canAddProductRule ? "/app/billing" : undefined}
                        >
                          {selectedProducts.length
                            ? "Change products"
                            : canAddProductRule
                              ? "Select products"
                              : "Upgrade plan"}
                        </Button>
                      </InlineStack>

                      {selectedProducts.length ? (
                        <Box
                          padding="300"
                          borderWidth="025"
                          borderColor="border"
                          borderRadius="200"
                          background="bg-surface-secondary"
                        >
                          <BlockStack gap="200">
                            <InlineStack
                              align="space-between"
                              blockAlign="center"
                            >
                              <Text as="p" fontWeight="semibold">
                                {`${selectedProducts.length} selected`}
                              </Text>
                              <Badge tone="success">Ready to save</Badge>
                            </InlineStack>
                            <BlockStack gap="100">
                              {selectedProducts.slice(0, 6).map((product) => (
                                <Text
                                  key={
                                    product.value.variantGid ||
                                    product.value.productGid
                                  }
                                  as="p"
                                  variant="bodySm"
                                >
                                  {product.label}
                                </Text>
                              ))}
                              {selectedProducts.length > 6 ? (
                                <Text as="p" variant="bodySm" tone="subdued">
                                  {`${selectedProducts.length - 6} more selected`}
                                </Text>
                              ) : null}
                            </BlockStack>
                          </BlockStack>
                        </Box>
                      ) : (
                        <Box
                          padding="400"
                          borderWidth="025"
                          borderColor="border"
                          borderRadius="200"
                          background="bg-surface"
                        >
                          <Text as="p" tone="subdued">
                            Select products before adding a pricing rule.
                          </Text>
                        </Box>
                      )}
                    </BlockStack>

                    {selectedProducts.length ? (
                      <>
                        <ChoiceList
                          title="Rule discount type"
                          choices={[
                            {
                              label: "Percentage off",
                              value: "percent",
                            },
                            {
                              label: "Fixed amount off",
                              value: "amount",
                            },
                            {
                              label: "Quantity tiers",
                              value: "tier",
                              helpText:
                                "Pro plan only. Example: 10+ gets 10%, 50+ gets 20%, 100+ gets 30%.",
                            },
                          ]}
                          selected={priceMode}
                          onChange={changePriceMode}
                        />

                        <Box maxWidth={priceMode[0] === "tier" ? "100%" : "320px"}>
                          {priceMode[0] === "tier" ? (
                            <TierPricingFields
                              disabled={!canUseTierPricing}
                              tiers={defaultTierPricingRules}
                              namePrefix="tier"
                            />
                          ) : priceMode[0] === "percent" ? (
                            <TextField
                              label="Percentage off"
                              name="discountPercent"
                              type="number"
                              min={0}
                              max={100}
                              suffix="%"
                              value={discountPercent}
                              onChange={setDiscountPercent}
                              autoComplete="off"
                            />
                          ) : (
                            <TextField
                              label="Amount off"
                              name="discountAmount"
                              type="number"
                              min={0}
                              prefix="$"
                              value={discountAmount}
                              onChange={setDiscountAmount}
                              autoComplete="off"
                            />
                          )}
                        </Box>

                        {priceMode[0] === "tier" && !canUseTierPricing ? (
                          <Banner
                            tone="warning"
                            action={{
                              content: "Upgrade plan",
                              url: "/app/billing",
                            }}
                          >
                            Tier-based wholesale pricing is available on the Pro
                            plan.
                          </Banner>
                        ) : null}

                        <InlineStack align="end">
                          <Button
                            submit
                            loading={isSubmitting}
                            disabled={
                              !canAddProductRule ||
                              (priceMode[0] === "tier" && !canUseTierPricing)
                            }
                          >
                            Save product rule
                          </Button>
                        </InlineStack>
                      </>
                    ) : null}
                  </BlockStack>
                </Card>
              </Form>
            ) : null}
          </BlockStack>

          {pricingMode[0] === "specific" ? (
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingLg">
                    Saved product rules
                  </Text>
                  <Text as="p" tone="subdued">
                    These rules apply only when specific product pricing is
                    selected.
                  </Text>
                </BlockStack>

                <Divider />

                {setting.productRules.length === 0 ? (
                  <Text as="p" tone="subdued">
                    No product or SKU rules saved yet.
                  </Text>
                ) : (
                  <BlockStack gap="300">
                    {setting.productRules.map((rule) => (
                      <PricingRuleEditor
                        key={rule.id}
                        rule={rule}
                        isSubmitting={isSubmitting}
                        canUseTierPricing={canUseTierPricing}
                      />
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          ) : (
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingLg">
                  Product rules paused
                </Text>
                <Text as="p" tone="subdued">
                  Global discount mode is selected, so saved product rules are
                  kept but not applied on the storefront.
                </Text>
              </BlockStack>
            </Card>
          )}
        </InlineGrid>
      </BlockStack>
    </Page>
  );
}
