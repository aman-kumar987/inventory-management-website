document.addEventListener('DOMContentLoaded', () => {
    const viewSelector = document.getElementById('view-selector');
    if (viewSelector) {
        viewSelector.addEventListener('change', (e) => {
            const selectedView = e.target.value;
            if (selectedView === 'ledger') {
                window.location.href = '/inventory/ledger';
            } else {
                window.location.href = '/inventory/summary';
            }
        });
    }
});

