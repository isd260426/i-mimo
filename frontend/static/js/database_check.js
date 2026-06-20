/**
 * Database Check (Daily Checklist) Module
 */

let checklistDataCache = {};

document.addEventListener('DOMContentLoaded', function() {
    initGridHeaders();
    initGridRows();

    // Set default month/year for checklist filters
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const formatLocalYMD = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    const todayStr = formatLocalYMD(today);
    const yesterdayStr = formatLocalYMD(yesterday);

    const monthSelect = document.getElementById('filterMonth');
    const yearSelect = document.getElementById('filterYear');
    if (monthSelect) monthSelect.value = today.getMonth() + 1;
    if (yearSelect) yearSelect.value = today.getFullYear();
    
    // Set default date and constraints in checklist entry form
    const checkDateInput = document.getElementById('checkDate');
    if (checkDateInput) {
        checkDateInput.value = todayStr;
        checkDateInput.min = yesterdayStr;
        checkDateInput.max = todayStr;
    }

    // Bind checklist filter changes
    if (monthSelect) monthSelect.addEventListener('change', loadChecklistGrid);
    if (yearSelect) yearSelect.addEventListener('change', loadChecklistGrid);

    // Form Submit for Checklist
    const checkForm = document.getElementById('checklistForm');
    if (checkForm) {
        checkForm.addEventListener('submit', function(e) {
            e.preventDefault();
            saveChecklist();
        });
    }
});

function initGridHeaders() {
    const grids = ['masterChecklistGrid', 'slaveChecklistGrid'];
    grids.forEach(id => {
        const tr = document.querySelector(`#${id} thead tr`);
        if (tr) {
            // Remove existing days just in case
            tr.querySelectorAll('.day-col').forEach(el => el.remove());
            // Add days 1 to 31
            for (let d = 1; d <= 31; d++) {
                const th = document.createElement('th');
                th.className = 'day-col';
                th.setAttribute('data-day', d);
                th.textContent = d;
                tr.appendChild(th);
            }
        }
    });
}

function initGridRows() {
    const params = [
        { label: 'Kondisi CPU & RAM Server Database - Pagi', name: 'cpu_ram_status', session: 'pagi', id: 1 },
        { label: 'Kondisi CPU & RAM Server Database - Sore', name: 'cpu_ram_status', session: 'sore', id: 2, indent: true },
        { label: 'Status Space Disk Server Database - Pagi', name: 'disk_status', session: 'pagi', id: 3 },
        { label: 'Status Space Disk Server Database - Sore', name: 'disk_status', session: 'sore', id: 4, indent: true },
        { label: 'Status Replication Database Master Slave - Pagi', name: 'replication_status', session: 'pagi', id: 5 },
        { label: 'Status Replication Database Master Slave - Sore', name: 'replication_status', session: 'sore', id: 6, indent: true },
        { label: 'Backup Database Daily - Pagi', name: 'backup_status', session: 'pagi', id: 7 },
        { label: 'Backup Database Daily - Sore', name: 'backup_status', session: 'sore', id: 8, indent: true }
    ];

    const bodies = ['masterChecklistGridBody', 'slaveChecklistGridBody'];
    bodies.forEach(bodyId => {
        const body = document.getElementById(bodyId);
        if (!body) return;

        body.innerHTML = '';
        params.forEach(p => {
            const tr = document.createElement('tr');
            tr.setAttribute('data-param', `${p.name}_${p.session}`);

            const tdNo = document.createElement('td');
            tdNo.textContent = p.id;
            tr.appendChild(tdNo);

            const tdLabel = document.createElement('td');
            tdLabel.className = 'text-start';
            if (p.indent) {
                tdLabel.className += ' font-italic text-muted';
                tdLabel.style.paddingLeft = '20px';
            }
            tdLabel.textContent = p.label;
            tr.appendChild(tdLabel);

            // Add cells 1 to 31
            for (let d = 1; d <= 31; d++) {
                const td = document.createElement('td');
                td.className = 'checklist-cell';
                td.setAttribute('data-day', d);
                td.setAttribute('data-session', p.session);
                td.setAttribute('data-param', p.name);
                td.innerHTML = '<span class="text-muted"><i class="bi bi-dash"></i></span>';
                tr.appendChild(td);
            }
            body.appendChild(tr);
        });
    });
}

