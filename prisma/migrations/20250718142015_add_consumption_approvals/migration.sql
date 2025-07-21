-- AlterTable
ALTER TABLE "CurrentStock" ADD COLUMN     "newQty" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "oldUsedQty" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ConsumptionScrapApproval" (
    "id" TEXT NOT NULL,
    "consumptionId" TEXT NOT NULL,
    "requestedQty" INTEGER NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "remarks" TEXT,
    "requestedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "processedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsumptionScrapApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsumptionScrapApproval_status_idx" ON "ConsumptionScrapApproval"("status");

-- AddForeignKey
ALTER TABLE "ConsumptionScrapApproval" ADD CONSTRAINT "ConsumptionScrapApproval_consumptionId_fkey" FOREIGN KEY ("consumptionId") REFERENCES "Consumption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumptionScrapApproval" ADD CONSTRAINT "ConsumptionScrapApproval_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumptionScrapApproval" ADD CONSTRAINT "ConsumptionScrapApproval_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
