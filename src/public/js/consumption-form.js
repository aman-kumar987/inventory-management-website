document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('consumption-form');
    if (!form) return;

    const container = document.getElementById('line-items-container');
    const addButton = document.getElementById('add-line-item-btn');
    const template = document.getElementById('line-item-template');

    const items = JSON.parse(document.getElementById('item-list-json').textContent);
    const plants = JSON.parse(document.getElementById('plant-list-json').textContent);

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
        container.appendChild(newBlock);

        const justAddedBlock = container.lastElementChild;

        // Setup dropdowns
        setupSearchDropdown(
            justAddedBlock.querySelector('.plant-search-wrapper'),
            plants,
            '.plant-search-input',
            '.plant-search-results',
            '.selected-plant-id',
            'id',
            plant => plant.name
        );

        setupSearchDropdown(
            justAddedBlock.querySelector('.item-search-wrapper'),
            items,
            '.item-search-input',
            '.item-search-results',
            '.selected-item-id',
            'id',
            item => `${item.item_code} — ${item.item_description}`
        );

        setupSearchDropdown(
            justAddedBlock.querySelector('.item-search-wrapper-old'),
            items,
            '.item-search-input-old',
            '.item-search-results-old',
            '.selected-item-id-old',
            'id',
            item => `${item.item_code} — ${item.item_description}`
        );

        updateAllBlocks();
    };

    const updateAllBlocks = () => {
        const allBlocks = container.querySelectorAll('.line-item-block');
        allBlocks.forEach((block, index) => {
            const numberSpan = block.querySelector('.item-number');
            if (numberSpan) numberSpan.textContent = index + 1;

            // Rename fields
            block.querySelectorAll('[name]').forEach(input => {
                input.name = input.name.replace(/lineItems\[\d+\]/, `lineItems[${index}]`);
            });

            // Show/hide remove button
            const removeButton = block.querySelector('.remove-item-btn');
            if (removeButton) {
                removeButton.classList.toggle('hidden', allBlocks.length <= 1);
            }
        });
    };

    container.addEventListener('click', (e) => {
        if (e.target.closest('.remove-item-btn')) {
            e.target.closest('.line-item-block').remove();
            updateAllBlocks();
            return;
        }

        const toggle = e.target.closest('.old-received-toggle');
        if (toggle) {
            const block = toggle.closest('.line-item-block');
            const fieldsToShow = block.querySelector('.old-received-fields');
            const requiredSelect = block.querySelector('.selected-item-id-old');

            const isChecked = toggle.checked;
            fieldsToShow.classList.toggle('hidden', !isChecked);

            // Set the `required` attribute only if checkbox is checked
            if (requiredSelect) {
                if (isChecked) {
                    requiredSelect.setAttribute('required', 'required');
                    requiredSelect.dataset.required = 'true';
                } else {
                    requiredSelect.removeAttribute('required');
                    requiredSelect.dataset.required = 'false';
                }
            }
        }
    });

    addButton.addEventListener('click', addNewLineItem);
    addNewLineItem();
});
