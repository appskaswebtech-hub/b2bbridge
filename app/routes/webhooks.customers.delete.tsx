import type { ActionFunctionArgs } from "react-router";

import db from "../db.server";
import { authenticate } from "../shopify.server";

type CustomerDeletePayload = {
  id?: number | string;
  email?: string | null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop, topic } = await authenticate.webhook(request);
  const customer = payload as CustomerDeletePayload;
  const customerId = customer.id ? String(customer.id) : "";
  const customerGid = customerId
    ? `gid://shopify/Customer/${customerId}`
    : "";
  const email = customer.email?.trim().toLowerCase() || "";
  const matches = [
    customerId ? { customerId } : null,
    customerGid ? { customerId: customerGid } : null,
    email ? { email } : null,
  ].filter(Boolean) as Array<{ customerId?: string; email?: string }>;

  console.log(`Received ${topic} webhook for ${shop}`);

  if (!matches.length) {
    return new Response();
  }

  const deleted = await db.wholesaleFormSubmission.deleteMany({
    where: {
      shop,
      OR: matches,
    },
  });

  console.log(
    `Deleted ${deleted.count} B2Bridge submission(s) for deleted Shopify customer ${customerId || email}`,
  );

  return new Response();
};
