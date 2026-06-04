import type { ActionFunctionArgs } from "react-router";

import db from "../db.server";
import { authenticate, unauthenticated } from "../shopify.server";

type CartItemInput = {
  productId?: string | number | null;
  variantId?: string | number | null;
  handle?: string | null;
  price?: number | string | null;
  quantity?: number | string | null;
};

type ShopifyGraphqlError = {
  message?: string;
};

function normalizeProductGid(productId?: string | number | null) {
  const value = String(productId || "").trim();

  if (!value) {
    return "";
  }

  return value.startsWith("gid://") ? value : `gid://shopify/Product/${value}`;
}

function normalizeVariantGid(variantId?: string | number | null) {
  const value = String(variantId || "").trim();

  if (!value) {
    return "";
  }

  return value.startsWith("gid://")
    ? value
    : `gid://shopify/ProductVariant/${value}`;
}

function normalizeCustomerGid(customerId?: string | null) {
  const value = String(customerId || "").trim();

  if (!value) {
    return "";
  }

  return value.startsWith("gid://")
    ? value
    : `gid://shopify/Customer/${value}`;
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
      query B2BridgeDraftCheckoutCustomer($id: ID!) {
        customer(id: $id) {
          tags
        }
      }
    `,
    { variables: { id: customerGid } },
  );
  const body = (await response.json()) as {
    data?: { customer?: { tags?: string[] | null } | null };
  };
  const customerTags = body.data?.customer?.tags || [];

  return customerTags.some((tag) =>
    acceptedTags.includes(String(tag).trim().toLowerCase()),
  );
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || session?.shop || "";
  const customerId =
    url.searchParams.get("logged_in_customer_id") ||
    url.searchParams.get("customer_id") ||
    "";

  if (!shop || !customerId) {
    return Response.json({ ok: false, reason: "customer_not_logged_in" });
  }

  const payload = (await request.json().catch(() => ({}))) as {
    items?: CartItemInput[];
  };
  const items = Array.isArray(payload.items) ? payload.items : [];

  if (!items.length) {
    return Response.json({ ok: false, reason: "cart_empty" }, { status: 400 });
  }

  const setting = await db.wholesalePricingSetting.findUnique({
    where: { shop },
    include: { productRules: true },
  });

  if (!setting?.enabled) {
    return Response.json({ ok: false, reason: "pricing_disabled" });
  }

  const hasWholesaleTag = await customerHasWholesaleTag({
    shop,
    customerId,
    acceptedTags: getAcceptedCustomerTags(setting.customerTag),
  });

  if (!hasWholesaleTag) {
    return Response.json({ ok: false, reason: "customer_tag_missing" });
  }

  const lineItems = items
    .map((item) => {
      const variantGid = normalizeVariantGid(item.variantId);
      const productGid = normalizeProductGid(item.productId);
      const handle = String(item.handle || "").trim();
      const price = Number(item.price || 0) / 100;
      const quantity = Math.max(1, Number(item.quantity || 1));

      if (!variantGid || !Number.isFinite(price) || price <= 0) {
        return null;
      }

      const productRule =
        setting.productRules.find((rule) => {
          if (rule.variantGid && rule.variantGid === variantGid) {
            return true;
          }

          if (rule.productGid && rule.productGid === productGid) {
            return true;
          }

          return Boolean(rule.productHandle && handle === rule.productHandle);
        }) || null;
      const rulePricing =
        setting.pricingMode === "global"
          ? {
              discountPercent: setting.globalDiscountPercent,
              discountAmount: setting.globalDiscountAmount,
              fixedPrice: null,
            }
          : productRule;
      const wholesalePrice = calculateWholesalePrice({
        price,
        discountPercent: rulePricing?.discountPercent,
        discountAmount: rulePricing?.discountAmount,
        fixedPrice: rulePricing?.fixedPrice,
      });
      const discountPercent =
        wholesalePrice !== null && wholesalePrice < price
          ? Number((((price - wholesalePrice) / price) * 100).toFixed(4))
          : 0;

      return {
        variantId: variantGid,
        quantity,
        ...(discountPercent > 0
          ? {
              appliedDiscount: {
                title: "B2Bridge wholesale price",
                description: "Wholesale customer discount",
                value: discountPercent,
                valueType: "PERCENTAGE",
              },
            }
          : {}),
      };
    })
    .filter((lineItem): lineItem is NonNullable<typeof lineItem> =>
      Boolean(lineItem),
    );

  if (!lineItems.some((lineItem) => lineItem.appliedDiscount)) {
    return Response.json({ ok: false, reason: "no_discounted_items" });
  }

  const { admin } = await unauthenticated.admin(shop);
  const response = await admin.graphql(
    `#graphql
      mutation B2BridgeCreateDraftCheckout($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            id
            invoiceUrl
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      variables: {
        input: {
          customerId: normalizeCustomerGid(customerId),
          lineItems,
          note: "B2Bridge wholesale checkout",
          tags: ["B2Bridge", "Wholesale"],
        },
      },
    },
  );
  const body = (await response.json()) as {
    errors?: ShopifyGraphqlError[];
    data?: {
      draftOrderCreate?: {
        draftOrder?: { invoiceUrl?: string | null } | null;
        userErrors?: ShopifyGraphqlError[];
      } | null;
    };
  };
  const errors = [
    ...(body.errors || []),
    ...(body.data?.draftOrderCreate?.userErrors || []),
  ];
  const checkoutUrl = body.data?.draftOrderCreate?.draftOrder?.invoiceUrl || "";

  if (errors.length || !checkoutUrl) {
    return Response.json(
      {
        ok: false,
        reason: "draft_order_failed",
        error: errors.map((error) => error.message).filter(Boolean).join(", "),
      },
      { status: 422 },
    );
  }

  return Response.json({ ok: true, checkoutUrl });
};
