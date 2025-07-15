document.addEventListener('DOMContentLoaded', () => {
    const inventoryForm = document.getElementById('inventory-form');
    if (!inventoryForm) return;

    const lineItemsContainer = document.getElementById('line-items-container');
    const addLineItemBtn = document.getElementById('add-line-item-btn');
    const template = document.getElementById('line-item-template');

    // ✅ Merge: Define this once (inside)
    const initializeTomSelect = (element) => {
        if (!element || element.tomselect) return;
        new TomSelect(element, {
            create: false,
            sortField: {
                field: "text",
                direction: "asc"
            },
            placeholder: "Search item..."
        });
    };

    const updateAllBlocks = () => {
        const allItemBlocks = lineItemsContainer.querySelectorAll('.line-item-block');
        allItemBlocks.forEach((itemBlock, itemIndex) => {
            const numberSpan = itemBlock.querySelector('.item-number');
            if (numberSpan) numberSpan.textContent = itemIndex + 1;

            itemBlock.querySelectorAll('[data-name]').forEach(input => {
                const name = input.dataset.name;
                input.name = `lineItems[${itemIndex}][${name}]`;
            });

            const allCategoryBlocks = itemBlock.querySelectorAll('.quantity-block');
            allCategoryBlocks.forEach((catBlock, catIndex) => {
                catBlock.querySelectorAll('[data-cat-name]').forEach(catInput => {
                    const name = catInput.dataset.catName;
                    catInput.name = `lineItems[${itemIndex}][categories][${catIndex}][${name}]`;
                });
            });

            const removeButton = itemBlock.querySelector('.remove-item-btn');
            if (removeButton) removeButton.classList.toggle('hidden', allItemBlocks.length <= 1);
        });
    };

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

    const addNewLineItem = () => {
        const newBlock = template.content.cloneNode(true);
        lineItemsContainer.appendChild(newBlock);

        const justAddedBlock = lineItemsContainer.lastElementChild;

        // ✅ Apply TomSelect only here
        const itemSelect = justAddedBlock.querySelector('.item-select-template');
        initializeTomSelect(itemSelect);

        handleQuantityLogic(justAddedBlock.querySelector('.quantity-container'));
        updateAllBlocks();
    };

    addLineItemBtn.addEventListener('click', addNewLineItem);
    lineItemsContainer.addEventListener('click', (e) => {
        if (e.target.closest('.remove-item-btn')) {
            e.target.closest('.line-item-block').remove();
            updateAllBlocks();
        }
    });

    addNewLineItem();
});
