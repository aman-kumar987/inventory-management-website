const setupSearchDropdown = (wrapper, dataArray, inputClass, listClass, hiddenInputClass, valueKey, labelKey) => {
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
        hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));

        if (!search) {
            resultsList.classList.add('hidden');
            return;
        }

        const filtered = dataArray.filter(item => item[labelKey].toLowerCase().includes(search));

        filtered.slice(0, 10).forEach(item => {
            const li = document.createElement('li');
            li.className = 'px-4 py-2 cursor-pointer hover:bg-gray-100';
            li.textContent = item[labelKey];
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

        hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));
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
            if (currentIndex >= 0) items[currentIndex].click();
        }
        items.forEach((item, i) => item.classList.toggle('bg-gray-200', i === currentIndex));
    });

    input.addEventListener('blur', () => setTimeout(() => resultsList.classList.add('hidden'), 200));
};

document.querySelectorAll('.approval-form').forEach(form => {
    const roleSelect = form.querySelector('.role-select');
    const plantContainer = form.querySelector('.plant-container');
    const clusterContainer = form.querySelector('.cluster-container');
    const approveBtn = form.querySelector('.approve-btn');
    const plantHiddenInput = form.querySelector('.selected-plant-id');
    const clusterHiddenInput = form.querySelector('.selected-cluster-id');

    setupSearchDropdown(plantContainer, JSON.parse(document.getElementById('plant-list-json').textContent), '.plant-search-input', '.plant-search-results', '.selected-plant-id', 'id', 'name');
    setupSearchDropdown(clusterContainer, JSON.parse(document.getElementById('cluster-list-json').textContent), '.cluster-search-input', '.cluster-search-results', '.selected-cluster-id', 'id', 'name');

    const checkApprovalButtonState = () => {
        const role = roleSelect.value;
        const plantSelected = plantHiddenInput.value;
        const clusterSelected = clusterHiddenInput.value;

        if (role === 'CLUSTER_MANAGER') {
            approveBtn.disabled = !clusterSelected;
        } else {
            approveBtn.disabled = !plantSelected;
        }
    };

    roleSelect.addEventListener('change', () => {
        const isManager = roleSelect.value === 'CLUSTER_MANAGER';
        plantContainer.classList.toggle('hidden', isManager);
        clusterContainer.classList.toggle('hidden', !isManager);
        // Clear inputs when hiding
        if (isManager) plantHiddenInput.value = '';
        else clusterHiddenInput.value = '';
        checkApprovalButtonState();
    });

    form.addEventListener('input', (e) => {
        if (e.target.classList.contains('approve-field')) {
            checkApprovalButtonState();
        }
    });

    // Initial state check
    checkApprovalButtonState();
});