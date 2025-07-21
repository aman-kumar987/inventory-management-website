document.addEventListener('DOMContentLoaded', () => {
    const dataTypeSelect = document.getElementById('dataType');
    const stockTypeContainer = document.getElementById('stock-type-filter-container');

    const toggleStockTypeFilter = () => {
        // Agar 'inventory' select hai, to filter dikhao
        if (dataTypeSelect.value === 'inventory') {
            stockTypeContainer.style.display = 'block';
        } else {
            // Agar 'consumption' select hai, to filter ko chhipa do
            stockTypeContainer.style.display = 'none';
        }
    };

    // Page load hote hi check karo
    toggleStockTypeFilter();

    // Jab bhi filter badle, tab check karo
    dataTypeSelect.addEventListener('change', toggleStockTypeFilter);
});