/**
 * Dashboard Navigation & Charts Module
 */

// Global config for API endpoints
window.getApiUrl = function(path) {
    const apiHost = window.location.origin;
    if (apiHost.includes('127.0.0.1') || apiHost.includes('localhost')) {
        return `http://127.0.0.1:30080/api/v1${path}`;
    }
    return `/api/v1${path}`;
};

window.getAuthHeader = function() {
    const token = localStorage.getItem('jwt_token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
};

document.addEventListener('DOMContentLoaded', function() {
    // Check JWT Authentication
    const token = localStorage.getItem('jwt_token');
    if (!token) {
        window.location.href = 'index.html';
        return;
    }

    // Load user greetings
    const userName = localStorage.getItem('user_name') || 'Administrator';
    const greetingEl = document.getElementById('topUserGreeting');
    const greetingMobileEl = document.getElementById('topUserGreetingMobile');
    if (greetingEl) greetingEl.textContent = userName;
    if (greetingMobileEl) greetingMobileEl.textContent = userName;

    // Load Menus Dynamically
    loadMenus();

    // Set default month/year for dashboard filters
    const today = new Date();
    const dbMonthSelect = document.getElementById('dbFilterMonth');
    const dbYearSelect = document.getElementById('dbFilterYear');
    if (dbMonthSelect) dbMonthSelect.value = today.getMonth() + 1;
    if (dbYearSelect) dbYearSelect.value = today.getFullYear();

    // Bind dashboard filter changes to refresh charts
    if (dbMonthSelect) dbMonthSelect.addEventListener('change', fetchReplicationSummary);
    if (dbYearSelect) dbYearSelect.addEventListener('change', fetchReplicationSummary);

    // Render charts if dashboard is default
    if (window.location.hash === '#dashboard' || !window.location.hash) {
        renderDashboardCharts();
    }
});

window.handleLogout = function() {
    localStorage.removeItem('jwt_token');
    localStorage.removeItem('user_name');
    localStorage.removeItem('user_username');
    window.location.href = 'index.html';
};

/**
 * Fetch dynamic menus from Backend API
 */
function loadMenus() {
    fetch(window.getApiUrl('/menus'), {
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
            renderNavbarMenu(result.data);
            initNavigation();
        }
    })
    .catch(err => console.error('Error loading menus:', err));
}

function renderNavbarMenu(menus) {
    const menuContainer = document.getElementById('navbarMenuContainer');
    if (!menuContainer) return;

    menuContainer.innerHTML = '';
    menus.forEach(menu => {
        const li = document.createElement('li');
        li.className = 'notika-nav-item';
        
        const a = document.createElement('a');
        a.href = menu.url;
        a.className = 'nav-menu-link';
        a.setAttribute('data-slug', menu.slug);
        
        const icon = document.createElement('i');
        icon.className = `bi ${menu.icon || 'bi-link'}`;
        
        a.appendChild(icon);
        a.appendChild(document.createTextNode(' ' + menu.name));
        li.appendChild(a);
        menuContainer.appendChild(li);
    });
}

/**
 * Navigation pill handling and client-side tab switching
 */
function initNavigation() {
    const links = document.querySelectorAll('.nav-menu-link');
    
    // Set active tab based on window hash or default to first tab available
    let activeHash = window.location.hash || '#dashboard';
    let activeLink = document.querySelector(`.nav-menu-link[href="${activeHash}"]`);
    
    if (!activeLink && links.length > 0) {
        activeLink = links[0];
        activeHash = activeLink.getAttribute('href');
    }

    if (activeLink) {
        switchTab(activeLink, activeHash);
    }

    // Bind click events to dynamic navigation links
    const menuContainer = document.getElementById('navbarMenuContainer');
    if (menuContainer) {
        menuContainer.onclick = function(e) {
            const target = e.target.closest('.nav-menu-link');
            if (target) {
                e.preventDefault();
                const hash = target.getAttribute('href');
                window.location.hash = hash;
                switchTab(target, hash);
            }
        };
    }
}

