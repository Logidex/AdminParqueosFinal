document.addEventListener('DOMContentLoaded', () => {
  const API_BASE_URL = 'http://localhost:3000';
  const summaryCard = document.getElementById('summaryCard');
  const occupationChartCanvas = document.getElementById('occupationChart');
  const detailedReportTable = document.getElementById('detailedReportTable').querySelector('tbody');
  const generateReportBtn = document.getElementById('generateReportBtn');
  const startDateInput = document.getElementById('startDate');
  const endDateInput = document.getElementById('endDate');
  const vehicleTypeFilter = document.getElementById('vehicleTypeFilter');

  let occupationChart;

  initializeApp();

  async function initializeApp() {
    try {
      await loadVehicleTypes();
      await loadSummary();
      await loadOccupationData();
      await loadDetailedReport();
      setupEventListeners();
    } catch (error) {
      console.error('Error inicializando la aplicación:', error);
      showAlert('Error al inicializar. Por favor, recargue la página.', 'danger');
    }
  }

  function setupEventListeners() {
    if (generateReportBtn) {
      generateReportBtn.addEventListener('click', async () => {
        try {
          console.log('Clic en Generar Reportes. Parámetros:', {
            start: startDateInput.value,
            end: endDateInput.value,
            type: vehicleTypeFilter.value
          });
          if (!startDateInput.value || !endDateInput.value) {
            throw new Error('Fechas no seleccionadas');
          }
          await loadSummary();
          await loadOccupationData();
          await loadDetailedReport();
          console.log('Reportes generados exitosamente');
          downloadReportBtn.disabled = false; // Habilitar botón de descarga
        } catch (error) {
          console.error('Error al generar reportes:', error.message);
          showAlert(`Error al generar reportes: ${error.message}`, 'danger');
        }
      });
    } else {
      console.error('Botón generateReportBtn no encontrado');
    }
    if (downloadReportBtn) {
      downloadReportBtn.addEventListener('click', () => {
        downloadCSV();
      });
    }
  }
  
  function downloadCSV() {
    const rows = Array.from(detailedReportTable.querySelectorAll('tr'));
    if (rows.length === 0) {
      showAlert('No hay datos para descargar', 'warning');
      return;
    }
    const csvContent = [
      ['Fecha', 'Espacio', 'Tipo Vehículo', 'Tiempo', 'Ingreso', 'Método de Pago'],
      ...rows.map(row => 
        Array.from(row.cells).map(cell => `"${cell.textContent.replace(/"/g, '""')}"`)
      )
    ].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `reportes_${startDateInput.value}_${endDateInput.value}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function loadVehicleTypes() {
    try {
      console.log('Cargando tipos de vehículo...');
      const response = await fetch(`${API_BASE_URL}/api/tipos-espacio`);
      if (!response.ok) throw new Error(`HTTP ${response.status}: Error al cargar tipos de vehículo`);
      const data = await response.json();
      console.log('Tipos de vehículo recibidos:', data);
      if (data.success) {
        vehicleTypeFilter.innerHTML = '<option value="Todos">Todos</option>';
        data.data.forEach(type => {
          const option = document.createElement('option');
          option.value = type.nombre;
          option.textContent = type.nombre;
          vehicleTypeFilter.appendChild(option);
        });
      }
    } catch (error) {
      console.error('Error al cargar tipos de vehículo:', error.message);
      showAlert('Error al cargar tipos de vehículo.', 'danger');
    }
  }

  async function loadSummary() {
    const start = startDateInput.value;
    const end = endDateInput.value;
    if (!start || !end) {
      console.warn('Fechas no seleccionadas para resumen');
      summaryCard.innerHTML = '<p class="text-danger text-center">Seleccione un rango de fechas</p>';
      return;
    }
    try {
      console.log('Cargando resumen:', { start, end });
      const response = await fetch(`${API_BASE_URL}/api/reportes/resumen?start=${start}&end=${end}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}: Error al cargar resumen`);
      const data = await response.json();
      console.log('Resumen recibido:', data);
      if (data.success) {
        summaryCard.innerHTML = `
          <div class="row text-center">
            <div class="col-md-4">
              <h5>Ingresos</h5>
              <p class="fs-4" style="color: var(--accent-color)">$${data.ingresos.toFixed(2)}</p>
            </div>
            <div class="col-md-4">
              <h5>Ocupación</h5>
              <p class="fs-4" style="color: var(--text-color)">${data.ocupacion.toFixed(1)}%</p>
            </div>
            <div class="col-md-4">
              <h5>Movimientos</h5>
              <p class="fs-4" style="color: var(--hover-color)">${data.movimientos}</p>
            </div>
          </div>
        `;
      } else {
        console.warn('No se encontraron datos para el resumen');
        summaryCard.innerHTML = '<p class="text-danger text-center">No se encontraron datos para el resumen</p>';
      }
    } catch (error) {
      console.error('Error al cargar resumen:', error.message);
      summaryCard.innerHTML = '<p class="text-danger text-center">Error al cargar resumen</p>';
    }
  }

  async function loadOccupationData() {
    const start = startDateInput.value;
    const end = endDateInput.value;
    if (!start || !end) {
      console.warn('Fechas no seleccionadas para ocupación');
      occupationChartCanvas.parentElement.innerHTML = '<p class="text-danger text-center">Seleccione un rango de fechas</p>';
      return;
    }
    try {
      console.log('Cargando ocupación:', { start, end });
      const response = await fetch(`${API_BASE_URL}/api/reportes/ocupacion?start=${start}&end=${end}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}: Error al cargar datos de ocupación`);
      const data = await response.json();
      console.log('Ocupación recibida:', data);
      if (data.success) {
        updateOccupationChart(data.data);
      } else {
        console.warn('No se encontraron datos de ocupación');
        occupationChartCanvas.parentElement.innerHTML = '<p class="text-danger text-center">No se encontraron datos de ocupación</p>';
      }
    } catch (error) {
      console.error('Error al cargar ocupación:', error.message);
      occupationChartCanvas.parentElement.innerHTML = '<p class="text-danger text-center">Error al cargar gráfico</p>';
    }
  }

  function updateOccupationChart(data) {
    if (occupationChart) occupationChart.destroy();
    console.log('Actualizando gráfico con datos:', data);
    occupationChart = new Chart(occupationChartCanvas, {
      type: 'bar',
      data: {
        labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
        datasets: [{
          label: 'Entradas por hora',
          data: data,
          backgroundColor: 'rgba(76, 175, 80, 0.6)',
          borderColor: 'rgba(76, 175, 80, 1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            labels: { color: '#ffffff' }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Cantidad de Entradas', color: '#ffffff' },
            ticks: { color: '#ffffff' },
            grid: { color: '#272727' }
          },
          x: {
            title: { display: true, text: 'Hora del Día', color: '#ffffff' },
            ticks: { color: '#ffffff' },
            grid: { color: '#272727' }
          }
        }
      }
    });
  }

  async function loadDetailedReport() {
    const start = startDateInput.value;
    const end = endDateInput.value;
    const type = vehicleTypeFilter.value;
    if (!start || !end) {
      console.warn('Fechas no seleccionadas para reporte detallado');
      detailedReportTable.innerHTML = '<tr><td colspan="6" class="text-danger text-center">Seleccione un rango de fechas</td></tr>';
      return;
    }
    try {
      console.log('Cargando reporte detallado:', { start, end, type });
      const response = await fetch(`${API_BASE_URL}/api/reportes/detalle?start=${start}&end=${end}&type=${type}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}: Error al cargar reporte detallado`);
      const data = await response.json();
      console.log('Reporte detallado recibido:', data);
      if (data.success) {
        renderDetailedReport(data.reportes);
      } else {
        console.warn('No se encontraron datos para el reporte detallado');
        detailedReportTable.innerHTML = '<tr><td colspan="6" class="text-center">No hay datos para mostrar</td></tr>';
      }
    } catch (error) {
      console.error('Error al cargar reporte detallado:', error.message);
      detailedReportTable.innerHTML = '<tr><td colspan="6" class="text-danger text-center">Error al cargar reporte</td></tr>';
    }
  }

  function renderDetailedReport(reports) {
    detailedReportTable.innerHTML = '';
    if (reports.length === 0) {
      console.warn('No hay reportes para renderizar');
      detailedReportTable.innerHTML = '<tr><td colspan="6" class="text-center">No hay datos para mostrar</td></tr>';
      return;
    }
    reports.forEach(report => {
      console.log('Renderizando reporte:', report);
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${report.fecha || 'N/A'}</td>
        <td>${report.espacio || 'N/A'}</td>
        <td>${report.tipo_vehiculo || 'N/A'}</td>
        <td>${report.tiempo || 'N/A'}</td>
        <td>$${report.ingreso ? report.ingreso.toFixed(2) : '0.00'}</td>
        <td>${report.metodo_pago || 'Sin pago'}</td>
      `;
      detailedReportTable.appendChild(row);
    });
  }

  function showAlert(message, type) {
    const alertContainer = document.createElement('div');
    alertContainer.className = `alert alert-${type} alert-dismissible fade show`;
    alertContainer.innerHTML = `
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    document.querySelector('.container').prepend(alertContainer);
    setTimeout(() => {
      alertContainer.classList.remove('show');
      setTimeout(() => alertContainer.remove(), 150);
    }, 5000);
  }
});
