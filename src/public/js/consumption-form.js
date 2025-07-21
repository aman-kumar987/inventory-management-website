document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('consumption-form');
    if (!form) return;

    const container = document.getElementById('line-items-container');
    const addButton = document.getElementById('add-line-item-btn');
    const template = document.getElementById('line-item-template');

    const items = JSON.parse(document.getElementById('item-list-json').textContent);
    const plants = JSON.parse(document.getElementById('plant-list-json').textContent);

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

    const addNewLineItem = () => {
        const newBlock = template.content.cloneNode(true);
        container.appendChild(newBlock);
        const justAddedBlock = container.lastElementChild;
        setupSearchDropdown(justAddedBlock.querySelector('.plant-search-wrapper'), plants, '.plant-search-input', '.plant-search-results', '.selected-plant-id', 'id', plant => plant.name);
        setupSearchDropdown(justAddedBlock.querySelector('.item-search-wrapper'), items, '.item-search-input', '.item-search-results', '.selected-item-id', 'id', item => `${item.item_code} — ${item.item_description}`);
        setupSearchDropdown(justAddedBlock.querySelector('.item-search-wrapper-old'), items, '.item-search-input-old', '.item-search-results-old', '.selected-item-id-old', 'id', item => `${item.item_code} — ${item.item_description}`);
        updateAllBlocks();
    };

    const updateAllBlocks = () => {
        const allBlocks = container.querySelectorAll('.line-item-block');
        allBlocks.forEach((block, index) => {
            block.querySelector('.item-number').textContent = index + 1;
            block.querySelectorAll('[name]').forEach(input => {
                input.name = input.name.replace(/lineItems\[\d+\]/, `lineItems[${index}]`);
            });
            block.querySelector('.remove-item-btn').classList.toggle('hidden', allBlocks.length <= 1);
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
            const isChecked = toggle.checked;
            fieldsToShow.classList.toggle('hidden', !isChecked);
            block.querySelectorAll('.old-required').forEach(input => {
                if (isChecked) {
                    input.setAttribute('required', 'required');
                } else {
                    input.removeAttribute('required');
                }
            });
        }
    });

    addButton.addEventListener('click', addNewLineItem);
    addNewLineItem();
});