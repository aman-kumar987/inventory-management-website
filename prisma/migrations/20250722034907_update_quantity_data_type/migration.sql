-- AlterTable
ALTER TABLE "Consumption" ALTER COLUMN "quantity" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "CurrentStock" ALTER COLUMN "newQty" SET DATA TYPE BIGINT,
ALTER COLUMN "oldUsedQty" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "Inventory" ALTER COLUMN "newQty" SET DATA TYPE BIGINT,
ALTER COLUMN "oldUsedQty" SET DATA TYPE BIGINT,
ALTER COLUMN "scrappedQty" SET DATA TYPE BIGINT,
ALTER COLUMN "consumptionAmount" SET DATA TYPE BIGINT,
ALTER COLUMN "total" SET DATA TYPE BIGINT;
