ALTER TABLE "WholesalePricingSetting" ADD COLUMN "productPriceStyle" TEXT NOT NULL DEFAULT 'simple';
ALTER TABLE "WholesalePricingSetting" ADD COLUMN "productPricePlacement" TEXT NOT NULL DEFAULT 'replace_price';
ALTER TABLE "WholesalePricingSetting" ADD COLUMN "productShowLabel" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "WholesalePricingSetting" ADD COLUMN "productShowCompare" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "WholesalePricingSetting" ADD COLUMN "productShowDiscount" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "WholesalePricingSetting" ADD COLUMN "productFontSize" TEXT NOT NULL DEFAULT '18';
ALTER TABLE "WholesalePricingSetting" ADD COLUMN "productAccentColor" TEXT NOT NULL DEFAULT '#111827';
ALTER TABLE "WholesalePricingSetting" ADD COLUMN "productPriceSelector" TEXT;

ALTER TABLE "WholesalePricingSetting" ADD COLUMN "collectionPriceStyle" TEXT NOT NULL DEFAULT 'compact';
ALTER TABLE "WholesalePricingSetting" ADD COLUMN "collectionPricePlacement" TEXT NOT NULL DEFAULT 'replace_price';
ALTER TABLE "WholesalePricingSetting" ADD COLUMN "collectionShowLabel" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WholesalePricingSetting" ADD COLUMN "collectionShowCompare" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "WholesalePricingSetting" ADD COLUMN "collectionShowDiscount" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "WholesalePricingSetting" ADD COLUMN "collectionFontSize" TEXT NOT NULL DEFAULT '13';
ALTER TABLE "WholesalePricingSetting" ADD COLUMN "collectionAccentColor" TEXT NOT NULL DEFAULT '#111827';
ALTER TABLE "WholesalePricingSetting" ADD COLUMN "collectionCardSelector" TEXT;
ALTER TABLE "WholesalePricingSetting" ADD COLUMN "collectionPriceSelector" TEXT;
