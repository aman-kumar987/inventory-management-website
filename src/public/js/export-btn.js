document.addEventListener('DOMContentLoaded', () => {
        // Find the export button by its ID
        const exportBtn = document.getElementById('export-btn');
        
        // Only run if the button exists on the page
        if (exportBtn) {
            // Get the current URL's search parameters (e.g., ?search=xyz&plantFilter=abc)
            const currentParams = new URLSearchParams(window.location.search);
            
            // Re-construct the export link to include these parameters
            // This ensures the backend receives the same filters the user is currently seeing
            exportBtn.href = `/inventory/ledger/export?${currentParams.toString()}`;
        }
    });