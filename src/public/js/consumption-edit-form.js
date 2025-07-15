document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('consumption-edit-form');
    if (!form) return;

    // Initialize all Tom Select instances on page load, but keep them hidden
    const tomSelectInstances = {};
    form.querySelectorAll('.item-select-template').forEach(select => {
        if (!select.id) select.id = `tom-select-${Math.random().toString(36).substring(2, 9)}`;
        tomSelectInstances[select.id] = new TomSelect(select, { create: false });
        tomSelectInstances[select.id].wrapper.classList.add('hidden'); // Hide the Tom Select input
    });

    // --- Handle enabling/disabling individual fields ---
    form.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-btn');
        if (!editBtn) return;

        const inputContainer = editBtn.parentElement;
        const inputToEnable = inputContainer.querySelector('input:not([type=hidden]), textarea, select');
        
        // --- Special logic for Tom Select fields ---
        const editableContainer = inputToEnable.closest('[data-editable-container]');
        if (editableContainer) {
            const staticInput = editableContainer.querySelector('.static-display');
            const tomSelectWrapper = editableContainer.querySelector('.ts-wrapper');
            
            staticInput.classList.toggle('hidden');
            tomSelectWrapper.classList.toggle('hidden');
            
            // Toggle lock icon
            const isEditing = !tomSelectWrapper.classList.contains('hidden');
            editBtn.innerHTML = isEditing ? '<i class="fas fa-lock-open text-indigo-600"></i>' : '<i class="fas fa-pencil-alt"></i>';
            return; // Stop further execution for this special case
        }

        // --- Standard logic for other fields ---
        if (inputToEnable) {
            const wasDisabled = inputToEnable.disabled;
            inputToEnable.disabled = !wasDisabled;
            if (wasDisabled) {
                inputToEnable.focus();
                editBtn.innerHTML = '<i class="fas fa-lock-open text-indigo-600"></i>';
            } else {
                editBtn.innerHTML = '<i class="fas fa-pencil-alt"></i>';
            }
        }
    });

    // --- Handle showing the 'Add Old Item' form ---
    const addOldItemBtn = document.getElementById('add-old-item-btn');
    const oldItemFormContainer = document.getElementById('old-item-form-container');
    const oldReceivedCheckbox = document.getElementById('old-received-hidden-checkbox');

    if (addOldItemBtn && oldItemFormContainer && oldReceivedCheckbox) {
        addOldItemBtn.addEventListener('click', () => {
            oldItemFormContainer.classList.remove('hidden');
            addOldItemBtn.classList.add('hidden');
            oldReceivedCheckbox.checked = true;

            const oldItemSelect = oldItemFormContainer.querySelector('.item-select-template');
            if (oldItemSelect && !oldItemSelect.tomselect) {
                if (!oldItemSelect.id) oldItemSelect.id = `tom-select-${Math.random().toString(36).substring(2, 9)}`;
                tomSelectInstances[oldItemSelect.id] = new TomSelect(oldItemSelect, { create: false });
            }
        });
    }
});