document.addEventListener('DOMContentLoaded', () => {
    // Find all the buttons that are meant to toggle a menu
    const toggleButtons = document.querySelectorAll('.sidebar-toggle');

    toggleButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Get the ID of the menu to open/close from the button's 'data-target' attribute
            const targetId = button.getAttribute('data-target');
            if (!targetId) return;

            const targetMenu = document.querySelector(targetId);
            if (!targetMenu) return;

            // Find the arrow icon inside the button
            const chevron = button.querySelector('.sidebar-chevron');

            // Toggle the 'hidden' class on the menu to show/hide it
            targetMenu.classList.toggle('hidden');
            
            // Toggle the 'rotate-180' class on the arrow icon
            if (chevron) {
                chevron.classList.toggle('rotate-180');
            }
        });
    });
});