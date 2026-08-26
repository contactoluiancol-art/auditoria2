// =====================================================
// SISTEMA DE NOTIFICACIONES PREMIUM - GLOBAL
// Reemplaza alert() / confirm() / prompt() en TODOS
// los modulos: inventario, auditorias, confiabilidad,
// recepcion, usuarios, bi, login, dashboard.
//
// API:
//   Notif.success(mensaje, titulo)
//   Notif.error(mensaje, titulo)
//   Notif.warning(mensaje, titulo)
//   Notif.info(mensaje, titulo)
//   Notif.confirm(mensaje, titulo)      -> Promise<boolean>
//   Notif.prompt(mensaje, titulo, valorInicial, opciones) -> Promise<string|null>
//
// Compatibilidad: window.mostrarNotificacion(titulo, mensaje, tipo)
// sigue funcionando igual que antes.
// =====================================================

(function(){

  const ICONOS = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };

  const TITULOS_DEFECTO = {
    success: '¡Listo!',
    error: 'Ocurrió un error',
    warning: 'Atención',
    info: 'Información'
  };

  const DURACION_MS = 4200;

  // ===================================================
  // INYECTAR CONTENEDORES SI NO EXISTEN (no requiere
  // tocar el HTML de cada modulo)
  // ===================================================

  function asegurarContenedores(){

    if(!document.getElementById('notifStack')){

      const stack = document.createElement('div');
      stack.id = 'notifStack';
      document.body.appendChild(stack);

    }

    if(!document.getElementById('notifModalOverlay')){

      const overlay = document.createElement('div');
      overlay.id = 'notifModalOverlay';

      overlay.innerHTML =
        '<div class="notif-modal-box" id="notifModalBox">' +
          '<div class="notif-modal-icono" id="notifModalIcono">❓</div>' +
          '<h2 id="notifModalTitulo">Confirmar</h2>' +
          '<p id="notifModalMensaje"></p>' +
          '<div id="notifModalCampoWrap"></div>' +
          '<div class="notif-modal-botones">' +
            '<button class="notif-btn-cancelar" id="notifBtnCancelar">Cancelar</button>' +
            '<button class="notif-btn-aceptar" id="notifBtnAceptar">Aceptar</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(overlay);

    }

    // Cargar el CSS premium automaticamente si el modulo no lo incluyo
    if(!document.getElementById('notifPremiumCSS')){

      const link = document.createElement('link');
      link.id = 'notifPremiumCSS';
      link.rel = 'stylesheet';

      // Detecta si estamos dentro de /modules/ para ajustar la ruta relativa
      const enSubcarpeta = window.location.pathname.includes('/modules/');

      link.href =
      (enSubcarpeta ? '../css/' : 'css/') +
      'notificaciones-premium.css';

      document.head.appendChild(link);

    }

  }

  // ===================================================
  // TOAST (reemplaza alert)
  // ===================================================

  function toast(tipo, mensaje, titulo){

    asegurarContenedores();

    const stack = document.getElementById('notifStack');

    const el = document.createElement('div');
    el.className = 'notif-toast notif-' + tipo;

    el.innerHTML =
      '<div class="notif-icono">' + ICONOS[tipo] + '</div>' +
      '<div class="notif-texto">' +
        '<div class="notif-titulo">' + (titulo || TITULOS_DEFECTO[tipo]) + '</div>' +
        '<div class="notif-mensaje"></div>' +
      '</div>' +
      '<button class="notif-cerrar">✕</button>' +
      '<div class="notif-barra" style="animation-duration:' + DURACION_MS + 'ms"></div>';

    // innerText para evitar inyeccion de HTML en el mensaje
    el.querySelector('.notif-mensaje').innerText = mensaje;

    stack.appendChild(el);

    function cerrar(){

      el.classList.add('notif-out');

      setTimeout(function(){
        if(el.parentNode){
          el.parentNode.removeChild(el);
        }
      }, 350);

    }

    el.querySelector('.notif-cerrar').addEventListener('click', cerrar);

    const timeoutId = setTimeout(cerrar, DURACION_MS);

    el.addEventListener('mouseenter', function(){
      clearTimeout(timeoutId);
      const barra = el.querySelector('.notif-barra');
      if(barra){ barra.style.animationPlayState = 'paused'; }
    });

  }

  // ===================================================
  // MODAL BASE (usado por confirm y prompt)
  // ===================================================

  function abrirModal(config){

    asegurarContenedores();

    return new Promise(function(resolve){

      const overlay = document.getElementById('notifModalOverlay');
      const icono = document.getElementById('notifModalIcono');
      const titulo = document.getElementById('notifModalTitulo');
      const mensaje = document.getElementById('notifModalMensaje');
      const campoWrap = document.getElementById('notifModalCampoWrap');
      const btnCancelar = document.getElementById('notifBtnCancelar');
      const btnAceptar = document.getElementById('notifBtnAceptar');
      const box = document.getElementById('notifModalBox');

      box.style.setProperty('--notif-color', config.color || '#2563eb');
      box.style.setProperty('--notif-bg', config.bg || '#eff6ff');

      icono.innerText = config.icono || '❓';
      titulo.innerText = config.titulo || 'Confirmar';
      mensaje.innerText = config.mensaje || '';

      campoWrap.innerHTML = '';

      let campo = null;

      if(config.tipoInput){

        if(config.tipoInput === 'select' && config.opciones){

          campo = document.createElement('select');

          config.opciones.forEach(function(op){

            const opt = document.createElement('option');
            opt.value = op;
            opt.innerText = op;
            campo.appendChild(opt);

          });

        }
        else{

          campo = document.createElement('input');
          campo.type = config.tipoInput === 'password' ? 'password' : 'text';
          campo.value = config.valorInicial || '';
          campo.placeholder = config.placeholder || '';

        }

        campoWrap.appendChild(campo);

      }

      btnCancelar.style.display = config.soloAceptar ? 'none' : 'inline-block';
      btnAceptar.innerText = config.textoAceptar || 'Aceptar';
      btnCancelar.innerText = config.textoCancelar || 'Cancelar';

      overlay.classList.add('active');

      if(campo){
        setTimeout(function(){ campo.focus(); if(campo.select){ campo.select(); } }, 150);
      }
      else{
        setTimeout(function(){ btnAceptar.focus(); }, 150);
      }

      function limpiar(){

        overlay.classList.remove('active');
        btnAceptar.removeEventListener('click', onAceptar);
        btnCancelar.removeEventListener('click', onCancelar);
        overlay.removeEventListener('keydown', onKeyDown);

      }

      function onAceptar(){

        const valor = campo ? campo.value : true;
        limpiar();
        resolve(valor);

      }

      function onCancelar(){

        limpiar();
        resolve(config.tipoInput ? null : false);

      }

      function onKeyDown(e){

        if(e.key === 'Enter'){
          onAceptar();
        }

        if(e.key === 'Escape'){
          onCancelar();
        }

      }

      btnAceptar.addEventListener('click', onAceptar);
      btnCancelar.addEventListener('click', onCancelar);
      overlay.addEventListener('keydown', onKeyDown);

    });

  }

  // ===================================================
  // API PUBLICA
  // ===================================================

  window.Notif = {

    success: function(mensaje, titulo){ toast('success', mensaje, titulo); },
    error:   function(mensaje, titulo){ toast('error', mensaje, titulo); },
    warning: function(mensaje, titulo){ toast('warning', mensaje, titulo); },
    info:    function(mensaje, titulo){ toast('info', mensaje, titulo); },

    confirm: function(mensaje, titulo){

      return abrirModal({
        mensaje: mensaje,
        titulo: titulo || '¿Estás seguro?',
        icono: '⚠️',
        color: '#ef4444',
        bg: '#fef2f2',
        textoAceptar: 'Sí, continuar',
        textoCancelar: 'Cancelar'
      });

    },

    prompt: function(mensaje, titulo, valorInicial, opciones){

      return abrirModal({
        mensaje: mensaje,
        titulo: titulo || 'Ingrese un valor',
        icono: '✏️',
        color: '#2563eb',
        bg: '#eff6ff',
        tipoInput: opciones ? 'select' : 'text',
        opciones: opciones,
        valorInicial: valorInicial || '',
        textoAceptar: 'Guardar',
        textoCancelar: 'Cancelar'
      });

    }

  };

  // ===================================================
  // FUNCION GLOBAL DE AYUDA: reemplazo directo de alert()
  // ===================================================

  window.notifAlert = function(mensaje){

    let tipo = 'info';

    const texto = String(mensaje).toLowerCase();

    if(texto.indexOf('error') !== -1 || texto.indexOf('❌') !== -1 || texto.indexOf('no se pudo') !== -1 || texto.indexOf('inválid') !== -1 || texto.indexOf('invalid') !== -1 || texto.indexOf('incorrect') !== -1 || texto.indexOf('faltante') !== -1 || texto.indexOf('debe ') !== -1 || texto.indexOf('requerid') !== -1){
      tipo = 'error';
    }
    else if(texto.indexOf('correctamente') !== -1 || texto.indexOf('exitosa') !== -1 || texto.indexOf('exitoso') !== -1 || texto.indexOf('guardad') !== -1 || texto.indexOf('actualizad') !== -1 || texto.indexOf('eliminad') !== -1 || texto.indexOf('creado') !== -1 || texto.indexOf('registrad') !== -1 || texto.indexOf('✅') !== -1){
      tipo = 'success';
    }
    else if(texto.indexOf('cuidado') !== -1 || texto.indexOf('advertencia') !== -1 || texto.indexOf('⚠') !== -1 || texto.indexOf('atención') !== -1 || texto.indexOf('atencion') !== -1){
      tipo = 'warning';
    }

    toast(tipo, mensaje);

  };

  // ===================================================
  // COMPATIBILIDAD CON EL SISTEMA ANTERIOR
  // ===================================================

  window.mostrarNotificacion = function(titulo, mensaje, tipo){

    tipo = tipo || 'success';

    if(!ICONOS[tipo]){
      tipo = 'info';
    }

    toast(tipo, mensaje, titulo);

  };

  // Crear los contenedores apenas cargue el script
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', asegurarContenedores);
  }
  else{
    asegurarContenedores();
  }

})();
