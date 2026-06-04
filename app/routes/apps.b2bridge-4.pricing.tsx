import type { LoaderFunctionArgs } from "react-router";

import db from "../db.server";
import { authenticate, unauthenticated } from "../shopify.server";

function normalizeProductGid(productId?: string | null) {
  const value = String(productId || "").trim();

  if (!value) {
    return "";
  }

  if (value.startsWith("gid://")) {
    return value;
  }

  return `gid://shopify/Product/${value}`;
}

function normalizeVariantGid(variantId?: string | null) {
  const value = String(variantId || "").trim();

  if (!value) {
    return "";
  }

  if (value.startsWith("gid://")) {
    return value;
  }

  return `gid://shopify/ProductVariant/${value}`;
}

function calculateWholesalePrice({
  price,
  discountPercent,
  discountAmount,
  fixedPrice,
}: {
  price: number;
  discountPercent?: string | null;
  discountAmount?: string | null;
  fixedPrice?: string | null;
}) {
  const fixed = Number(fixedPrice || "");

  if (Number.isFinite(fixed) && fixed > 0) {
    return fixed;
  }

  const amount = Number(discountAmount || "");

  if (Number.isFinite(amount) && amount > 0) {
    return Math.max(price - amount, 0);
  }

  const percent = Number(discountPercent || "");

  if (!Number.isFinite(percent) || percent <= 0) {
    return null;
  }

  return Math.max(price * (1 - percent / 100), 0);
}

function normalizeCustomerGid(customerId?: string | null) {
  const value = String(customerId || "").trim();

  if (!value) {
    return "";
  }

  if (value.startsWith("gid://")) {
    return value;
  }

  return `gid://shopify/Customer/${value}`;
}

