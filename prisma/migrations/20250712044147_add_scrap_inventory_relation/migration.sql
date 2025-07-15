-- AddForeignKey
ALTER TABLE "ScrapApproval" ADD CONSTRAINT "ScrapApproval_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "Inventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
