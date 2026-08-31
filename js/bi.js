/**
 * ====================================================================
 * BI.JS — Motor Unificado de Business Intelligence & Analítica
 * ====================================================================
 * Versión: 2.7.0
 */

(function () {
  'use strict';

  let datosExcelOriginales = [];
  let datosExcelFiltrados = [];
  let chartPrincipal = null;
  let chartTop = null;
  let chartLinea = null;
  let dataTableInstancia = null;

  function $(id) {
    return document.getElementById(id);
  }

  function notificar(mensaje, tipo = 'warning') {
    if (typeof window.mostrarNotificacion === 'function') {
      window.mostrarNotificacion('BI Inteligente', mensaje, tipo);
    } else if (typeof window.notifAlert === 'function') {
      window.notifAlert(mensaje);
    }
  }

  // ==================================================================
  // 1. CARGA DE EXCEL
  // ==================================================================
  function leerExcel(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (evt) {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheet];
        const json = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (!json || json.length === 0) {
          notificar('El archivo no contiene registros o filas legibles.');
          return;
        }

        datosExcelOriginales = json;
        datosExcelFiltrados = [...json];

        configurarSelectores(json);
        generarDashboardCompleto();
        renderizarTablaBI(json);

        notificar(`Se cargaron ${json.length} filas para análisis BI.`, 'success');

      } catch (err) {
        console.error('Error leyendo Excel en BI:', err);
        notificar('Error al procesar el archivo Excel.', 'error');
      }
    };

    reader.readAsArrayBuffer(file);
  }

  // ==================================================================
  // 2. DETECCIÓN DE COLUMNAS, DIMENSIONES Y MÉTRICAS
  // ==================================================================
  function configurarSelectores(datos) {
    if (!datos.length) return;

    const columnas = Object.keys(datos[0]);
    const selDim = $('dimension');
    const selMet = $('metrica');
    const selF1 = $('filtroColumna1');
    const selF2 = $('filtroColumna2');
    const lblF1 = $('labelFiltro1');
    const lblF2 = $('labelFiltro2');

    if (!selDim || !selMet) return;

    selDim.innerHTML = '';
    selMet.innerHTML = '';

    // Determinar columnas numéricas vs texto
    const metricasCandidatas = [];
    const dimensionesCandidatas = [];

    columnas.forEach(col => {
      const valoresMuestra = datos.slice(0, 30).map(d => d[col]);
      const esNumerica = valoresMuestra.some(v => v !== '' && !isNaN(Number(v)));

      if (esNumerica) metricasCandidatas.push(col);
      dimensionesCandidatas.push(col);

      selDim.innerHTML += `<option value="${col}">${col}</option>`;
      selMet.innerHTML += `<option value="${col}">${col}</option>`;
    });

    if (metricasCandidatas.length > 0) {
      selMet.value = metricasCandidatas[0];
    }

    // Configurar filtros dinámicos con las dos primeras dimensiones
    if (dimensionesCandidatas.length >= 1 && selF1 && lblF1) {
      const col1 = dimensionesCandidatas[0];
      lblF1.textContent = col1;
      poblarValoresFiltro(selF1, col1, datos);
    }
    if (dimensionesCandidatas.length >= 2 && selF2 && lblF2) {
      const col2 = dimensionesCandidatas[1];
      lblF2.textContent = col2;
      poblarValoresFiltro(selF2, col2, datos);
    }
  }

  function poblarValoresFiltro(selectElement, columna, datos) {
    const unicos = [...new Set(datos.map(d => String(d[columna] || '').trim()).filter(Boolean))].slice(0, 50);
    selectElement.innerHTML = `<option value="">(Todos)</option>` + unicos.map(v => `<option value="${v}">${v}</option>`).join('');
  }

  // ==================================================================
  // 3. GENERACIÓN DE DASHBOARD & GRÁFICOS
  // ==================================================================
  function generarDashboardCompleto() {
    if (!datosExcelFiltrados.length) return;

    const dim = $('dimension')?.value;
    const met = $('metrica')?.value;
    const tipo = $('tipoGrafico')?.value || 'bar';

    if (!dim || !met) return;

    // Agrupar datos por dimensión
    const acumulador = {};
    let totalMetrica = 0;
    let maxValor = -Infinity;
    let contadorRegistros = datosExcelFiltrados.length;

    datosExcelFiltrados.forEach(row => {
      const key = String(row[dim] || 'Sin especificar').trim();
      const val = Number(row[met]) || (row[met] !== '' ? 1 : 0);

      acumulador[key] = (acumulador[key] || 0) + val;
      totalMetrica += val;
      if (val > maxValor) maxValor = val;
    });

    const etiquetas = Object.keys(acumulador);
    const valores = Object.values(acumulador);
    const promedio = contadorRegistros > 0 ? (totalMetrica / contadorRegistros) : 0;

    // Actualizar KPIs
    if ($('kpiRegistros')) $('kpiRegistros').innerText = contadorRegistros.toLocaleString();
    if ($('kpiTotal')) $('kpiTotal').innerText = totalMetrica.toLocaleString();
    if ($('kpiPromedio')) $('kpiPromedio').innerText = promedio.toLocaleString('es-CO', { maximumFractionDigits: 1 });
    if ($('kpiMaximo')) $('kpiMaximo').innerText = (maxValor === -Infinity ? 0 : maxValor).toLocaleString();

    // 1. Gráfico Principal
    crearGraficoPrincipal(etiquetas, valores, met, tipo);

    // 2. Gráfico Top 10
    const pares = etiquetas.map((e, idx) => ({ etiqueta: e, valor: valores[idx] }));
    pares.sort((a, b) => b.valor - a.valor);
    const top10 = pares.slice(0, 10);
    crearGraficoTop(top10.map(t => t.etiqueta), top10.map(t => t.valor), met);

    // 3. Gráfico de Tendencia
    crearGraficoLinea(etiquetas.slice(0, 20), valores.slice(0, 20), met);
  }

  function crearGraficoPrincipal(labels, data, labelName, type) {
    const canvas = $('graficoPrincipal');
    if (!canvas || !window.Chart) return;
    if (chartPrincipal) chartPrincipal.destroy();

    const colores = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316'];

    chartPrincipal = new window.Chart(canvas, {
      type: type,
      data: {
        labels: labels,
        datasets: [{
          label: labelName,
          data: data,
          backgroundColor: type === 'line' ? 'rgba(37, 99, 235, 0.15)' : colores,
          borderColor: '#2563eb',
          borderWidth: 2,
          fill: type === 'line',
          tension: 0.35
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: ['pie', 'doughnut'].includes(type), position: 'bottom' }
        }
      }
    });
  }

  function crearGraficoTop(labels, data, labelName) {
    const canvas = $('graficoTop');
    if (!canvas || !window.Chart) return;
    if (chartTop) chartTop.destroy();

    chartTop = new window.Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: `Top ${labelName}`,
          data: data,
          backgroundColor: '#10b981',
          borderRadius: 6
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
      }
    });
  }

  function crearGraficoLinea(labels, data, labelName) {
    const canvas = $('graficoLinea');
    if (!canvas || !window.Chart) return;
    if (chartLinea) chartLinea.destroy();

    chartLinea = new window.Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: `Evolución ${labelName}`,
          data: data,
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          fill: true,
          tension: 0.35
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
      }
    });
  }

  // ==================================================================
  // 4. FILTROS DINÁMICOS
  // ==================================================================
  function aplicarFiltros() {
    const col1 = $('labelFiltro1')?.textContent;
    const col2 = $('labelFiltro2')?.textContent;
    const val1 = $('filtroColumna1')?.value;
    const val2 = $('filtroColumna2')?.value;

    datosExcelFiltrados = datosExcelOriginales.filter(row => {
      let cumple1 = true;
      let cumple2 = true;

      if (val1 && col1) {
        cumple1 = String(row[col1] || '').trim() === val1;
      }
      if (val2 && col2) {
        cumple2 = String(row[col2] || '').trim() === val2;
      }

      return cumple1 && cumple2;
    });

    generarDashboardCompleto();
    renderizarTablaBI(datosExcelFiltrados);
    notificar(`Filtros aplicados: ${datosExcelFiltrados.length} registros resultantes.`, 'info');
  }

  function resetearFiltros() {
    if ($('filtroColumna1')) $('filtroColumna1').value = '';
    if ($('filtroColumna2')) $('filtroColumna2').value = '';
    datosExcelFiltrados = [...datosExcelOriginales];
    generarDashboardCompleto();
    renderizarTablaBI(datosExcelFiltrados);
  }

  // ==================================================================
  // 5. TABLA DE DATOS
  // ==================================================================
  function renderizarTablaBI(datos) {
    const tabla = $('tablaBI');
    if (!tabla || !datos.length) return;

    if (dataTableInstancia) {
      dataTableInstancia.destroy();
      tabla.innerHTML = '';
    }

    const columnas = Object.keys(datos[0]).map(c => ({ title: c, data: c }));

    if (window.jQuery && window.jQuery.fn.DataTable) {
      dataTableInstancia = window.jQuery(tabla).DataTable({
        data: datos,
        columns: columnas,
        pageLength: 10,
        responsive: true,
        destroy: true,
        language: {
          search: "Buscar:",
          lengthMenu: "Mostrar _MENU_ filas",
          info: "Mostrando _START_ a _END_ de _TOTAL_ registros",
          paginate: { first: "«", previous: "‹", next: "›", last: "»" },
          emptyTable: "Sin datos disponibles"
        }
      });
    }
  }

  // ==================================================================
  // 6. EVENTOS
  // ==================================================================
  document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'excelBI') {
      leerExcel(e);
    }
  });

  document.addEventListener('click', function (e) {
    if (e.target && e.target.id === 'btnGenerar') {
      e.preventDefault();
      generarDashboardCompleto();
    }
    if (e.target && e.target.id === 'btnAplicar') {
      e.preventDefault();
      aplicarFiltros();
    }
    if (e.target && e.target.id === 'btnResetFiltros') {
      e.preventDefault();
      resetearFiltros();
    }
  });
})();