function isDateTodayOrYesterday(y, m, d) {
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const formatLocalYMD = (date) => {
        const yearVal = date.getFullYear();
        const monthVal = String(date.getMonth() + 1).padStart(2, '0');
        const dayVal = String(date.getDate()).padStart(2, '0');
        return `${yearVal}-${monthVal}-${dayVal}`;
    };

    const todayStr = formatLocalYMD(today);
    const yesterdayStr = formatLocalYMD(yesterday);

    return (dateStr === todayStr || dateStr === yesterdayStr);
}

window.loadChecklistGrid = function() {
    const filterM = document.getElementById('filterMonth');
    const filterY = document.getElementById('filterYear');
    if (!filterM || !filterY) return;

    const month = filterM.value;
    const year = filterY.value;

    // Reset grid cells
    document.querySelectorAll('.checklist-cell').forEach(cell => {
        cell.innerHTML = '<span class="text-muted"><i class="bi bi-dash"></i></span>';
        cell.className = 'checklist-cell';
        cell.removeAttribute('data-bs-toggle');
        cell.removeAttribute('data-bs-html');
        cell.removeAttribute('title');
        
        const tooltipInstance = bootstrap.Tooltip.getInstance(cell);
        if (tooltipInstance) tooltipInstance.dispose();
    });

    // Configure cells event handler
    document.querySelectorAll('.checklist-cell').forEach(cell => {
        const day = cell.getAttribute('data-day');
        const isAllowed = isDateTodayOrYesterday(year, month, day);

        if (!isAllowed) {
            cell.style.cursor = 'default';
            cell.onclick = null;
            cell.classList.add('disabled-cell');
        } else {
            cell.style.cursor = 'pointer';
            cell.classList.remove('disabled-cell');
            cell.onclick = function() {
                const session = cell.getAttribute('data-session');
                const param = cell.getAttribute('data-param');
                const isMaster = cell.closest('table').id === 'masterChecklistGrid';
                const serverType = isMaster ? 'master' : 'slave';
                
                const monthStr = String(month).padStart(2, '0');
                const dayStr = String(day).padStart(2, '0');
                const dateStr = `${year}-${monthStr}-${dayStr}`;

                const cachedRecord = checklistDataCache[serverType] && checklistDataCache[serverType][session] && checklistDataCache[serverType][session][day];
                if (cachedRecord) {
                    populateChecklistForm(cachedRecord, serverType);
                } else {
                    document.getElementById('checkDate').value = dateStr;
                    document.getElementById('serverType').value = serverType;
                    document.getElementById('checkSession').value = session;
                    document.getElementById('cpuRamStatus').value = 'Normal';
                    document.getElementById('diskStatus').value = 'Normal';
                    document.getElementById('replicationStatus').value = serverType === 'master' ? 'N/A' : 'Active';
                    document.getElementById('backupStatus').value = 'Success';
                    document.getElementById('checklistNotes').value = '';
                    
                    document.getElementById('formChecklistTitle').innerHTML = `<i class="bi bi-pencil-square text-teal me-2"></i>Pengisian Checklist Baru (Server ${serverType.toUpperCase()}, Sesi: ${session.toUpperCase()}, Tanggal: ${dateStr})`;
                    
                    const formCollapse = bootstrap.Collapse.getOrCreateInstance(document.getElementById('checklistFormCollapse'));
                    formCollapse.show();
                    document.getElementById('checklistFormCollapse').scrollIntoView({ behavior: 'smooth' });
                }
            };
        }
    });

    // Fetch live data from REST API
    fetch(window.getApiUrl(`/checklists?month=${month}&year=${year}`), {
        headers: window.getAuthHeader()
    })
    .then(response => {
        if (response.status === 401) {
            window.handleLogout();
            throw new Error('Unauthorized');
        }
        return response.json();
    })
    .then(result => {
        if (result.success) {
            // Structurize Mongo array response to matched type-session-day cache map
            const cache = {
                master: { pagi: {}, sore: {} },
                slave: { pagi: {}, sore: {} }
            };

            (result.data || []).forEach(record => {
                const date = new Date(record.check_date);
                const day = date.getDate();
                const type = record.server_type;
                const session = record.session;
                
                if (cache[type] && cache[type][session]) {
                    cache[type][session][day] = record;
                }
            });

            checklistDataCache = cache;
            renderChecklistData(cache);
        }
    })
    .catch(error => console.error('Error loading checklists:', error));
};

