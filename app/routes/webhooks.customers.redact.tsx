import type { ActionFunctionArgs } from "react-router";

import db from "../db.server";
import { authenticate } from "../shopify.server";

type CustomerRedactPayload = {
  customer?: {
    id?: number | string;
    email?: string | null;
  };
  customer_id?: number | string;
  email?: string | null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop } = await authenticate.webhook(request);
  const body = payload as CustomerRedactPayload;
  const customerId = String(body.customer?.id || body.customer_id || "");
  const customerGid = customerId
    ? `gid://shopify/Customer/${customerId}`
    : "";
  const email = (body.customer?.email || body.email || "").trim().toLowerCase();
  const matches = [
    customerId ? { customerId } : null,
    customerGid ? { customerId: customerGid } : null,
    email ? { email } : null,
  ].filter(Boolean) as Array<{ customerId?: string; email?: string }>;

  if (matches.length) {
    await db.wholesaleFormSubmission.deleteMany({
      where: {
        shop,
        OR: matches,
      },
    });
  }

  return new Response();
};
