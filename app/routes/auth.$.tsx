
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

function getShopFromAdminUrl(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    const storeHandle = url.pathname.match(/\/store\/([^/]+)/)?.[1];

    return storeHandle ? `${storeHandle}.myshopify.com` : null;
  } catch {
    return null;
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (
    url.pathname.endsWith("/auth/session-token") &&
    url.searchParams.get("charge_id")
  ) {
    const shop =
      url.searchParams.get("shop") ||
      getShopFromAdminUrl(request.headers.get("referer"));
    const billingUrl = new URL("/app/billing", url);

    if (shop) {
      billingUrl.searchParams.set("shop", shop);
    }

    throw redirect(`${billingUrl.pathname}${billingUrl.search}`);
  }

  await authenticate.admin(request);

  return null;
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
