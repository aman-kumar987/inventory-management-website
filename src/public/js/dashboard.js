document.addEventListener('DOMContentLoaded', () => {
    // 1. Select all necessary elements from the DOM
    const plantInput = document.getElementById('plant-search-input');
    const plantHiddenInput = document.getElementById('selected-plant-id');
    const plantDropdown = document.getElementById('plant-search-results');
    const plantDataScript = document.getElementById('plant-list-json');

    // 2. If any element is missing (e.g., for a USER role), exit gracefully
    if (!plantInput || !plantHiddenInput || !plantDropdown || !plantDataScript) {
        return;
    }

    // 3. Parse the plant data provided by the controller from the correct script tag
    const plants = JSON.parse(plantDataScript.textContent);
    let keyboardIndex = -1;

    // 4. Function to show/hide and populate the dropdown
    const updateDropdown = (filteredPlants) => {
        plantDropdown.innerHTML = ''; // Clear previous results
        keyboardIndex = -1;

        if (filteredPlants.length === 0) {
            plantDropdown.classList.add('hidden');
            return;
        }

        filteredPlants.forEach(plant => {
            const li = document.createElement('li');
            li.textContent = plant.name;
            li.dataset.plantId = plant.id;
            li.className = 'px-4 py-2 cursor-pointer hover:bg-gray-100';
            plantDropdown.appendChild(li);
        });

        plantDropdown.classList.remove('hidden');
    };

    // 5. Event listener for typing in the search box
    plantInput.addEventListener('input', () => {
        const searchTerm = plantInput.value.trim().toLowerCase();
        plantHiddenInput.value = ''; // Clear selection if user types again

        if (!searchTerm) {
            updateDropdown([]); // Hide if empty
            return;
        }

        const filtered = plants.filter(p => p.name.toLowerCase().includes(searchTerm)).slice(0, 10);
        updateDropdown(filtered);
    });

    // 6. Event listener for selecting an item with a click
    plantDropdown.addEventListener('click', (e) => {
        const listItem = e.target.closest('li');
        if (!listItem) return;

        plantInput.value = listItem.textContent;
        plantHiddenInput.value = listItem.dataset.plantId;
        plantDropdown.classList.add('hidden');
    });

    // 7. Event listener for keyboard navigation (Up, Down, Enter)
    plantInput.addEventListener('keydown', (e) => {
        const listItems = plantDropdown.querySelectorAll('li');
        if (listItems.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            keyboardIndex = (keyboardIndex + 1) % listItems.length;
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            keyboardIndex = (keyboardIndex - 1 + listItems.length) % listItems.length;
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (keyboardIndex >= 0) {
                listItems[keyboardIndex].click();
            }
        }

        listItems.forEach((item, index) => {
            item.classList.toggle('bg-gray-200', index === keyboardIndex);
        });
    });

    // 8. Event listener to hide the dropdown when the user clicks away
    plantInput.addEventListener('blur', () => {
        // Use a small delay to allow click events to register
        setTimeout(() => {
            plantDropdown.classList.add('hidden');
        }, 200);
    });
});