let cveData = [];
async function loadCveList(filters = {}) {
    try {
        const response = await fetch('/retrieve-cves', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(filters)
        });
        const data = await response.json();

        console.log('Filtered Data:', data);

        const totalResults = data.length;
        document.getElementById('totalResults').textContent = `Total Results: ${totalResults}`;

        const cveList = document.getElementById('cveList');
        const tbody = cveList.querySelector('tbody');
        tbody.innerHTML = '';

        data.sort((a, b) => new Date(b.published_date) - new Date(a.published_date));

        data.forEach(cve => {
            const row = document.createElement('tr');
            row.classList.add('system-row');
            row.setAttribute('data-cve-id', cve.cve_id);

            row.innerHTML = `
                <td>${cve.cve_id}</td>
                <td>${[...new Set(cve.affected.map(product => product.product))].join(', ')}</td>
                <td>${cve.description.slice(0, 30)}${cve.description.length > 30 ? '...' : ''}</td>
                <td>${cve.baseSeverity}</td>
                <td>${new Date(cve.published_date).toLocaleDateString()}</td>
                <td><a href="${cve.url}" target="_blank">Link</a></td>
            `;

            const detailsRow = document.createElement('tr');
            detailsRow.classList.add('cve-details', 'hidden');
            detailsRow.setAttribute('data-cve-id', cve.cve_id);

            detailsRow.innerHTML = `
                <td colspan="6">
                    <div>
                        <strong>Description:</strong> ${cve.description}<br>
                        <strong>Affected Products:</strong> ${cve.affected.map(product => `${product.product} (${product.version !== 'N/A' ? product.version : 'N/A'})`).join(', ')}
                    </div>
                </td>
            `;

            tbody.appendChild(row);
            tbody.appendChild(detailsRow);

            row.addEventListener('click', () => {
                detailsRow.classList.toggle('hidden');
            });
        });
    } catch (error) {
        console.error('Error fetching CVEs:', error);
    }
}

document.getElementById('filterForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const severityFilter = document.getElementById('severityFilter').value;
    const keywordFilter = document.getElementById('keywordFilter').value;
    const dateRangeFilter = document.getElementById('dateRangeFilter').value;

    const filters = {
        severity: severityFilter,
        dateRange: dateRangeFilter ? parseInt(dateRangeFilter) : '',
        keyword: keywordFilter,
        excludeResolved: document.getElementById('excludeResolved').checked
    };

    await loadCveList(filters);
});

document.getElementById('clearFiltersBtn').addEventListener('click', async () => {
    document.getElementById('filterForm').reset();
    await loadCveList();
});

// Initial load of CVE list
document.addEventListener("DOMContentLoaded", async () => {
    await loadCveList();
});

function switchTabByHash() {
    let hash = window.location.hash;

    // Standaard naar CVE Overview als er geen hash is
    if (!hash) {
        hash = '#cveOverview';
        window.location.hash = hash;
    }

    const tabs = document.querySelectorAll('.tab-pane');
    const links = document.querySelectorAll('.tab-links a');

    // Verwijder de actieve klasse van alle tabbladen en links
    tabs.forEach(tab => tab.classList.remove('active'));
    links.forEach(link => link.classList.remove('active'));

    // Zoek het juiste tabblad en maak deze actief
    const activeTab = document.querySelector(hash);
    if (activeTab) {
        activeTab.classList.add('active');
        document.querySelector(`.tab-links a[href="${hash}"]`).classList.add('active');
    }
}

// Zorg dat de tab wisselt wanneer de pagina laadt of de hash verandert
window.addEventListener('load', switchTabByHash);
window.addEventListener('hashchange', switchTabByHash);


async function loadLogs() {
    try {
        const response = await fetch('/refresh-logs');
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const logs = await response.json();
        console.log('Loaded logs:', logs); // Voeg een log toe om de data te controleren
        if (!Array.isArray(logs)) {
            throw new TypeError('Expected an array of logs');
        }

        // Sorteer logs op timestamp van nieuw naar oud
        logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        const logsTable = document.getElementById('refreshLogsTable').querySelector('tbody');
        logsTable.innerHTML = '';

        logs.forEach(log => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${new Date(log.timestamp).toLocaleString()}</td>
                <td colspan="4">${log.message}</td>
            `;
            logsTable.appendChild(row);
        });
    } catch (error) {
        console.error('Error loading logs:', error);
    }
}


document.querySelector('.tab-links a[href="#logsOverview"]').addEventListener('click', async () => {
    await loadLogs();
});
