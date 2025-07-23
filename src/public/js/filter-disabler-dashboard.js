document.addEventListener('DOMContentLoaded', () => {
    const dataTypeSelect = document.getElementById('dataType');
    const stockTypeContainer = document.getElementById('stock-type-filter-container');

    const toggleStockTypeFilter = () => {
        if (dataTypeSelect.value === 'inventory') {
            stockTypeContainer.style.display = 'block';
        } else {
            stockTypeContainer.style.display = 'none';
        }
    };

    toggleStockTypeFilter();
    dataTypeSelect.addEventListener('change', toggleStockTypeFilter);
});