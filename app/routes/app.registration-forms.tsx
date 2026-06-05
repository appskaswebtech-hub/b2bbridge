import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
  useSearchParams,
} from "react-router";
import type { DragEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { authenticate } from "../shopify.server";
import db from "../db.server";
import { formatLimit, isWithinLimit } from "../billing";
import { getBillingStatus } from "../billing.server";

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
  EmptyState,
  InlineGrid,
  InlineStack,
  Layout,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";

type RegistrationField = {
  label: string;
  type: string;
};

const defaultFields: RegistrationField[] = [
  { label: "First name", type: "text" },
  { label: "Last name", type: "text" },
  { label: "Email", type: "email" },
  { label: "Password", type: "password" },
  { label: "Address", type: "text" },
  { label: "Company", type: "text" },
  { label: "Phone", type: "tel" },
  { label: "City", type: "text" },
];

const availableFields: RegistrationField[] = [
  { label: "Country", type: "text" },
  { label: "Zip code", type: "text" },
  { label: "Apartment / suite", type: "text" },
  { label: "Business website", type: "url" },
  { label: "VAT validation", type: "text" },
  { label: "Tax ID validation", type: "text" },
  { label: "Resale certificate upload", type: "file" },
  { label: "Subscribe to newsletter", type: "checkbox" },
  { label: "Custom question", type: "textarea" },
];

const stepTitles = [
  "General",
  "Approval",
  "Post-registration",
  "Fields & protection",
  "Messages",
];

const appProxyFormPath = "/apps/b2bridge-4";

function parseFieldsJson(fieldsJson?: string | null) {
  if (!fieldsJson) {
    return defaultFields;
  }

  try {
    const parsed = JSON.parse(fieldsJson);

    if (!Array.isArray(parsed)) {
      return defaultFields;
    }

    const fields = parsed.filter(
      (field): field is RegistrationField =>
        typeof field?.label === "string" && typeof field?.type === "string",
    );

    return fields.length > 0 ? fields : defaultFields;
  } catch {
    return defaultFields;
  }
}

function normalizeFieldLabel(label: string) {
  return label.trim().toLowerCase();
}

function dedupeFields(fields: RegistrationField[]) {
  const seenLabels = new Set<string>();

  return fields.filter((field) => {
    const labelKey = normalizeFieldLabel(field.label);

    if (!labelKey || seenLabels.has(labelKey)) {
      return false;
    }

    seenLabels.add(labelKey);
    return true;
  });
}

function hasField(fields: RegistrationField[], field: RegistrationField) {
  const labelKey = normalizeFieldLabel(field.label);

  return fields.some(
    (existingField) => normalizeFieldLabel(existingField.label) === labelKey,
  );
}

function normalizeFieldsJson(fieldsJson: string) {
  return JSON.stringify(dedupeFields(parseFieldsJson(fieldsJson)));
}

async function requireForm(formId: string, shop: string) {
  if (!formId) {
    return null;
  }

  return db.wholesaleForm.findFirst({
    where: {
      id: formId,
      shop,
    },
  });
}

function createProxyFormUrl(slug: string) {
  return `${appProxyFormPath}/${encodeURIComponent(slug)}`;
}

function createStorefrontUrl(shop: string, previewUrl: string) {
  return `https://${shop}${previewUrl}`;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const billingStatus = await getBillingStatus(billing);

  const forms = await db.wholesaleForm.findMany({
    where: { shop: session.shop },
    include: {
      approvalSetting: true,
      postRegistration: true,
      fieldSetting: true,
      messageSetting: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return {
    billing: {
      currentPlan: billingStatus.currentPlan,
      limits: billingStatus.limits,
      hasActivePayment: billingStatus.hasActivePayment,
    },
    forms: forms.map((form) => ({
      ...form,
      storefrontUrl: createStorefrontUrl(session.shop, form.previewUrl),
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "save_general");

  if (intent === "save_general") {
    const formId = String(formData.get("formId") || "");
    const title = String(formData.get("title") || "").trim();
    const status = formData.get("published") === "on" ? "active" : "draft";
    const billingStatus = await getBillingStatus(billing);

    if (!title) {
      return { ok: false, error: "Form name is required" };
    }

    const existingForm = await requireForm(formId, session.shop);

    if (!existingForm) {
      const currentFormCount = await db.wholesaleForm.count({
        where: { shop: session.shop },
      });

      if (!isWithinLimit(currentFormCount, billingStatus.limits.forms)) {
        return {
          ok: false,
          error: `Your current plan allows ${formatLimit(
            billingStatus.limits.forms,
          )} forms. Upgrade your plan to create more forms.`,
        };
      }
    }

    const nextFormId = existingForm?.id || crypto.randomUUID();
    const previewUrl = createProxyFormUrl(nextFormId);

    const form = existingForm
      ? await db.wholesaleForm.update({
          where: { id: existingForm.id },
          data: { title, formUrlType: "portal", previewUrl, status },
        })
      : await db.wholesaleForm.create({
          data: {
            id: nextFormId,
            shop: session.shop,
            title,
            formUrlType: "portal",
            previewUrl,
            status,
          },
        });

    return {
      ok: true,
      formId: form.id,
      nextStep: "2",
    };
  }

  if (intent === "delete_form") {
    const formId = String(formData.get("formId") || "");
    const form = await requireForm(formId, session.shop);

    if (!form) {
      return { ok: false, error: "Registration form not found." };
    }

    await db.wholesaleForm.delete({
      where: { id: form.id },
    });

    return { ok: true, deleted: true };
  }

  if (intent === "save_approval") {
    const formId = String(formData.get("formId") || "");
    const form = await requireForm(formId, session.shop);

    if (!form) {
      return {
        ok: false,
        error: "Parent form not found. Please save General step first.",
      };
    }

    const approvalType = String(formData.get("approvalType") || "manual");
    const hidePasswordField = formData.get("hidePasswordField") === "on";
    const autoApproveDomain = formData.get("autoApproveDomain") === "on";
    const autoApproveEmailRule = String(
      formData.get("autoApproveEmailRule") || "",
    ).trim();

    await db.wholesaleFormApprovalSetting.upsert({
      where: { formId },
      update: {
        approvalType,
        hidePasswordField,
        autoApproveDomain,
        autoApproveEmailRule,
      },
      create: {
        shop: session.shop,
        formId,
        approvalType,
        hidePasswordField,
        autoApproveDomain,
        autoApproveEmailRule,
      },
    });

    return {
      ok: true,
      formId,
      nextStep: "3",
    };
  }

  if (intent === "save_post_registration") {
    const formId = String(formData.get("formId") || "");
    const form = await requireForm(formId, session.shop);

    if (!form) {
      return {
        ok: false,
        error: "Parent form not found. Please save General step first.",
      };
    }

    const redirectUrl = String(formData.get("redirectUrl") || "").trim();
    const customerTag = String(formData.get("customerTag") || "").trim();

    await db.wholesaleFormPostRegistration.upsert({
      where: { formId },
      update: {
        redirectUrl,
        customerTag,
      },
      create: {
        shop: session.shop,
        formId,
        redirectUrl,
        customerTag,
      },
    });

    return {
      ok: true,
      formId,
      nextStep: "4",
    };
  }

  if (intent === "save_fields") {
    const formId = String(formData.get("formId") || "");
    const form = await requireForm(formId, session.shop);

    if (!form) {
      return {
        ok: false,
        error: "Parent form not found. Please save General step first.",
      };
    }

    const fieldsJson = normalizeFieldsJson(
      String(formData.get("fieldsJson") || "[]"),
    );
    const requirePrivacyPolicy = formData.get("requirePrivacyPolicy") === "on";
    const enablePrivacyPolicyCheckbox =
      formData.get("enablePrivacyPolicyCheckbox") === "on";
    const enableRecaptcha = formData.get("enableRecaptcha") === "on";

    await db.wholesaleFormFieldSetting.upsert({
      where: { formId },
      update: {
        fieldsJson,
        requirePrivacyPolicy,
        enablePrivacyPolicyCheckbox,
        enableRecaptcha,
      },
      create: {
        shop: session.shop,
        formId,
        fieldsJson,
        requirePrivacyPolicy,
        enablePrivacyPolicyCheckbox,
        enableRecaptcha,
      },
    });

    return {
      ok: true,
      formId,
      nextStep: "5",
    };
  }

  if (intent === "save_messages") {
    const formId = String(formData.get("formId") || "");
    const form = await requireForm(formId, session.shop);

    if (!form) {
      return {
        ok: false,
        error: "Parent form not found. Please save General step first.",
      };
    }

    const successColor = String(formData.get("successColor") || "#008000");
    const errorColor = String(formData.get("errorColor") || "#ff0000");
    const successMessage = String(
      formData.get("successMessage") ||
        "Your registration was submitted successfully.",
    ).trim();
    const errorMessage = String(
      formData.get("errorMessage") ||
        "Something went wrong. Please check the form and try again.",
    ).trim();

    await db.wholesaleFormMessageSetting.upsert({
      where: { formId },
      update: {
        successColor,
        errorColor,
        successMessage,
        errorMessage,
      },
      create: {
        shop: session.shop,
        formId,
        successColor,
        errorColor,
        successMessage,
        errorMessage,
      },
    });

    return {
      ok: true,
      done: true,
      formId,
    };
  }

  return { ok: false, error: "Unknown form action" };
};

export default function RegistrationFormsPage() {
  const { billing, forms } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [searchParams, setSearchParams] = useSearchParams();

  const isCreating = searchParams.get("view") === "new";
  const step = searchParams.get("step") || "1";
  const currentFormId = searchParams.get("formId") || "";
  const currentForm = useMemo(
    () => forms.find((form) => form.id === currentFormId),
    [currentFormId, forms],
  );

  const [formTitle, setFormTitle] = useState("");
  const [isPublished, setIsPublished] = useState(true);

  const [approvalType, setApprovalType] = useState<string[]>(["manual"]);
  const [hidePasswordField, setHidePasswordField] = useState(true);
  const [autoApproveDomain, setAutoApproveDomain] = useState(false);
  const [autoApproveEmailRule, setAutoApproveEmailRule] = useState("");

  const [redirectUrl, setRedirectUrl] = useState("");
  const [customerTag, setCustomerTag] = useState("");

  const [fields, setFields] = useState<RegistrationField[]>(defaultFields);
  const [requirePrivacyPolicy, setRequirePrivacyPolicy] = useState(false);
  const [enablePrivacyPolicyCheckbox, setEnablePrivacyPolicyCheckbox] =
    useState(false);
  const [enableRecaptcha, setEnableRecaptcha] = useState(false);
  const [showFieldPicker, setShowFieldPicker] = useState(false);
  const [draggedFieldIndex, setDraggedFieldIndex] = useState<number | null>(
    null,
  );
  const draggedFieldIndexRef = useRef<number | null>(null);
  const [copiedUrl, setCopiedUrl] = useState("");

  const [successColor, setSuccessColor] = useState("#008000");
  const [errorColor, setErrorColor] = useState("#ff0000");
  const [successMessage, setSuccessMessage] = useState(
    "Your registration was submitted successfully.",
  );
  const [errorMessage, setErrorMessage] = useState(
    "Something went wrong. Please check the form and try again.",
  );

  const isGeneralStep = isCreating && step === "1";
  const isApprovalStep = isCreating && step === "2";
  const isPostRegistrationStep = isCreating && step === "3";
  const isFieldsStep = isCreating && step === "4";
  const isMessagesStep = isCreating && step === "5";
  const isSubmitting = navigation.state === "submitting";
  const stepNumber = Number(step);
  const currentStepLabel = stepTitles[stepNumber - 1] || "General";
  const activeForms = forms.filter((form) => form.status === "active").length;
  const draftForms = forms.length - activeForms;
  const canCreateForm = isWithinLimit(forms.length, billing.limits.forms);
  const formLimitLabel = formatLimit(billing.limits.forms);

  useEffect(() => {
    if (!currentForm || !isCreating) {
      return;
    }

    setFormTitle(currentForm.title);
    setIsPublished(currentForm.status === "active");

    setApprovalType([currentForm.approvalSetting?.approvalType || "manual"]);
    setHidePasswordField(
      currentForm.approvalSetting?.hidePasswordField ?? true,
    );
    setAutoApproveDomain(
      currentForm.approvalSetting?.autoApproveDomain ?? false,
    );
    setAutoApproveEmailRule(
      currentForm.approvalSetting?.autoApproveEmailRule || "",
    );

    setRedirectUrl(currentForm.postRegistration?.redirectUrl || "");
    setCustomerTag(currentForm.postRegistration?.customerTag || "");

    setFields(
      dedupeFields(parseFieldsJson(currentForm.fieldSetting?.fieldsJson)),
    );
    setRequirePrivacyPolicy(
      currentForm.fieldSetting?.requirePrivacyPolicy ?? false,
    );
    setEnablePrivacyPolicyCheckbox(
      currentForm.fieldSetting?.enablePrivacyPolicyCheckbox ?? false,
    );
    setEnableRecaptcha(currentForm.fieldSetting?.enableRecaptcha ?? false);

    setSuccessColor(currentForm.messageSetting?.successColor || "#008000");
    setErrorColor(currentForm.messageSetting?.errorColor || "#ff0000");
    setSuccessMessage(
      currentForm.messageSetting?.successMessage ||
        "Your registration was submitted successfully.",
    );
    setErrorMessage(
      currentForm.messageSetting?.errorMessage ||
        "Something went wrong. Please check the form and try again.",
    );
  }, [currentForm, isCreating]);

  useEffect(() => {
    if (actionData?.ok && "nextStep" in actionData && actionData.nextStep) {
      setSearchParams({
        view: "new",
        step: actionData.nextStep,
        formId: actionData.formId,
      });
    }

    if (actionData?.ok && "done" in actionData && actionData.done) {
      setSearchParams({});
    }
  }, [actionData, setSearchParams]);

  function resetFormState() {
    setFormTitle("");
    setIsPublished(true);
    setApprovalType(["manual"]);
    setHidePasswordField(true);
    setAutoApproveDomain(false);
    setAutoApproveEmailRule("");
    setRedirectUrl("");
    setCustomerTag("");
    setFields(dedupeFields(defaultFields));
    setRequirePrivacyPolicy(false);
    setEnablePrivacyPolicyCheckbox(false);
    setEnableRecaptcha(false);
    setSuccessColor("#008000");
    setErrorColor("#ff0000");
    setSuccessMessage("Your registration was submitted successfully.");
    setErrorMessage(
      "Something went wrong. Please check the form and try again.",
    );
  }

  function startCreate() {
    if (!canCreateForm) {
      return;
    }

    resetFormState();
    setSearchParams({ view: "new", step: "1" });
  }

  function addField(field: RegistrationField) {
    setFields((prev) => {
      if (hasField(prev, field)) {
        return prev;
      }

      return [...prev, { ...field }];
    });
    setShowFieldPicker(false);
  }

  function removeField(indexToRemove: number) {
    setFields((prev) => prev.filter((_, index) => index !== indexToRemove));
  }

  function moveField(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) {
      return;
    }

    setFields((prev) => {
      const next = [...prev];
      const [field] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, field);

      return next;
    });
  }

  function handleFieldDragStart(
    event: DragEvent<HTMLButtonElement>,
    index: number,
  ) {
    draggedFieldIndexRef.current = index;
    setDraggedFieldIndex(index);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  }

  function handleFieldDragEnter(
    event: DragEvent<HTMLDivElement>,
    index: number,
  ) {
    event.preventDefault();
    const sourceIndex = draggedFieldIndexRef.current;

    if (sourceIndex === null || sourceIndex === index) {
      return;
    }

    moveField(sourceIndex, index);
    draggedFieldIndexRef.current = index;
    setDraggedFieldIndex(index);
  }

  function clearFieldDrag() {
    draggedFieldIndexRef.current = null;
    setDraggedFieldIndex(null);
  }

  function handleFieldDrop(event: DragEvent<HTMLDivElement>, index: number) {
    event.preventDefault();
    const sourceIndex =
      draggedFieldIndexRef.current ??
      Number(event.dataTransfer.getData("text/plain"));

    if (Number.isNaN(sourceIndex) || sourceIndex === index) {
      clearFieldDrag();
      return;
    }

    moveField(sourceIndex, index);
    clearFieldDrag();
  }

  async function copyUrlToClipboard(url: string) {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(url);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = url;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    setCopiedUrl(url);
    window.setTimeout(() => setCopiedUrl(""), 1600);
  }

  if (isCreating) {
    return (
      <Page
        title={currentFormId ? "Edit wholesale form" : "Create wholesale form"}
        backAction={{
          content: "Registration forms",
          onAction: () => setSearchParams({}),
        }}
      >
        <BlockStack gap="500">
          <BuilderHeader
            currentStep={stepNumber}
            currentStepLabel={currentStepLabel}
            formTitle={formTitle || "Untitled wholesale flow"}
            isPublished={isPublished}
          />

          <ProgressRail currentStep={stepNumber} />

          {actionData?.ok === false && actionData.error ? (
            <Banner tone="critical">{actionData.error}</Banner>
          ) : null}

          {isGeneralStep && (
            <Form method="post">
              <input type="hidden" name="intent" value="save_general" />
              <input type="hidden" name="formId" value={currentFormId} />
              <input type="hidden" name="title" value={formTitle} />

              {isPublished ? (
                <input type="hidden" name="published" value="on" />
              ) : null}

              <Layout>
                <Layout.Section>
                  <Card>
                    <BlockStack gap="500">
                      <HeroTitle
                        title="Form setup"
                        subtitle="Name the application, review the storefront URL, and control publishing."
                      />

                      <Banner tone={billing.currentPlan ? "info" : "warning"}>
                        {billing.currentPlan
                          ? `${billing.currentPlan} includes ${formLimitLabel} forms.`
                          : "Choose a billing plan to publish registration forms on the storefront."}
                      </Banner>

                      <Divider />

                      <BlockStack gap="400">
                        <Text as="h3" variant="headingMd">
                          Form identity
                        </Text>

                        <TextField
                          label="Form name"
                          value={formTitle}
                          onChange={setFormTitle}
                          autoComplete="off"
                          placeholder="Wholesale registration form"
                          helpText="Used in B2Bridge admin and as the default storefront heading."
                        />

                        <TextField
                          label="Storefront URL"
                          value={
                            currentForm?.storefrontUrl ||
                            "Generated after saving this form"
                          }
                          autoComplete="off"
                          readOnly
                          helpText="Use the theme app block for full theme header and footer support."
                        />

                        <Box
                          padding="400"
                          background="bg-surface-success"
                          borderRadius="300"
                        >
                          <InlineStack
                            align="space-between"
                            blockAlign="center"
                          >
                            <InlineStack gap="300" blockAlign="center">
                              <Checkbox
                                label="Publish form"
                                checked={isPublished}
                                onChange={setIsPublished}
                              />

                              <Text as="span" tone="subdued">
                                Available for storefront applicants
                              </Text>
                            </InlineStack>

                            <Badge tone={isPublished ? "success" : "attention"}>
                              {isPublished ? "Active" : "Draft"}
                            </Badge>
                          </InlineStack>
                        </Box>
                      </BlockStack>
                    </BlockStack>
                  </Card>
                </Layout.Section>

                <Layout.Section variant="oneThird">
                  <PreviewCard fields={fields.slice(0, 4)} />
                </Layout.Section>
              </Layout>

              <FooterActions
                stepText="STEP 1 / 5"
                stepLabel="General"
                onDiscard={() => setSearchParams({})}
                backDisabled
                continueText="Save & Continue"
                loading={isSubmitting}
                submit
              />
            </Form>
          )}

          {isApprovalStep && (
            <Form method="post">
              <input type="hidden" name="intent" value="save_approval" />
              <input type="hidden" name="formId" value={currentFormId} />
              <input
                type="hidden"
                name="approvalType"
                value={approvalType[0]}
              />

              {hidePasswordField ? (
                <input type="hidden" name="hidePasswordField" value="on" />
              ) : null}

              {autoApproveDomain ? (
                <input type="hidden" name="autoApproveDomain" value="on" />
              ) : null}

              <input
                type="hidden"
                name="autoApproveEmailRule"
                value={autoApproveEmailRule}
              />

              <Card>
                <BlockStack gap="500">
                  <HeroTitle
                    title="Approval"
                    subtitle="Choose how new B2B accounts are reviewed and approved."
                  />

                  <BlockStack gap="400">
                    <InlineStack align="space-between">
                      <Text as="h3" variant="headingMd">
                        Approval type
                      </Text>
                      <Badge tone="info">Step 2</Badge>
                    </InlineStack>

                    <ChoiceList
                      title="Select how your customers are approved"
                      choices={[
                        {
                          label: "Manual approved by you",
                          value: "manual",
                        },
                        {
                          label: "Auto approved upon registration",
                          value: "auto",
                        },
                      ]}
                      selected={approvalType}
                      onChange={setApprovalType}
                    />

                    {approvalType[0] === "manual" && (
                      <Box paddingInlineStart="400">
                        <BlockStack gap="300">
                          <Checkbox
                            label="Hide password field on the form"
                            checked={hidePasswordField}
                            onChange={setHidePasswordField}
                          />

                          <Text as="p" tone="subdued">
                            After being approved, your customers can create
                            password.
                          </Text>

                          <Checkbox
                            label="Auto approve a customer if their email contains"
                            checked={autoApproveDomain}
                            onChange={setAutoApproveDomain}
                          />

                          {autoApproveDomain && (
                            <TextField
                              label="Email contains"
                              placeholder="example.com"
                              value={autoApproveEmailRule}
                              onChange={setAutoApproveEmailRule}
                              autoComplete="off"
                            />
                          )}
                        </BlockStack>
                      </Box>
                    )}
                  </BlockStack>
                </BlockStack>
              </Card>

              <FooterActions
                stepText="STEP 2 / 5"
                stepLabel="Approval"
                onDiscard={() => setSearchParams({})}
                onBack={() =>
                  setSearchParams({
                    view: "new",
                    step: "1",
                    formId: currentFormId,
                  })
                }
                continueText="Save & Continue"
                loading={isSubmitting}
                submit
              />
            </Form>
          )}

          {isPostRegistrationStep && (
            <Form method="post">
              <input
                type="hidden"
                name="intent"
                value="save_post_registration"
              />
              <input type="hidden" name="formId" value={currentFormId} />
              <input type="hidden" name="redirectUrl" value={redirectUrl} />
              <input type="hidden" name="customerTag" value={customerTag} />

              <Card>
                <BlockStack gap="500">
                  <HeroTitle
                    title="Post-registration"
                    subtitle="Define what happens after a customer successfully submits the form."
                  />

                  <BlockStack gap="400">
                    <InlineStack align="space-between">
                      <Text as="h3" variant="headingMd">
                        Post-registration settings
                      </Text>
                      <Badge tone="info">Step 3</Badge>
                    </InlineStack>

                    <TextField
                      label="After registration, redirect customer to page"
                      value={redirectUrl}
                      onChange={setRedirectUrl}
                      placeholder="https://your-store.myshopify.com/pages/thank-you"
                      autoComplete="off"
                    />

                    <TextField
                      label="Add tag to customers successfully registered via this form"
                      value={customerTag}
                      onChange={setCustomerTag}
                      placeholder="wholesale-applicant"
                      autoComplete="off"
                    />
                  </BlockStack>
                </BlockStack>
              </Card>

              <FooterActions
                stepText="STEP 3 / 5"
                stepLabel="Post-registration"
                onDiscard={() => setSearchParams({})}
                onBack={() =>
                  setSearchParams({
                    view: "new",
                    step: "2",
                    formId: currentFormId,
                  })
                }
                continueText="Save & Continue"
                loading={isSubmitting}
                submit
              />
            </Form>
          )}

          {isFieldsStep && (
            <Form method="post">
              <input type="hidden" name="intent" value="save_fields" />
              <input type="hidden" name="formId" value={currentFormId} />
              <input
                type="hidden"
                name="fieldsJson"
                value={JSON.stringify(fields)}
              />

              {requirePrivacyPolicy ? (
                <input type="hidden" name="requirePrivacyPolicy" value="on" />
              ) : null}

              {enablePrivacyPolicyCheckbox ? (
                <input
                  type="hidden"
                  name="enablePrivacyPolicyCheckbox"
                  value="on"
                />
              ) : null}

              {enableRecaptcha ? (
                <input type="hidden" name="enableRecaptcha" value="on" />
              ) : null}

              <Layout>
                <Layout.Section>
                  <Card>
                    <BlockStack gap="500">
                      <HeroTitle
                        title="Fields & protection"
                        subtitle="Configure form fields, privacy policy, and spam protection."
                      />

                      <BlockStack gap="300">
                        <InlineStack align="space-between">
                          <Text as="h3" variant="headingMd">
                            Form fields
                          </Text>
                          <Badge tone="info">{`${fields.length} fields`}</Badge>
                        </InlineStack>

                        <BlockStack gap="200">
                          {fields.map((field, index) => (
                            <div
                              key={`${field.label}-${field.type}-${index}`}
                              onDragEnter={(event) =>
                                handleFieldDragEnter(event, index)
                              }
                              onDragOver={(event) => {
                                event.preventDefault();
                                event.dataTransfer.dropEffect = "move";
                              }}
                              onDrop={(event) => handleFieldDrop(event, index)}
                              style={{
                                background:
                                  draggedFieldIndex === index
                                    ? "#f1f8ff"
                                    : "#ffffff",
                                border: "1px solid #dfe3e8",
                                borderRadius: "8px",
                                boxShadow:
                                  draggedFieldIndex === index
                                    ? "0 6px 16px rgba(0,0,0,.08)"
                                    : "none",
                                opacity: draggedFieldIndex === index ? 0.92 : 1,
                                padding: "10px 12px",
                                transition:
                                  "background .12s ease, box-shadow .12s ease, opacity .12s ease",
                              }}
                            >
                              <InlineStack
                                align="space-between"
                                blockAlign="center"
                              >
                                <InlineStack gap="200" blockAlign="center">
                                  <button
                                    type="button"
                                    draggable
                                    aria-label={`Move ${field.label}`}
                                    onDragStart={(event) =>
                                      handleFieldDragStart(event, index)
                                    }
                                    onDragEnd={clearFieldDrag}
                                    style={{
                                      background: "#f6f6f7",
                                      border: "1px solid #e1e3e5",
                                      borderRadius: "6px",
                                      color: "#6d7175",
                                      cursor: "grab",
                                      font: "inherit",
                                      lineHeight: 1,
                                      padding: "3px 7px",
                                    }}
                                  >
                                    ::
                                  </button>
                                  <Text as="span">{field.label}</Text>
                                </InlineStack>

                                <InlineStack gap="200" blockAlign="center">
                                  <Badge>{field.type}</Badge>
                                  <Button
                                    onClick={() => removeField(index)}
                                    disabled={fields.length <= 1}
                                  >
                                    Remove
                                  </Button>
                                </InlineStack>
                              </InlineStack>
                            </div>
                          ))}
                        </BlockStack>

                        <Button
                          fullWidth
                          onClick={() => setShowFieldPicker(!showFieldPicker)}
                        >
                          Add field
                        </Button>

                        {showFieldPicker && (
                          <Card>
                            <BlockStack gap="200">
                              <Text as="h3" variant="headingSm">
                                Select a field to add
                              </Text>

                              {availableFields.map((field) => {
                                const alreadyAdded = hasField(fields, field);

                                return (
                                  <Button
                                    key={field.label}
                                    fullWidth
                                    disabled={alreadyAdded}
                                    onClick={() => addField(field)}
                                  >
                                    {alreadyAdded
                                      ? `${field.label} already added`
                                      : field.label}
                                  </Button>
                                );
                              })}
                            </BlockStack>
                          </Card>
                        )}
                      </BlockStack>

                      <Divider />

                      <BlockStack gap="300">
                        <Text as="h3" variant="headingMd">
                          Privacy policy mandatory
                        </Text>

                        <Checkbox
                          label="Require customers to accept privacy policy before submitting registration form"
                          checked={requirePrivacyPolicy}
                          onChange={setRequirePrivacyPolicy}
                        />
                        <Checkbox
                          label="Enable privacy mandatory checkbox"
                          checked={enablePrivacyPolicyCheckbox}
                          onChange={setEnablePrivacyPolicyCheckbox}
                        />
                      </BlockStack>

                      <Divider />

                      <BlockStack gap="300">
                        <Text as="h3" variant="headingMd">
                          Spam protection
                        </Text>

                        <Banner tone="warning">
                          Storefront spam protection adds a hidden verification
                          field and rejects automated submissions.
                        </Banner>

                        <Checkbox
                          label="Enable storefront spam protection"
                          checked={enableRecaptcha}
                          onChange={setEnableRecaptcha}
                        />
                      </BlockStack>
                    </BlockStack>
                  </Card>
                </Layout.Section>

                <Layout.Section variant="oneThird">
                  <PreviewCard fields={fields} />
                </Layout.Section>
              </Layout>

              <FooterActions
                stepText="STEP 4 / 5"
                stepLabel="Fields & protection"
                onDiscard={() => setSearchParams({})}
                onBack={() =>
                  setSearchParams({
                    view: "new",
                    step: "3",
                    formId: currentFormId,
                  })
                }
                continueText="Save & Continue"
                loading={isSubmitting}
                submit
              />
            </Form>
          )}

          {isMessagesStep && (
            <Form method="post">
              <input type="hidden" name="intent" value="save_messages" />
              <input type="hidden" name="formId" value={currentFormId} />
              <input type="hidden" name="successColor" value={successColor} />
              <input type="hidden" name="errorColor" value={errorColor} />
              <input
                type="hidden"
                name="successMessage"
                value={successMessage}
              />
              <input type="hidden" name="errorMessage" value={errorMessage} />

              <Layout>
                <Layout.Section>
                  <Card>
                    <BlockStack gap="500">
                      <HeroTitle
                        title="Messages"
                        subtitle="Customize colors and copy for success and error states."
                      />

                      <BlockStack gap="400">
                        <InlineStack align="space-between">
                          <Text as="h3" variant="headingMd">
                            Message colors
                          </Text>
                          <Badge tone="info">Branding</Badge>
                        </InlineStack>

                        <InlineStack gap="300">
                          <ColorPicker
                            label="Success message color"
                            value={successColor}
                            onChange={setSuccessColor}
                          />
                          <ColorPicker
                            label="Error message color"
                            value={errorColor}
                            onChange={setErrorColor}
                          />
                        </InlineStack>
                      </BlockStack>

                      <Divider />

                      <TextField
                        label="Success message"
                        value={successMessage}
                        onChange={setSuccessMessage}
                        multiline={3}
                        autoComplete="off"
                      />

                      <TextField
                        label="Error message"
                        value={errorMessage}
                        onChange={setErrorMessage}
                        multiline={3}
                        autoComplete="off"
                      />
                    </BlockStack>
                  </Card>
                </Layout.Section>

                <Layout.Section variant="oneThird">
                  <PreviewCard fields={fields.slice(0, 4)} />
                </Layout.Section>
              </Layout>

              <FooterActions
                stepText="STEP 5 / 5"
                stepLabel="Messages"
                onDiscard={() => setSearchParams({})}
                onBack={() =>
                  setSearchParams({
                    view: "new",
                    step: "4",
                    formId: currentFormId,
                  })
                }
                continueText="Save"
                loading={isSubmitting}
                submit
              />
            </Form>
          )}
        </BlockStack>
      </Page>
    );
  }

  return (
    <Page title="Registration forms">
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
              <BlockStack gap="300">
                <InlineStack gap="200" blockAlign="center">
                  <Badge tone="info">B2Bridge</Badge>
                  <Badge tone="success">Storefront proxy ready</Badge>
                  <Badge tone={billing.currentPlan ? "success" : "attention"}>
                    {billing.currentPlan || "No plan"}
                  </Badge>
                </InlineStack>

                <BlockStack gap="100">
                  <Text as="h2" variant="heading2xl">
                    Wholesale form manager
                  </Text>
                  <Text as="p" tone="subdued">
                    Create branded application flows and publish them through
                    the theme for a native storefront experience.
                  </Text>
                </BlockStack>
              </BlockStack>

              <Button
                variant="primary"
                onClick={canCreateForm ? startCreate : undefined}
                url={!canCreateForm ? "/app/billing" : undefined}
              >
                {canCreateForm ? "New form" : "Upgrade plan"}
              </Button>
            </InlineGrid>
          </Box>

          <Box padding="400">
            <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="300">
              <MetricTile label="Forms created" value={String(forms.length)} />
              <MetricTile label="Plan limit" value={formLimitLabel} />
              <MetricTile label="Live forms" value={String(activeForms)} />
              <MetricTile label="Draft" value={String(draftForms)} />
            </InlineGrid>
          </Box>
        </Card>

        {!canCreateForm ? (
          <Banner
            tone="warning"
            action={{ content: "Upgrade plan", url: "/app/billing" }}
          >
            Your current plan allows {formLimitLabel} forms. Upgrade to create
            more registration forms.
          </Banner>
        ) : null}

        <Card>
          {actionData?.ok === false && actionData.error ? (
            <Box paddingBlockEnd="400">
              <Banner tone="critical">{actionData.error}</Banner>
            </Box>
          ) : null}

          {actionData?.ok && "deleted" in actionData && actionData.deleted ? (
            <Box paddingBlockEnd="400">
              <Banner tone="success">Wholesale form deleted.</Banner>
            </Box>
          ) : null}

          {forms.length === 0 ? (
            <EmptyState
              heading="No wholesale forms yet"
              action={{
                content: canCreateForm ? "Create first form" : "Choose plan",
                ...(canCreateForm
                  ? { onAction: startCreate }
                  : { url: "/app/billing" }),
              }}
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>Build a branded application flow for wholesale buyers.</p>
            </EmptyState>
          ) : (
            <BlockStack gap="300">
              {forms.map((form) => {
                const fieldCount = parseFieldsJson(
                  form.fieldSetting?.fieldsJson,
                ).length;
                const createdDate = new Date(
                  form.createdAt,
                ).toLocaleDateString();
                return (
                  <Box
                    key={form.id}
                    padding="500"
                    borderWidth="025"
                    borderColor="border"
                    borderRadius="300"
                    background="bg-surface"
                  >
                    <BlockStack gap="400">
                      <InlineGrid
                        columns={{ xs: 1, md: "minmax(0, 1fr) auto" }}
                        gap="400"
                        alignItems="start"
                      >
                        <InlineStack gap="400" blockAlign="start" wrap={false}>
                          <Box
                            padding="300"
                            borderRadius="300"
                            background={
                              form.status === "active"
                                ? "bg-surface-success"
                                : "bg-surface-warning"
                            }
                            borderWidth="025"
                            borderColor="border"
                            minWidth="48px"
                          >
                            <Text as="p" variant="headingLg" alignment="center">
                              {form.title.slice(0, 1).toUpperCase()}
                            </Text>
                          </Box>

                          <BlockStack gap="200">
                            <InlineStack gap="200" blockAlign="center">
                              <Text as="h3" variant="headingLg">
                                {form.title}
                              </Text>
                              <Badge
                                tone={
                                  form.status === "active"
                                    ? "success"
                                    : "attention"
                                }
                              >
                                {form.status === "active" ? "Active" : "Draft"}
                              </Badge>
                            </InlineStack>

                            <InlineStack gap="200">
                              <Badge tone="info">{`${fieldCount} fields`}</Badge>
                              <Badge>{`Created ${createdDate}`}</Badge>
                              <Badge>Theme app block</Badge>
                            </InlineStack>
                          </BlockStack>
                        </InlineStack>

                        <InlineStack gap="200" align="end">
                          <Button
                            onClick={() =>
                              window.open(
                                form.storefrontUrl,
                                "_blank",
                                "noopener,noreferrer",
                              )
                            }
                          >
                            Preview
                          </Button>
                          <Button
                            variant="primary"
                            onClick={() =>
                              setSearchParams({
                                view: "new",
                                step: "1",
                                formId: form.id,
                              })
                            }
                          >
                            Edit
                          </Button>
                          <Form
                            method="post"
                            onSubmit={(event) => {
                              if (
                                !window.confirm(
                                  `Delete "${form.title}" permanently?`,
                                )
                              ) {
                                event.preventDefault();
                              }
                            }}
                          >
                            <input
                              type="hidden"
                              name="intent"
                              value="delete_form"
                            />
                            <input
                              type="hidden"
                              name="formId"
                              value={form.id}
                            />
                            <Button
                              submit
                              tone="critical"
                              loading={isSubmitting}
                            >
                              Delete
                            </Button>
                          </Form>
                        </InlineStack>
                      </InlineGrid>

                      <Box
                        padding="300"
                        borderRadius="300"
                        borderWidth="025"
                        borderColor="border"
                        background="bg-surface-secondary"
                      >
                        <BlockStack gap="100">
                          <InlineStack
                            align="space-between"
                            blockAlign="center"
                          >
                            <BlockStack gap="050">
                              <Text
                                as="p"
                                variant="bodySm"
                                fontWeight="semibold"
                              >
                                Theme page setup
                              </Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                In the Shopify theme editor, open your
                                registration page template, add the B2Bridge
                                form app block, then paste this Form ID.
                              </Text>
                            </BlockStack>
                            {copiedUrl === form.id ? (
                              <Badge tone="success">Copied</Badge>
                            ) : null}
                          </InlineStack>
                          <InlineGrid
                            columns={{ xs: "minmax(0, 1fr) auto" }}
                            gap="200"
                            alignItems="center"
                          >
                            <Text as="p" variant="bodyMd">
                              {form.id}
                            </Text>
                            <CopyUrlButton
                              label={`Copy form ID for ${form.title}`}
                              onClick={() => copyUrlToClipboard(form.id)}
                            />
                          </InlineGrid>
                          <InlineGrid
                            columns={{ xs: "minmax(0, 1fr) auto" }}
                            gap="200"
                            alignItems="center"
                          >
                            <Text as="p" variant="bodySm" tone="subdued">
                              Direct preview: {form.storefrontUrl}
                            </Text>
                            <CopyUrlButton
                              label={`Copy direct preview URL for ${form.title}`}
                              onClick={() =>
                                copyUrlToClipboard(form.storefrontUrl)
                              }
                            />
                          </InlineGrid>
                        </BlockStack>
                      </Box>
                    </BlockStack>
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

function HeroTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <Box paddingBlockEnd="400" borderBlockEndWidth="025" borderColor="border">
      <BlockStack gap="100">
        <Text as="h2" variant="headingLg">
          {title}
        </Text>
        <Text as="p" tone="subdued">
          {subtitle}
        </Text>
      </BlockStack>
    </Box>
  );
}

function BuilderHeader({
  currentStep,
  currentStepLabel,
  formTitle,
  isPublished,
}: {
  currentStep: number;
  currentStepLabel: string;
  formTitle: string;
  isPublished: boolean;
}) {
  return (
    <Card padding="0">
      <Box
        padding="600"
        background="bg-surface"
        borderBlockEndWidth="025"
        borderColor="border"
      >
        <InlineGrid
          columns={{ xs: 1, md: "minmax(0, 1fr) auto" }}
          gap="500"
          alignItems="center"
        >
          <BlockStack gap="300">
            <InlineStack gap="200" blockAlign="center">
              <Badge tone="info">Form builder</Badge>
              <Badge tone={isPublished ? "success" : "attention"}>
                {isPublished ? "Active" : "Draft"}
              </Badge>
            </InlineStack>

            <BlockStack gap="100">
              <Text as="h1" variant="headingXl">
                {formTitle}
              </Text>
              <Text as="p" tone="subdued">
                Configure the application customers complete inside your theme.
              </Text>
            </BlockStack>
          </BlockStack>

          <Box
            width="96px"
            padding="400"
            borderRadius="200"
            borderWidth="025"
            borderColor="border"
            background="bg-surface-secondary"
          >
            <BlockStack gap="050" inlineAlign="center">
              <Text as="p" variant="headingLg">
                {currentStep}/5
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {currentStepLabel}
              </Text>
            </BlockStack>
          </Box>
        </InlineGrid>
      </Box>
    </Card>
  );
}

function ProgressRail({ currentStep }: { currentStep: number }) {
  return (
    <Card padding="0">
      <InlineGrid columns={{ xs: 1, sm: 5 }} gap="0">
        {stepTitles.map((label, index) => {
          const number = index + 1;
          const isActive = number === currentStep;
          const isDone = number < currentStep;

          return (
            <Box
              key={label}
              padding="300"
              borderInlineEndWidth={
                number === stepTitles.length ? undefined : "025"
              }
              borderColor="border"
              background={isActive ? "bg-surface-secondary" : "bg-surface"}
            >
              <BlockStack gap="200">
                <InlineStack align="space-between" blockAlign="center">
                  <Badge
                    tone={isDone ? "success" : isActive ? "info" : undefined}
                  >
                    {isDone ? "Done" : String(number)}
                  </Badge>
                  <Text
                    as="span"
                    variant="bodySm"
                    tone={isActive ? undefined : "subdued"}
                  >
                    Step
                  </Text>
                </InlineStack>

                <Text
                  as="p"
                  variant="bodySm"
                  fontWeight={isActive ? "semibold" : "regular"}
                  tone={isActive ? undefined : "subdued"}
                >
                  {label}
                </Text>
                <Box
                  minHeight="3px"
                  borderRadius="200"
                  background={
                    isActive ? "bg-fill-emphasis" : "bg-surface-secondary"
                  }
                />
              </BlockStack>
            </Box>
          );
        })}
      </InlineGrid>
    </Card>
  );
}

function MetricTile({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <Box
      padding={compact ? "300" : "400"}
      borderRadius="300"
      borderWidth="025"
      borderColor="border"
      background={compact ? "bg-surface-secondary" : "bg-surface"}
    >
      <BlockStack gap="100">
        <Text as="p" variant={compact ? "headingMd" : "headingLg"}>
          {value}
        </Text>
        <Text as="p" tone="subdued">
          {label}
        </Text>
      </BlockStack>
    </Box>
  );
}

function CopyUrlButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title="Copy URL"
      onClick={onClick}
      style={{
        alignItems: "center",
        background: "#ffffff",
        border: "1px solid #c9cccf",
        borderRadius: "8px",
        cursor: "pointer",
        display: "inline-flex",
        height: "32px",
        justifyContent: "center",
        padding: 0,
        position: "relative",
        width: "32px",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          border: "1.5px solid #202223",
          borderRadius: "3px",
          height: "13px",
          left: "9px",
          position: "absolute",
          top: "10px",
          width: "13px",
        }}
      />
      <span
        aria-hidden="true"
        style={{
          background: "#ffffff",
          border: "1.5px solid #202223",
          borderRadius: "3px",
          height: "13px",
          left: "13px",
          position: "absolute",
          top: "6px",
          width: "13px",
        }}
      />
    </button>
  );
}

function FooterActions({
  stepText,
  stepLabel,
  onDiscard,
  onBack,
  continueText,
  backDisabled = false,
  loading = false,
  submit = false,
}: {
  stepText: string;
  stepLabel: string;
  onDiscard: () => void;
  onBack?: () => void;
  continueText: string;
  backDisabled?: boolean;
  loading?: boolean;
  submit?: boolean;
}) {
  return (
    <Card padding="0">
      <Box padding="300" background="bg-surface">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="300" blockAlign="center">
            <BlockStack gap="050">
              <Text as="p" fontWeight="semibold">
                {stepLabel}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {stepText}
              </Text>
            </BlockStack>
          </InlineStack>

          <InlineStack gap="200">
            <Button onClick={onDiscard}>Discard</Button>
            <Button disabled={backDisabled} onClick={onBack}>
              Back
            </Button>

            <Button variant="primary" submit={submit} loading={loading}>
              {continueText}
            </Button>
          </InlineStack>
        </InlineStack>
      </Box>
    </Card>
  );
}

function PreviewCard({ fields }: { fields: RegistrationField[] }) {
  return (
    <Card padding="0">
      <Box padding="300" borderBlockEndWidth="025" borderColor="border">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h2" variant="headingMd">
            Storefront preview
          </Text>
          <Badge>Theme block</Badge>
        </InlineStack>
      </Box>
      <Box padding="400">
        <BlockStack gap="300">
          <Box
            padding="400"
            background="bg-surface"
            borderRadius="200"
            borderWidth="025"
            borderColor="border"
          >
            <BlockStack gap="300">
              <BlockStack gap="050">
                <Text as="h3" variant="headingMd">
                  Wholesale registration
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Applicants complete this form on a page using your theme.
                </Text>
              </BlockStack>

              {fields.slice(0, 8).map((field, index) => (
                <TextField
                  key={`${field.label}-preview-${index}`}
                  label={field.label}
                  autoComplete="off"
                  disabled
                />
              ))}

              {fields.length > 8 ? (
                <Badge>{`${fields.length - 8} more fields`}</Badge>
              ) : null}

              <Button variant="primary" fullWidth>
                Submit application
              </Button>
            </BlockStack>
          </Box>

          <Text as="p" variant="bodySm" tone="subdued">
            Preview updates as form fields change.
          </Text>
        </BlockStack>
      </Box>
    </Card>
  );
}

function ColorPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <BlockStack gap="100">
      <Text as="span">{label}</Text>

      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        style={{
          width: "100%",
          height: "40px",
          border: "1px solid #dcdcdc",
          borderRadius: "8px",
          padding: "4px",
        }}
      />
    </BlockStack>
  );
}
