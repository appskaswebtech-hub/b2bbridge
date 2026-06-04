import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import db from "../db.server";
import { authenticate, unauthenticated } from "../shopify.server";

type RegistrationField = {
  label: string;
  type: string;
};

type ShopifyGraphqlError = {
  message?: string;
};

type CustomerCreateResponse = {
  errors?: ShopifyGraphqlError[];
  data?: {
    customerCreate?: {
      customer?: {
        id?: string;
      } | null;
      userErrors?: ShopifyGraphqlError[];
    } | null;
  };
};

const appProxyFormPath = "/apps/b2bridge-4";
const appProxyRoutePath = "/proxy";

const fallbackFields: RegistrationField[] = [
  { label: "First name", type: "text" },
  { label: "Last name", type: "text" },
  { label: "Email", type: "email" },
  { label: "Company", type: "text" },
  { label: "Phone", type: "tel" },
];

function getShopFromRequest(request: Request, sessionShop?: string) {
  const url = new URL(request.url);
  return sessionShop || url.searchParams.get("shop") || "";
}

function getFormIdFromRequest(request: Request) {
  const url = new URL(request.url);
  const queryFormId =
    url.searchParams.get("formId") || url.searchParams.get("form_id") || "";

  if (queryFormId) {
    return normalizeFormIdentifier(queryFormId);
  }

  return normalizeFormIdentifier(getFormIdFromPath(url.pathname));
}

function getFormIdFromPath(pathname: string) {
  for (const prefix of [appProxyFormPath, appProxyRoutePath]) {
    if (!pathname.startsWith(`${prefix}/`)) {
      continue;
    }

    const [formId] = pathname.slice(prefix.length + 1).split("/");

    if (formId) {
      try {
        return decodeURIComponent(formId);
      } catch {
        return formId;
      }
    }
  }

  return "";
}

function normalizeFormIdentifier(value: string) {
  const rawValue = String(value || "").trim();

  if (!rawValue) {
    return "";
  }

  let pathname = rawValue.split("?")[0];

  try {
    pathname = new URL(rawValue, "https://b2bridge.local").pathname;
  } catch {
    // Use the raw path-like value.
  }

  pathname = pathname.replace(/\/+$/g, "");

  for (const prefix of [appProxyFormPath, appProxyRoutePath]) {
    if (!pathname.startsWith(`${prefix}/`)) {
      continue;
    }

    const [formId] = pathname.slice(prefix.length + 1).split("/");

    if (formId) {
      try {
        return decodeURIComponent(formId);
      } catch {
        return formId;
      }
    }
  }

  return rawValue;
}

