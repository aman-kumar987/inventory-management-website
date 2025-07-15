/*
  Warnings:

  - Added the required column `updatedAt` to the `Consumption` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Consumption" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "newInstallation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "new_assetNo" TEXT,
ADD COLUMN     "new_itemCode" TEXT,
ADD COLUMN     "new_poNo" TEXT,
ADD COLUMN     "new_serialNo" TEXT,
ADD COLUMN     "old_assetNo" TEXT,
ADD COLUMN     "old_faultRemark" TEXT,
ADD COLUMN     "old_poNo" TEXT,
ADD COLUMN     "old_serialNo" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "updatedBy" TEXT;
