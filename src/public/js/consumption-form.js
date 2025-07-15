document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('consumption-form');
    if (!form) return;

    const container = document.getElementById('line-items-container');
    const addButton = document.getElementById('add-line-item-btn');
    const template = document.getElementById('line-item-template');

    // --- Function to add a new line item from the template ---
    const addNewLineItem = () => {
        // Create a new line item by cloning the template's content
        const newBlock = template.content.cloneNode(true);
        // Append it to the container
        container.appendChild(newBlock);
        // Update numbering and button visibility
        updateAllBlocks();
    };

    // --- Function to update all line items after a change ---
    const updateAllBlocks = () => {
        const allBlocks = container.querySelectorAll('.line-item-block');
        allBlocks.forEach((block, index) => {
            // Update the title number (e.g., "Consumption Entry 1")
            const numberSpan = block.querySelector('.item-number');
            if (numberSpan) {
                numberSpan.textContent = index + 1;
            }

            // Update the 'name' attribute for all form fields in this block
            block.querySelectorAll('[name]').forEach(input => {
                input.name = input.name.replace(/lineItems\[\d+\]/, `lineItems[${index}]`);
            });

            // Show or hide the remove button
            const removeButton = block.querySelector('.remove-item-btn');
            if (removeButton) {
                removeButton.classList.toggle('hidden', allBlocks.length <= 1);
            }
        });
    };

    // --- Main Event Listener for the container ---
    container.addEventListener('click', (e) => {
        // Handle clicking the remove button
        if (e.target.closest('.remove-item-btn')) {
            e.target.closest('.line-item-block').remove();
            updateAllBlocks();
            return;
        }

        // Handle clicking the "Old Received" toggle switch
        const toggle = e.target.closest('.old-received-toggle');
        if (toggle) {
            const block = toggle.closest('.line-item-block');
            const fieldsToShow = block.querySelector('.old-received-fields');
            const requiredSelect = fieldsToShow.querySelector('select[data-required="true"]');
            
            const isChecked = toggle.checked;
            fieldsToShow.classList.toggle('hidden', !isChecked);
            if (requiredSelect) {
                requiredSelect.required = isChecked;
            }
        }
    });

    // --- Event listener for the main "Add" button ---
    addButton.addEventListener('click', addNewLineItem);

    // --- Start by adding the first line item to the page ---
    addNewLineItem();
});