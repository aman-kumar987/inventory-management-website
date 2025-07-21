document.addEventListener('DOMContentLoaded', () => {
    const inventoryForm = document.getElementById('inventory-form');
    if (!inventoryForm) return;

    const lineItemsContainer = document.getElementById('line-items-container');
    const addLineItemBtn = document.getElementById('add-line-item-btn');
    const template = document.getElementById('line-item-template');

    const items = JSON.parse(document.getElementById('item-list-json').textContent);
    const plants = JSON.parse(document.getElementById('plant-list-json').textContent);

    /**
     * Updates the name attributes for all form fields to ensure correct submission.
     */
    const updateAllBlocks = () => {
        const allItemBlocks = lineItemsContainer.querySelectorAll('.line-item-block');
        allItemBlocks.forEach((itemBlock, itemIndex) => {
            itemBlock.querySelector('.item-number').textContent = itemIndex + 1;
            itemBlock.querySelectorAll('[data-name]').forEach(input => {
                const name = input.dataset.name;
                input.name = `lineItems[${itemIndex}][${name}]`;
            });
            itemBlock.querySelectorAll('.quantity-block').forEach((catBlock, catIndex) => {
                catBlock.querySelectorAll('[data-cat-name]').forEach(catInput => {
                    const name = catInput.dataset.catName;
                    catInput.name = `lineItems[${itemIndex}][categories][${catIndex}][${name}]`;
                });
            });
            const removeButton = itemBlock.querySelector('.remove-item-btn');
            if (removeButton) removeButton.classList.toggle('hidden', allItemBlocks.length <= 1);
        });
    };

    /**
     * Handles the logic for adding/removing quantity rows and preventing duplicate categories.
     */
    const handleQuantityLogic = (quantityContainer) => {
        const allCategoryValues = ['New', 'OldUsed', 'Scrapped'];
        const allCategoryLabels = {
            'New': 'New',
            'OldUsed': 'Old/Used',
            'Scrapped': 'Scrapped'
        };

        const updateButtons = () => {
            const blocks = quantityContainer.querySelectorAll('.quantity-block');
            const canAdd = blocks.length < 3;
            blocks.forEach((block, index) => {
                block.querySelector('.btn-icon-add').classList.toggle('hidden', index < blocks.length - 1 || !canAdd);
                block.querySelector('.btn-icon-remove').classList.toggle('hidden', blocks.length <= 1);
            });
        };

        const updateOptions = () => {
            const selected = Array.from(quantityContainer.querySelectorAll('.category-select')).map(s => s.value);
            quantityContainer.querySelectorAll('.category-select').forEach(select => {
                const currentVal = select.value;
                let html = '';
                allCategoryValues.forEach(val => {
                    if (val === currentVal || !selected.includes(val)) {
                        html += `<option value="${val}">${allCategoryLabels[val]}</option>`;
                    }
                });
                select.innerHTML = html;
                select.value = currentVal;
            });
        };

        quantityContainer.addEventListener('click', e => {
            const addBtn = e.target.closest('.btn-icon-add');
            if (addBtn) {
                const currentBlock = addBtn.closest('.quantity-block');
                const newBlock = currentBlock.cloneNode(true);
                newBlock.querySelector('input[type="number"]').value = 0;

                const selected = Array.from(quantityContainer.querySelectorAll('.category-select')).map(s => s.value);
                const firstAvailable = allCategoryValues.find(v => !selected.includes(v));
                if (firstAvailable) {
                    newBlock.querySelector('select').value = firstAvailable;
                }

                quantityContainer.appendChild(newBlock);
                updateOptions();
                updateButtons();
                updateAllBlocks();
            }

            const removeBtn = e.target.closest('.btn-icon-remove');
            if (removeBtn) {
                removeBtn.closest('.quantity-block').remove();
                updateOptions();
                updateButtons();
                updateAllBlocks();
            }
        });

        quantityContainer.addEventListener('change', e => {
            if (e.target.classList.contains('category-select')) {
                updateOptions();
            }
        });

        updateOptions();
        updateButtons();
    };

    /**
     * Creates a searchable dropdown with full keyboard navigation support.
     */
    const setupSearchDropdown = (wrapper, dataArray, inputClass, listClass, hiddenInputClass, valueKey, labelFn) => {
        if (!wrapper) return;
        const input = wrapper.querySelector(inputClass);
        const hiddenInput = wrapper.querySelector(hiddenInputClass);
        const resultsList = wrapper.querySelector(listClass);
        let currentIndex = -1;

        input.addEventListener('input', () => {
            const search = input.value.trim().toLowerCase();
            resultsList.innerHTML = '';
            currentIndex = -1;

            if (!search) {
                resultsList.classList.add('hidden');
                return;
            }

            const filtered = dataArray.filter(item => labelFn(item).toLowerCase().includes(search));

            filtered.slice(0, 10).forEach(item => {
                const li = document.createElement('li');
                li.className = 'px-4 py-2 cursor-pointer hover:bg-gray-100';
                li.textContent = labelFn(item);
                li.dataset.value = item[valueKey];
                resultsList.appendChild(li);
            });
            resultsList.classList.remove('hidden');
        });

        resultsList.addEventListener('click', (e) => {
            const li = e.target.closest('li');
            if (!li) return;
            input.value = li.textContent;
            hiddenInput.value = li.dataset.value;
            resultsList.classList.add('hidden');
        });

        input.addEventListener('keydown', (e) => {
            const items = resultsList.querySelectorAll('li');
            if (items.length === 0) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                currentIndex = (currentIndex + 1) % items.length;
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                currentIndex = (currentIndex - 1 + items.length) % items.length;
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (currentIndex >= 0) {
                    items[currentIndex].click();
                }
            }
            items.forEach((item, i) => item.classList.toggle('bg-gray-200', i === currentIndex));
        });

        input.addEventListener('blur', () => setTimeout(() => resultsList.classList.add('hidden'), 200));
    };

    /**
     * Creates and configures a new line item block.
     */
    const addNewLineItem = () => {
        const newBlock = template.content.cloneNode(true);
        lineItemsContainer.appendChild(newBlock);
        const justAddedBlock = lineItemsContainer.lastElementChild;

        setupSearchDropdown(justAddedBlock.querySelector('.item-search-wrapper'), items, '.item-search-input', '.item-search-results', '.selected-item-id', 'id', (item) => `${item.item_code} — ${item.item_description}`);
        setupSearchDropdown(justAddedBlock.querySelector('.plant-search-wrapper'), plants, '.plant-search-input', '.plant-search-results', '.selected-plant-id', 'id', (plant) => `${plant.name}`);

        handleQuantityLogic(justAddedBlock.querySelector('.quantity-container'));
        updateAllBlocks();
    };

    // --- Main Event Listeners ---
    addLineItemBtn.addEventListener('click', addNewLineItem);
    lineItemsContainer.addEventListener('click', (e) => {
        if (e.target.closest('.remove-item-btn')) {
            e.target.closest('.line-item-block').remove();
            updateAllBlocks();
        }
    });

    // --- Initial Load ---
    addNewLineItem();
});