document.addEventListener('DOMContentLoaded', () => {
    const inventoryForm = document.getElementById('inventory-form');
    if (!inventoryForm) return;

    const lineItemsContainer = document.getElementById('line-items-container');
    const addLineItemBtn = document.getElementById('add-line-item-btn');
    const template = document.getElementById('line-item-template');

    const items = JSON.parse(document.getElementById('item-list-json').textContent);
    const plants = JSON.parse(document.getElementById('plant-list-json').textContent);

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

    const setupSearchDropdown = (wrapper, dataArray, inputClass, listClass, hiddenInputClass, valueKey, labelFn) => {
        const input = wrapper.querySelector(inputClass);
        const hiddenInput = wrapper.querySelector(hiddenInputClass);
        const resultsList = wrapper.querySelector(listClass);

        input.addEventListener('input', () => {
            const search = input.value.trim().toLowerCase();
            resultsList.innerHTML = '';

            if (!search) {
                resultsList.classList.add('hidden');
                return;
            }

            const filtered = dataArray.filter(item =>
                labelFn(item).toLowerCase().includes(search)
            );

            filtered.slice(0, 10).forEach(item => {
                const li = document.createElement('li');
                li.textContent = labelFn(item);
                li.dataset.itemId = item[valueKey];
                resultsList.appendChild(li);
            });

            resultsList.classList.remove('hidden');
        });

        resultsList.addEventListener('click', (e) => {
            const li = e.target.closest('li');
            if (!li) return;

            input.value = li.textContent;
            hiddenInput.value = li.dataset.itemId;
            resultsList.classList.add('hidden');
        });

        input.addEventListener('blur', () => {
            setTimeout(() => resultsList.classList.add('hidden'), 150);
        });
    };

    const addNewLineItem = () => {
        const newBlock = template.content.cloneNode(true);
        lineItemsContainer.appendChild(newBlock);

        const justAddedBlock = lineItemsContainer.lastElementChild;

        setupSearchDropdown(
            justAddedBlock.querySelector('.item-search-wrapper'),
            items,
            '.item-search-input',
            '.item-search-results',
            '.selected-item-id',
            'id',
            (item) => `${item.item_code} — ${item.item_description}`
        );

        setupSearchDropdown(
            justAddedBlock.querySelector('.plant-search-wrapper'),
            plants,
            '.plant-search-input',
            '.plant-search-results',
            '.selected-plant-id',
            'id',
            (plant) => `${plant.name}`
        );

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
