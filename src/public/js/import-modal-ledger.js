document.addEventListener('DOMContentLoaded', () => {
        const openBtn = document.getElementById('open-import-modal-btn');
        const cancelBtn = document.getElementById('cancel-import-btn');
        const modal = document.getElementById('import-inventory-modal');

        if (openBtn && modal && cancelBtn) {
            // Event listener to open the modal
            openBtn.addEventListener('click', () => {
                modal.classList.remove('hidden');
            });

            // Event listener to close the modal
            cancelBtn.addEventListener('click', () => {
                modal.classList.add('hidden');
            });
            
            // Optional: Close modal if user clicks outside of it on the backdrop
            modal.addEventListener('click', (event) => {
                // Check if the click was on the backdrop itself (the first child of the modal div)
                if (event.target === modal) {
                     modal.classList.add('hidden');
                }
            });
        }
    });