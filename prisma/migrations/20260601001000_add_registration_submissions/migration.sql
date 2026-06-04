CREATE TABLE IF NOT EXISTS "WholesaleFormSubmission" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shop" TEXT NOT NULL,
  "formId" TEXT NOT NULL,
  "email" TEXT,
  "firstName" TEXT,
  "lastName" TEXT,
  "phone" TEXT,
  "company" TEXT,
  "fieldsJson" TEXT NOT NULL DEFAULT '{}',
  "customerId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'submitted',
  "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WholesaleFormSubmission_formId_fkey" FOREIGN KEY ("formId") REFERENCES "WholesaleForm" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "WholesaleFormSubmission_shop_idx" ON "WholesaleFormSubmission"("shop");
CREATE INDEX IF NOT EXISTS "WholesaleFormSubmission_formId_idx" ON "WholesaleFormSubmission"("formId");
CREATE INDEX IF NOT EXISTS "WholesaleFormSubmission_email_idx" ON "WholesaleFormSubmission"("email");