function renderChecklistData(data) {
    const params = ['cpu_ram_status', 'disk_status', 'replication_status', 'backup_status'];
    const filterM = document.getElementById('filterMonth');
    const filterY = document.getElementById('filterYear');
    if (!filterM || !filterY) return;
    const month = filterM.value;
    const year = filterY.value;

    ['master', 'slave'].forEach(type => {
        const typeData = data[type] || {};
        const gridId = type === 'master' ? 'masterChecklistGrid' : 'slaveChecklistGrid';
        
        ['pagi', 'sore'].forEach(session => {
            const sessionData = typeData[session] || {};
            
            Object.keys(sessionData).forEach(day => {
                const dayNum = parseInt(day);
                const record = sessionData[day];
                
                params.forEach(paramName => {
                    const cell = document.querySelector(`#${gridId} tbody tr td[data-day="${dayNum}"][data-session="${session}"][data-param="${paramName}"]`);
                    if (cell) {
                        const val = record[paramName];
                        let iconHtml = '';
                        let cellClass = 'checklist-cell';
                        
                        if (val === 'Normal' || val === 'Active' || val === 'Success') {
                            iconHtml = '<span class="text-success"><i class="bi bi-check-lg"></i></span>';
                            cellClass = 'checklist-cell status-ok';
                        } else if (val === 'Warning' || val === 'Lag') {
                            iconHtml = '<span class="text-warning"><i class="bi bi-exclamation-triangle-fill"></i></span>';
                            cellClass = 'checklist-cell status-warning';
                        } else if (val === 'Critical' || val === 'Error' || val === 'Failed') {
                            iconHtml = '<span class="text-danger"><i class="bi bi-x-lg"></i></span>';
                            cellClass = 'checklist-cell status-error';
                        } else if (val === 'N/A') {
                            iconHtml = '<span class="text-muted small">N/A</span>';
                            cellClass = 'checklist-cell status-na';
                        }

                        if (!isDateTodayOrYesterday(year, month, dayNum)) {
                            cellClass += ' disabled-cell';
                        }

                        cell.className = cellClass;
                        cell.innerHTML = iconHtml;
                        
                        // Tooltip
                        const notesEscaped = escapeHtml(record.notes || '-');
                        const dateFormatted = record.check_date;
                        const sessionFormatted = record.session.toUpperCase();
                        const userEscaped = escapeHtml(record.created_by || 'System');
                        
                        let tooltipContent = `
                            <div class="text-start">
                                <strong>Tanggal:</strong> ${dateFormatted}<br>
                                <strong>Sesi:</strong> ${sessionFormatted}<br>
                                <strong>CPU/RAM:</strong> ${record.cpu_ram_status}<br>
                                <strong>Disk Space:</strong> ${record.disk_status}<br>
                                <strong>Replikasi:</strong> ${record.replication_status}<br>
                                <strong>Backup:</strong> ${record.backup_status}<br>
                                <strong>Catatan:</strong> ${notesEscaped}<br>
                                <strong>Petugas:</strong> ${userEscaped}
                        `;
                        if (record.updated_by) {
                            tooltipContent += `<br><strong>Updater:</strong> ${escapeHtml(record.updated_by)}`;
                        }
                        if (record.updated_at) {
                            const updateDate = new Date(record.updated_at).toLocaleString('id-ID');
                            tooltipContent += `<br><strong>Updated At:</strong> ${updateDate}`;
                        }
                        tooltipContent += `</div>`;

                        cell.setAttribute('data-bs-toggle', 'tooltip');
                        cell.setAttribute('data-bs-html', 'true');
                        cell.setAttribute('title', tooltipContent);
                    }
                });
            });
        });
    });

    const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
    [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));
}