function parseFields(fieldsJson?: string | null) {
  if (!fieldsJson) {
    return fallbackFields;
  }

  try {
    const parsed = JSON.parse(fieldsJson);

    if (!Array.isArray(parsed)) {
      return fallbackFields;
    }

    const fields = parsed.filter(
      (field): field is RegistrationField =>
        typeof field?.label === "string" && typeof field?.type === "string",
    );

    return fields.length > 0 ? fields : fallbackFields;
  } catch {
    return fallbackFields;
  }
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function fieldInputType(type: string) {
  if (["email", "tel", "url", "password", "file"].includes(type)) {
    return type;
  }

  if (type === "checkbox") {
    return "checkbox";
  }

  return "text";
}

function getRenderableFields(
  fields: RegistrationField[],
  hidePasswordField?: boolean,
) {
  if (!hidePasswordField) {
    return fields;
  }

  return fields.filter((field) => field.type !== "password");
}

function createProxyFormUrl(formId: string) {
  return `${appProxyFormPath}/${encodeURIComponent(formId)}`;
}

function isPageEmbedRequest(request: Request) {
  const url = new URL(request.url);
  return url.searchParams.get("embedded") === "page";
}

function wantsInlineResponse(request: Request) {
  return request.headers.get("Accept")?.includes("application/json");
}

function getLiquidResponseOptions(request: Request) {
  return { layout: !isPageEmbedRequest(request) };
}

function inlineError(fieldName: string, message: string) {
  return Response.json(
    {
      ok: false,
      fieldErrors: {
        [fieldName]: message,
      },
    },
    { status: 422 },
  );
}

function inlineFormError(message: string) {
  return Response.json(
    {
      ok: false,
      formError: message,
    },
    { status: 422 },
  );
}

function getFieldNameByLabel(fields: RegistrationField[], label: string) {
  const targetLabel = label.toLowerCase();
  const field = fields.find(
    (currentField) => currentField.label.toLowerCase() === targetLabel,
  );

  return field ? `field_${slugify(field.label)}` : "";
}

function getFieldNameFromErrorMessage(
  message: string,
  fields: RegistrationField[],
) {
  const lowerMessage = message.toLowerCase();

  for (const field of fields) {
    const lowerLabel = field.label.toLowerCase();

    if (lowerLabel && lowerMessage.includes(lowerLabel)) {
      return `field_${slugify(field.label)}`;
    }
  }

  if (lowerMessage.includes("email")) {
    return getFieldNameByLabel(fields, "Email");
  }

  if (lowerMessage.includes("phone")) {
    return getFieldNameByLabel(fields, "Phone");
  }

  return "";
}

function createFormActionUrl({
  formId,
  previewUrl,
  embedded,
}: {
  formId: string;
  previewUrl?: string | null;
  embedded?: boolean;
}) {
  const formUrl = previewUrl?.startsWith(appProxyFormPath)
    ? previewUrl
    : createProxyFormUrl(formId);

  if (!embedded) {
    return formUrl;
  }

  const separator = formUrl.includes("?") ? "&" : "?";
  return `${formUrl}${separator}embedded=page`;
}

function renderWithThemeChrome(content: string) {
  return `
    <main id="MainContent" class="content-for-layout focus-none" role="main" tabindex="-1">
      ${content}
    </main>
  `;
}

function renderField(field: RegistrationField) {
  const name = `field_${slugify(field.label)}`;
  const label = escapeHtml(field.label);

  if (field.type === "textarea") {
    return `
      <label class="b2b-field">
        <span>${label}</span>
        <textarea name="${name}" rows="4"></textarea>
      </label>
    `;
  }

  if (field.type === "checkbox") {
    return `
      <label class="b2b-checkbox">
        <input type="checkbox" name="${name}" value="yes" />
        <span>${label}</span>
      </label>
    `;
  }

  return `
    <label class="b2b-field">
      <span>${label}</span>
      <input type="${fieldInputType(field.type)}" name="${name}" ${
        field.type === "email" ? "required" : ""
      } />
    </label>
  `;
}

function renderPrivacyCheckbox({
  enabled,
  required,
}: {
  enabled?: boolean;
  required?: boolean;
}) {
  if (!enabled && !required) {
    return "";
  }

  return `
    <label class="b2b-checkbox">
      <input type="checkbox" name="privacyAccepted" value="yes" ${
        required ? "required" : ""
      } />
      <span>I accept the privacy policy.</span>
    </label>
  `;
}

function renderSpamProtection(enabled?: boolean) {
  if (!enabled) {
    return "";
  }

  return `
    <div class="b2b-hp" aria-hidden="true">
      <label>
        Website
        <input type="text" name="b2bridgeWebsite" tabindex="-1" autocomplete="off" />
      </label>
    </div>
  `;
}

function isAutoApproved({
  approvalType,
  autoApproveDomain,
  autoApproveEmailRule,
}: {
  approvalType?: string | null;
  autoApproveDomain?: boolean | null;
  autoApproveEmailRule?: string | null;
}, email: string) {
  if (approvalType === "auto") {
    return true;
  }

  const rule = autoApproveEmailRule?.trim().toLowerCase();

  return Boolean(
    autoApproveDomain && rule && email.toLowerCase().includes(rule),
  );
}

function isProtectedCustomerDataError(message: string) {
  return message
    .toLowerCase()
    .includes("not approved to access the customer object");
}

async function getActiveForm(shop: string, formId: string) {
  return db.wholesaleForm.findFirst({
    where: {
      status: "active",
      shop,
      ...(formId
        ? {
            OR: [
              { id: formId },
              { previewUrl: createProxyFormUrl(formId) },
            ],
          }
        : {}),
    },
    include: {
      approvalSetting: true,
      postRegistration: true,
      fieldSetting: true,
      messageSetting: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { liquid, session } = await authenticate.public.appProxy(request);
  const liquidResponseOptions = getLiquidResponseOptions(request);

  const shop = getShopFromRequest(request, session?.shop);
  const formId = getFormIdFromRequest(request);

  if (!shop) {
    return liquid(
      renderWithThemeChrome(
        renderMessage("Registration form is not available.", "error"),
      ),
      liquidResponseOptions,
    );
  }

  const form = await getActiveForm(shop, formId);

  if (!form) {
    return liquid(
      renderWithThemeChrome(
        renderMessage("No active registration form is available."),
      ),
      liquidResponseOptions,
    );
  }

  const fields = getRenderableFields(
    parseFields(form.fieldSetting?.fieldsJson),
    form.approvalSetting?.hidePasswordField,
  );
  const successColor = form.messageSetting?.successColor || "#008000";
  const errorColor = form.messageSetting?.errorColor || "#cc0000";

  return liquid(
    renderWithThemeChrome(
      `
        <section class="b2b-registration-shell">
          <style>
            .b2b-registration-shell {
              max-width: 1040px;
              margin: 42px auto;
              padding: 0 18px;
              font-family: inherit;
            }
            .b2b-registration-card {
              border: 1px solid rgba(17, 24, 39, .12);
              border-radius: 8px;
              background: #fff;
              overflow: hidden;
              box-shadow: 0 18px 48px rgba(17, 24, 39, .10);
            }
            .b2b-registration-head {
              display: grid;
              grid-template-columns: minmax(0, 1fr) auto;
              gap: 24px;
              align-items: end;
              padding: 34px;
              background:
                linear-gradient(135deg, rgba(248, 250, 252, .96), rgba(236, 253, 245, .92)),
                #f8fafc;
              border-bottom: 1px solid rgba(17, 24, 39, .10);
            }
            .b2b-registration-kicker {
              display: inline-flex;
              width: fit-content;
              border: 1px solid rgba(5, 150, 105, .28);
              border-radius: 999px;
              margin: 0 0 12px;
              padding: 5px 10px;
              background: rgba(240, 253, 244, .72);
              color: #065f46;
              font-size: 12px;
              font-weight: 700;
              letter-spacing: 0;
              text-transform: uppercase;
            }
            .b2b-registration-head h1 {
              margin: 0;
              color: #111827;
              font-size: clamp(28px, 4vw, 42px);
              line-height: 1.08;
              letter-spacing: 0;
            }
            .b2b-registration-head p {
              max-width: 620px;
              margin: 12px 0 0;
              color: rgba(17, 24, 39, .68);
              font-size: 16px;
              line-height: 1.55;
            }
            .b2b-registration-badge {
              border: 1px solid rgba(17, 24, 39, .12);
              border-radius: 8px;
              padding: 14px 16px;
              background: rgba(255, 255, 255, .76);
              color: rgba(17, 24, 39, .72);
              font-size: 13px;
              font-weight: 700;
              white-space: nowrap;
            }
            .b2b-registration-form {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 18px 20px;
              padding: 34px;
            }
            .b2b-field {
              display: grid;
              gap: 7px;
              color: #111827;
              font-size: 13px;
              font-weight: 700;
            }
            .b2b-field:has(textarea),
            .b2b-checkbox,
            .b2b-submit,
            .b2b-form-note,
            .b2b-hp {
              grid-column: 1 / -1;
            }
            .b2b-field input,
            .b2b-field textarea {
              width: 100%;
              box-sizing: border-box;
              border: 1px solid rgba(17, 24, 39, .18);
              border-radius: 8px;
              background: #fbfcfd;
              color: #111827;
              padding: 13px 14px;
              font: inherit;
              font-weight: 500;
              outline: none;
              transition: border-color .14s ease, box-shadow .14s ease, background .14s ease;
            }
            .b2b-field input:focus,
            .b2b-field textarea:focus {
              border-color: #047857;
              background: #fff;
              box-shadow: 0 0 0 3px rgba(4, 120, 87, .14);
            }
            .b2b-checkbox {
              display: flex;
              gap: 10px;
              align-items: flex-start;
              border: 1px solid rgba(17, 24, 39, .10);
              border-radius: 8px;
              padding: 12px 14px;
              background: #f8fafc;
              color: rgba(17, 24, 39, .76);
              font-size: 14px;
            }
            .b2b-checkbox input {
              margin-top: 2px;
            }
            .b2b-submit {
              border: 0;
              border-radius: 8px;
              padding: 15px 18px;
              background: linear-gradient(135deg, #111827, #047857);
              color: #fff;
              font: inherit;
              font-weight: 700;
              cursor: pointer;
              box-shadow: 0 12px 24px rgba(4, 120, 87, .24);
              transition: transform .14s ease, box-shadow .14s ease, opacity .14s ease;
            }
            .b2b-submit:hover {
              box-shadow: 0 16px 30px rgba(4, 120, 87, .28);
              transform: translateY(-1px);
            }
            .b2b-submit:disabled {
              cursor: progress;
              opacity: .72;
              transform: none;
            }
            .b2b-form-note {
              margin: -4px 0 0;
              color: rgba(17, 24, 39, .58);
              font-size: 13px;
              text-align: center;
            }
            .b2b-hp {
              height: 0;
              left: -9999px;
              overflow: hidden;
              position: absolute;
              top: auto;
              width: 0;
            }
            .b2b-success { color: ${escapeHtml(successColor)}; }
            .b2b-error { color: ${escapeHtml(errorColor)}; }
            @media (max-width: 720px) {
              .b2b-registration-head,
              .b2b-registration-form {
                grid-template-columns: 1fr;
                padding: 24px;
              }
              .b2b-registration-badge {
                width: fit-content;
              }
            }
          </style>

          <div class="b2b-registration-card">
            <div class="b2b-registration-head">
              <div>
                <p class="b2b-registration-kicker">Wholesale access</p>
                <h1>${escapeHtml(form.title)}</h1>
                <p>Apply for a business account and unlock wholesale pricing, account review, and faster repeat ordering.</p>
              </div>
              <div class="b2b-registration-badge">Secure application</div>
            </div>

            <form class="b2b-registration-form" method="post" action="${escapeHtml(
              createFormActionUrl({
                formId: form.id,
                previewUrl: form.previewUrl,
                embedded: isPageEmbedRequest(request),
              }),
            )}">
              <input type="hidden" name="formId" value="${escapeHtml(form.id)}" />
              ${fields.map(renderField).join("")}
              ${renderPrivacyCheckbox({
                enabled: form.fieldSetting?.enablePrivacyPolicyCheckbox,
                required: form.fieldSetting?.requirePrivacyPolicy,
              })}
              ${renderSpamProtection(form.fieldSetting?.enableRecaptcha)}
              <button class="b2b-submit" type="submit">Submit application</button>
              <p class="b2b-form-note">Your information is sent securely through B2Bridge.</p>
            </form>
          </div>
        </section>
      `,
    ),
    liquidResponseOptions,
  );
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { liquid, session } = await authenticate.public.appProxy(request);
  const liquidResponseOptions = getLiquidResponseOptions(request);
  const useInlineResponse = wantsInlineResponse(request);
  const shop = getShopFromRequest(request, session?.shop);
  const formData = await request.formData();
  const formId = String(formData.get("formId") || getFormIdFromRequest(request));

  if (!shop || !formId) {
    if (useInlineResponse) {
      return inlineFormError("Registration form is not available.");
    }

    return liquid(
      renderWithThemeChrome(
        renderMessage("Registration form is not available.", "error"),
      ),
      liquidResponseOptions,
    );
  }

  const form = await db.wholesaleForm.findFirst({
    where: {
      id: formId,
      shop,
      status: "active",
    },
    include: {
      approvalSetting: true,
      postRegistration: true,
      fieldSetting: true,
      messageSetting: true,
    },
  });

  if (!form) {
    if (useInlineResponse) {
      return inlineFormError("Registration form is not available.");
    }

    return liquid(
      renderWithThemeChrome(
        renderMessage("Registration form is not available.", "error"),
      ),
      liquidResponseOptions,
    );
  }

  if (
    form.fieldSetting?.requirePrivacyPolicy &&
    formData.get("privacyAccepted") !== "yes"
  ) {
    if (useInlineResponse) {
      return inlineError(
        "privacyAccepted",
        "Please accept the privacy policy before submitting.",
      );
    }

    return liquid(
      renderWithThemeChrome(
        renderMessage(
          "Please accept the privacy policy before submitting.",
          "error",
          form.messageSetting,
        ),
      ),
      liquidResponseOptions,
    );
  }

  if (
    form.fieldSetting?.enableRecaptcha &&
    String(formData.get("b2bridgeWebsite") || "").trim()
  ) {
    if (useInlineResponse) {
      return inlineFormError(
        "Submission could not be verified. Please try again.",
      );
    }

    return liquid(
      renderWithThemeChrome(
        renderMessage(
          "Submission could not be verified. Please try again.",
          "error",
          form.messageSetting,
        ),
      ),
      liquidResponseOptions,
    );
  }

  const fields = getRenderableFields(
    parseFields(form.fieldSetting?.fieldsJson),
    form.approvalSetting?.hidePasswordField,
  );
  const values = Object.fromEntries(
    fields.map((field) => {
      const key = `field_${slugify(field.label)}`;
      return [field.label, String(formData.get(key) || "")];
    }),
  );

  const email = values.Email || values.email || "";
  const firstName = values["First name"] || values.firstName || "";
  const lastName = values["Last name"] || values.lastName || "";
  const phone = values.Phone || values.phone || "";
  const company = values.Company || values.company || "";
  const autoApproved = isAutoApproved(form.approvalSetting || {}, email);
  const tags = [
    autoApproved ? form.postRegistration?.customerTag : null,
    autoApproved ? "b2bridge-auto-approved" : "b2bridge-pending-approval",
  ].filter(Boolean) as string[];

  if (!email) {
    if (useInlineResponse) {
      return inlineError(
        getFieldNameByLabel(fields, "Email") || "field_email",
        "Email is required to create a customer.",
      );
    }

    return liquid(
      renderWithThemeChrome(
        renderMessage(
          "Email is required to create a customer.",
          "error",
          form.messageSetting,
        ),
      ),
      liquidResponseOptions,
    );
  }

  let adminContext: Awaited<ReturnType<typeof unauthenticated.admin>>;

  try {
    adminContext = await unauthenticated.admin(shop);
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Could not load Shopify admin session.";

    if (useInlineResponse) {
      return inlineFormError(`Customer could not be created. ${errorMessage}`);
    }

    return liquid(
      renderWithThemeChrome(
        renderMessage(
          `Customer could not be created. ${errorMessage}`,
          "error",
          form.messageSetting,
        ),
      ),
      liquidResponseOptions,
    );
  }

  let customerId = "";
  const status = autoApproved ? "approved" : "pending";

  try {
    const customerInput: Record<string, unknown> = {
      email,
      tags,
      note: `B2Bridge wholesale registration: ${JSON.stringify(values)}`,
    };

    if (firstName) {
      customerInput.firstName = firstName;
    }

    if (lastName) {
      customerInput.lastName = lastName;
    }

    if (phone) {
      customerInput.phone = phone;
    }

    const response = await adminContext.admin.graphql(
      `#graphql
        mutation CreateB2BridgeCustomer($input: CustomerInput!) {
          customerCreate(input: $input) {
            customer {
              id
            }
            userErrors {
              message
            }
          }
        }
      `,
      {
        variables: {
          input: customerInput,
        },
      },
    );
    const body = (await response.json()) as CustomerCreateResponse;
    const graphqlErrors = body.errors || [];
    const errors = body.data?.customerCreate?.userErrors || [];
    customerId = body.data?.customerCreate?.customer?.id || "";

    if (graphqlErrors.length || !customerId || errors.length) {
      const errorMessage =
        graphqlErrors
          .map((error: { message?: string }) => error.message)
          .filter(Boolean)
          .join(" ") ||
        errors.map((error: { message?: string }) => error.message).join(" ") ||
        "Customer could not be created in Shopify.";

      if (!isProtectedCustomerDataError(errorMessage)) {
        if (useInlineResponse) {
          const fieldName = getFieldNameFromErrorMessage(errorMessage, fields);

          return fieldName
            ? inlineError(fieldName, errorMessage)
            : inlineFormError(errorMessage);
        }

        return liquid(
          renderWithThemeChrome(
            renderMessage(errorMessage, "error", form.messageSetting),
          ),
          liquidResponseOptions,
        );
      }

      customerId = "";
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Customer could not be created in Shopify.";

    if (!isProtectedCustomerDataError(errorMessage)) {
      if (useInlineResponse) {
        const fieldName = getFieldNameFromErrorMessage(errorMessage, fields);

        return fieldName
          ? inlineError(fieldName, errorMessage)
          : inlineFormError(errorMessage);
      }

      return liquid(
        renderWithThemeChrome(
          renderMessage(errorMessage, "error", form.messageSetting),
        ),
        liquidResponseOptions,
      );
    }
  }

  await db.wholesaleFormSubmission.create({
    data: {
      shop,
      formId,
      email,
      firstName,
      lastName,
      phone,
      company,
      customerId,
      status: customerId ? status : "submitted",
      fieldsJson: JSON.stringify(values),
    },
  });

  const message =
    form.messageSetting?.successMessage ||
    "Your registration was submitted successfully.";
  const redirectUrl = form.postRegistration?.redirectUrl;

  if (redirectUrl) {
    if (useInlineResponse) {
      return Response.json({ ok: true, message, redirectUrl });
    }

    return liquid(
      renderWithThemeChrome(
        `
          ${renderMessage(message, "success", form.messageSetting)}
          <script>
            setTimeout(function () {
              window.location.href = ${JSON.stringify(redirectUrl)};
            }, 1200);
          </script>
        `,
      ),
      liquidResponseOptions,
    );
  }

  if (useInlineResponse) {
    return Response.json({ ok: true, message });
  }

  return liquid(
    renderWithThemeChrome(renderMessage(message, "success", form.messageSetting)),
    liquidResponseOptions,
  );
};

function renderMessage(
  message: string,
  tone: "success" | "error" = "success",
  messageSetting?: {
    successColor?: string | null;
    errorColor?: string | null;
  } | null,
) {
  const color =
    tone === "success"
      ? messageSetting?.successColor || "#008000"
      : messageSetting?.errorColor || "#cc0000";

  return `
    <section style="max-width: 720px; margin: 48px auto; padding: 0 20px;">
      <div style="border: 1px solid rgba(0,0,0,.12); border-radius: 14px; padding: 28px; background: #fff;">
        <h1 class="b2b-${tone}" style="margin: 0 0 10px; color: ${escapeHtml(color)};">${escapeHtml(message)}</h1>
        <p style="margin: 0; color: rgba(0,0,0,.62);">${
          tone === "error"
            ? "Please go back to the form and correct the highlighted information."
            : "You can return to the store whenever you are ready."
        }</p>
        ${
          tone === "error"
            ? `<button class="b2b-return-to-form" type="button" onclick="window.history.back()" style="margin-top: 18px; border: 0; border-radius: 10px; padding: 12px 16px; background: #111827; color: #fff; font: inherit; font-weight: 700; cursor: pointer;">Back to form</button>`
            : ""
        }
      </div>
    </section>
  `;
}
