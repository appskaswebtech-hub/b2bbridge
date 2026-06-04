-- CreateTable
CREATE TABLE "WholesalePricingSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "customerTag" TEXT NOT NULL DEFAULT 'b2bridge-auto-approved',
    "globalDiscountPercent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WholesaleProductPricingRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "settingId" TEXT NOT NULL,
    "productGid" TEXT,
    "productHandle" TEXT,
    "productTitle" TEXT NOT NULL,
    "discountPercent" TEXT,
    "fixedPrice" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WholesaleProductPricingRule_settingId_fkey" FOREIGN KEY ("settingId") REFERENCES "WholesalePricingSetting" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "WholesalePricingSetting_shop_key" ON "WholesalePricingSetting"("shop");

-- CreateIndex
CREATE INDEX "WholesalePricingSetting_shop_idx" ON "WholesalePricingSetting"("shop");

-- CreateIndex
CREATE INDEX "WholesaleProductPricingRule_shop_idx" ON "WholesaleProductPricingRule"("shop");

-- CreateIndex
CREATE INDEX "WholesaleProductPricingRule_settingId_idx" ON "WholesaleProductPricingRule"("settingId");

-- CreateIndex
CREATE INDEX "WholesaleProductPricingRule_productGid_idx" ON "WholesaleProductPricingRule"("productGid");

-- CreateIndex
CREATE INDEX "WholesaleProductPricingRule_productHandle_idx" ON "WholesaleProductPricingRule"("productHandle");