function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function populateChecklistForm(record, type) {
    document.getElementById('checkDate').value = record.check_date;
    document.getElementById('serverType').value = type;
    document.getElementById('checkSession').value = record.session;
    document.getElementById('cpuRamStatus').value = record.cpu_ram_status;
    document.getElementById('diskStatus').value = record.disk_status;
    document.getElementById('replicationStatus').value = record.replication_status;
    document.getElementById('backupStatus').value = record.backup_status;
    document.getElementById('checklistNotes').value = record.notes || '';
    
    document.getElementById('formChecklistTitle').innerHTML = `<i class="bi bi-pencil-square text-teal me-2"></i>Edit Checklist (Server ${type.toUpperCase()}, Sesi: ${record.session.toUpperCase()}, Tanggal: ${record.check_date})`;
    
    const formCollapse = bootstrap.Collapse.getOrCreateInstance(document.getElementById('checklistFormCollapse'));
    formCollapse.show();
    document.getElementById('checklistFormCollapse').scrollIntoView({ behavior: 'smooth' });
}

window.resetChecklistForm = function() {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const formatLocalYMD = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    const todayStr = formatLocalYMD(today);
    const yesterdayStr = formatLocalYMD(yesterday);

    const checkDateInput = document.getElementById('checkDate');
    if (checkDateInput) {
        checkDateInput.value = todayStr;
        checkDateInput.min = yesterdayStr;
        checkDateInput.max = todayStr;
    }
    
    document.getElementById('serverType').value = 'master';
    document.getElementById('checkSession').value = 'pagi';
    document.getElementById('cpuRamStatus').value = 'Normal';
    document.getElementById('diskStatus').value = 'Normal';
    document.getElementById('replicationStatus').value = 'Active';
    document.getElementById('backupStatus').value = 'Success';
    document.getElementById('checklistNotes').value = '';
    
    document.getElementById('formChecklistTitle').innerHTML = '<i class="bi bi-pencil-square text-teal me-2"></i>Pengisian Checklist Harian';
};

window.closeChecklistForm = function() {
    resetChecklistForm();
    const formCollapse = bootstrap.Collapse.getOrCreateInstance(document.getElementById('checklistFormCollapse'));
    formCollapse.hide();
};

function saveChecklist() {
    const date = document.getElementById('checkDate').value;
    const type = document.getElementById('serverType').value;
    const session = document.getElementById('checkSession').value;
    const cpu = document.getElementById('cpuRamStatus').value;
    const disk = document.getElementById('diskStatus').value;
    const replication = document.getElementById('replicationStatus').value;
    const backup = document.getElementById('backupStatus').value;
    const notes = document.getElementById('checklistNotes').value;

    const payload = {
        check_date: date,
        server_type: type,
        session: session,
        cpu_ram_status: cpu,
        disk_status: disk,
        replication_status: replication,
        backup_status: backup,
        notes: notes
    };

    fetch(window.getApiUrl('/checklists'), {
        method: 'POST',
        headers: Object.assign({
            'Content-Type': 'application/json'
        }, window.getAuthHeader()),
        body: JSON.stringify(payload)
    })
    .then(response => {
        if (response.status === 401) {
            window.handleLogout();
            throw new Error('Unauthorized');
        }
        return response.json();
    })
    .then(result => {
        if (result.success) {
            alert(result.message);
            closeChecklistForm();
            loadChecklistGrid();
        } else {
            alert('Gagal menyimpan checklist: ' + result.message);
        }
    })
    .catch(error => console.error('Error saving checklist:', error));
}
