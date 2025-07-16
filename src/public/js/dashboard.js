document.addEventListener('DOMContentLoaded', () => {
    const plantInput = document.getElementById('plant-search-input');
    const plantHiddenInput = document.getElementById('selected-plant-id');
    const plantDropdown = document.getElementById('plant-search-results');
    const plantDataScript = document.getElementById('plant-list-json');

    const plants = plantDataScript ? JSON.parse(plantDataScript.textContent) : [];

    let currentIndex = -1;

    const updateDropdown = (filtered) => {
        plantDropdown.innerHTML = '';
        currentIndex = -1;

        filtered.forEach((plant, index) => {
            const li = document.createElement('li');
            li.textContent = plant.name;
            li.dataset.plantId = plant.id;
            li.className = 'px-4 py-2 cursor-pointer hover:bg-gray-100';
            plantDropdown.appendChild(li);
        });

        plantDropdown.classList.remove('hidden');
    };

    plantInput.addEventListener('input', () => {
        const val = plantInput.value.trim().toLowerCase();
        if (!val) {
            plantDropdown.classList.add('hidden');
            return;
        }

        const filtered = plants.filter(p => p.name.toLowerCase().includes(val)).slice(0, 10);
        updateDropdown(filtered);
    });

    plantInput.addEventListener('keydown', (e) => {
        const items = plantDropdown.querySelectorAll('li');
        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            currentIndex = (currentIndex + 1) % items.length;
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            currentIndex = (currentIndex - 1 + items.length) % items.length;
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (currentIndex >= 0 && currentIndex < items.length) {
                const selected = items[currentIndex];
                plantInput.value = selected.textContent;
                plantHiddenInput.value = selected.dataset.plantId;
                plantDropdown.classList.add('hidden');
            }
        }

        items.forEach((item, i) => {
            item.classList.toggle('bg-gray-200', i === currentIndex);
        });
    });

    plantDropdown.addEventListener('click', (e) => {
        const li = e.target.closest('li');
        if (!li) return;

        plantInput.value = li.textContent;
        plantHiddenInput.value = li.dataset.plantId;
        plantDropdown.classList.add('hidden');
    });

    plantInput.addEventListener('blur', () => {
        setTimeout(() => plantDropdown.classList.add('hidden'), 150);
    });
});