function switchTab(clickedLink, targetHash) {
    document.querySelectorAll('.nav-menu-link').forEach(link => {
        link.classList.remove('active');
    });
    
    clickedLink.classList.add('active');

    document.querySelectorAll('.tab-content-panel').forEach(panel => {
        panel.classList.remove('active');
    });

    const slug = targetHash.replace('#', '');
    const targetId = 'panel-' + slug;
    const targetPanel = document.getElementById(targetId);
    if (targetPanel) {
        targetPanel.classList.add('active');
    } else {
        const dashboardPanel = document.getElementById('panel-dashboard');
        if (dashboardPanel) dashboardPanel.classList.add('active');
    }

    const submenuContainer = document.getElementById('submenu-container-bar');
    if (submenuContainer) {
        document.querySelectorAll('.submenu-content').forEach(sub => {
            sub.classList.add('d-none');
        });

        const activeSubmenu = document.getElementById('submenu-' + slug);
        if (activeSubmenu) {
            activeSubmenu.classList.remove('d-none');
            submenuContainer.classList.remove('d-none');
        } else {
            submenuContainer.classList.add('d-none');
        }
    }

    if (slug === 'dashboard') {
        setTimeout(renderDashboardCharts, 100);
    } else if (slug === 'database-check') {
        setTimeout(loadChecklistGrid, 100);
    } else if (slug === 'master-user') {
        setTimeout(fetchUsers, 100);
    }
}

/**
 * Chart.js Dashboard Charts Initialization and Updates
 */
let cpuChart, memChart, storageChart, dbChart;

function renderDashboardCharts() {
    if (cpuChart) cpuChart.destroy();
    if (memChart) memChart.destroy();
    if (storageChart) storageChart.destroy();
    if (dbChart) dbChart.destroy();

    const gridColor = 'rgba(255, 255, 255, 0.05)';
    const tickColor = '#a1a1aa';

    // 1. CPU Chart (Line Chart)
    const canvasCpu = document.getElementById('cpuHistoryChart');
    if (canvasCpu) {
        const ctxCpu = canvasCpu.getContext('2d');
        const cpuGrad = ctxCpu.createLinearGradient(0, 0, 0, 300);
        cpuGrad.addColorStop(0, 'rgba(15, 138, 131, 0.4)');
        cpuGrad.addColorStop(1, 'rgba(15, 138, 131, 0)');

        cpuChart = new Chart(ctxCpu, {
            type: 'line',
            data: {
                labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'],
                datasets: [{
                    label: 'CPU Usage (%)',
                    data: [35, 42, 58, 48, 72, 55, 38],
                    borderColor: '#0F8A83',
                    backgroundColor: cpuGrad,
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: { grid: { color: gridColor }, ticks: { color: tickColor } },
                    y: { min: 0, max: 100, grid: { color: gridColor }, ticks: { color: tickColor } }
                }
            }
        });
    }

    // 2. Memory Chart (Doughnut)
    const canvasMem = document.getElementById('memoryAllocChart');
    if (canvasMem) {
        const ctxMem = canvasMem.getContext('2d');
        memChart = new Chart(ctxMem, {
            type: 'doughnut',
            data: {
                labels: ['Allocated (GB)', 'Free (GB)'],
                datasets: [{
                    data: [48, 16],
                    backgroundColor: ['#0F8A83', 'rgba(255, 255, 255, 0.05)'],
                    borderColor: ['#18181c'],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: tickColor, font: { family: 'Inter' } }
                    }
                },
                cutout: '75%'
            }
        });
    }

    // 3. Storage Chart (Stacked Bar)
    const canvasStorage = document.getElementById('storageUsageChart');
    if (canvasStorage) {
        const ctxStorage = canvasStorage.getContext('2d');
        storageChart = new Chart(ctxStorage, {
            type: 'bar',
            data: {
                labels: ['Server-01', 'Server-02', 'Server-03', 'Server-04'],
                datasets: [
                    {
                        label: 'Used Space (TB)',
                        data: [1.2, 0.8, 1.5, 0.6],
                        backgroundColor: '#0C7C72'
                    },
                    {
                        label: 'Free Space (TB)',
                        data: [0.72, 1.12, 0.42, 1.32],
                        backgroundColor: 'rgba(255, 255, 255, 0.05)'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: tickColor } }
                },
                scales: {
                    x: { stacked: true, grid: { color: gridColor }, ticks: { color: tickColor } },
                    y: { stacked: true, grid: { color: gridColor }, ticks: { color: tickColor } }
                }
            }
        });
    }

    // 4. DB Replication Status Chart
    const canvasDb = document.getElementById('dbReplicationChart');
    if (canvasDb) {
        const ctxDb = canvasDb.getContext('2d');
        dbChart = new Chart(ctxDb, {
            type: 'doughnut',
            data: {
                labels: ['Active (Normal)', 'Lag', 'Error'],
                datasets: [{
                    data: [0, 0, 0],
                    backgroundColor: ['#198754', '#ffc107', '#dc3545'],
                    borderColor: ['#18181c'],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: tickColor, font: { family: 'Inter' } }
                    }
                },
                cutout: '70%'
            }
        });

        fetchReplicationSummary();
    }
}

