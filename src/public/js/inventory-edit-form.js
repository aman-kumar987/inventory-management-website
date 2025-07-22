document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('edit-inventory-form');
    if (!form) return;

    const newQtyInput = document.getElementById('newQty');
    const oldUsedQtyInput = document.getElementById('oldUsedQty');
    const scrappedQtyInput = document.getElementById('scrappedQty');

    const originalScrapped = parseInt(document.getElementById('original-scrapped-qty').value, 10);
    const originalOldUsed = parseInt(document.getElementById('original-old-used-qty').value, 10);

    function updateOldUsedQty() {
        const currentScrapped = parseInt(scrappedQtyInput.value, 10) || 0;
        const scrapIncrease = currentScrapped - originalScrapped;

        if (scrapIncrease > 0) {
            // Agar scrap badhaya gaya hai, to old/used ko calculate karein aur readonly banayein
            const newOldUsed = Math.max(0, originalOldUsed - scrapIncrease);
            oldUsedQtyInput.value = newOldUsed;
            oldUsedQtyInput.readOnly = true;
            oldUsedQtyInput.classList.add('bg-gray-100'); // Optional: visually indicate it's readonly
        } else {
            // Agar scrap kam ya barabar hai, to old/used ko editable banayein
            oldUsedQtyInput.readOnly = false;
            oldUsedQtyInput.classList.remove('bg-gray-100');
            // Agar user ne scrap kam kiya hai, to old/used ko original value par reset na karein,
            // taaki user use manually set kar sake.
        }
    }

    // Jab bhi scrap quantity badle, calculation update karein
    scrappedQtyInput.addEventListener('input', updateOldUsedQty);

    // Page load par bhi ek baar check karein
    updateOldUsedQty();
});