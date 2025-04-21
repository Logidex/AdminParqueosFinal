document.addEventListener('DOMContentLoaded', function () {
  let currentSpaces = [];
  const API_BASE_URL = 'http://localhost:3000';
  const typeMapping = {
    'Electrico': 'Eléctrico', 'Discapacitado': 'Discapacitados', 'Camion': 'Camión',
    'Moto': 'Motocicleta', 'Automovil': 'Automóvil', 'eléctrico': 'Eléctrico',
    'discapacitados': 'Discapacitados', 'camión': 'Camión', 'motocicleta': 'Motocicleta',
    'automóvil': 'Automóvil'
  };

  const spacesContainer = document.getElementById('spacesContainer');
  const refreshBtn = document.getElementById('refreshBtn');
  const applyFiltersBtn = document.getElementById('applyFilters');
  const confirmOccupyBtn = document.getElementById('confirmOccupyBtn');
  const confirmFreeBtn = document.getElementById('confirmFreeBtn');
  const confirmReserveBtn = document.getElementById('confirmReserveBtn');

  initApp();

  async function initApp() {
    try {
      await loadSpaceTypes();
      await loadSpaces();
      setupEventListeners();
    } catch (error) {
      console.error('Error inicializando:', error);
      showAlert('Error al inicializar. Recargue la página.', 'danger');
    }
  }

  function setupEventListeners() {
    if (refreshBtn) refreshBtn.addEventListener('click', loadSpaces);
    if (applyFiltersBtn) applyFiltersBtn.addEventListener('click', applyFilters);
    if (confirmOccupyBtn) confirmOccupyBtn.addEventListener('click', occupySpace);
    if (confirmFreeBtn) confirmFreeBtn.addEventListener('click', freeSpace);
    if (confirmReserveBtn) confirmReserveBtn.addEventListener('click', reserveSpace);

    const reserveForm = document.getElementById('reserveSpaceForm');
    if (reserveForm) {
      reserveForm.addEventListener('submit', e => {
        e.preventDefault();
        reserveSpace();
      });
    } else {
      console.warn('Formulario reserveSpaceForm no encontrado');
    }

    const freeForm = document.getElementById('freeSpaceForm');
    if (freeForm) {
      freeForm.addEventListener('submit', e => {
        e.preventDefault();
        freeSpace();
      });
    } else {
      console.warn('Formulario freeSpaceForm no encontrado');
    }
  }

  async function loadSpaceTypes() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/tipos-espacio`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      if (data.success) {
        const vehicleTypeSelect = document.getElementById('vehicleType');
        if (!vehicleTypeSelect) return;
        const currentValue = vehicleTypeSelect.value;
        vehicleTypeSelect.innerHTML = '';
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Seleccione...';
        defaultOption.disabled = true;
        defaultOption.selected = true;
        vehicleTypeSelect.appendChild(defaultOption);
        data.data.forEach(type => {
          const option = document.createElement('option');
          option.value = type.nombre;
          option.textContent = type.nombre;
          vehicleTypeSelect.appendChild(option);
        });
        if (currentValue && [...vehicleTypeSelect.options].some(opt => opt.value === currentValue)) {
          vehicleTypeSelect.value = currentValue;
        }
      }
    } catch (error) {
      console.error('Error al cargar tipos:', error);
      showAlert('Error al cargar tipos. Recargue la página.', 'danger');
    }
  }

  async function loadSpaces() {
    spacesContainer.innerHTML = `
      <div class="col-12 text-center">
        <div class="spinner-border" role="status">
          <span class="visually-hidden">Cargando...</span>
        </div>
      </div>
    `;
    try {
      const response = await fetch(`${API_BASE_URL}/api/espacios`);
      if (!response.ok) throw new Error('Error al cargar espacios');
      const data = await response.json();
      if (data.success) {
        currentSpaces = data.data;
        renderSpaces(currentSpaces);
      }
    } catch (error) {
      console.error('Error:', error);
      spacesContainer.innerHTML = `
        <div class="col-12 text-center text-danger">
          <i class="fas fa-exclamation-triangle fa-2x mb-2"></i>
          <p>Error al cargar los espacios.</p>
        </div>
      `;
    }
  }

  function getBadgeClass(estado) {
    switch (estado?.toLowerCase()) {
      case 'disponible': return 'bg-success';
      case 'ocupado': return 'bg-danger';
      case 'reservado': return 'bg-warning';
      default: return 'bg-secondary';
    }
  }

  function renderSpaces(spaces) {
    spacesContainer.innerHTML = '';
    spaces.forEach(space => {
      const card = document.createElement('div');
      card.className = 'card m-2 shadow-sm';
      let buttons = '';
      if (space.estado.toLowerCase() === 'disponible') {
        buttons = `
          <button class="btn btn-primary btn-sm occupy-btn" 
                  data-id="${space.espacio_id}" 
                  data-tipo="${space.tipo}">
            <i class="bi bi-car-front"></i> Ocupar
          </button>
          <button class="btn btn-success btn-sm reserve-btn" 
                  data-id="${space.espacio_id}" 
                  data-tipo="${space.tipo}">
            <i class="bi bi-bookmark"></i> Reservar
          </button>
        `;
      } else if (space.estado.toLowerCase() === 'reservado') {
        buttons = `
          <button class="btn btn-primary btn-sm occupy-reserved-btn" 
                  data-id="${space.espacio_id}" 
                  data-tipo="${space.tipo}">
            <i class="bi bi-car-front"></i> Marcar como Ocupado
          </button>
        `;
      }
      card.innerHTML = `
        <div class="card-body">
          <div class="d-flex justify-content-between">
            <h5 class="card-title">${space.codigo || 'Sin código'}</h5>
            <span class="badge ${getBadgeClass(space.estado)}">${space.estado}</span>
          </div>
          <p class="card-text"><strong>Tipo:</strong> ${space.tipo || 'N/A'}</p>
          <p class="card-text"><strong>Ubicación:</strong> Piso ${space.piso || '-'}, Zona ${space.zona || '-'}</p>
          <button class="btn btn-warning btn-sm free-btn" 
                  data-id="${space.espacio_id}">
            <i class="bi bi-arrow-left-right"></i> Liberar
          </button>
          ${buttons}
          <button class="btn btn-outline-secondary btn-sm details-btn" 
                  data-id="${space.espacio_id}">
            <i class="bi bi-info-circle"></i> Detalles
          </button>
        </div>
      `;
      spacesContainer.appendChild(card);
    });
    initializeEvents();
  }

  function initializeEvents() {
    document.querySelectorAll('.free-btn').forEach(button => {
      button.addEventListener('click', function() {
        const spaceId = parseInt(button.dataset.id);
        const space = currentSpaces.find(s => s.espacio_id === spaceId);
        if (space) setupFreeModal(space);
        else showAlert('Error: Espacio no encontrado', 'danger');
      });
    });
    document.querySelectorAll('.reserve-btn').forEach(button => {
      button.addEventListener('click', function() {
        const spaceId = parseInt(button.dataset.id);
        const space = currentSpaces.find(s => s.espacio_id === spaceId);
        if (space) setupReserveModal(space);
        else showAlert('Error: Espacio no encontrado', 'danger');
      });
    });
    document.querySelectorAll('.occupy-btn').forEach(button => {
      button.addEventListener('click', function() {
        const spaceId = parseInt(button.dataset.id);
        const space = currentSpaces.find(s => s.espacio_id === spaceId);
        if (space) setupOccupyModal(space);
        else showAlert('Error: Espacio no encontrado', 'danger');
      });
    });
    document.querySelectorAll('.occupy-reserved-btn').forEach(button => {
      button.addEventListener('click', function() {
        const spaceId = parseInt(button.dataset.id);
        const space = currentSpaces.find(s => s.espacio_id === spaceId);
        if (space) setupOccupyModal(space);
        else showAlert('Error: Espacio no encontrado', 'danger');
      });
    });
    document.querySelectorAll('.details-btn').forEach(button => {
      button.addEventListener('click', async function() {
        const spaceId = parseInt(button.dataset.id);
        const space = currentSpaces.find(s => s.espacio_id === spaceId);
        if (space) await setupDetailsModal(space);
        else showAlert('Error: Espacio no encontrado', 'danger');
      });
    });
  }

  async function setupFreeModal(space) {
    if (!space || !space.espacio_id) {
      showAlert('Error: Espacio inválido', 'danger');
      return;
    }
    const spaceIdInput = document.getElementById('spaceIdToFree');
    const freeSpaceCharge = document.getElementById('freeSpaceCharge');
    const paymentMethodSelect = document.getElementById('paymentMethod');
    if (!spaceIdInput || !freeSpaceCharge || !paymentMethodSelect) {
      showAlert('Error: Elementos del modal no encontrados', 'danger');
      return;
    }
    spaceIdInput.value = space.espacio_id;
    document.getElementById('freeSpaceCode').textContent = space.codigo ? `- ${space.codigo}` : '';
    paymentMethodSelect.value = '';

    // Obtener placa y calcular tarifa
    let tarifa = 0;
    let placa = '';
    try {
      const movimientoResult = await fetch(`${API_BASE_URL}/api/movimientos/entrada`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ espacio_id: space.espacio_id })
      });
      const movimientoData = await movimientoResult.json();
      if (movimientoData.success && movimientoData.data && movimientoData.data.placa) {
        placa = movimientoData.data.placa;
        const tarifaResult = await fetch(`${API_BASE_URL}/api/calcular-cobro`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ espacio_id: space.espacio_id, placa })
        });
        const tarifaData = await tarifaResult.json();
        if (tarifaData.success && tarifaData.tarifa != null) {
          tarifa = tarifaData.tarifa;
        }
      }
    } catch (error) {
      console.error('Error al calcular tarifa:', error);
      showAlert('Error al calcular la tarifa', 'danger');
    }

    freeSpaceCharge.textContent = tarifa.toFixed(2);
    const modal = new bootstrap.Modal(document.getElementById('freeSpaceModal'), { backdrop: true });
    modal.show();
  }

  function setupReserveModal(space) {
    if (!space || !space.espacio_id || !space.tipo) {
      showAlert('Error: Espacio inválido', 'danger');
      return;
    }
    const spaceIdInput = document.getElementById('spaceIdToReserve');
    const spaceTypeInput = document.getElementById('reserveSpaceType');
    if (!spaceIdInput || !spaceTypeInput) {
      showAlert('Error: Elementos del modal no encontrados', 'danger');
      return;
    }
    spaceIdInput.value = space.espacio_id;
    spaceTypeInput.value = typeMapping[space.tipo] || space.tipo;
    document.getElementById('reserveSpaceCode').textContent = space.codigo ? `- ${space.codigo}` : '';
    document.getElementById('reserveVehiclePlate').value = '';
    const modal = new bootstrap.Modal(document.getElementById('reserveSpaceModal'), { backdrop: true });
    modal.show();
  }

  function setupOccupyModal(space) {
    if (!space || !space.espacio_id || !space.tipo) {
      showAlert('Error: Espacio inválido', 'danger');
      return;
    }
    const spaceIdInput = document.getElementById('spaceIdToOccupy');
    const vehicleTypeInput = document.getElementById('vehicleType');
    const vehiclePlateInput = document.getElementById('vehiclePlate');
    if (!spaceIdInput || !vehicleTypeInput || !vehiclePlateInput) {
      showAlert('Error: Elementos del modal no encontrados', 'danger');
      return;
    }
    spaceIdInput.value = space.espacio_id;
    vehicleTypeInput.value = typeMapping[space.tipo] || space.tipo;
    vehiclePlateInput.value = space.estado.toLowerCase() === 'reservado' && space.placa_reservada ? space.placa_reservada : '';
    const modal = new bootstrap.Modal(document.getElementById('occupySpaceModal'), { backdrop: true });
    modal.show();
  }

  async function setupDetailsModal(space) {
    if (!space || !space.espacio_id) {
      showAlert('Error: Espacio inválido', 'danger');
      return;
    }
    const detailSpaceCode = document.getElementById('detailSpaceCode');
    const detailSpaceType = document.getElementById('detailSpaceType');
    const detailSpaceLocation = document.getElementById('detailSpaceLocation');
    const detailSpaceStatus = document.getElementById('detailSpaceStatus');
    const vehicleDetails = document.getElementById('vehicleDetails');
    if (!detailSpaceCode || !detailSpaceType || !detailSpaceLocation || !detailSpaceStatus || !vehicleDetails) {
      showAlert('Error: Elementos del modal no encontrados', 'danger');
      return;
    }
    detailSpaceCode.textContent = space.codigo || 'Sin código';
    detailSpaceType.textContent = space.tipo || 'N/A';
    detailSpaceLocation.textContent = `Piso ${space.piso || '-'}, Zona ${space.zona || '-'}`;
    detailSpaceStatus.textContent = space.estado || 'Desconocido';
    vehicleDetails.style.display = 'none';

    if (space.estado.toLowerCase() === 'reservado' && space.placa_reservada) {
      vehicleDetails.style.display = 'block';
      document.getElementById('detailVehiclePlate').textContent = space.placa_reservada;
      document.getElementById('detailVehicleType').textContent = space.tipo;
      document.getElementById('detailEntryTime').textContent = 'N/A';
    } else if (space.estado.toLowerCase() === 'ocupado') {
      try {
        const response = await fetch(`${API_BASE_URL}/api/movimientos/entrada`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ espacio_id: space.espacio_id })
        });
        const data = await response.json();
        if (data.success && data.data) {
          vehicleDetails.style.display = 'block';
          document.getElementById('detailVehiclePlate').textContent = data.data.placa || 'N/A';
          document.getElementById('detailVehicleType').textContent = data.data.tipo_vehiculo || 'N/A';
          document.getElementById('detailEntryTime').textContent = data.data.fecha_hora ? new Date(data.data.fecha_hora).toLocaleString() : 'N/A';
        }
      } catch (error) {
        console.error('Error al obtener datos:', error);
        showAlert('Error al cargar detalles del vehículo', 'danger');
      }
    }

    const modal = new bootstrap.Modal(document.getElementById('spaceDetailsModal'), { backdrop: true });
    modal.show();
  }

  async function freeSpace() {
    const spaceId = document.getElementById('spaceIdToFree')?.value;
    const paymentMethod = document.getElementById('paymentMethod')?.value;
    const freeSpaceCharge = document.getElementById('freeSpaceCharge')?.textContent;
    const errors = [];
    if (!spaceId || isNaN(spaceId) || spaceId <= 0) errors.push('ID de espacio inválido');
    if (!paymentMethod || !['Efectivo', 'Tarjeta'].includes(paymentMethod)) errors.push('Método de pago inválido');
    if (!freeSpaceCharge || isNaN(parseFloat(freeSpaceCharge))) errors.push('Monto a cobrar inválido');
    if (errors.length > 0) {
      showAlert(`Errores:<br>- ${errors.join('<br>- ')}`, 'danger');
      return;
    }
    const btn = document.getElementById('confirmFreeBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Procesando...';
    try {
      const response = await fetch(`${API_BASE_URL}/api/liberar-espacio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          espacio_id: parseInt(spaceId),
          usuario_id: 5,
          metodo_pago: paymentMethod,
          monto: parseFloat(freeSpaceCharge)
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Error al liberar');
      showAlert('✅ Espacio liberado', 'success');
      loadSpaces();
      const modal = bootstrap.Modal.getInstance(document.getElementById('freeSpaceModal'));
      if (modal) modal.hide();
    } catch (error) {
      showAlert(`❌ ${error.message}`, 'danger');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-unlock"></i> Confirmar Liberación';
    }
  }

  async function occupySpace() {
    const spaceId = document.getElementById('spaceIdToOccupy')?.value;
    const vehicleType = document.getElementById('vehicleType')?.value;
    const plate = document.getElementById('vehiclePlate')?.value?.trim();
    const errors = [];
    if (!spaceId || isNaN(spaceId) || spaceId <= 0) errors.push('ID de espacio inválido');
    if (!plate || plate.length < 3) errors.push('Placa inválida');
    if (!vehicleType) errors.push('Tipo de vehículo no definido');
    if (errors.length > 0) {
      showAlert(`Errores:<br>- ${errors.join('<br>- ')}`, 'danger');
      return;
    }
    const btn = document.getElementById('confirmOccupyBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Procesando...';
    try {
      const response = await fetch(`${API_BASE_URL}/api/asignar-vehiculo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          espacio_id: parseInt(spaceId),
          placa: plate.toUpperCase(),
          tipo: vehicleType
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Error al ocupar');
      showAlert('✅ Espacio ocupado', 'success');
      document.getElementById('occupySpaceForm').reset();
      loadSpaces();
      const modal = bootstrap.Modal.getInstance(document.getElementById('occupySpaceModal'));
      if (modal) modal.hide();
    } catch (error) {
      showAlert(`❌ ${error.message}`, 'danger');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-car-front"></i> Confirmar';
    }
  }

  async function reserveSpace() {
    const spaceId = document.getElementById('spaceIdToReserve')?.value;
    const plate = document.getElementById('reserveVehiclePlate')?.value?.trim();
    const spaceType = document.getElementById('reserveSpaceType')?.value;
    const errors = [];
    if (!spaceId || isNaN(spaceId) || spaceId <= 0) errors.push('ID de espacio inválido');
    if (!plate || plate.length < 3) errors.push('Placa inválida');
    if (!spaceType) errors.push('Tipo de espacio no definido');
    if (errors.length > 0) {
      showAlert(`Errores:<br>- ${errors.join('<br>- ')}`, 'danger');
      return;
    }
    const btn = document.getElementById('confirmReserveBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Procesando...';
    try {
      const response = await fetch(`${API_BASE_URL}/api/reservar-espacio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          espacio_id: parseInt(spaceId),
          placa: plate.toUpperCase(),
          tipo_vehiculo: spaceType,
          usuario_id: 5
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Error al reservar');
      showAlert('✅ Reserva registrada', 'success');
      document.getElementById('reserveSpaceForm').reset();
      loadSpaces();
      const modal = bootstrap.Modal.getInstance(document.getElementById('reserveSpaceModal'));
      if (modal) modal.hide();
    } catch (error) {
      showAlert(`❌ ${error.message}`, 'danger');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-bookmark"></i> Confirmar Reserva';
    }
  }

  function applyFilters() {
    const floorFilter = document.getElementById('floorFilter').value;
    const zoneFilter = document.getElementById('zoneFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;
    let filteredSpaces = [...currentSpaces];
    if (floorFilter) filteredSpaces = filteredSpaces.filter(space => space.piso === parseInt(floorFilter));
    if (zoneFilter) filteredSpaces = filteredSpaces.filter(space => space.zona === zoneFilter);
    if (statusFilter) filteredSpaces = filteredSpaces.filter(space => space.estado === statusFilter);
    renderSpaces(filteredSpaces);
  }

  function showAlert(message, type) {
    const container = document.querySelector('.container') || document.body;
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.setAttribute('role', 'alert');
    alertDiv.innerHTML = `
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    container.insertBefore(alertDiv, container.firstChild);
    setTimeout(() => {
      alertDiv.classList.remove('show');
      alertDiv.classList.add('fade');
      setTimeout(() => alertDiv.remove(), 150);
    }, 5000);
  }
});