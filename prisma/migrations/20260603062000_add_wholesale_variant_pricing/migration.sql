-- AlterTable
ALTER TABLE "WholesaleProductPricingRule" ADD COLUMN "variantGid" TEXT;
ALTER TABLE "WholesaleProductPricingRule" ADD COLUMN "variantSku" TEXT;
ALTER TABLE "WholesaleProductPricingRule" ADD COLUMN "variantTitle" TEXT;

-- CreateIndex
CREATE INDEX "WholesaleProductPricingRule_variantGid_idx" ON "WholesaleProductPricingRule"("variantGid");
