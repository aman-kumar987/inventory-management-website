-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'UNASSIGNED';

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_plantId_fkey";

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "plantId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
