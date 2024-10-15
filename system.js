let isEditing = false;
let editingSystemId = null;
let allGroups = [];

// Voeg deze code toe in het begin van je script, bijvoorbeeld na DOMContentLoaded
document.addEventListener('DOMContentLoaded', function () {
    // Laad alle groepen en sla ze op in allGroups
    fetch('/groups')
        .then(response => response.json())
        .then(groups => {
            allGroups = groups;
            console.log('All Groups:', allGroups); // Log om te bevestigen dat groepen correct worden geladen
            loadSystems(); // Zorg ervoor dat loadSystems wordt aangeroepen nadat allGroups is geladen
        })
        .catch(error => console.error('Error loading groups:', error));

    const addNewEntryButton = document.getElementById('addNewEntry');
    if (addNewEntryButton) {
        addNewEntryButton.addEventListener('click', function () {
            showAddSystemForm();
        });
    }

    const exportDataButton = document.getElementById('exportData');
    if (exportDataButton) {
        exportDataButton.addEventListener('click', function () {
            const exportButtonsContainer = document.getElementById('exportButtonsContainer');
            const tableOptionsBar = document.querySelector('.table-options-bar');

            if (exportButtonsContainer.style.display === 'none' || exportButtonsContainer.classList.contains('hidden')) {
                exportButtonsContainer.style.display = 'flex';
                exportButtonsContainer.classList.remove('hidden');
                exportButtonsContainer.classList.add('show');

                // Pas de breedte van de table-options-bar aan zodat de knoppen passen
                tableOptionsBar.style.width = 'auto';
            } else {
                exportButtonsContainer.style.display = 'none';
                exportButtonsContainer.classList.remove('show');
                exportButtonsContainer.classList.add('hidden');

                // Herstel de oorspronkelijke breedte van de table-options-bar
                tableOptionsBar.style.width = '';
            }
        });
    }

    const searchBox = document.getElementById('searchBox');
    if (searchBox) {
        searchBox.addEventListener('keyup', function () {
            const table = $('#systemList').DataTable();
            table.search(this.value).draw();
        });
    }

    const systemForm = document.getElementById('systemForm');
    if (systemForm) {
        systemForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            await submitSystemForm();
        });
    }
});

