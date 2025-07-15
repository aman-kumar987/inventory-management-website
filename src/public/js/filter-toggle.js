// This script will handle any filter toggle button on any page.
document.addEventListener('DOMContentLoaded', () => {
    
    // Find the single toggle button present on the current page.
    const toggleBtn = document.getElementById('filter-toggle-btn');
    if (!toggleBtn) {
        return; // If there's no button on this page, do nothing.
    }

    // Get the IDs of the panel and chevron to control from the button's data attributes.
    const panelId = toggleBtn.getAttribute('data-target-panel');
    const chevronId = toggleBtn.getAttribute('data-target-chevron');

    const filterPanel = document.getElementById(panelId);
    const chevron = document.getElementById(chevronId);

    // Only add the event listener if all three elements exist.
    if (filterPanel && chevron) {
        toggleBtn.addEventListener('click', () => {
            // Check if the panel is currently hidden
            const isHidden = filterPanel.classList.contains('hidden');
            
            // Toggle the 'hidden' class on the panel
            if (isHidden) {
                filterPanel.classList.remove('hidden');
            } else {
                filterPanel.classList.add('hidden');
            }
            
            // Toggle the 'rotate-180' class on the chevron icon
            chevron.classList.toggle('rotate-180', isHidden);
        });
    }
});