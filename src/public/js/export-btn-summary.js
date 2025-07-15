document.addEventListener('DOMContentLoaded', () => {
        // This script ensures the Export button includes current filters
        const exportBtn = document.getElementById('export-btn');
        if (exportBtn) {
            const currentParams = new URLSearchParams(window.location.search);
            // Append these parameters to the export button's link
            exportBtn.href = `/inventory/summary/export?${currentParams.toString()}`;
        }
    });