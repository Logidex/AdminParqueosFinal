document.addEventListener('DOMContentLoaded', function() {
    const menuItems = document.querySelectorAll('.menu-item');
    const sections = document.querySelectorAll('.settings-section');
    const notificationsContainer = document.querySelector('#notifications');
    const generalForm = document.querySelector('#general-form');
    const tarifasTableBody = document.querySelector('#tarifas-table tbody');
    const addTarifaBtn = document.querySelector('.add-tarifa-btn');
    const rolesTableBody = document.querySelector('#roles-table tbody');
    const addRolBtn = document.querySelector('.add-rol-btn');
    const backupForm = document.querySelector('#backup-form');
    const backupNowBtn = document.querySelector('.backup-now');

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

    // Cambiar entre secciones
    menuItems.forEach(item => {
        item.addEventListener('click', function() {
            menuItems.forEach(i => i.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));
            this.classList.add('active');
            const sectionId = this.getAttribute('data-section');
            document.getElementById(sectionId).classList.add('active');
        });
    });

    // Sección General: Guardar información del estacionamiento
    generalForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(generalForm);
        const data = {
            nombre: formData.get('nombre') || 'Sin nombre',
            telefono: formData.get('telefono') || 'Sin teléfono',
            email: formData.get('email') || 'sin@email.com',
            direccion: formData.get('direccion') || 'Sin dirección'
        };
        if (!data.nombre || !data.telefono || !data.email || !data.direccion) {
            showNotification('Todos los campos son obligatorios', 'error');
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
            showNotification('El formato del email es inválido', 'error');
            return;
        }
        console.log('Datos enviados:', data);
        try {
            const response = await fetch('http://localhost:3000/api/config/general', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.message + (result.details ? `: ${result.details}` : ''));
            }
            showNotification('Configuración general guardada con éxito', 'success');
        } catch (error) {
            console.error('Error al guardar configuración general:', error);
            showNotification('Error al guardar configuración: ' + error.message, 'error');
        }
    });

    // Sección Tarifas: Cargar y gestionar tarifas
    async function loadTarifas() {
        try {
            const response = await fetch('http://localhost:3000/api/tarifas');
            const data = await response.json();
            if (!data.success) {
                throw new Error(data.message);
            }
            tarifasTableBody.innerHTML = '';
            data.tarifas.forEach(tarifa => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td style="padding: 10px; border-bottom: 1px solid #444;">${tarifa.tipo}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #444;">
                        <input type="text" class="form-control" value="${tarifa.primera_hora}" style="width: 80px;">
                    </td>
                    <td style="padding: 10px; border-bottom: 1px solid #444;">
                        <input type="text" class="form-control" value="${tarifa.horas_adicionales}" style="width: 80px;">
                    </td>
                    <td style="padding: 10px; border-bottom: 1px solid #444;">
                        <input type="text" class="form-control" value="${tarifa.dia_completo}" style="width: 80px;">
                    </td>
                    <td style="padding: 10px; border-bottom: 1px solid #444;">
                        <button class="btn btn-secondary save-tarifa" data-id="${tarifa.tarifa_id}">Guardar</button>
                    </td>
                `;
                tarifasTableBody.appendChild(row);
            });
            // Agregar listeners a los botones de guardar
            document.querySelectorAll('.save-tarifa').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const row = e.target.closest('tr');
                    const tarifaId = e.target.dataset.id;
                    const primeraHoraInput = row.querySelector('td:nth-child(2) input');
                    const horasAdicionalesInput = row.querySelector('td:nth-child(3) input');
                    const diaCompletoInput = row.querySelector('td:nth-child(4) input');
            
                    // Validar que los inputs existen
                    if (!primeraHoraInput || !horasAdicionalesInput || !diaCompletoInput) {
                        showNotification('Error: No se encontraron los campos de tarifa', 'error');
                        console.error('Inputs de tarifa no encontrados en la fila');
                        return;
                    }
            
                    const data = {
                        primera_hora: primeraHoraInput.value,
                        horas_adicionales: horasAdicionalesInput.value,
                        dia_completo: diaCompletoInput.value
                    };
            
                    // Validar que los valores no estén vacíos y sean números válidos
                    if (!data.primera_hora || !data.horas_adicionales || !data.dia_completo) {
                        showNotification('Todos los campos de tarifa son obligatorios', 'error');
                        return;
                    }
                    if (isNaN(data.primera_hora) || isNaN(data.horas_adicionales) || isNaN(data.dia_completo) ||
                        data.primera_hora <= 0 || data.horas_adicionales <= 0 || data.dia_completo <= 0) {
                        showNotification('Los valores de tarifa deben ser números positivos', 'error');
                        return;
                    }
            
                    try {
                        const response = await fetch(`http://localhost:3000/api/tarifas/${tarifaId}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                            primera_hora: parseFloat(data.primera_hora),
                            horas_adicionales: parseFloat(data.horas_adicionales),
                            dia_completo: parseFloat(data.dia_completo)
                        })
                        });
                        const result = await response.json();
                        if (!result.success) {
                            throw new Error(result.message);
                        }
                        showNotification('Tarifa actualizada con éxito', 'success');
                    } catch (error) {
                        console.error('Error al actualizar tarifa:', error);
                        showNotification('Error al actualizar tarifa: ' + error.message, 'error');
                    }
                });
            });
        } catch (error) {
            console.error('Error al cargar tarifas:', error);
            showNotification('Error al cargar tarifas: ' + error.message, 'error');
        }
    }

    // Modal para añadir nueva tarifa
    addTarifaBtn.addEventListener('click', () => {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h2>Nueva Tarifa</h2>
                <form id="new-tarifa-form">
                    <div class="form-group">
                        <label>Tipo de Vehículo</label>
                        <select name="tipo_id" class="form-control">
                            <!-- Se llenará dinámicamente -->
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Primera Hora ($)</label>
                        <input type="text" name="primera_hora" class="form-control" placeholder="Ej: 3.00">
                    </div>
                    <div class="form-group">
                        <label>Horas Adicionales ($)</label>
                        <input type="text" name="horas_adicionales" class="form-control" placeholder="Ej: 1.50">
                    </div>
                    <div class="form-group">
                        <label>Día Completo ($)</label>
                        <input type="text" name="dia_completo" class="form-control" placeholder="Ej: 15.00">
                    </div>
                    <div class="form-group">
                        <button type="button" class="btn btn-secondary cancel-btn">Cancelar</button>
                        <button type="submit" class="btn btn-primary">Crear</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);

        // Cargar tipos de espacio
        fetch('http://localhost:3000/api/tipos-espacio')
            .then(response => response.json())
            .then(data => {
                const select = modal.querySelector('select[name="tipo_id"]');
                data.data.forEach(tipo => {
                    const option = document.createElement('option');
                    option.value = tipo.tipo_id;
                    option.textContent = tipo.nombre;
                    select.appendChild(option);
                });
            });

        modal.querySelector('.cancel-btn').addEventListener('click', () => modal.remove());
        modal.querySelector('#new-tarifa-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const data = {
                tipo_id: formData.get('tipo_id'),
                primera_hora: formData.get('primera_hora'),
                horas_adicionales: formData.get('horas_adicionales'),
                dia_completo: formData.get('dia_completo')
            };
            try {
                const response = await fetch('http://localhost:3000/api/tarifas', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                const result = await response.json();
                if (!result.success) {
                    throw new Error(result.message);
                }
                modal.remove();
                loadTarifas();
                showNotification('Tarifa creada con éxito', 'success');
            } catch (error) {
                console.error('Error al crear tarifa:', error);
                showNotification('Error al crear tarifa: ' + error.message, 'error');
            }
        });
    });

    // Sección Permisos: Cargar y gestionar roles
    async function loadRoles() {
        try {
            const response = await fetch('http://localhost:3000/api/roles');
            const data = await response.json();
            if (!data.success) {
                throw new Error(data.message);
            }
            rolesTableBody.innerHTML = '';
            data.roles.forEach(rol => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td style="padding: 10px; border-bottom: 1px solid #444;">${rol.nombre}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #444;">${rol.descripcion || 'Sin descripción'}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #444;">${JSON.stringify(rol.permisos)}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #444;">
                        <button class="btn btn-secondary edit-rol" data-id="${rol.rol_id}">Editar</button>
                    </td>
                `;
                rolesTableBody.appendChild(row);
            });
            // Agregar listeners a los botones de editar
            document.querySelectorAll('.edit-rol').forEach(btn => {
                btn.addEventListener('click', () => showRolModal(btn.dataset.id));
            });
        } catch (error) {
            console.error('Error al cargar roles:', error);
            showNotification('Error al cargar roles: ' + error.message, 'error');
        }
    }

    // Modal para añadir/editar rol
    function showRolModal(rolId = null) {
        const isEdit = !!rolId;
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h2>${isEdit ? 'Editar' : 'Nuevo'} Rol</h2>
                <form id="rol-form">
                    <div class="form-group">
                        <label>Nombre del Rol</label>
                        <input type="text" name="nombre" class="form-control" placeholder="Ej: Administrador">
                    </div>
                    <div class="form-group">
                        <label>Descripción</label>
                        <textarea name="descripcion" class="form-control" rows="3"></textarea>
                    </div>
                    <div class="form-group">
                        <label>Permisos (JSON)</label>
                        <textarea name="permisos" class="form-control" rows="5">{"all": false}</textarea>
                    </div>
                    <div class="form-group">
                        <button type="button" class="btn btn-secondary cancel-btn">Cancelar</button>
                        <button type="submit" class="btn btn-primary">${isEdit ? 'Actualizar' : 'Crear'}</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);

        if (isEdit) {
            fetch(`http://localhost:3000/api/roles/${rolId}`)
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        modal.querySelector('input[name="nombre"]').value = data.rol.nombre;
                        modal.querySelector('textarea[name="descripcion"]').value = data.rol.descripcion || '';
                        modal.querySelector('textarea[name="permisos"]').value = JSON.stringify(data.rol.permisos, null, 2);
                    }
                });
        }

        modal.querySelector('.cancel-btn').addEventListener('click', () => modal.remove());
        modal.querySelector('#rol-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const data = {
                nombre: formData.get('nombre'),
                descripcion: formData.get('descripcion'),
                permisos: JSON.parse(formData.get('permisos'))
            };
            try {
                const url = isEdit ? `http://localhost:3000/api/roles/${rolId}` : 'http://localhost:3000/api/roles';
                const method = isEdit ? 'PUT' : 'POST';
                const response = await fetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                const result = await response.json();
                if (!result.success) {
                    throw new Error(result.message);
                }
                modal.remove();
                loadRoles();
                showNotification(`Rol ${isEdit ? 'actualizado' : 'creado'} con éxito`, 'success');
            } catch (error) {
                console.error('Error al guardar rol:', error);
                showNotification(`Error al ${isEdit ? 'actualizar' : 'crear'} rol: ${error.message}`, 'error');
            }
        });
    }

    addRolBtn.addEventListener('click', () => showRolModal());

    // Sección Copias de Seguridad
    backupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(backupForm);
        const data = {
            frecuencia: formData.get('frecuencia'),
            directorio: formData.get('directorio')
        };
        try {
            const response = await fetch('http://localhost:3000/api/config/backup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.message);
            }
            showNotification('Configuración de backup guardada con éxito', 'success');
        } catch (error) {
            console.error('Error al guardar configuración de backup:', error);
            showNotification('Error al guardar configuración de backup: ' + error.message, 'error');
        }
    });

    backupNowBtn.addEventListener('click', async () => {
        try {
            const response = await fetch('http://localhost:3000/api/backup', {
                method: 'POST'
            });
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.message);
            }
            showNotification('Backup realizado con éxito', 'success');
        } catch (error) {
            console.error('Error al realizar backup:', error);
            showNotification('Error al realizar backup: ' + error.message, 'error');
        }
    });

    // Carga inicial
    loadTarifas();
    loadRoles();
});