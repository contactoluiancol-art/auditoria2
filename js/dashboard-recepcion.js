// ======================
// CONFIGURACIÓN SUPABASE
// ======================
// Nota: La anon key requiere RLS activo en Supabase.
const SUPABASE_URL = 'https://hurxdjoiafkjoyrmyhbd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // Utiliza tu clave pública segura

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ======================
// VARIABLES GLOBALES
// ======================
let graficoRecepciones = null;
let graficoNovedades = null;
let graficoTendencia = null;

const ORDEN_MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

// Helper para evitar inyección en el DOM
function sanitize(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// ======================
// CARGA DE DATOS
// ======================
async function cargarDashboard() {
  try {
    const { data, error } = await supabaseClient
      .from('recepciones')
      .select('created_at, novedad_original, estado, proveedor, material');

    if (error) throw error;
    construirDashboard(data || []);
  } catch (err) {
    console.error('Error al cargar datos del dashboard:', err.message);
  }
}

// ======================
// CONSTRUCCIÓN DEL DASHBOARD
// ======================
function construirDashboard(recepciones) {
  let totalRecepciones = 0;
  let totalFaltantes = 0;
  let totalSobrantes = 0;
  let totalDanados = 0;

  const resumenMeses = {};

  recepciones.forEach(item => {
    totalRecepciones++;

    const fecha = new Date(item.created_at);
    const mes = fecha.toLocaleString('es-CO', { month: 'long' }).toLowerCase();

    if (!resumenMeses[mes]) {
      resumenMeses[mes] = { recepciones: 0, faltantes: 0, sobrantes: 0, danados: 0 };
    }

    resumenMeses[mes].recepciones++;

    const estado = (item.novedad_original || item.estado || '').toLowerCase().trim();

    if (estado === 'faltante') {
      totalFaltantes++;
      resumenMeses[mes].faltantes++;
    } else if (estado === 'sobrante') {
      totalSobrantes++;
      resumenMeses[mes].sobrantes++;
    } else if (estado === 'dañado' || estado === 'danado') {
      totalDanados++;
      resumenMeses[mes].danados++;
    }
  });

  // KPIs
  actualizarKPI('kpiTotalRecepciones', totalRecepciones);
  actualizarKPI('kpiFaltantes', totalFaltantes);
  actualizarKPI('kpiSobrantes', totalSobrantes);
  actualizarKPI('kpiDanados', totalDanados);

  // Tabla Consolidada
  const body = document.getElementById('dashboardRecepcionBody');
  if (body) {
    body.innerHTML = '';
    const mesesOrdenados = ORDEN_MESES.filter(mes => resumenMeses[mes]);

    let mesMasActivo = '-';
    let valorMasActivo = 0;
    let mesMasCritico = '-';
    let valorMasCritico = 0;

    mesesOrdenados.forEach(mes => {
      const item = resumenMeses[mes];
      const totalNovedades = item.faltantes + item.sobrantes + item.danados;

      if (item.recepciones > valorMasActivo) {
        valorMasActivo = item.recepciones;
        mesMasActivo = mes;
      }

      if (totalNovedades > valorMasCritico) {
        valorMasCritico = totalNovedades;
        mesMasCritico = mes;
      }

      body.innerHTML += `
        <tr>
          <td>${sanitize(mes)}</td>
          <td>${item.recepciones}</td>
          <td>${item.faltantes}</td>
          <td>${item.sobrantes}</td>
          <td>${item.danados}</td>
          <td>${totalNovedades}</td>
        </tr>
      `;
    });

    actualizarKPI('mesMasActivo', mesMasActivo);
    actualizarKPI('mesMasCritico', mesMasCritico);

    // Gráficos y Top Rankings
    crearGraficoRecepciones(mesesOrdenados, resumenMeses);
    crearGraficoNovedades(totalFaltantes, totalSobrantes, totalDanados);
    crearGraficoTendencia(mesesOrdenados, resumenMeses);
  }

  calcularSaludOperativa(totalRecepciones, totalFaltantes, totalSobrantes, totalDanados);
  construirTopProveedores(recepciones);
  construirTopMateriales(recepciones);
}

function actualizarKPI(id, valor) {
  const el = document.getElementById(id);
  if (el) el.innerText = valor;
}

// ======================
// GRÁFICOS CHART.JS
// ======================
function crearGraficoRecepciones(meses, resumen) {
  const canvas = document.getElementById('graficoRecepciones');
  if (!canvas) return;
  if (graficoRecepciones) graficoRecepciones.destroy();

  graficoRecepciones = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: meses,
      datasets: [{
        label: 'Recepciones Registradas',
        data: meses.map(m => resumen[m].recepciones),
        backgroundColor: '#2563eb',
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } }
    }
  });
}

