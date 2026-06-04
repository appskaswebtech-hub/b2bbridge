import type { ActionFunctionArgs } from "react-router";

import db from "../db.server";
import { authenticate } from "../shopify.server";

type CustomerPrivacyPayload = {
  customer?: {
    id?: number | string;
    email?: string | null;
  };
  customer_id?: number | string;
  email?: string | null;
};

function getCustomerMatches(payload: CustomerPrivacyPayload) {
  const customerId = String(payload.customer?.id || payload.customer_id || "");
  const customerGid = customerId
    ? `gid://shopify/Customer/${customerId}`
    : "";
  const email = (payload.customer?.email || payload.email || "")
    .trim()
    .toLowerCase();

  return [
    customerId ? { customerId } : null,
    customerGid ? { customerId: customerGid } : null,
    email ? { email } : null,
  ].filter(Boolean) as Array<{ customerId?: string; email?: string }>;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop, topic } = await authenticate.webhook(request);
  const normalizedTopic = String(topic).toLowerCase();

  if (
    normalizedTopic === "customers_redact" ||
    normalizedTopic === "customers/redact"
  ) {
    const matches = getCustomerMatches(payload as CustomerPrivacyPayload);

    if (matches.length) {
      await db.wholesaleFormSubmission.deleteMany({
        where: {
          shop,
          OR: matches,
        },
      });
    }
  }

  if (normalizedTopic === "shop_redact" || normalizedTopic === "shop/redact") {
    await db.wholesaleFormSubmission.deleteMany({ where: { shop } });
    await db.wholesaleForm.deleteMany({ where: { shop } });
    await db.wholesalePricingSetting.deleteMany({ where: { shop } });
    await db.session.deleteMany({ where: { shop } });
  }

  return new Response();
};
