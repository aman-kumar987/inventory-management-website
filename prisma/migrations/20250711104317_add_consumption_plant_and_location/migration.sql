/*
  Warnings:

  - You are about to drop the column `createdAt` on the `Consumption` table. All the data in the column will be lost.
  - You are about to drop the column `createdBy` on the `Consumption` table. All the data in the column will be lost.
  - You are about to drop the column `isDeleted` on the `Consumption` table. All the data in the column will be lost.
  - You are about to drop the column `location` on the `Consumption` table. All the data in the column will be lost.
  - You are about to drop the column `newInstallation` on the `Consumption` table. All the data in the column will be lost.
  - You are about to drop the column `new_assetNo` on the `Consumption` table. All the data in the column will be lost.
  - You are about to drop the column `new_itemCode` on the `Consumption` table. All the data in the column will be lost.
  - You are about to drop the column `new_poNo` on the `Consumption` table. All the data in the column will be lost.
  - You are about to drop the column `new_serialNo` on the `Consumption` table. All the data in the column will be lost.
  - You are about to drop the column `old_assetNo` on the `Consumption` table. All the data in the column will be lost.
  - You are about to drop the column `old_faultRemark` on the `Consumption` table. All the data in the column will be lost.
  - You are about to drop the column `old_poNo` on the `Consumption` table. All the data in the column will be lost.
  - You are about to drop the column `old_serialNo` on the `Consumption` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Consumption` table. All the data in the column will be lost.
  - You are about to drop the column `updatedBy` on the `Consumption` table. All the data in the column will be lost.
  - Added the required column `consumption_location` to the `Consumption` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sub_location` to the `Consumption` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Consumption" DROP COLUMN "createdAt",
DROP COLUMN "createdBy",
DROP COLUMN "isDeleted",
DROP COLUMN "location",
DROP COLUMN "newInstallation",
DROP COLUMN "new_assetNo",
DROP COLUMN "new_itemCode",
DROP COLUMN "new_poNo",
DROP COLUMN "new_serialNo",
DROP COLUMN "old_assetNo",
DROP COLUMN "old_faultRemark",
DROP COLUMN "old_poNo",
DROP COLUMN "old_serialNo",
DROP COLUMN "updatedAt",
DROP COLUMN "updatedBy",
ADD COLUMN     "consumption_location" TEXT NOT NULL,
ADD COLUMN     "sub_location" TEXT NOT NULL;