document.addEventListener('click', function(event) {
    if (event.target.classList.contains('close-button')) {
        const modal = event.target.closest('.modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }
});

function loadSystems() {
    fetch('/systems')
        .then(response => response.json())
        .then(systems => {
            console.log('Loaded systems:', systems); // Controleer of de systemen zijn geladen
            populateTable(systems);
            initializeDataTable();

            // Plaats hier je forEach loop om de groepen te loggen
            systems.forEach(system => {
                console.log('Groups for system:', system.customId, system.groups);  // Log de groepen om te controleren of `name` beschikbaar is

                const groupsHtml = (system.groups || []).map(groupId => {
                    // Zoek de naam van de groep in allGroups array
                    const group = allGroups.find(g => g._id === groupId);
                    return group ? group.name : 'Unknown Group';
                }).join(', ');

                console.log('Groups HTML:', groupsHtml);
            });
        })
        .catch(error => {
            showNotification('Failed to fetch systems', 'error');
            console.error('Failed to fetch systems', error);
        });
}


function initializeDataTable() {
    if ($.fn.DataTable.isDataTable('#systemList')) {
        $('#systemList').DataTable().destroy();
    }

    const table = $('#systemList').DataTable({
        responsive: true,
        dom: '<"top"i>rt<"bottom"flp><"clear">',
        buttons: [
            {
                extend: 'copy',
                text: 'Copy',
                className: 'btn btn-default'
            },
            {
                extend: 'csv',
                text: 'CSV',
                className: 'btn btn-default'
            },
            {
                extend: 'excel',
                text: 'Excel',
                className: 'btn btn-default'
            },
            {
                extend: 'pdf',
                text: 'PDF',
                className: 'btn btn-default'
            },
            {
                extend: 'print',
                text: 'Print',
                className: 'btn btn-default'
            }
        ],
        pageLength: 10,
        lengthMenu: [[10, 25, 50, -1], [10, 25, 50, "All"]],
        colReorder: true,
        select: false,
        order: [],
        columnDefs: [
            { orderable: false, targets: [0, 7] }
        ],
        drawCallback: function () {
            const infoText = $('.dataTables_info').text();
            if ($('.table-info').length === 0) {
                $('.table-options-bar').prepend('<div class="table-info"></div>');
            }
            $('.table-info').text(infoText);
        },
            initComplete: function () {
                // Hide default search box and buttons
                $('.dataTables_filter').hide();
                $('.dt-buttons').hide();

                // Move the buttons container to the exportButtonsContainer
                const exportButtonsContainer = document.getElementById('exportButtonsContainer');
                const buttons = this.api().buttons().container();

                // Clear the container first
                exportButtonsContainer.innerHTML = '';

                // Append the actual buttons container to maintain functionality
                $(exportButtonsContainer).append(buttons);

                // Make sure the buttons are visible
                $(buttons).css('display', 'flex');
                $(buttons).css('gap', '10px'); // Add spacing between buttons if necessary
            }
    });

    // Event listener for expanding rows
    $('#systemList tbody').on('click', 'td.details-control', function () {
        const tr = $(this).closest('tr');
        const row = table.row(tr);

        if (row.child.isShown()) {
            row.child.hide();
            tr.removeClass('shown');
            $(this).find('.material-icons').text('expand_more');
        } else {
            const rowData = {
                hostname: tr.data('hostname'),
                platform: tr.data('platform'),
                platformVersion: tr.data('platformversion'),
                architecture: tr.data('architecture'),
                ipAddress: tr.data('ipaddress'),
                cpu: tr.data('cpu'),
                installedSoftware: tr.data('installedsoftware'),
                keywords: tr.data('keywords')
            };
            row.child(format(rowData)).show();
            tr.addClass('shown');
            $(this).find('.material-icons').text('expand_less');
        }
    });
}

async function loadAndSelectGroups(systemId) {
    try {
        const response = await fetch(`/systems/${systemId}/groups`);
        if (response.ok) {
            const groups = await response.json();
            const checkboxContainer = document.getElementById('systemCheckboxes');
            checkboxContainer.innerHTML = '';

            groups.forEach(group => {
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.classList.add('group-checkbox');
                checkbox.dataset.groupId = group._id;
                checkbox.id = `group-${group._id}`;
                checkbox.name = 'groups';
                checkbox.value = group._id;
                if (group.isSelected) {
                    checkbox.checked = true;
                }

                const label = document.createElement('label');
                label.htmlFor = checkbox.id;
                label.textContent = group.name;

                const div = document.createElement('div');
                div.classList.add('checkbox-group');
                div.appendChild(checkbox);
                div.appendChild(label);

                checkboxContainer.appendChild(div);
            });
        } else {
            console.error('Failed to load groups for system');
        }
    } catch (error) {
        console.error('Error loading groups for system:', error);
    }
}

function format(rowData) {
    const groups = rowData.groups || [];
    const groupCheckboxes = allGroups.map(group => {
        const isChecked = groups.includes(group._id) ? 'checked' : '';
        return `
            <label>
                <input type="checkbox" class="group-checkbox" data-group-id="${group._id}" ${isChecked}>
                ${group.name}
            </label>
        `;
    }).join('<br>');

    return `
        <table cellpadding="5" cellspacing="0" border="0" style="padding-left:50px;">
            <tr>
                <td>Hostname:</td>
                <td>${rowData.hostname || 'Unknown'}</td>
            </tr>
            <tr>
                <td>Platform:</td>
                <td>${rowData.platform || 'Unknown'} ${rowData.platformVersion || ''}</td>
            </tr>
            <tr>
                <td>Architecture:</td>
                <td>${rowData.architecture || 'Unknown'}</td>
            </tr>
            <tr>
                <td>IP Address:</td>
                <td>${rowData.ipAddress || 'Unknown'}</td>
            </tr>
            <tr>
                <td>CPU:</td>
                <td>${rowData.cpu || 'Unknown'}</td>
            </tr>
        </table>
    `;
}

$('#systemList tbody').on('change', '.group-checkbox', async function () {
    const systemId = $(this).closest('tr').data('id');  // Dit zou de customId moeten zijn
    const groupId = $(this).data('group-id');
    const isChecked = $(this).is(':checked');

    if (!systemId) {
        console.error('System ID is undefined');
        return;
    }

    try {
        // Haal de huidige groepen van het systeem op
        const response = await fetch(`/systems/${systemId}`);
        if (!response.ok) {
            console.error('Failed to fetch system details');
            return;
        }

        const system = await response.json();

        let updatedGroups = system.groups || [];

        if (isChecked) {
            // Voeg de groep toe als deze niet bestaat
            if (!updatedGroups.includes(groupId)) {
                updatedGroups.push(groupId);
            }
        } else {
            // Verwijder de groep als deze bestaat
            updatedGroups = updatedGroups.filter(id => id !== groupId);
        }

        // Update de groepen van het systeem en update ook de bijbehorende groepen
        const updateResponse = await fetch(`/systems/${systemId}/groups`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ groups: updatedGroups }),
        });

        if (updateResponse.ok) {
            console.log('System groups updated successfully');
        } else {
            console.error('Failed to update system groups');
        }

    } catch (error) {
        console.error('Failed to update system groups:', error);
    }
});


