-- AlterTable
ALTER TABLE "WholesalePricingSetting" ADD COLUMN "globalDiscountAmount" TEXT;

-- AlterTable
ALTER TABLE "WholesaleProductPricingRule" ADD COLUMN "discountAmount" TEXT;