function getAcceptedCustomerTags(customerTag?: string | null) {
  return Array.from(
    new Set(
      `${customerTag || ""},WHOLESALER`
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

async function customerHasWholesaleTag({
  shop,
  customerId,
  acceptedTags,
}: {
  shop: string;
  customerId: string;
  acceptedTags: string[];
}) {
  const customerGid = normalizeCustomerGid(customerId);

  if (!customerGid) {
    return false;
  }

  const { admin } = await unauthenticated.admin(shop);
  const response = await admin.graphql(
    `#graphql
      query B2BridgePricingCustomer($id: ID!) {
        customer(id: $id) {
          tags
        }
      }
    `,
    {
      variables: {
        id: customerGid,
      },
    },
  );
  const body = (await response.json()) as {
    data?: { customer?: { tags?: string[] | null } | null };
  };
  const customerTags = body.data?.customer?.tags || [];

  return customerTags.some((tag) =>
    acceptedTags.includes(String(tag).trim().toLowerCase()),
  );
}

function getRulePricing({
  productRule,
  setting,
}: {
  productRule: {
    discountPercent?: string | null;
    discountAmount?: string | null;
    fixedPrice?: string | null;
  } | null;
  setting: {
    pricingMode?: string | null;
    globalDiscountPercent?: string | null;
    globalDiscountAmount?: string | null;
  };
}) {
  if (setting.pricingMode === "global") {
    return {
      discountPercent: setting.globalDiscountPercent,
      discountAmount: setting.globalDiscountAmount,
      fixedPrice: null,
      ruleType: "global",
    };
  }

  if (productRule) {
    return {
      discountPercent: productRule.discountPercent,
      discountAmount: productRule.discountAmount,
      fixedPrice: productRule.fixedPrice,
      ruleType: "product",
    };
  }

  return {
    discountPercent: null,
    discountAmount: null,
    fixedPrice: null,
    ruleType: "none",
  };
}

function getDisplaySettings(setting: {
  productPriceStyle?: string | null;
  productPricePlacement?: string | null;
  productShowLabel?: boolean | null;
  productShowCompare?: boolean | null;
  productShowDiscount?: boolean | null;
  productFontSize?: string | null;
  productAccentColor?: string | null;
  productPriceSelector?: string | null;
  collectionPriceStyle?: string | null;
  collectionPricePlacement?: string | null;
  collectionShowLabel?: boolean | null;
  collectionShowCompare?: boolean | null;
  collectionShowDiscount?: boolean | null;
  collectionFontSize?: string | null;
  collectionAccentColor?: string | null;
  collectionCardSelector?: string | null;
  collectionPriceSelector?: string | null;
}) {
  return {
    product: {
      style: setting.productPriceStyle || "simple",
      placement: setting.productPricePlacement || "replace_price",
      showLabel: setting.productShowLabel !== false,
      showCompare: setting.productShowCompare !== false,
      showDiscount: setting.productShowDiscount !== false,
      fontSize: setting.productFontSize || "18",
      accentColor: setting.productAccentColor || "#111827",
      priceSelector: setting.productPriceSelector || "",
    },
    collection: {
      style: setting.collectionPriceStyle || "compact",
      placement: setting.collectionPricePlacement || "replace_price",
      showLabel: Boolean(setting.collectionShowLabel),
      showCompare: setting.collectionShowCompare !== false,
      showDiscount: setting.collectionShowDiscount !== false,
      fontSize: setting.collectionFontSize || "13",
      accentColor: setting.collectionAccentColor || "#111827",
      cardSelector: setting.collectionCardSelector || "",
      priceSelector: setting.collectionPriceSelector || "",
    },
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || session?.shop || "";
  const loggedInCustomerId =
    url.searchParams.get("logged_in_customer_id") ||
    url.searchParams.get("customer_id") ||
    "";
  const themeCustomerVerified =
    url.searchParams.get("theme_customer_verified") === "1";
  const productGid = normalizeProductGid(url.searchParams.get("product_id"));
  const variantGid = normalizeVariantGid(url.searchParams.get("variant_id"));
  const productHandle = String(url.searchParams.get("handle") || "").trim();
  const price = Number(url.searchParams.get("price") || "");

  if (!shop || !Number.isFinite(price) || price <= 0) {
    return Response.json({ ok: false }, { status: 400 });
  }

  const setting = await db.wholesalePricingSetting.findUnique({
    where: { shop },
    include: { productRules: true },
  });

  if (!setting?.enabled) {
    return Response.json({
      ok: true,
      enabled: false,
      reason: "pricing_disabled",
    });
  }

  if (!themeCustomerVerified) {
    if (!loggedInCustomerId) {
      return Response.json({
        ok: true,
        enabled: false,
        reason: "customer_not_logged_in",
      });
    }

    const hasWholesaleTag = await customerHasWholesaleTag({
      shop,
      customerId: loggedInCustomerId,
      acceptedTags: getAcceptedCustomerTags(setting.customerTag),
    });

    if (!hasWholesaleTag) {
      return Response.json({
        ok: true,
        enabled: false,
        reason: "customer_tag_missing",
        customerTag: setting.customerTag,
      });
    }
  }

  const productRule =
    setting.productRules.find((rule) => {
      if (rule.variantGid && variantGid && rule.variantGid === variantGid) {
        return true;
      }

      if (rule.productGid && productGid && rule.productGid === productGid) {
        return true;
      }

      return Boolean(
        rule.productHandle &&
        productHandle &&
        rule.productHandle === productHandle,
      );
    }) || null;
  const rulePricing = getRulePricing({ productRule, setting });
  const wholesalePrice = calculateWholesalePrice({
    price,
    discountPercent: rulePricing.discountPercent,
    discountAmount: rulePricing.discountAmount,
    fixedPrice: rulePricing.fixedPrice,
  });

  if (wholesalePrice === null || wholesalePrice >= price) {
    return Response.json({
      ok: true,
      enabled: false,
      reason: productRule ? "rule_has_no_discount" : "no_matching_rule",
      pricingMode: setting.pricingMode,
      matchedRule: Boolean(productRule),
    });
  }

  return Response.json({
    ok: true,
    enabled: true,
    customerTag: setting.customerTag,
    pricingMode: setting.pricingMode,
    productHandle,
    matchedRule: Boolean(productRule),
    wholesalePrice,
    discountPercent: rulePricing.discountPercent || "",
    discountAmount: rulePricing.discountAmount || "",
    ruleType: rulePricing.ruleType,
    display: getDisplaySettings(setting),
  });
};
