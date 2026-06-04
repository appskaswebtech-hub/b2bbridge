-- Baseline the registration form tables and add settings for all five wizard steps.
CREATE TABLE IF NOT EXISTS "WholesaleForm" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shop" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "formUrlType" TEXT NOT NULL DEFAULT 'portal',
  "previewUrl" TEXT NOT NULL DEFAULT '/apps/b2bridge/registration-form',
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS "WholesaleForm_shop_idx" ON "WholesaleForm"("shop");

CREATE TABLE IF NOT EXISTS "WholesaleFormApprovalSetting" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shop" TEXT NOT NULL,
  "formId" TEXT NOT NULL,
  "approvalType" TEXT NOT NULL DEFAULT 'manual',
  "hidePasswordField" BOOLEAN NOT NULL DEFAULT true,
  "autoApproveDomain" BOOLEAN NOT NULL DEFAULT false,
  "autoApproveEmailRule" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "WholesaleFormApprovalSetting_formId_fkey" FOREIGN KEY ("formId") REFERENCES "WholesaleForm" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "WholesaleFormApprovalSetting_formId_key" ON "WholesaleFormApprovalSetting"("formId");
CREATE INDEX IF NOT EXISTS "WholesaleFormApprovalSetting_shop_idx" ON "WholesaleFormApprovalSetting"("shop");

CREATE TABLE IF NOT EXISTS "WholesaleFormPostRegistration" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shop" TEXT NOT NULL,
  "formId" TEXT NOT NULL,
  "redirectUrl" TEXT,
  "customerTag" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "WholesaleFormPostRegistration_formId_fkey" FOREIGN KEY ("formId") REFERENCES "WholesaleForm" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "WholesaleFormPostRegistration_formId_key" ON "WholesaleFormPostRegistration"("formId");
CREATE INDEX IF NOT EXISTS "WholesaleFormPostRegistration_shop_idx" ON "WholesaleFormPostRegistration"("shop");

CREATE TABLE IF NOT EXISTS "WholesaleFormFieldSetting" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shop" TEXT NOT NULL,
  "formId" TEXT NOT NULL,
  "fieldsJson" TEXT NOT NULL DEFAULT '[]',
  "requirePrivacyPolicy" BOOLEAN NOT NULL DEFAULT false,
  "enablePrivacyPolicyCheckbox" BOOLEAN NOT NULL DEFAULT false,
  "enableRecaptcha" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "WholesaleFormFieldSetting_formId_fkey" FOREIGN KEY ("formId") REFERENCES "WholesaleForm" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "WholesaleFormFieldSetting_formId_key" ON "WholesaleFormFieldSetting"("formId");
CREATE INDEX IF NOT EXISTS "WholesaleFormFieldSetting_shop_idx" ON "WholesaleFormFieldSetting"("shop");

CREATE TABLE IF NOT EXISTS "WholesaleFormMessageSetting" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shop" TEXT NOT NULL,
  "formId" TEXT NOT NULL,
  "successColor" TEXT NOT NULL DEFAULT '#008000',
  "errorColor" TEXT NOT NULL DEFAULT '#ff0000',
  "successMessage" TEXT NOT NULL DEFAULT 'Your registration was submitted successfully.',
  "errorMessage" TEXT NOT NULL DEFAULT 'Something went wrong. Please check the form and try again.',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "WholesaleFormMessageSetting_formId_fkey" FOREIGN KEY ("formId") REFERENCES "WholesaleForm" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "WholesaleFormMessageSetting_formId_key" ON "WholesaleFormMessageSetting"("formId");
CREATE INDEX IF NOT EXISTS "WholesaleFormMessageSetting_shop_idx" ON "WholesaleFormMessageSetting"("shop");
