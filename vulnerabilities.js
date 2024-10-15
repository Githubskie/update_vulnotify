document.addEventListener('DOMContentLoaded', async function() {
    await fetch('/match-cves', { method: 'POST' });  // Roept CVE-matching aan
    loadVulnerabilities();
});

async function loadVulnerabilities() {
    try {
        console.log('Fetching match results...');
        const responseMatchResults = await fetch('/match-results');
        if (!responseMatchResults.ok) throw new Error('Failed to fetch match results');
        const matchResults = await responseMatchResults.json();
        console.log('Match results:', matchResults);

        console.log('Fetching groups...');
        const responseGroups = await fetch('/groups');
        if (!responseGroups.ok) throw new Error('Failed to fetch groups');
        const groups = await responseGroups.json();
        console.log('Groups:', groups);

        const tabLinksContainer = document.querySelector('.tab-links');
        const tabContentContainer = document.querySelector('.tab-content');

        groups.forEach((group, index) => {
            console.log('Processing group:', group); // Debugging line

            const totalVulnerabilities = group.systems.reduce((count, system) => {
                if (!system._id) {
                    console.error('System ID is undefined for system:', system);
                    return count;
                }

                const systemIdStr = system._id.toString();
                const matchResult = matchResults.find(match => match.systemId === systemIdStr);
                return count + (matchResult ? matchResult.matchedCVEs.length : 0);
            }, 0);

            const tabLink = document.createElement('li');
            const tabAnchor = document.createElement('a');
            tabAnchor.href = `#tab${index}`;
            tabAnchor.innerHTML = `${group.name} <span class="vuln-count">(${totalVulnerabilities})</span>`;
            if (index === 0) tabAnchor.classList.add('active-tab');
            tabLink.appendChild(tabAnchor);
            tabLinksContainer.appendChild(tabLink);

            const tabContent = document.createElement('div');
            tabContent.id = `tab${index}`;
            tabContent.classList.add('tab-pane');
            if (index === 0) tabContent.classList.add('active');
            tabContent.innerHTML = generateGroupContent(group, matchResults);
            tabContentContainer.appendChild(tabContent);
        });

        document.querySelectorAll('.tab-links a').forEach(tab => {
            tab.addEventListener('click', function(e) {
                e.preventDefault();
                document.querySelector('.tab-links .active-tab').classList.remove('active-tab');
                document.querySelector('.tab-content .active').classList.remove('active');
                this.classList.add('active-tab');
                document.querySelector(this.getAttribute('href')).classList.add('active');
            });
        });

        document.querySelectorAll('.system-row').forEach(row => {
            row.addEventListener('click', function(event) {
                const target = event.target;
                if (!target.closest('.actions') && !target.classList.contains('cve-item')) {
                    const systemId = this.getAttribute('data-system-id');
                    const groupId = this.getAttribute('data-group-id');
                    const detailsRow = document.querySelector(`.cve-details[data-system-id="${systemId}"][data-group-id="${groupId}"]`);
                    if (detailsRow) {
                        detailsRow.style.display = detailsRow.style.display === 'none' ? 'table-row' : 'none';
                    }
                }
            });
        });

        document.querySelectorAll('.export-icon, .export-all-icon, .toggle-icon, .toggle-all-icon').forEach(icon => {
            icon.addEventListener('click', function(event) {
                event.stopPropagation();
                if (this.matches('.export-icon, .export-all-icon')) {
                    const groupId = this.dataset.groupId;
                    exportAllCves(groupId);
                } else if (this.matches('.toggle-icon, .toggle-all-icon')) {
                    this.textContent = this.textContent === 'toggle_on' ? 'toggle_off' : 'toggle_on';
                    this.classList.toggle('toggle-on');
                    this.classList.toggle('toggle-off');
                }
            });
        });

    } catch (error) {
        console.error('Error loading vulnerabilities:', error);
    }
}

function generateGroupContent(group, matchResults) {
    let content = `<div data-group-id="${group._id}"><table>
        <thead>
            <tr>
                <th>System</th>
                <th>Vulnerabilities</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>`;

    group.systems.forEach(system => {
        const systemIdStr = system._id.toString();
        const matchResult = matchResults.find(match => match.systemId === systemIdStr);
        const vulnerabilityCount = matchResult ? matchResult.matchedCVEs.length : 0;
        const cveList = matchResult ? matchResult.matchedCVEs.map(cve => `
            <div class="cve-item">
                <p><strong>${cve.cve_id}</strong> (${cve.severity})</p>
                <p><strong>Description:</strong> ${cve.description}</p>
                <p><strong>Published Date:</strong> ${new Date(cve.published_date).toLocaleDateString()}</p>
                <p><strong>Match Type:</strong> ${cve.matchType}</p>
                <p><a href="${cve.url}" target="_blank">${cve.url}</a></p>
            </div>
        `).join('') : '';

        content += `
            <tr class="system-row" data-system-id="${system._id}" data-group-id="${group._id}">
                <td>${system.hostname}</td>
                <td>${vulnerabilityCount}</td>
                <td class="actions">
                    <i class="material-icons export-icon" data-group-id="${group._id}">send</i>
                    <i class="material-icons toggle-icon ${group.autoEmail ? 'toggle-on' : 'toggle-off'}" data-group-id="${group._id}">
                        ${group.autoEmail ? 'toggle_on' : 'toggle_off'}
                    </i>
                </td>
            </tr>
            <tr class="cve-details" data-system-id="${system._id}" data-group-id="${group._id}" style="display: none;">
                <td colspan="3">${cveList}</td>
            </tr>`;
    });

    content += `</tbody></table>
    <div class="group-actions">
        <i class="material-icons export-all-icon" data-group-id="${group._id}">send</i>
        <i class="material-icons toggle-all-icon ${group.autoEmail ? 'toggle-on' : 'toggle-off'}" data-group-id="${group._id}">
            ${group.autoEmail ? 'toggle_on' : 'toggle_off'}
        </i>
    </div></div>`;
    return content;
}

async function exportAllCves(groupId) {
    showLoadingOverlay();
    try {
        const response = await fetch(`/export-all-cves/${groupId}`, { method: 'POST' });
        if (response.ok) {
            alert('All CVEs exported successfully');
        } else {
            alert('Error exporting CVEs');
        }
    } catch (error) {
        console.error('Error exporting CVEs:', error);
        alert('Error exporting CVEs');
    } finally {
        hideLoadingOverlay();
    }
}
