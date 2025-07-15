document.addEventListener('DOMContentLoaded', () => {

    // --- Filter Toggle Logic for Inventory Page ---
    const toggleBtn = document.getElementById('toggle-filter-btn');
    const filterContainer = document.getElementById('filter-container');

    // This 'if' block makes the code safe to run on any page.
    // It will only execute if it finds the button and container.
    if (toggleBtn && filterContainer) {
        const btnText = toggleBtn.querySelector('span');

        toggleBtn.addEventListener('click', () => {
            const isHidden = filterContainer.classList.toggle('hidden');
            
            if (btnText) {
                btnText.textContent = isHidden ? 'Show Filters' : 'Hide Filters';
            }
        });
    }

    // You can add other global scripts here in the future.
});