function fetchReplicationSummary() {
    const filterM = document.getElementById('dbFilterMonth');
    const filterY = document.getElementById('dbFilterYear');
    const month = filterM ? filterM.value : new Date().getMonth() + 1;
    const year = filterY ? filterY.value : new Date().getFullYear();

    // Fetch replication logs from checklist API and count replication_status
    fetch(window.getApiUrl(`/checklists?month=${month}&year=${year}`), {
        headers: window.getAuthHeader()
    })
    .then(response => response.json())
    .then(result => {
        if (result.success && dbChart) {
            let active = 0, lag = 0, error = 0;
            const records = result.data || [];
            
            records.forEach(r => {
                if (r.server_type === 'slave') {
                    if (r.replication_status === 'Active') active++;
                    else if (r.replication_status === 'Lag') lag++;
                    else if (r.replication_status === 'Error') error++;
                }
            });

            dbChart.data.datasets[0].data = [active, lag, error];
            dbChart.update();
        }
    })
    .catch(err => console.error('Error fetching replication summary:', err));
}

window.refreshDashboardCharts = function() {
    if (cpuChart) {
        cpuChart.data.datasets[0].data = cpuChart.data.datasets[0].data.map(val => {
            const change = (Math.random() - 0.5) * 20;
            return Math.min(100, Math.max(10, Math.round(val + change)));
        });
        cpuChart.update();
    }
    if (memChart) {
        const total = 64;
        const allocated = Math.round(40 + Math.random() * 15);
        memChart.data.datasets[0].data = [allocated, total - allocated];
        memChart.update();
    }
    if (storageChart) {
        storageChart.data.datasets[0].data = storageChart.data.datasets[0].data.map(val => {
            const change = (Math.random() - 0.5) * 0.2;
            return Math.max(0.1, parseFloat((val + change).toFixed(2)));
        });
        storageChart.update();
    }
    fetchReplicationSummary();
};

window.downloadReport = function(format) {
    const filterM = document.getElementById('dbFilterMonth');
    const filterY = document.getElementById('dbFilterYear');
    const month = filterM ? filterM.value : new Date().getMonth() + 1;
    const year = filterY ? filterY.value : new Date().getFullYear();

    // Since we separated UI and backend, reports can be downloaded from exporter NodePort (Port 30080)
    const apiHost = window.location.origin;
    let exportURL = apiHost.includes('127.0.0.1') || apiHost.includes('localhost')
        ? `http://127.0.0.1:30080/api/v1/export?format=${format}&month=${month}&year=${year}`
        : `/api/v1/export?format=${format}&month=${month}&year=${year}`;

    // Append jwt token as query parameter for authentication
    const token = localStorage.getItem('jwt_token');
    exportURL += `&token=${token}`;

    if (format === 'pdf') {
        window.open(exportURL, '_blank');
    } else {
        window.location.href = exportURL;
    }
};
