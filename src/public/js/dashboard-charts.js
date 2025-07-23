document.addEventListener('DOMContentLoaded', () => {
    const chartDataScript = document.getElementById('chart-data-json');
    if (!chartDataScript) return;

    const chartData = JSON.parse(chartDataScript.textContent).filter(d => d.value > 0);
    const ctx = document.getElementById('dashboardChart');
    if (!ctx || chartData.length === 0) return;

    const labels = chartData.map(d => d.name);
    const dataValues = chartData.map(d => d.value);

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Total Quantity', // This will be a generic label
                data: dataValues,
                backgroundColor: 'rgba(79, 70, 229, 0.7)',
                borderColor: 'rgba(79, 70, 229, 1)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { 
                    beginAtZero: true,
                    grid: { color: '#e5e7eb' }
                },
                x: { grid: { display: false } }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1f2937',
                    titleFont: { size: 14 },
                    bodyFont: { size: 12 },
                    padding: 10,
                    cornerRadius: 4,
                    displayColors: false
                }
            }
        }
    });
});