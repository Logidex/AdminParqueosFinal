document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.querySelector('.search-box input');
    const roleFilter = document.querySelector('.filter-group select');
    const addUserBtn = document.querySelector('.btn-add-user');
    const tbody = document.querySelector('.users-table tbody');
    const pagination = document.querySelector('.pagination');
    const notificationsContainer = document.querySelector('#notifications');
    let currentPage = 1;
    const usersPerPage = 10;

    // Función para mostrar notificaciones
    function showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notificationsContainer.appendChild(notification);
        setTimeout(() => {
            notification.remove();
        }, 5000); // Eliminar después de 5 segundos
    }

    // Obtener y mostrar usuarios
    async function fetchUsers(page = 1, search = '', role = '') {
        try {
            const query = new URLSearchParams({
                page,
                limit: usersPerPage,
                search,
                role
            }).toString();
            const response = await fetch(`http://localhost:3000/api/users?${query}`);
            const data = await response.json();
            if (!data.success) {
                throw new Error(data.message);
            }
            displayUsers(data.users);
            setupPagination(data.totalPages);
        } catch (error) {
            console.error('Error al obtener usuarios:', error);
            showNotification('Error al cargar usuarios: ' + error.message, 'error');
        }
    }

    // Mostrar usuarios en la tabla
    function displayUsers(users) {
        tbody.innerHTML = '';
        users.forEach(user => {
            const tr = document.createElement('tr');
            const statusClass = user.activo ? 'status-active' : 'status-inactive';
            const statusText = user.activo ? 'Activo' : 'Inactivo';
            const lastAccess = user.ultimo_acceso ? new Date(user.ultimo_acceso).toLocaleString('es-ES') : 'Nunca';
            tr.innerHTML = `
                <td>
                    <div class="user-name">
                        <img src="${user.avatar_url || 'https://randomuser.me/api/portraits/lego/1.jpg'}" class="user-avatar">
                        <span>${user.nombre} ${user.apellido}</span>
                    </div>
                </td>
                <td>${user.email}</td>
                <td>${user.rol}</td>
                <td><span class="user-status ${statusClass}">${statusText}</span></td>
                <td>${lastAccess}</td>
                <td>
                    <button class="action-btn edit" data-id="${user.usuario_id}" title="Editar"><i class="fas fa-edit"></i></button>
                    <button class="action-btn delete" data-id="${user.usuario_id}" title="Eliminar"><i class="fas fa-trash-alt"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    // Configurar paginación
    function setupPagination(totalPages) {
        pagination.innerHTML = `
            <button class="page-btn prev"><i class="fas fa-chevron-left"></i></button>
            ${Array.from({length: totalPages}, (_, i) => `
                <button class="page-btn ${i + 1 === currentPage ? 'active' : ''}" data-page="${i + 1}">${i + 1}</button>
            `).join('')}
            <button class="page-btn next"><i class="fas fa-chevron-right"></i></button>
        `;
        pagination.querySelectorAll('.page-btn[data-page]').forEach(btn => {
            btn.addEventListener('click', () => {
                currentPage = parseInt(btn.dataset.page);
                fetchUsers(currentPage, searchInput.value, roleFilter.value);
            });
        });
        pagination.querySelector('.prev').addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                fetchUsers(currentPage, searchInput.value, roleFilter.value);
            }
        });
        pagination.querySelector('.next').addEventListener('click', () => {
            if (currentPage < totalPages) {
                currentPage++;
                fetchUsers(currentPage, searchInput.value, roleFilter.value);
            }
        });
    }

    // Mostrar modal de usuario
    function showUserModal(user = null) {
        const isEdit = !!user;
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h2>${isEdit ? 'Editar' : 'Nuevo'} Usuario</h2>
                <form id="user-form">
                    <input type="text" id="username" placeholder="Nombre de usuario" value="${user?.username || ''}" ${isEdit ? 'disabled' : ''}>
                    <input type="email" id="email" placeholder="Email" value="${user?.email || ''}">
                    <input type="text" id="nombre" placeholder="Nombre" value="${user?.nombre || ''}">
                    <input type="text" id="apellido" placeholder="Apellido" value="${user?.apellido || ''}">
                    <select id="rol">
                        <option value="">Seleccione un rol</option>
                        <option value="Administrador" ${user?.rol === 'Administrador' ? 'selected' : ''}>Administrador</option>
                        <option value="Operador" ${user?.rol === 'Operador' ? 'selected' : ''}>Operador</option>
                        <option value="Cliente" ${user?.rol === 'Cliente' ? 'selected' : ''}>Cliente</option>
                    </select>
                    <input type="password" id="password" placeholder="Contraseña" ${isEdit ? 'style="display:none"' : ''}>
                    <label><input type="checkbox" id="activo" ${user?.activo !== false ? 'checked' : ''}> Activo</label>
                    <div class="modal-actions">
                        <button type="button" class="cancel-btn">Cancelar</button>
                        <button type="submit">${isEdit ? 'Actualizar' : 'Crear'}</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('.cancel-btn').addEventListener('click', () => modal.remove());
        modal.querySelector('#user-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = {
                username: modal.querySelector('#username').value,
                email: modal.querySelector('#email').value,
                nombre: modal.querySelector('#nombre').value,
                apellido: modal.querySelector('#apellido').value,
                rol: modal.querySelector('#rol').value,
                password: modal.querySelector('#password').value,
                activo: modal.querySelector('#activo').checked
            };
            try {
                const url = isEdit ? `http://localhost:3000/api/users/${user.usuario_id}` : 'http://localhost:3000/api/register';
                const method = isEdit ? 'PUT' : 'POST';
                const body = isEdit ? { ...formData, password: undefined } : formData;
                const response = await fetch(url, {
                    method,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body)
                });
                const data = await response.json();
                if (!data.success) {
                    throw new Error(data.message);
                }
                modal.remove();
                fetchUsers(currentPage, searchInput.value, roleFilter.value);
                showNotification(`Usuario ${isEdit ? 'actualizado' : 'creado'} con éxito`, 'success');
            } catch (error) {
                console.error('Error al guardar usuario:', error);
                showNotification(`Error al ${isEdit ? 'actualizar' : 'crear'} usuario: ${error.message}`, 'error');
            }
        });
    }

    // Eliminar usuario
    async function deleteUser(userId) {
        const confirmModal = document.createElement('div');
        confirmModal.className = 'modal';
        confirmModal.innerHTML = `
            <div class="modal-content">
                <h2>Confirmar Eliminación</h2>
                <p>¿Estás seguro de eliminar este usuario?</p>
                <div class="modal-actions">
                    <button class="cancel-btn">Cancelar</button>
                    <button class="confirm-btn">Eliminar</button>
                </div>
            </div>
        `;
        document.body.appendChild(confirmModal);

        confirmModal.querySelector('.cancel-btn').addEventListener('click', () => confirmModal.remove());
        confirmModal.querySelector('.confirm-btn').addEventListener('click', async () => {
            try {
                const response = await fetch(`http://localhost:3000/api/users/${userId}`, {
                    method: 'DELETE'
                });
                const data = await response.json();
                if (!data.success) {
                    throw new Error(data.message);
                }
                confirmModal.remove();
                fetchUsers(currentPage, searchInput.value, roleFilter.value);
                showNotification('Usuario eliminado con éxito', 'success');
            } catch (error) {
                console.error('Error al eliminar usuario:', error);
                showNotification('Error al eliminar usuario: ' + error.message, 'error');
            }
        });
    }

    // Listeners de eventos
    addUserBtn.addEventListener('click', () => showUserModal());
    searchInput.addEventListener('input', () => fetchUsers(1, searchInput.value, roleFilter.value));
    roleFilter.addEventListener('change', () => fetchUsers(1, searchInput.value, roleFilter.value));
    tbody.addEventListener('click', (e) => {
        const btn = e.target.closest('.action-btn');
        if (!btn) return;
        const userId = btn.dataset.id;
        if (btn.classList.contains('edit')) {
            const user = tbody.querySelector(`tr:has(button[data-id="${userId}"])`);
            const userData = {
                usuario_id: userId,
                username: user.querySelector('.user-name span').textContent.split(' ')[0],
                nombre: user.querySelector('.user-name span').textContent.split(' ')[0],
                apellido: user.querySelector('.user-name span').textContent.split(' ')[1] || '',
                email: user.querySelector('td:nth-child(2)').textContent,
                rol: user.querySelector('td:nth-child(3)').textContent,
                activo: user.querySelector('.user-status').classList.contains('status-active')
            };
            showUserModal(userData);
        } else if (btn.classList.contains('delete')) {
            deleteUser(userId);
        }
    });

    // Carga inicial
    fetchUsers();
});