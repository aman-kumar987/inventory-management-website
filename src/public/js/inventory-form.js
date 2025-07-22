document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('inventory-form');
    if (!form) return;

    const container = document.getElementById('line-items-container');
    const addButton = document.getElementById('add-line-item-btn');
    const template = document.getElementById('line-item-template');

    const itemsData = JSON.parse(document.getElementById('item-list-json').textContent);
    const plantsData = JSON.parse(document.getElementById('plant-list-json').textContent);

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
            hiddenInput.value = '';

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
            if (e.key === 'ArrowDown') { e.preventDefault(); currentIndex = (currentIndex + 1) % items.length; } 
            else if (e.key === 'ArrowUp') { e.preventDefault(); currentIndex = (currentIndex - 1 + items.length) % items.length; } 
            else if (e.key === 'Enter') { e.preventDefault(); if (currentIndex >= 0) items[currentIndex].click(); }
            items.forEach((item, i) => item.classList.toggle('bg-gray-200', i === currentIndex));
        });

        input.addEventListener('blur', () => setTimeout(() => resultsList.classList.add('hidden'), 200));
    };
    
    const updateAllBlocks = () => {
        const allItemBlocks = container.querySelectorAll('.line-item-block');
        allItemBlocks.forEach((itemBlock, itemIndex) => {
            itemBlock.querySelector('.item-number').textContent = itemIndex + 1;
            itemBlock.querySelectorAll('[data-name]').forEach(input => {
                const currentName = input.getAttribute('name');
                const dataName = input.dataset.name;
                if (!currentName || !currentName.startsWith('lineItems[0]')) {
                    input.name = `lineItems[${itemIndex}][${dataName}]`;
                } else if (currentName.startsWith('lineItems[0]')) {
                    input.name = input.name.replace(/lineItems\[\d+\]/, `lineItems[${itemIndex}]`);
                }
            });
            itemBlock.querySelectorAll('.quantity-block').forEach((catBlock, catIndex) => {
                catBlock.querySelectorAll('[data-cat-name]').forEach(catInput => {
                    catInput.name = `lineItems[${itemIndex}][categories][${catIndex}][${catInput.dataset.catName}]`;
                });
            });
            itemBlock.querySelector('.remove-item-btn').classList.toggle('hidden', allItemBlocks.length <= 1);
        });
    };

    const handleQuantityLogic = (quantityContainer) => {
        const allCategoryValues = ['New', 'OldUsed', 'Scrapped'];
        const allCategoryLabels = { 'New': 'New', 'OldUsed': 'Old/Used', 'Scrapped': 'Scrapped' };
        const updateButtonsAndOptions = () => {
            const blocks = quantityContainer.querySelectorAll('.quantity-block');
            const selected = Array.from(blocks).map(b => b.querySelector('.category-select').value);
            const canAdd = blocks.length < allCategoryValues.length;
            blocks.forEach((block, index) => {
                block.querySelector('.btn-icon-add').classList.toggle('hidden', index < blocks.length - 1 || !canAdd);
                block.querySelector('.btn-icon-remove').classList.toggle('hidden', blocks.length <= 1);
                const currentSelect = block.querySelector('.category-select');
                const currentVal = currentSelect.value;
                let html = '';
                allCategoryValues.forEach(val => {
                    if (val === currentVal || !selected.includes(val)) html += `<option value="${val}">${allCategoryLabels[val]}</option>`;
                });
                currentSelect.innerHTML = html;
                currentSelect.value = currentVal;
            });
        };
        quantityContainer.addEventListener('click', e => {
            const addBtn = e.target.closest('.btn-icon-add');
            if (addBtn) {
                const newBlock = addBtn.closest('.quantity-block').cloneNode(true);
                newBlock.querySelector('input[type="number"]').value = 0;
                quantityContainer.appendChild(newBlock);
                updateButtonsAndOptions();
                updateAllBlocks();
            }
            const removeBtn = e.target.closest('.btn-icon-remove');
            if (removeBtn) {
                removeBtn.closest('.quantity-block').remove();
                updateButtonsAndOptions();
                updateAllBlocks();
            }
        });
        quantityContainer.addEventListener('change', e => { if (e.target.classList.contains('category-select')) updateButtonsAndOptions(); });
        updateButtonsAndOptions();
    };

    const addNewLineItem = () => {
        const newBlock = template.content.cloneNode(true);
        container.appendChild(newBlock);
        const justAddedBlock = container.lastElementChild;

        const plantWrapper = justAddedBlock.querySelector('.plant-search-wrapper');
        const itemWrapper = justAddedBlock.querySelector('.item-search-wrapper');

        if (plantWrapper) {
            setupSearchDropdown(plantWrapper, plantsData, '.plant-search-input', '.plant-search-results', '.selected-plant-id', 'id', (plant) => plant.name);
        }
        if (itemWrapper) {
            setupSearchDropdown(itemWrapper, itemsData, '.item-search-input', '.item-search-results', '.selected-item-id', 'id', (item) => `${item.item_code} — ${item.item_description}`);
        }
        
        handleQuantityLogic(justAddedBlock.querySelector('.quantity-container'));
        updateAllBlocks();
    };

    addButton.addEventListener('click', addNewLineItem);
    container.addEventListener('click', (e) => {
        if (e.target.closest('.remove-item-btn')) {
            e.target.closest('.line-item-block').remove();
            updateAllBlocks();
        }
    });

    addNewLineItem();
});