/**
 * ====================================================================
 * SISTEMA GLOBAL DE NOTIFICACIONES ERP — PRO ENGINE & REALTIME SYNC
 * ====================================================================
 * Versión: 2.7.0
 * Características:
 *  - API Pública Unificada: window.Notif, window.crearNotificacion, window.mostrarNotificacion.
 *  - Sincronización Realtime Multi-usuario vía WebSockets (Supabase Channel).
 *  - Aislamiento estricto por cuenta (gestión individual por usuario).
 *  - Sintetizador Web Audio API nativo (sin archivos externos).
 *  - Persistencia bidireccional (LocalStorage + Supabase DB).
 */

(function () {
  'use strict';

  const MAX_HISTORIAL = 50;
  const DURACION_TOAST_MS = 4500;

  const ICONOS = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };

  const TITULOS_DEFECTO = {
    success: 'Operación Exitosa',
    error: 'Error en el Sistema',
    warning: 'Atención Requerida',
    info: 'Información del Sistema'
  };

  // ==================================================================
  // 1. GESTIÓN DE IDENTIDAD & AISLAMIENTO DE USUARIO
  // ==================================================================
  function obtenerUsuarioActual() {
    try {
      if (window.usuarioLogueado && window.usuarioLogueado.usuario) {
        return String(window.usuarioLogueado.usuario).toLowerCase().trim();
      }
      const sesion = JSON.parse(localStorage.getItem('usuarioLogueado') || '{}');
      if (sesion.usuario) {
        return String(sesion.usuario).toLowerCase().trim();
      }
    } catch (_) {
      // Ignorar error de parsing
    }
    return 'general';
  }

  function obtenerClaveStorage() {
    const usuario = obtenerUsuarioActual();
    return `erp_notif_${usuario}`;
  }

  function obtenerHistorialLocal() {
    try {
      const key = obtenerClaveStorage();
      return JSON.parse(localStorage.getItem(key)) || [];
    } catch (_) {
      return [];
    }
  }

  function guardarHistorialLocal(lista) {
    try {
      const key = obtenerClaveStorage();
      localStorage.setItem(key, JSON.stringify(lista.slice(0, MAX_HISTORIAL)));
    } catch (e) {
      console.warn('No se pudo guardar el historial de notificaciones localmente:', e);
    }
  }

  // ==================================================================
  // 2. SINTETIZADOR NATIVO WEB AUDIO API
  // ==================================================================
  let audioCtx = null;

  function reproducirSonido(tipo = 'info') {
    try {
      if (window.ERP_CONFIG && window.ERP_CONFIG.AUDIO_NOTIFICATIONS === false) return;

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      if (!audioCtx) {
        audioCtx = new AudioContextClass();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const ahora = audioCtx.currentTime;
      const tonos = {
        success: [
          { f: 523.25, d: 0.08, t: 0 },    // C5
          { f: 659.25, d: 0.10, t: 0.07 }, // E5
          { f: 1046.50, d: 0.22, t: 0.15 } // C6
        ],
        warning: [
          { f: 440.00, d: 0.12, t: 0 },    // A4
          { f: 554.37, d: 0.20, t: 0.10 }  // C#5
        ],
        error: [
          { f: 311.13, d: 0.14, t: 0 },    // Eb4
          { f: 233.08, d: 0.26, t: 0.12 }  // Bb3
        ],
        info: [
          { f: 587.33, d: 0.09, t: 0 },    // D5
          { f: 880.00, d: 0.18, t: 0.08 }  // A5
        ]
      };

      const notas = tonos[tipo] || tonos.info;
      notas.forEach(n => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = tipo === 'error' ? 'sawtooth' : tipo === 'warning' ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(n.f, ahora + n.t);

        gain.gain.setValueAtTime(0.0001, ahora + n.t);
        gain.gain.exponentialRampToValueAtTime(0.15, ahora + n.t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ahora + n.t + n.d);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(ahora + n.t);
        osc.stop(ahora + n.t + n.d);
      });
    } catch (e) {
      // Audio autoplay restrictions or unsupported browser
    }
  }

  // ==================================================================
  // 3. INYECCIÓN DEL DOM (STACK & MODALES ASÍNCRONOS)
  // ==================================================================
  function asegurarContenedores() {
    if (!document.getElementById('notifStack')) {
      const stack = document.createElement('div');
      stack.id = 'notifStack';
      stack.className = 'notif-stack-container';
      document.body.appendChild(stack);
    }

    if (!document.getElementById('notifModalOverlay')) {
      const overlay = document.createElement('div');
      overlay.id = 'notifModalOverlay';
      overlay.className = 'notif-modal-overlay';
      overlay.innerHTML = `
        <div class="notif-modal-box" id="notifModalBox">
          <div class="notif-modal-icono" id="notifModalIcono">❓</div>
          <h2 id="notifModalTitulo" class="notif-modal-titulo">Confirmación</h2>
          <p id="notifModalMensaje" class="notif-modal-mensaje"></p>
          <div id="notifModalCampoWrap" class="notif-modal-campo-wrap"></div>
          <div class="notif-modal-botones">
            <button class="notif-btn-cancelar" id="notifBtnCancelar" type="button">Cancelar</button>
            <button class="notif-btn-aceptar" id="notifBtnAceptar" type="button">Aceptar</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
    }
  }

  // ==================================================================
  // 4. RENDERIZADOR DE TOASTS
  // ==================================================================
  function mostrarToast(tipo = 'info', mensaje = '', titulo = '') {
    asegurarContenedores();
    reproducirSonido(tipo);

    const stack = document.getElementById('notifStack');
    if (!stack) return;

    const toastEl = document.createElement('div');
    toastEl.className = `notif-toast notif-${tipo}`;
    toastEl.setAttribute('role', 'alert');

    const tituloTexto = titulo || TITULOS_DEFECTO[tipo] || 'Notificación';
    const iconoTexto = ICONOS[tipo] || 'ℹ️';

    toastEl.innerHTML = `
      <div class="notif-icono">${iconoTexto}</div>
      <div class="notif-texto">
        <div class="notif-titulo">${tituloTexto}</div>
        <div class="notif-mensaje"></div>
      </div>
      <button class="notif-cerrar" type="button" aria-label="Cerrar notificación">✕</button>
      <div class="notif-barra" style="animation-duration: ${DURACION_TOAST_MS}ms;"></div>
    `;

    toastEl.querySelector('.notif-mensaje').textContent = mensaje;
    stack.appendChild(toastEl);

    function cerrar() {
      toastEl.classList.add('notif-out');
      setTimeout(() => {
        if (toastEl.parentNode) toastEl.parentNode.removeChild(toastEl);
      }, 350);
    }

    toastEl.querySelector('.notif-cerrar').addEventListener('click', cerrar);
    let timeoutId = setTimeout(cerrar, DURACION_TOAST_MS);

    toastEl.addEventListener('mouseenter', () => {
      clearTimeout(timeoutId);
      const barra = toastEl.querySelector('.notif-barra');
      if (barra) barra.style.animationPlayState = 'paused';
    });

    toastEl.addEventListener('mouseleave', () => {
      const barra = toastEl.querySelector('.notif-barra');
      if (barra) barra.style.animationPlayState = 'running';
      timeoutId = setTimeout(cerrar, 2000);
    });
  }

  // ==================================================================
  // 5. CONTROL DEL CONTADOR Y PANEL DESPLEGABLE
  // ==================================================================
  window.actualizarContadorCampana = function () {
    const contador = document.getElementById('contadorNotificaciones') || document.getElementById('notificacionesCount');
    if (!contador) return;

    const lista = obtenerHistorialLocal();
    const noLeidas = lista.filter(item => !item.leida).length;

    contador.textContent = String(noLeidas);
    contador.style.display = noLeidas > 0 ? 'inline-flex' : 'none';
  };

  window.renderNotificaciones = function () {
    const contenedor = document.getElementById('listaNotificaciones') || document.getElementById('notificacionesBody');
    if (!contenedor) return;

    const lista = obtenerHistorialLocal();

    if (lista.length === 0) {
      contenedor.innerHTML = `
        <div class="notif-empty-state">
          <span>🔔</span>
          <p>No tienes notificaciones pendientes.</p>
        </div>`;
      return;
    }

    const itemsHTML = lista.map(item => `
      <div class="notif-item-row ${item.leida ? 'leida' : 'no-leida'}" onclick="window.marcarNotificacionLeida(${item.id})">
        <div class="notif-item-head">
          <div class="notif-item-title-wrap">
            ${!item.leida ? '<span class="notif-unread-dot"></span>' : ''}
            <strong class="notif-item-title">${item.titulo}</strong>
          </div>
          <div class="notif-item-meta">
            <span class="notif-item-date">${item.fecha}</span>
            <button type="button" class="notif-item-del-btn" onclick="window.eliminarNotificacion(${item.id}, event)" title="Eliminar">✕</button>
          </div>
        </div>
        <p class="notif-item-msg">${item.mensaje}</p>
      </div>
    `).join('');

    contenedor.innerHTML = `
      <div class="notif-panel-toolbar">
        <button type="button" class="notif-tool-btn" onclick="window.marcarTodasNotificacionesLeidas()">✓ Marcar todas leídas</button>
        <button type="button" class="notif-tool-btn danger" onclick="window.vaciarNotificaciones()">🗑️ Vaciar</button>
      </div>
      <div class="notif-items-scroll">
        ${itemsHTML}
      </div>
    `;
  };

  // ==================================================================
  // 6. ACCIONES DE GESTIÓN DE NOTIFICACIONES (ISOLATED PER USER)
  // ==================================================================
  window.marcarNotificacionLeida = function (id) {
    const lista = obtenerHistorialLocal();
    const actualizada = lista.map(n => n.id === Number(id) ? { ...n, leida: true } : n);
    guardarHistorialLocal(actualizada);
    window.actualizarContadorCampana();
    window.renderNotificaciones();
  };

  window.marcarTodasNotificacionesLeidas = function () {
    const lista = obtenerHistorialLocal();
    const actualizada = lista.map(n => ({ ...n, leida: true }));
    guardarHistorialLocal(actualizada);
    window.actualizarContadorCampana();
    window.renderNotificaciones();
  };

  window.eliminarNotificacion = function (id, event) {
    if (event && event.stopPropagation) event.stopPropagation();
    const lista = obtenerHistorialLocal();
    const actualizada = lista.filter(n => n.id !== Number(id));
    guardarHistorialLocal(actualizada);
    window.actualizarContadorCampana();
    window.renderNotificaciones();
  };

  window.vaciarNotificaciones = function () {
    guardarHistorialLocal([]);
    window.actualizarContadorCampana();
    window.renderNotificaciones();
  };

  // ==================================================================
  // 7. API PÚBLICA PRINCIPAL
  // ==================================================================
  window.crearNotificacion = async function (mensaje, tipo = 'info', titulo = '', broadcast = true) {
    const tipoFinal = ['success', 'error', 'warning', 'info'].includes(tipo) ? tipo : 'info';
    const tituloFinal = titulo || (tipoFinal === 'success' ? 'Operación Exitosa' : tipoFinal === 'error' ? 'Alerta del Sistema' : 'Notificación');
    const usuarioActual = obtenerUsuarioActual();

    const nuevaNotif = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      titulo: tituloFinal,
      mensaje: String(mensaje || ''),
      tipo: tipoFinal,
      leida: false,
      fecha: new Date().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
    };

    // Guardar en almacenamiento local del usuario actual
    const lista = obtenerHistorialLocal();
    lista.unshift(nuevaNotif);
    guardarHistorialLocal(lista);

    window.actualizarContadorCampana();
    window.renderNotificaciones();

    // Mostrar Toast visual al emisor
    mostrarToast(tipoFinal, mensaje, tituloFinal);

    // Disparar evento en la ventana
    window.dispatchEvent(new CustomEvent('nuevaNotificacion', { detail: nuevaNotif }));

    // Persistir y sincronizar en Supabase Realtime si está disponible
    if (broadcast && window.supabaseClient) {
      try {
        await window.supabaseClient.from('notificaciones').insert([{
          usuario: usuarioActual,
          titulo: tituloFinal,
          mensaje: String(mensaje || ''),
          tipo: tipoFinal,
          leida: false
        }]);
      } catch (err) {
        // Fallback silencioso si falla BD
      }
    }
  };

  window.mostrarNotificacion = function (titulo, mensaje, tipo = 'info') {
    window.crearNotificacion(mensaje, tipo, titulo, false);
  };

  window.notifAlert = function (mensaje) {
    const texto = String(mensaje || '').toLowerCase();
    const tipo = texto.includes('error') || texto.includes('fallo') || texto.includes('denegado')
      ? 'error'
      : texto.includes('éxito') || texto.includes('exito') || texto.includes('correct')
      ? 'success'
      : 'warning';

    window.crearNotificacion(mensaje, tipo, '', false);
  };

  // API con Promises para Modales (Confirm y Prompt)
  window.Notif = {
    success: (m, t) => window.crearNotificacion(m, 'success', t, false),
    error: (m, t) => window.crearNotificacion(m, 'error', t, false),
    warning: (m, t) => window.crearNotificacion(m, 'warning', t, false),
    info: (m, t) => window.crearNotificacion(m, 'info', t, false),

    confirm: function (mensaje, titulo) {
      asegurarContenedores();
      reproducirSonido('warning');

      return new Promise(resolve => {
        const overlay = document.getElementById('notifModalOverlay');
        const box = document.getElementById('notifModalBox');
        if (!overlay || !box) return resolve(false);

        box.style.setProperty('--notif-theme-color', '#ef4444');
        document.getElementById('notifModalIcono').textContent = '⚠️';
        document.getElementById('notifModalTitulo').textContent = titulo || '¿Confirmar Acción?';
        document.getElementById('notifModalMensaje').textContent = mensaje || '';
        document.getElementById('notifModalCampoWrap').innerHTML = '';

        const btnCancel = document.getElementById('notifBtnCancelar');
        const btnOk = document.getElementById('notifBtnAceptar');
        btnCancel.style.display = 'inline-block';
        btnCancel.textContent = 'Cancelar';
        btnOk.textContent = 'Confirmar';

        overlay.classList.add('active');

        function cleanup() {
          overlay.classList.remove('active');
          btnOk.removeEventListener('click', onOk);
          btnCancel.removeEventListener('click', onCancel);
        }

        function onOk() { cleanup(); resolve(true); }
        function onCancel() { cleanup(); resolve(false); }

        btnOk.addEventListener('click', onOk);
        btnCancel.addEventListener('click', onCancel);
      });
    },

    prompt: function (mensaje, titulo, valorInicial = '', opciones = null) {
      asegurarContenedores();
      return new Promise(resolve => {
        const overlay = document.getElementById('notifModalOverlay');
        const box = document.getElementById('notifModalBox');
        if (!overlay || !box) return resolve(null);

        box.style.setProperty('--notif-theme-color', '#2563eb');
        document.getElementById('notifModalIcono').textContent = '✏️';
        document.getElementById('notifModalTitulo').textContent = titulo || 'Ingreso de Datos';
        document.getElementById('notifModalMensaje').textContent = mensaje || '';

        const wrap = document.getElementById('notifModalCampoWrap');
        wrap.innerHTML = '';

        let inputElement;
        if (opciones && Array.isArray(opciones)) {
          inputElement = document.createElement('select');
          inputElement.className = 'notif-modal-select';
          opciones.forEach(op => {
            const opt = document.createElement('option');
            opt.value = op;
            opt.textContent = op;
            if (op === valorInicial) opt.selected = true;
            inputElement.appendChild(opt);
          });
        } else {
          inputElement = document.createElement('input');
          inputElement.type = 'text';
          inputElement.className = 'notif-modal-input';
          inputElement.value = valorInicial || '';
        }
        wrap.appendChild(inputElement);

        const btnCancel = document.getElementById('notifBtnCancelar');
        const btnOk = document.getElementById('notifBtnAceptar');
        btnCancel.style.display = 'inline-block';
        btnOk.textContent = 'Guardar';

        overlay.classList.add('active');
        setTimeout(() => inputElement.focus(), 80);

        function cleanup() {
          overlay.classList.remove('active');
          btnOk.removeEventListener('click', onOk);
          btnCancel.removeEventListener('click', onCancel);
        }

        function onOk() {
          const val = inputElement.value;
          cleanup();
          resolve(val);
        }

        function onCancel() {
          cleanup();
          resolve(null);
        }

        btnOk.addEventListener('click', onOk);
        btnCancel.addEventListener('click', onCancel);
      });
    }
  };

  // ==================================================================
  // 8. SINCRONIZACIÓN REALTIME DE EVENTOS GLOBALES
  // ==================================================================
  function conectarRealtimeNotificaciones() {
    if (window._notifRealtimeConectado || !window.supabaseClient) return;
    window._notifRealtimeConectado = true;

    try {
      const usuarioActual = obtenerUsuarioActual();

      window.supabaseClient
        .channel('erp-global-alerts')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notificaciones' },
          payload => {
            const row = payload.new;
            // Si la notificación fue emitida por otro usuario, mostrar Toast y agregar a la campana
            if (row && row.usuario !== usuarioActual) {
              const item = {
                id: row.id || Date.now(),
                titulo: row.titulo,
                mensaje: row.mensaje,
                tipo: row.tipo || 'info',
                leida: false,
                fecha: new Date(row.created_at || Date.now()).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
              };

              const lista = obtenerHistorialLocal();
              lista.unshift(item);
              guardarHistorialLocal(lista);

              window.actualizarContadorCampana();
              window.renderNotificaciones();
              mostrarToast(item.tipo, item.mensaje, item.titulo);
            }
          }
        )
        .subscribe();
    } catch (e) {
      console.warn('Error inicializando Realtime de notificaciones:', e);
    }
  }

  // ==================================================================
  // 9. INICIALIZACIÓN
  // ==================================================================
  function inicializar() {
    asegurarContenedores();
    window.actualizarContadorCampana();
    window.renderNotificaciones();

    // Conectar Realtime cuando el cliente esté listo
    setTimeout(conectarRealtimeNotificaciones, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
  } else {
    inicializar();
  }
})();
