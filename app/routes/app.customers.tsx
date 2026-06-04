import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";

import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  EmptyState,
  InlineGrid,
  InlineStack,
  Page,
  Text,
} from "@shopify/polaris";

import db from "../db.server";
import { authenticate } from "../shopify.server";

function getInitials(firstName?: string | null, lastName?: string | null) {
  const initials = [firstName, lastName]
    .map((value) => value?.trim().slice(0, 1).toUpperCase())
    .filter(Boolean)
    .join("");

  return initials || "B2B";
}

function getCustomerName({
  firstName,
  lastName,
  email,
}: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}) {
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  return fullName || email || "Unknown customer";
}

function getStatusTone(status: string) {
  if (status === "approved") {
    return "success" as const;
  }

  if (status === "pending") {
    return "attention" as const;
  }

  return "info" as const;
}

function uniqueCustomersByEmail<
  T extends {
    email?: string | null;
    id: string;
  },
>(customers: T[]) {
  const seen = new Set<string>();

  return customers.filter((customer) => {
    const key = customer.email?.trim().toLowerCase() || customer.id;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

type CustomerInviteResponse = {
  data?: {
    customerSendAccountInviteEmail?: {
      customer?: {
        id: string;
      } | null;
      userErrors?: Array<{
        field?: string[] | null;
        message: string;
      }>;
    };
  };
  errors?: Array<{
    message: string;
  }>;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown Shopify API error.";
  }
}

function getCustomerAccessWarning(error: unknown) {
  const message = getErrorMessage(error);

  if (
    message.toLowerCase().includes("not approved to access the customer object")
  ) {
    return "Approval saved, but Shopify blocked the customer email/tag action because this app is not approved for protected customer data. Request Customer object access in Shopify Partner Dashboard.";
  }

  return message;
}

async function sendApprovalInviteEmail({
  admin,
  customerId,
}: {
  admin: Awaited<ReturnType<typeof authenticate.admin>>["admin"];
  customerId: string;
}) {
  try {
    const response = await admin.graphql(
      `#graphql
        mutation B2BridgeSendApprovalInvite($customerId: ID!) {
          customerSendAccountInviteEmail(customerId: $customerId) {
            customer {
              id
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
          customerId,
        },
      },
    );
    const body = (await response.json()) as CustomerInviteResponse;
    const apiError = body.errors?.[0]?.message;
    const userError =
      body.data?.customerSendAccountInviteEmail?.userErrors?.[0]?.message;

    if (apiError || userError) {
      return {
        ok: false,
        error:
          apiError || userError || "Customer invite email could not be sent.",
      };
    }

    return { ok: true, error: "" };
  } catch (error) {
    return {
      ok: false,
      error: getCustomerAccessWarning(error),
    };
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  await db.wholesaleFormSubmission.deleteMany({
    where: {
      shop: session.shop,
      customerId: "",
      status: {
        in: ["approved", "rejected"],
      },
    },
  });

  const submissions = await db.wholesaleFormSubmission.findMany({
    where: { shop: session.shop },
    include: {
      form: {
        select: {
          title: true,
        },
      },
    },
    orderBy: { submittedAt: "desc" },
  });

  const customers = uniqueCustomersByEmail(submissions);
  const approvedCount = customers.filter(
    (customer) => customer.status === "approved",
  ).length;
  const pendingCount = customers.filter(
    (customer) => customer.status !== "approved",
  ).length;

  return {
    customers,
    metrics: {
      total: customers.length,
      approved: approvedCount,
      pending: pendingCount,
    },
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const submissionId = String(formData.get("submissionId") || "");
  const submission = await db.wholesaleFormSubmission.findFirst({
    where: {
      id: submissionId,
      shop: session.shop,
    },
  });

  if (!submission) {
    return { ok: false, error: "Customer submission not found." };
  }

  if (intent === "delete_submission") {
    const where = submission.email
      ? {
          shop: session.shop,
          email: submission.email,
        }
      : {
          shop: session.shop,
          id: submission.id,
        };

    await db.wholesaleFormSubmission.deleteMany({ where });

    return { ok: true, deleted: true };
  }

  const status = intent === "approve_customer" ? "approved" : "rejected";
  const where = submission.email
    ? {
        shop: session.shop,
        email: submission.email,
      }
    : {
        shop: session.shop,
        id: submission.id,
      };

  await db.wholesaleFormSubmission.updateMany({
    where,
    data: { status },
  });

  const customerId = submission.customerId || "";
  let emailSent = false;
  let emailWarning = "";

  if (customerId) {
    const pricingSetting = await db.wholesalePricingSetting.findUnique({
      where: { shop: session.shop },
    });
    const wholesaleTag = pricingSetting?.customerTag || "WHOLESALER";

    try {
      if (status === "approved") {
        await admin.graphql(
          `#graphql
            mutation B2BridgeApproveCustomerTags(
              $id: ID!,
              $addTags: [String!]!,
              $removeTags: [String!]!
            ) {
              addWholesaleTags: tagsAdd(id: $id, tags: $addTags) {
                userErrors {
                  message
                }
              }
              removePendingTags: tagsRemove(id: $id, tags: $removeTags) {
                userErrors {
                  message
                }
              }
            }
          `,
          {
            variables: {
              id: customerId,
              addTags: [wholesaleTag],
              removeTags: ["b2bridge-pending-approval"],
            },
          },
        );
      } else {
        await admin.graphql(
          `#graphql
            mutation B2BridgeRejectCustomerTags($id: ID!, $tags: [String!]!) {
              tagsRemove(id: $id, tags: $tags) {
                userErrors {
                  message
                }
              }
            }
          `,
          {
            variables: {
              id: customerId,
              tags: [
                wholesaleTag,
                "b2bridge-auto-approved",
                "b2bridge-pending-approval",
              ],
            },
          },
        );
      }
    } catch (error) {
      emailWarning = getCustomerAccessWarning(error);
    }
  }

  if (status === "approved") {
    if (customerId) {
      const approvalEmail = await sendApprovalInviteEmail({
        admin,
        customerId,
      });

      emailSent = approvalEmail.ok;
      emailWarning = approvalEmail.error;
    } else {
      emailWarning =
        "Approval email was not sent because this submission is not linked to a Shopify customer. Protected customer data access is required to look up customers by email.";
    }
  }

  return { ok: true, status, emailSent, emailWarning };
};

export default function B2BCustomersPage() {
  const { customers, metrics } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <Page title="Customer approvals">
      <BlockStack gap="500">
        <Card padding="0">
          <Box
            padding="800"
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
                  <Badge tone="success">Approval workflow</Badge>
                </InlineStack>

                <BlockStack gap="100">
                  <Text as="h2" variant="heading2xl">
                    Wholesale approvals
                  </Text>
                  <Text as="p" tone="subdued">
                    Review storefront applications, approve wholesale access,
                    and keep applicant records tidy.
                  </Text>
                </BlockStack>
              </BlockStack>

              <Button url="/app/registration-forms" variant="primary">
                Registration forms
              </Button>
            </InlineGrid>
          </Box>

          <Box padding="400">
            <InlineGrid columns={{ xs: 1, sm: 3 }} gap="300">
              <MetricTile
                label="Applicant records"
                value={String(metrics.total)}
              />
              <MetricTile label="Approved" value={String(metrics.approved)} />
              <MetricTile
                label="Needs review"
                value={String(metrics.pending)}
              />
            </InlineGrid>
          </Box>
        </Card>

        <Card>
          {actionData?.ok === false && actionData.error ? (
            <Box paddingBlockEnd="400">
              <Banner tone="critical">{actionData.error}</Banner>
            </Box>
          ) : null}

          {actionData?.ok && actionData.status ? (
            <Box paddingBlockEnd="400">
              <Banner tone="success">
                Customer marked as {actionData.status}.
                {actionData.emailSent
                  ? " Approval email sent."
                  : actionData.emailWarning
                    ? ` ${actionData.emailWarning}`
                    : ""}
              </Banner>
            </Box>
          ) : null}

          {actionData?.ok && actionData.deleted ? (
            <Box paddingBlockEnd="400">
              <Banner tone="success">Applicant record deleted.</Banner>
            </Box>
          ) : null}

          {customers.length === 0 ? (
            <EmptyState
              heading="No wholesale applicants yet"
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>
                Applications appear here as soon as customers submit a wholesale
                registration form.
              </p>
            </EmptyState>
          ) : (
            <BlockStack gap="300">
              {customers.map((customer) => {
                const name = getCustomerName(customer);
                const submittedAt = new Date(
                  customer.submittedAt,
                ).toLocaleString();

                return (
                  <Box
                    key={customer.id}
                    padding="500"
                    borderWidth="025"
                    borderColor="border"
                    borderRadius="300"
                    background="bg-surface"
                  >
                    <InlineGrid
                      columns={{ xs: 1, md: "minmax(0, 1fr) auto" }}
                      gap="400"
                      alignItems="start"
                    >
                      <InlineStack gap="400" blockAlign="start" wrap={false}>
                        <Box
                          padding="300"
                          borderRadius="300"
                          background="bg-surface-secondary"
                          borderWidth="025"
                          borderColor="border"
                          minWidth="54px"
                        >
                          <Text as="p" variant="headingMd" alignment="center">
                            {getInitials(customer.firstName, customer.lastName)}
                          </Text>
                        </Box>

                        <BlockStack gap="200">
                          <InlineStack gap="200" blockAlign="center">
                            <Text as="h3" variant="headingLg">
                              {name}
                            </Text>
                            <Badge tone={getStatusTone(customer.status)}>
                              {customer.status}
                            </Badge>
                          </InlineStack>

                          <InlineStack gap="300">
                            <Text as="p" tone="subdued">
                              {customer.email || "No email"}
                            </Text>
                            <Text as="p" tone="subdued">
                              {customer.phone || "No phone"}
                            </Text>
                            <Text as="p" tone="subdued">
                              {customer.company || "No company"}
                            </Text>
                          </InlineStack>

                          <Text as="p" variant="bodySm" tone="subdued">
                            Form: {customer.form.title} · Submitted{" "}
                            {submittedAt}
                          </Text>
                        </BlockStack>
                      </InlineStack>

                      <BlockStack gap="200" inlineAlign="end">
                        {customer.customerId ? (
                          <Badge tone="success">Linked Shopify customer</Badge>
                        ) : (
                          <Badge tone="attention">Applicant record only</Badge>
                        )}
                        <InlineStack gap="200">
                          {customer.status !== "approved" ? (
                            <Form method="post">
                              <input
                                type="hidden"
                                name="intent"
                                value="approve_customer"
                              />
                              <input
                                type="hidden"
                                name="submissionId"
                                value={customer.id}
                              />
                              <Button
                                submit
                                variant="primary"
                                loading={isSubmitting}
                              >
                                Approve access
                              </Button>
                            </Form>
                          ) : null}
                          {customer.status !== "rejected" ? (
                            <Form method="post">
                              <input
                                type="hidden"
                                name="intent"
                                value="reject_customer"
                              />
                              <input
                                type="hidden"
                                name="submissionId"
                                value={customer.id}
                              />
                              <Button
                                submit
                                tone="critical"
                                loading={isSubmitting}
                              >
                                Reject
                              </Button>
                            </Form>
                          ) : null}
                          {!customer.customerId ? (
                            <Form method="post">
                              <input
                                type="hidden"
                                name="intent"
                                value="delete_submission"
                              />
                              <input
                                type="hidden"
                                name="submissionId"
                                value={customer.id}
                              />
                              <Button
                                submit
                                tone="critical"
                                loading={isSubmitting}
                              >
                                Delete record
                              </Button>
                            </Form>
                          ) : null}
                        </InlineStack>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {customer.customerId || customer.id}
                        </Text>
                      </BlockStack>
                    </InlineGrid>
                  </Box>
                );
              })}
            </BlockStack>
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <Box
      padding="400"
      borderRadius="300"
      borderWidth="025"
      borderColor="border"
      background="bg-surface"
    >
      <BlockStack gap="100">
        <Text as="p" variant="headingLg">
          {value}
        </Text>
        <Text as="p" tone="subdued">
          {label}
        </Text>
      </BlockStack>
    </Box>
  );
}