function initializeRowExpansion(table) {
    $('#systemList tbody').on('click', 'td.details-control', function () {
        const tr = $(this).closest('tr');
        const row = table.row(tr);

        if (row.child.isShown()) {
            row.child.hide();
            tr.removeClass('shown');
            $(this).find('.material-icons').text('expand_more');
        } else {
            const rowData = row.data();
            const systemId = rowData ? rowData.dataId : null; // Zorg ervoor dat hier customId wordt opgehaald

            if (systemId) {
                row.child(format(rowData)).show();
                tr.addClass('shown');
                $(this).find('.material-icons').text('expand_less');
            } else {
                console.error('No system ID found for the selected row.');
            }
        }
    });
}


async function loadManageSystemsTable() {
    try {
        const response = await fetch('/systems');
        if (!response.ok) {
            console.error('Failed to fetch systems');
            return;
        }
        const systems = await response.json();

        const groupsResponse = await fetch('/groups');
        if (!groupsResponse.ok) {
            console.error('Failed to fetch groups');
            return;
        }
        const groups = await groupsResponse.json();

        const tableBody = document.querySelector('#manageSystemsTable tbody');
        tableBody.innerHTML = '';

        systems.forEach(system => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${system.customId}</td>
                <td>${system.hostname}</td>
                <td>
                    <select class="group-select" data-system-id="${system._id}">
                        <option value="">No Group</option>
                        ${groups.map(group => `
                            <option value="${group._id}" ${system.groups && system.groups.includes(group._id) ? 'selected' : ''}>
                                ${group.name}
                            </option>`).join('')}
                    </select>
                </td>
            `;
            tableBody.appendChild(row);
        });

        document.querySelectorAll('.group-select').forEach(select => {
            select.addEventListener('change', async function () {
                const systemId = this.dataset.systemId;
                const groupId = this.value;
                await updateSystemGroup(systemId, groupId);
            });
        });
    } catch (error) {
        console.error('Error loading systems or groups:', error);
    }
}

async function updateSystem(customId) {
    try {
        const response = await fetch(`/systems/${customId}`);
        if (!response.ok) {
            showNotification('Failed to fetch system details', 'error');
            console.error('Failed to fetch system details:', response.statusText);
            return;
        }
        const system = await response.json();

        document.getElementById('platform').value = system.platform;
        document.getElementById('platformVersion').value = system.platformVersion;
        document.getElementById('architecture').value = system.architecture;
        document.getElementById('hostname').value = system.hostname;
        document.getElementById('ipAddress').value = system.ipAddress;
        document.getElementById('cpu').value = system.cpu;
        document.getElementById('keywords').value = system.keywords.join(', ');

        const softwareListDiv = document.getElementById('softwareList');
        softwareListDiv.innerHTML = '';
        system.installedSoftware.forEach(software => {
            addSoftwareField(software.name, software.version);
        });

        showAddSystemForm();
        document.getElementById('submitBtn').textContent = 'Save Edit';
        isEditing = true;
        editingSystemId = system.customId;

        toggleCancelButton(true);
    } catch (error) {
        showNotification('Error updating system', 'error');
        console.error('Error updating system:', error);
    }
}

async function updateSystemGroup(systemId, groupId) {
    try {
        const response = await fetch(`/systems/${systemId}/groups`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ groups: groupId ? [groupId] : [] })
        });

        if (response.ok) {
            console.log('System group updated successfully');
        } else {
            console.error('Failed to update system group');
        }
    } catch (error) {
        console.error('Error updating system group:', error);
    }
}

function populateTable(systems) {
    console.log('Systems:', systems); // Controleer de ingeladen systemen
    const tableBody = document.querySelector('#systemList tbody');
    tableBody.innerHTML = '';

    systems.forEach(system => {
        const softwareHtml = (system.installedSoftware || []).map(software => `${escapeHtml(software.name)} v${escapeHtml(software.version)}`).join('<br>');
        const groupsHtml = (system.groups || []).map(group => escapeHtml(group.name)).join(', ');  // Haal de namen van de groepen op

        // Zorg ervoor dat je 'customId' correct gebruikt voor het 'data-id' attribuut zonder extra tekst
        const row = `
            <tr data-id="${escapeHtml(system.customId)}"
                data-hostname="${escapeHtml(system.hostname)}"
                data-platform="${escapeHtml(system.platform)}"
                data-platformversion="${escapeHtml(system.platformVersion)}"
                data-architecture="${escapeHtml(system.architecture)}"
                data-ipaddress="${escapeHtml(system.ipAddress || '')}"
                data-cpu="${escapeHtml(system.cpu)}"
                data-installedsoftware="${escapeHtml(softwareHtml || '')}"
                data-groups="${escapeHtml(groupsHtml || '')}"
                data-keywords="${escapeHtml(system.keywords ? system.keywords.join(', ') : '')}">
                <td class="details-control"><i class="material-icons">expand_more</i></td>
                <td>${escapeHtml(system.customId)}</td>
                <td>${escapeHtml(system.hostname)}</td>
                <td>${escapeHtml(system.platform)} ${escapeHtml(system.platformVersion)}</td>
                <td>${escapeHtml(system.architecture)}</td>
                <td>${escapeHtml(system.cpu)}</td>
                <td class="ellipsis">${softwareHtml}</td>
                <td>${groupsHtml || 'No groups assigned'}</td>
                <td>
                    <i class="material-icons action-icon edit" onclick="editSystem('${escapeHtml(system.customId)}')">edit</i>
                    <i class="material-icons action-icon delete" onclick="deleteSystem('${escapeHtml(system.customId)}')">delete</i>
                </td>
            </tr>
        `;
        tableBody.insertAdjacentHTML('beforeend', row);
        console.log('Generated row with customId:', system.customId);
    });
}






// Functie om speciale karakters in strings te escapen
function escapeHtml(str) {
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
}

function showTab(event, tabId) {
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => content.style.display = 'none');

    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => button.classList.remove('active'));

    document.getElementById(tabId).style.display = 'block';
    event.currentTarget.classList.add('active');

    console.log(`Tab with ID ${tabId} is now visible.`);

    if (tabId === 'manageGroupSystemsSection') {
        loadGroupsForSelection();
    }
}


function loadGroupsForSelection() {
    fetch('/groups')
        .then(response => response.json())
        .then(groups => {
            const select = document.getElementById('groupSelect');
            select.innerHTML = groups.map(group => `<option value="${group.customId}">${group.name}</option>`).join('');
            if (groups.length > 0) {
                loadSystemsForTable(groups[0].customId); // Load systems for the first group by default
            }
        })
        .catch(error => console.error('Failed to load groups', error));
}



function showAddSystemForm() {
    const formModal = document.getElementById('systemFormModal');
    console.log('Opening modal:', formModal); // Voeg deze lijn toe
    if (formModal) {
        formModal.style.display = 'block';
    }
}

function closeModal(modalId) {
    const formModal = document.getElementById(modalId);
    console.log('Closing modal:', formModal); // Voeg deze lijn toe
    if (formModal) {
        formModal.style.display = 'none';
    } else {
        console.error(`Modal element with ID ${modalId} not found`);
    }
}

async function submitSystemForm() {
    console.log('Submitting form...');

    const systemData = {
        platform: document.getElementById('platform').value,
        platformVersion: document.getElementById('platformVersion').value,
        architecture: document.getElementById('architecture').value,
        hostname: document.getElementById('hostname').value,
        ipAddress: document.getElementById('ipAddress').value,
        cpu: document.getElementById('cpu').value,
        installedSoftware: getSoftwareList(),
        keywords: parseKeywords(document.getElementById('keywords').value)
    };

    const endpoint = isEditing ? `/systems/${editingSystemId}` : '/systems';
    const method = isEditing ? 'PUT' : 'POST';

    console.log('Endpoint:', endpoint);
    console.log('Method:', method);
    console.log('Data:', systemData);

    try {
        const response = await fetch(endpoint, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(systemData)
        });

        if (response.ok) {
            console.log('System saved successfully');

            // Refresh de pagina na succesvol opslaan
            location.reload();  // Dit zal de pagina verversen
        } else {
            console.error('Failed to save system');
        }
    } catch (error) {
        console.error('Error saving system:', error);
    }
}

function updateTableRow(system) {
    const table = $('#systemList').DataTable();
    const row = table.row($(`tr[data-id='${system.customId}']`)).node();

    if (row) {
        // Update de rijgegevens
        const softwareHtml = (system.installedSoftware || []).map(software => `${software.name} v${software.version}`).join('<br>');
        const groupsHtml = (system.groups || []).map(groupId => {
            const group = allGroups.find(g => g._id === groupId);
            return group ? group.name : 'Unknown Group';
        }).join(', ');

        $(row).attr({
            'data-id': system.customId,
            'data-hostname': system.hostname,
            'data-platform': system.platform,
            'data-platformVersion': system.platformVersion,
            'data-architecture': system.architecture,
            'data-ipAddress': system.ipAddress,
            'data-cpu': system.cpu,
            'data-installedSoftware': softwareHtml,
            'data-groups': groupsHtml,
            'data-keywords': (system.keywords || []).join(', ')
        });

        $(row).html(`
            <td class="details-control"><i class="material-icons">expand_more</i></td>
            <td>${system.customId}</td>
            <td>${system.hostname}</td>
            <td>${system.platform} ${system.platformVersion}</td>
            <td>${system.architecture}</td>
            <td>${system.cpu}</td>
            <td class="ellipsis">${softwareHtml}</td>
            <td>${groupsHtml || 'No groups assigned'}</td>
            <td>
                <i class="material-icons action-icon edit" onclick="editSystem('${system.customId}')">edit</i>
                <i class="material-icons action-icon delete" onclick="deleteSystem('${system.customId}')">delete</i>
            </td>
        `);

        table.row(row).invalidate().draw(false);  // Werk de rij bij in de datatable
    } else {
        console.error(`Row with customId ${system.customId} not found`);
    }
}

function addTableRow(system) {
    const table = $('#systemList').DataTable();
    const softwareHtml = (system.installedSoftware || []).map(software => `${software.name} v${software.version}`).join('<br>');

    // Zorg ervoor dat je het juiste aantal kolommen toevoegt voor elke rij
    const rowNode = table.row.add([
        '<i class="material-icons details-control">expand_more</i>',  // Kolom 1
        system.customId,                                              // Kolom 2
        system.hostname,                                              // Kolom 3
        `${system.platform} ${system.platformVersion}`,               // Kolom 4
        system.architecture,                                          // Kolom 5
        system.cpu,                                                   // Kolom 6
        `<span class="ellipsis">${softwareHtml}</span>`,              // Kolom 7
        `<i class="material-icons action-icon edit" onclick="editSystem('${system.customId}')">edit</i>
         <i class="material-icons action-icon delete" onclick="deleteSystem('${system.customId}')">delete</i>`  // Kolom 8
    ]).draw(false).node();

    // Voeg de juiste data-attributes toe aan de rij
    $(rowNode).attr({
        'data-id': system.customId,
        'data-hostname': system.hostname,
        'data-platform': system.platform,
        'data-platformVersion': system.platformVersion,
        'data-architecture': system.architecture,
        'data-ipAddress': system.ipAddress,
        'data-cpu': system.cpu,
        'data-installedSoftware': softwareHtml,
        'data-keywords': (system.keywords || []).join(', ')
    });

    // Voeg klikfunctionaliteit toe aan de expand-knop
    $(rowNode).find('.details-control').click(function () {
        const tr = $(this).closest('tr');
        const row = table.row(tr);

        if (row.child.isShown()) {
            row.child.hide();
            tr.removeClass('shown');
            $(this).find('.material-icons').text('expand_more');
        } else {
            row.child(format(tr.data())).show();
            tr.addClass('shown');
            $(this).find('.material-icons').text('expand_less');
        }
    });
}

async function editSystem(customId) {
    try {
        const response = await fetch(`/systems/${customId}`);
        if (!response.ok) {
            showNotification('Failed to fetch system details', 'error');
            console.error('Failed to fetch system details:', response.statusText);
            return;
        }
        const system = await response.json();

        document.getElementById('platform').value = system.platform;
        document.getElementById('platformVersion').value = system.platformVersion;
        document.getElementById('architecture').value = system.architecture;
        document.getElementById('hostname').value = system.hostname;
        document.getElementById('ipAddress').value = system.ipAddress;
        document.getElementById('cpu').value = system.cpu;
        document.getElementById('keywords').value = system.keywords.join(', ');

        const softwareListDiv = document.getElementById('softwareList');
        softwareListDiv.innerHTML = '';
        system.installedSoftware.forEach(software => {
            addSoftwareField(software.name, software.version);
        });

        showAddSystemForm();
        document.getElementById('submitBtn').textContent = 'Save Edit';
        isEditing = true;
        editingSystemId = system.customId;

        await loadAndSelectGroups(system.customId);

        toggleCancelButton(true);
    } catch (error) {
        showNotification('Error updating system', 'error');
        console.error('Error updating system:', error);
    }
}

async function deleteSystem(customId) {
    if (!confirm("Are you sure you want to delete this system?")) return;

    try {
        const response = await fetch(`/systems/${customId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            console.log('System deleted');
            const table = $('#systemList').DataTable();
            table.row($(`tr[data-id='${customId}']`)).remove().draw();
            showNotification('System deleted successfully', 'success');
        } else {
            throw new Error('Failed to delete system');
        }
    } catch (error) {
        showNotification('Error deleting system', 'error');
        console.error(error);
    }
}

function parseKeywords(keywords) {
    return keywords.toLowerCase().split(/\s*,\s*|\s+/).filter(Boolean);
}

function toggleCancelButton(show) {
    const cancelButton = document.getElementById('cancelBtn');
    cancelButton.style.display = show ? 'inline-block' : 'none';
}

function cancelEdit() {
    resetForm();
    closeModal();
}

function resetForm() {
    document.getElementById('systemForm').reset();
    document.getElementById('submitBtn').textContent = 'Add';
    isEditing = false;
    editingSystemId = null;
    const softwareListDiv = document.getElementById('softwareList');
    softwareListDiv.innerHTML = '';
    addSoftwareField();
    toggleCancelButton(false);
    clearPlatformAndVersion();
}

function clearPlatformAndVersion() {
    document.getElementById('platform').value = '';
    document.getElementById('platformVersion').value = '';
}

function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerText = message;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

function addSoftwareField(name = '', version = '') {
    const list = document.getElementById('softwareList');
    const newEntry = document.createElement('div');
    newEntry.classList.add('software-entry');
    newEntry.innerHTML = `
        <input type="text" class="software-name" placeholder="Software Name" value="${name}">
        <input type="text" class="software-version" placeholder="Version" value="${version}">
    `;
    list.appendChild(newEntry);
}

function getSoftwareList() {
    const entries = document.querySelectorAll('.software-entry');
    return Array.from(entries).map(entry => {
        const name = entry.querySelector('.software-name').value.trim();
        const version = entry.querySelector('.software-version').value.trim();
        // Controleer alleen of de naam niet leeg is
        return { name, version: version || 'N/A' };  // Gebruik 'N/A' als er geen versie is ingevoerd
    }).filter(software => software.name);  // Sla alleen software met een naam op
}
