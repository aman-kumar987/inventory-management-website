-- AddForeignKey
ALTER TABLE "Consumption" ADD CONSTRAINT "Consumption_old_itemCode_fkey" FOREIGN KEY ("old_itemCode") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
