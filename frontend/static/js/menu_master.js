/**
 * Menu Master Settings Module
 */

document.addEventListener('DOMContentLoaded', function() {
    loadMenusTable();

    // Form Submit for Menu Master
    const menuForm = document.getElementById('menuForm');
    if (menuForm) {
        menuForm.addEventListener('submit', function(e) {
            e.preventDefault();
            saveMenu();
        });
    }
});

/**
 * Fetch and render menus inside Menu Master table
 */
function loadMenusTable() {
    fetch(window.getApiUrl('/menus?all=true'), {
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
            renderMenusTable(result.data);
        } else {
            alert('Gagal mengambil data menu: ' + result.message);
        }
    })
    .catch(error => {
        console.error('Error fetching menus:', error);
    });
}

function renderMenusTable(menus) {
    const tbody = document.getElementById('menusTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!menus || menus.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-secondary small">Tidak ada data menu.</td></tr>';
        return;
    }

    menus.forEach(menu => {
        const tr = document.createElement('tr');
        
        const statusBadge = menu.is_active == 1 
            ? '<span class="badge bg-success">Aktif</span>' 
            : '<span class="badge bg-secondary">Non-Aktif</span>';

        tr.innerHTML = `
            <td>
                <span class="d-flex align-items-center gap-2">
                    <i class="bi ${menu.icon || 'bi-link'} text-teal"></i>
                    <strong>${menu.name}</strong>
                </span>
                <div class="text-muted small">${menu.url}</div>
            </td>
            <td>${menu.order_no}</td>
            <td>${statusBadge}</td>
            <td>
                <div class="d-flex justify-content-center gap-2">
                    <button type="button" class="btn btn-sm btn-outline-info border-0 px-2" onclick='editMenu(${JSON.stringify(menu)})'>
                        <i class="bi bi-pencil-fill"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-danger border-0 px-2" onclick="deleteMenu(${menu.id})">
                        <i class="bi bi-trash3-fill"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

/**
 * Save dynamic menu (Add / Update)
 */
function saveMenu() {
    const idVal = document.getElementById('menuId').value;
    const action = document.getElementById('menuAction').value;

    const data = {
        id: idVal ? parseInt(idVal) : 0,
        name: document.getElementById('menuName').value,
        url: document.getElementById('menuUrl').value,
        icon: document.getElementById('menuIcon').value,
        order_no: parseInt(document.getElementById('menuOrder').value),
        is_active: parseInt(document.getElementById('menuActive').value)
    };

    const method = action === 'add' ? 'POST' : 'PUT';

    fetch(window.getApiUrl('/menus'), {
        method: method,
        headers: {
            ...window.getAuthHeader(),
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            alert(result.message);
            resetMenuForm();
            loadMenusTable();
            reloadNavbarContainer();
        } else {
            alert('Gagal menyimpan menu: ' + result.message);
        }
    })
    .catch(error => {
        console.error('Error saving menu:', error);
    });
}

/**
 * Load values to edit in the form
 */
window.editMenu = function(menu) {
    document.getElementById('menuId').value = menu.id;
    document.getElementById('menuAction').value = 'update';
    document.getElementById('menuName').value = menu.name;
    document.getElementById('menuUrl').value = menu.url;
    document.getElementById('menuIcon').value = menu.icon;
    document.getElementById('menuOrder').value = menu.order_no;
    document.getElementById('menuActive').value = menu.is_active;

    document.getElementById('formMenuTitle').innerText = 'Edit Menu: ' + menu.name;
    document.getElementById('btnSaveMenu').innerText = 'Perbarui';
    
    const cancelBtn = document.getElementById('btnCancelEdit');
    if (cancelBtn) cancelBtn.classList.remove('d-none');
};

window.resetMenuForm = function() {
    document.getElementById('menuId').value = '';
    document.getElementById('menuAction').value = 'add';
    const form = document.getElementById('menuForm');
    if (form) form.reset();

    document.getElementById('formMenuTitle').innerText = 'Tambah Menu Baru';
    document.getElementById('btnSaveMenu').innerText = 'Simpan';
    
    const cancelBtn = document.getElementById('btnCancelEdit');
    if (cancelBtn) cancelBtn.classList.add('d-none');
};

/**
 * Delete Menu
 */
window.deleteMenu = function(id) {
    if (confirm('Apakah Anda yakin ingin menghapus menu ini?')) {
        fetch(window.getApiUrl(`/menus/${id}`), {
            method: 'DELETE',
            headers: window.getAuthHeader()
        })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                alert(result.message);
                loadMenusTable();
                reloadNavbarContainer();
            } else {
                alert('Gagal menghapus menu: ' + result.message);
            }
        })
        .catch(error => {
            console.error('Error deleting menu:', error);
        });
    }
};

/**
 * Reload navigation items dynamically in header navbar without page refresh
 */
function reloadNavbarContainer() {
    fetch(window.getApiUrl('/menus'), {
        headers: window.getAuthHeader()
    })
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            const container = document.getElementById('navbarMenuContainer');
            if (!container) return;
            container.innerHTML = '';
            
            const activeMenus = result.data || [];
            
            if (activeMenus.length === 0) {
                container.innerHTML = '<span class="text-white-50 small px-3">No active menus.</span>';
                return;
            }

            // Save current hash before reload
            const currentHash = window.location.hash || '#dashboard';

            activeMenus.forEach((menu) => {
                const li = document.createElement('li');
                li.className = 'notika-nav-item';

                const a = document.createElement('a');
                a.href = menu.url;
                a.className = 'nav-menu-link';
                a.setAttribute('data-slug', menu.slug);
                
                // Re-apply active class if it matches hash
                if (menu.url === currentHash) {
                    a.className += ' active';
                }
                
                const iconClass = menu.icon ? menu.icon : 'bi-link';
                a.innerHTML = `<i class="bi ${iconClass}"></i>${menu.name}`;
                
                li.appendChild(a);
                container.appendChild(li);
            });

            // Rebind triggers
            if (typeof initNavigation === 'function') {
                initNavigation();
            }
        }
    })
    .catch(err => console.error('Error reloading navbar container:', err));
}
