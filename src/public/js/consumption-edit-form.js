document.addEventListener('DOMContentLoaded', () => {
    const quantityInput = document.getElementById('quantity');
    const saveButton = document.getElementById('save-changes-btn');
    const messageP = document.getElementById('stock-validation-message');

    const availableNew = parseInt(document.getElementById('available-new-stock').value, 10);
    const availableOld = parseInt(document.getElementById('available-old-stock').value, 10);
    const originalQty = parseInt(document.getElementById('original-quantity').value, 10);

    const totalAvailableStock = availableNew + availableOld;

    const validateStock = () => {
        const newQty = parseInt(quantityInput.value, 10) || 0;
        const increase = newQty - originalQty;

        if (increase > 0 && increase > totalAvailableStock) {
            messageP.textContent = `Error: Cannot increase by ${increase}. Only ${totalAvailableStock} more available in stock.`;
            saveButton.disabled = true;
            quantityInput.classList.add('border-red-500');
        } else {
            messageP.textContent = '';
            saveButton.disabled = false;
            quantityInput.classList.remove('border-red-500');
        }
    };

    quantityInput.addEventListener('input', validateStock);
});