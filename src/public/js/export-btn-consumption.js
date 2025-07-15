document.addEventListener('DOMContentLoaded', () => {
        // This script ensures the Export button includes current filters
        const exportBtn = document.getElementById('export-btn');
        if (exportBtn) {
            const currentParams = new URLSearchParams(window.location.search);
            exportBtn.href = `/consumption/export?${currentParams.toString()}`;
        }
    });