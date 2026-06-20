/**
 * Master User Management Module
 */

document.addEventListener('DOMContentLoaded', function() {
    // Form Submit for User Master
    const userForm = document.getElementById('userForm');
    if (userForm) {
        userForm.addEventListener('submit', function(e) {
            e.preventDefault();
            saveUser();
        });
    }
});

/**
 * Fetch and render users inside User Master table
 */
window.fetchUsers = function() {
    fetch(window.getApiUrl('/users'), {
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
            renderUsersTable(result.data);
        } else {
            console.error('Gagal mengambil data user: ' + result.message);
        }
    })
    .catch(error => {
        console.error('Error fetching users:', error);
    });
};

function renderUsersTable(users) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-secondary small">Tidak ada data user.</td></tr>';
        return;
    }

    users.forEach(user => {
        const tr = document.createElement('tr');
        let dateFormatted = '-';
        if (user.created_at) {
            const dateObj = new Date(user.created_at);
            dateFormatted = dateObj.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
        }

        tr.innerHTML = `
            <td>
                <span class="d-flex align-items-center gap-2">
                    <i class="bi bi-person-fill text-teal"></i>
                    <strong>${user.name}</strong>
                </span>
            </td>
            <td><code>${user.username}</code></td>
            <td>${dateFormatted}</td>
            <td>
                <div class="d-flex justify-content-center gap-2">
                    <button type="button" class="btn btn-sm btn-outline-info border-0 px-2" onclick='editUser(${JSON.stringify(user)})'>
                        <i class="bi bi-pencil-fill"></i> Edit
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-danger border-0 px-2" onclick="deleteUser(${user.id})">
                        <i class="bi bi-trash3-fill"></i> Hapus
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

/**
 * Save User Details (Add / Update)
 */
function saveUser() {
    const idVal = document.getElementById('userId').value;
    const action = document.getElementById('userAction').value;

    const data = {
        id: idVal ? parseInt(idVal) : 0,
        username: document.getElementById('userUsername').value,
        name: document.getElementById('userName').value,
        password: document.getElementById('userPassword').value
    };

    const method = action === 'add' ? 'POST' : 'PUT';

    fetch(window.getApiUrl('/users'), {
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
            closeUserForm();
            window.fetchUsers();
        } else {
            alert('Gagal menyimpan user: ' + result.message);
        }
    })
    .catch(error => {
        console.error('Error saving user:', error);
    });
}

/**
 * Load user values to form and expand form collapse
 */
window.editUser = function(user) {
    document.getElementById('userId').value = user.id;
    document.getElementById('userAction').value = 'update';
    document.getElementById('userName').value = user.name;
    document.getElementById('userUsername').value = user.username;
    
    // Password fields modifications
    const passInput = document.getElementById('userPassword');
    passInput.removeAttribute('required');
    passInput.placeholder = 'Ketik password baru jika ingin diubah';
    
    const helpText = document.getElementById('helpUserPassword');
    if (helpText) helpText.classList.remove('d-none');

    document.getElementById('formUserTitle').innerText = 'Edit Profil User: ' + user.name;
    document.getElementById('btnSaveUser').innerText = 'Perbarui User';
    
    // Ensure form collapse is open
    const bsCollapse = bootstrap.Collapse.getOrCreateInstance(document.getElementById('userFormCollapse'));
    bsCollapse.show();
};

window.resetUserForm = function() {
    document.getElementById('userId').value = '';
    document.getElementById('userAction').value = 'add';
    const form = document.getElementById('userForm');
    if (form) form.reset();
    
    const passInput = document.getElementById('userPassword');
    if (passInput) {
        passInput.setAttribute('required', 'required');
        passInput.placeholder = 'Minimal 6 karakter';
    }
    
    const helpText = document.getElementById('helpUserPassword');
    if (helpText) helpText.classList.add('d-none');

    document.getElementById('formUserTitle').innerText = 'Tambah Akun Admin Baru';
    document.getElementById('btnSaveUser').innerText = 'Simpan User';
};

window.closeUserForm = function() {
    resetUserForm();
    const bsCollapse = bootstrap.Collapse.getOrCreateInstance(document.getElementById('userFormCollapse'));
    bsCollapse.hide();
};

/**
 * Delete user by ID
 */
window.deleteUser = function(id) {
    if (confirm('Apakah Anda yakin ingin menghapus akun user ini?')) {
        fetch(window.getApiUrl(`/users/${id}`), {
            method: 'DELETE',
            headers: window.getAuthHeader()
        })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                alert(result.message);
                window.fetchUsers();
            } else {
                alert('Gagal menghapus user: ' + result.message);
            }
        })
        .catch(error => {
            console.error('Error deleting user:', error);
        });
    }
};