function crearGraficoNovedades(faltantes, sobrantes, danados) {
  const canvas = document.getElementById('graficoNovedades');
  if (!canvas) return;
  if (graficoNovedades) graficoNovedades.destroy();

  graficoNovedades = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Faltantes', 'Sobrantes', 'Dañados'],
      datasets: [{
        data: [faltantes, sobrantes, danados],
        backgroundColor: ['#f59e0b', '#3b82f6', '#ef4444']
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom' } }
    }
  });
}

function crearGraficoTendencia(meses, resumen) {
  const canvas = document.getElementById('graficoTendenciaNovedades');
  if (!canvas) return;
  if (graficoTendencia) graficoTendencia.destroy();

  graficoTendencia = new Chart(canvas, {
    type: 'line',
    data: {
      labels: meses,
      datasets: [{
        label: 'Novedades',
        data: meses.map(m => resumen[m].faltantes + resumen[m].sobrantes + resumen[m].danados),
        borderColor: '#ef4444',
        backgroundColor: '#ef4444',
        tension: 0.3,
        fill: false
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } }
    }
  });
}

// ======================
// CÁLCULOS & RANKINGS
// ======================
function calcularSaludOperativa(total, faltantes, sobrantes, danados) {
  const novedades = faltantes + sobrantes + danados;
  const salud = total > 0 ? Math.max(100 - (novedades / total) * 100, 0) : 100;
  actualizarKPI('saludOperativa', `${salud.toFixed(1)}%`);
}

function construirTopProveedores(recepciones) {
  const proveedores = {};
  recepciones.forEach(item => {
    const estado = (item.novedad_original || item.estado || '').toLowerCase();
    if (['faltante', 'sobrante', 'dañado', 'danado'].includes(estado)) {
      const p = item.proveedor || 'Sin Proveedor';
      proveedores[p] = (proveedores[p] || 0) + 1;
    }
  });

  renderRanking('topProveedoresBody', proveedores);
}

function construirTopMateriales(recepciones) {
  const materiales = {};
  recepciones.forEach(item => {
    const estado = (item.novedad_original || item.estado || '').toLowerCase();
    if (['faltante', 'sobrante', 'dañado', 'danado'].includes(estado)) {
      const m = item.material || 'Sin Material';
      materiales[m] = (materiales[m] || 0) + 1;
    }
  });

  renderRanking('topMaterialesBody', materiales);
}

function renderRanking(elementId, dataset) {
  const body = document.getElementById(elementId);
  if (!body) return;

  const ranking = Object.entries(dataset)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  body.innerHTML = ranking.map(([nombre, cantidad]) => `
    <tr>
      <td>${sanitize(nombre)}</td>
      <td>${cantidad}</td>
    </tr>
  `).join('');
}

// ======================
// EXPORTACIÓN A PDF
// ======================
document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'exportarPdfBtn') {
    exportarDashboardPDF();
  }
});

function exportarDashboardPDF() {
  if (!window.jspdf) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const fecha = new Date().toLocaleString('es-CO');

  doc.setFontSize(18);
  doc.text('ELECTROINGENIERÍA', 20, 20);

  doc.setFontSize(13);
  doc.text('Dashboard Ejecutivo de Recepciones', 20, 30);

  doc.setFontSize(10);
  doc.text(`Fecha de emisión: ${fecha}`, 20, 40);

  const kpis = [
    `Total Recepciones: ${document.getElementById('kpiTotalRecepciones')?.innerText || '0'}`,
    `Faltantes: ${document.getElementById('kpiFaltantes')?.innerText || '0'}`,
    `Sobrantes: ${document.getElementById('kpiSobrantes')?.innerText || '0'}`,
    `Dañados: ${document.getElementById('kpiDanados')?.innerText || '0'}`,
    `Mes más activo: ${document.getElementById('mesMasActivo')?.innerText || '-'}`,
    `Mes más crítico: ${document.getElementById('mesMasCritico')?.innerText || '-'}`
  ];

  let y = 55;
  kpis.forEach(texto => {
    doc.text(texto, 20, y);
    y += 8;
  });

  y += 6;
  doc.setFontSize(12);
  doc.text('Consolidado Mensual', 20, y);
  y += 8;

  doc.setFontSize(10);
  const filas = document.querySelectorAll('#dashboardRecepcionBody tr');
  filas.forEach(fila => {
    const textoFila = Array.from(fila.children).map(td => td.innerText).join(' | ');
    doc.text(textoFila, 20, y);
    y += 7;
  });

  doc.save('Dashboard_Recepciones.pdf');
}

// ======================
// INICIALIZACIÓN
// ======================
document.addEventListener('DOMContentLoaded', cargarDashboard);