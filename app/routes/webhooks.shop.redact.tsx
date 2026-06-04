import type { ActionFunctionArgs } from "react-router";

import db from "../db.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticate.webhook(request);

  await db.wholesaleFormSubmission.deleteMany({ where: { shop } });
  await db.wholesaleForm.deleteMany({ where: { shop } });
  await db.wholesalePricingSetting.deleteMany({ where: { shop } });
  await db.session.deleteMany({ where: { shop } });

  return new Response();
};
