

// ======================
// VARIABLES GLOBALES
// ======================

window.refreshRecepcion = null;

window.recepcionGestionando = null;

var adjuntosCommonRecepcion = window.AdjuntosCommon;
var soportesRecepcionSeleccionados = [];
window.recepcionesCacheSoportes = {};
window.recepcionSoportesModalId = null;

function notificarAdjuntosRecepcion(mensaje) {
  if (typeof window.mostrarNotificacion === 'function') {
    window.mostrarNotificacion('Soportes de recepción', mensaje, 'warning');
  } else if (typeof notifAlert === 'function') {
    notifAlert(mensaje);
  } else {
    alert(mensaje);
  }
}

function totalSoportesRecepcion() {
  return soportesRecepcionSeleccionados.length;
}

function agregarArchivosRecepcion(archivos) {
  if (!adjuntosCommonRecepcion) {
    notificarAdjuntosRecepcion('No cargó el componente común de adjuntos.');
    return;
  }

  for (const archivo of Array.from(archivos || [])) {
    if (totalSoportesRecepcion() >= adjuntosCommonRecepcion.MAX_ADJUNTOS) {
      notificarAdjuntosRecepcion('Solo puede agregar hasta 10 soportes por recepción.');
      break;
    }

    const validacion = adjuntosCommonRecepcion.validarArchivo(archivo);
    if (!validacion.valido) {
      notificarAdjuntosRecepcion(validacion.mensaje);
      continue;
    }

    const duplicado = soportesRecepcionSeleccionados.some(function (item) {
      return item.tipo === 'archivo' &&
        item.archivo.name === archivo.name &&
        item.archivo.size === archivo.size &&
        item.archivo.lastModified === archivo.lastModified;
    });

    if (!duplicado) {
      soportesRecepcionSeleccionados.push({
        tipo: 'archivo',
        archivo: archivo,
        nombre: archivo.name,
        mime: archivo.type || '',
        tamano: archivo.size
      });
    }
  }

  renderSoportesRecepcionTemporales();
}

function agregarDriveRecepcion() {
  const input = document.getElementById('driveLinkRecepcion');
  if (!input || !adjuntosCommonRecepcion) return;

  if (totalSoportesRecepcion() >= adjuntosCommonRecepcion.MAX_ADJUNTOS) {
    notificarAdjuntosRecepcion('Solo puede agregar hasta 10 soportes por recepción.');
    return;
  }

  const url = adjuntosCommonRecepcion.normalizarDriveUrl(input.value);
  if (!url) {
    notificarAdjuntosRecepcion('Pegue un enlace válido de Google Drive o Google Docs que comience por https://.');
    return;
  }

  if (soportesRecepcionSeleccionados.some(function (item) { return item.url === url; })) {
    notificarAdjuntosRecepcion('Ese enlace de Drive ya fue agregado.');
    return;
  }

  soportesRecepcionSeleccionados.push({
    tipo: 'drive',
    nombre: adjuntosCommonRecepcion.nombreEnlaceDrive(url, totalSoportesRecepcion() + 1),
    url: url,
    mime: 'text/uri-list',
    tamano: 0
  });

  input.value = '';
  renderSoportesRecepcionTemporales();
}

function renderSoportesRecepcionTemporales() {
  const lista = document.getElementById('listaSoportesRecepcion');
  const contador = document.getElementById('contadorSoportesRecepcion');
  if (!lista || !adjuntosCommonRecepcion) return;

  if (contador) {
    contador.textContent = `${totalSoportesRecepcion()} / ${adjuntosCommonRecepcion.MAX_ADJUNTOS}`;
  }

  if (soportesRecepcionSeleccionados.length === 0) {
    lista.innerHTML = '<div class="adjunto-vacio">Aún no se han agregado soportes.</div>';
    return;
  }

  lista.innerHTML = soportesRecepcionSeleccionados.map(function (soporte, index) {
    const visual = adjuntosCommonRecepcion.tipoVisual(soporte);
    const meta = soporte.tipo === 'drive'
      ? visual.etiqueta
      : `${visual.etiqueta} · ${adjuntosCommonRecepcion.formatearTamano(soporte.tamano)}`;

    return `
      <div class="adjunto-item">
        <div class="adjunto-item__info">
          <span class="adjunto-item__icono">${visual.icono}</span>
          <div class="adjunto-item__texto">
            <span class="adjunto-item__nombre">${adjuntosCommonRecepcion.escaparHTML(soporte.nombre)}</span>
            <span class="adjunto-item__meta">${adjuntosCommonRecepcion.escaparHTML(meta)}</span>
          </div>
        </div>
        <div class="adjunto-item__acciones">
          <button type="button" class="adjunto-btn adjunto-btn--eliminar" onclick="eliminarSoporteRecepcionTemporal(${index})">Quitar</button>
        </div>
      </div>`;
  }).join('');
}

window.eliminarSoporteRecepcionTemporal = function (index) {
  soportesRecepcionSeleccionados.splice(Number(index), 1);
  renderSoportesRecepcionTemporales();
};

async function limpiarArchivosSubidosRecepcion(rutas) {
  if (!rutas || rutas.length === 0) return;
  try {
    await window.supabaseClient.storage.from('recepciones-pdf').remove(rutas);
  } catch (error) {
    console.warn('No fue posible limpiar archivos huérfanos de recepción:', error);
  }
}

async function subirSoportesRecepcion(listaSoportes = soportesRecepcionSeleccionados) {
  const soportesGuardados = [];
  const rutasSubidas = [];

  for (const soporte of listaSoportes) {
    if (soporte.tipo === 'drive') {
      soportesGuardados.push({
        tipo: 'drive',
        nombre: soporte.nombre,
        url: soporte.url,
        ruta: '',
        mime: 'text/uri-list',
        tamano: 0
      });
      continue;
    }

    const archivo = soporte.archivo;
    const limpio = String(archivo.name || 'soporte')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_');
    const identificador = window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const ruta = `recepciones/${identificador}_${limpio}`;

    const subida = await window.supabaseClient
      .storage
      .from('recepciones-pdf')
      .upload(ruta, archivo, { upsert: false, contentType: archivo.type || undefined });

    if (subida.error) {
      await limpiarArchivosSubidosRecepcion(rutasSubidas);
      throw new Error(`No se pudo subir “${archivo.name}”: ${subida.error.message}`);
    }

    rutasSubidas.push(ruta);

    const urlData = window.supabaseClient
      .storage
      .from('recepciones-pdf')
      .getPublicUrl(ruta);

    soportesGuardados.push({
      tipo: 'archivo',
      nombre: archivo.name,
      url: urlData.data.publicUrl,
      ruta: ruta,
      mime: archivo.type || '',
      tamano: archivo.size
    });
  }

  return { soportesGuardados, rutasSubidas };
}

function puedeGestionarSoportesRecepcion() {
  const usuario = String(window.usuarioLogueado?.usuario || '').toLowerCase();
  const rol = String(window.usuarioLogueado?.rol || '').toLowerCase();
  const rolPermitido = ['admin', 'auditor', 'lider', 'compras'].includes(usuario) ||
    ['admin', 'auditor', 'lider', 'compras'].includes(rol);
  const permiso = typeof window.tienePermiso === 'function' &&
    (window.tienePermiso('recepcion', 'crear') || window.tienePermiso('recepcion', 'editar'));
  return Boolean(rolPermitido || permiso);
}

async function consultarSoportesRecepcion(id) {
  const consulta = await window.supabaseClient
    .from('recepciones')
    .select('pdf_url')
    .eq('id', Number(id))
    .single();

  if (consulta.error) return { error: consulta.error, soportes: [] };
  return {
    error: null,
    soportes: adjuntosCommonRecepcion.deserializarRecepcion(consulta.data?.pdf_url)
  };
}

async function agregarSoportesRecepcionExistente(nuevos) {
  const id = Number(window.recepcionSoportesModalId);
  if (!id || !nuevos.length || !adjuntosCommonRecepcion) return;
  if (!puedeGestionarSoportesRecepcion()) {
    notificarAdjuntosRecepcion('No tiene permisos para agregar soportes a esta recepción.');
    return;
  }

  const consulta = await consultarSoportesRecepcion(id);
  if (consulta.error) {
    notificarAdjuntosRecepcion('No fue posible consultar los soportes actuales: ' + consulta.error.message);
    return;
  }

  const actuales = consulta.soportes;
  const nuevosSinDuplicar = nuevos.filter(function (nuevo) {
    return !(nuevo.tipo === 'drive' && actuales.some(function (actual) { return actual.url === nuevo.url; }));
  });

  if (actuales.length + nuevosSinDuplicar.length > adjuntosCommonRecepcion.MAX_ADJUNTOS) {
    notificarAdjuntosRecepcion(`La recepción ya tiene ${actuales.length} soportes. El máximo permitido es 10.`);
    return;
  }
  if (!nuevosSinDuplicar.length) {
    notificarAdjuntosRecepcion('Los enlaces seleccionados ya estaban registrados.');
    return;
  }

  let carga;
  try {
    carga = await subirSoportesRecepcion(nuevosSinDuplicar);
  } catch (error) {
    notificarAdjuntosRecepcion(error.message || 'No fue posible subir los soportes.');
    return;
  }

  const combinados = actuales.concat(carga.soportesGuardados);
  const actualizacion = await window.supabaseClient
    .from('recepciones')
    .update({ pdf_url: adjuntosCommonRecepcion.serializarRecepcion(combinados) })
    .eq('id', id);

  if (actualizacion.error) {
    await limpiarArchivosSubidosRecepcion(carga.rutasSubidas);
    notificarAdjuntosRecepcion('No fue posible actualizar la recepción: ' + actualizacion.error.message);
    return;
  }

  if (typeof window.crearNotificacion === 'function') {
    window.crearNotificacion(`📎 Se agregaron ${nuevosSinDuplicar.length} soporte(s) a la recepción #${id}.`);
  }

  await window.renderRecepciones();
  window.verSoportesRecepcion(id);
}

async function cargarArchivosRecepcionModal(archivos) {
  const actuales = window.recepcionesCacheSoportes[window.recepcionSoportesModalId] || [];
  const disponibles = adjuntosCommonRecepcion.MAX_ADJUNTOS - actuales.length;
  const nuevos = [];

  for (const archivo of Array.from(archivos || [])) {
    if (nuevos.length >= disponibles) {
      notificarAdjuntosRecepcion(`Solo puede agregar ${Math.max(disponibles, 0)} soporte(s) más.`);
      break;
    }
    const validacion = adjuntosCommonRecepcion.validarArchivo(archivo);
    if (!validacion.valido) {
      notificarAdjuntosRecepcion(validacion.mensaje);
      continue;
    }
    nuevos.push({
      tipo: 'archivo',
      archivo,
      nombre: archivo.name,
      mime: archivo.type || '',
      tamano: archivo.size
    });
  }

  await agregarSoportesRecepcionExistente(nuevos);
}

async function cargarDriveRecepcionModal() {
  const input = document.getElementById('driveLinkRecepcionModal');
  if (!input || !adjuntosCommonRecepcion) return;

  const url = adjuntosCommonRecepcion.normalizarDriveUrl(input.value);
  if (!url) {
    notificarAdjuntosRecepcion('Pegue un enlace válido de Google Drive o Google Docs que comience por https://.');
    return;
  }

  const actuales = window.recepcionesCacheSoportes[window.recepcionSoportesModalId] || [];
  const nuevo = {
    tipo: 'drive',
    nombre: adjuntosCommonRecepcion.nombreEnlaceDrive(url, actuales.length + 1),
    url,
    mime: 'text/uri-list',
    tamano: 0
  };
  input.value = '';
  await agregarSoportesRecepcionExistente([nuevo]);
}

window.eliminarSoporteRecepcionGuardado = async function (index) {
  const id = Number(window.recepcionSoportesModalId);
  if (!id || !adjuntosCommonRecepcion) return;
  if (!puedeGestionarSoportesRecepcion()) {
    notificarAdjuntosRecepcion('No tiene permisos para eliminar soportes.');
    return;
  }

  const consulta = await consultarSoportesRecepcion(id);
  if (consulta.error) {
    notificarAdjuntosRecepcion('No fue posible consultar los soportes: ' + consulta.error.message);
    return;
  }

  if (consulta.soportes.length <= adjuntosCommonRecepcion.MIN_ADJUNTOS) {
    notificarAdjuntosRecepcion('La recepción debe conservar mínimo un soporte.');
    return;
  }

  const soporte = consulta.soportes[Number(index)];
  if (!soporte) return;

  const confirmar = window.Notif && typeof window.Notif.confirm === 'function'
    ? await window.Notif.confirm('El soporte se eliminará del registro.', '¿Eliminar soporte?')
    : window.confirm('¿Eliminar soporte?');
  if (!confirmar) return;

  const restantes = consulta.soportes.filter(function (_, i) { return i !== Number(index); });
  const actualizacion = await window.supabaseClient
    .from('recepciones')
    .update({ pdf_url: adjuntosCommonRecepcion.serializarRecepcion(restantes) })
    .eq('id', id);

  if (actualizacion.error) {
    notificarAdjuntosRecepcion('No fue posible actualizar la recepción: ' + actualizacion.error.message);
    return;
  }

  if (soporte.tipo === 'archivo' && soporte.ruta) {
    const limpieza = await window.supabaseClient.storage.from('recepciones-pdf').remove([soporte.ruta]);
    if (limpieza.error) console.warn('No se pudo eliminar el archivo físico:', limpieza.error);
  }

  if (typeof window.crearNotificacion === 'function') {
    window.crearNotificacion(`🗑️ Se eliminó un soporte de la recepción #${id}.`);
  }

  await window.renderRecepciones();
  window.verSoportesRecepcion(id);
};

function inicializarAdjuntosRecepcion() {
  const inputArchivos = document.getElementById('pdfInput');
  const btnArchivos = document.getElementById('btnAgregarSoportesRecepcion');
  const btnDrive = document.getElementById('btnAgregarDriveRecepcion');
  const inputDrive = document.getElementById('driveLinkRecepcion');

  if (btnArchivos && inputArchivos) {
    btnArchivos.onclick = function () { inputArchivos.click(); };
    inputArchivos.onchange = function (evento) {
      agregarArchivosRecepcion(evento.target.files);
      evento.target.value = '';
    };
  }

  if (btnDrive) btnDrive.onclick = agregarDriveRecepcion;
  if (inputDrive) {
    inputDrive.onkeydown = function (evento) {
      if (evento.key === 'Enter') {
        evento.preventDefault();
        agregarDriveRecepcion();
      }
    };
  }

  const inputModal = document.getElementById('actualizarSoportesRecepcionInput');
  const btnArchivosModal = document.getElementById('btnAgregarArchivosRecepcionModal');
  const btnDriveModal = document.getElementById('btnAgregarDriveRecepcionModal');
  const inputDriveModal = document.getElementById('driveLinkRecepcionModal');

  if (btnArchivosModal && inputModal) {
    btnArchivosModal.onclick = function () { inputModal.click(); };
    inputModal.onchange = async function (evento) {
      await cargarArchivosRecepcionModal(evento.target.files);
      evento.target.value = '';
    };
  }
  if (btnDriveModal) btnDriveModal.onclick = cargarDriveRecepcionModal;
  if (inputDriveModal) {
    inputDriveModal.onkeydown = function (evento) {
      if (evento.key === 'Enter') {
        evento.preventDefault();
        cargarDriveRecepcionModal();
      }
    };
  }

  renderSoportesRecepcionTemporales();
}



// ======================
// BOTON GUARDAR
// ======================

window.guardarRecepcionBtn =
document.getElementById(
  'guardarRecepcion'
);
// ======================
// EVENTO BOTON
// ======================

if(window.guardarRecepcionBtn){

 window.guardarRecepcionBtn.addEventListener(

    'click',

    guardarRecepcion

  );

}

// ======================
// CREAR NOTIFICACION
// ======================

window.crearNotificacion = function(mensaje){

  try{

    let notificaciones =

    JSON.parse(

      localStorage.getItem(
        'notificaciones'
      )

    ) || [];





    const nuevaNotificacion = {

      id:
      Date.now(),

      mensaje:
      mensaje,

      leida:
      false,

      fecha:
      new Date()
      .toLocaleString('es-CO')

    };





    notificaciones.unshift(
      nuevaNotificacion
    );





    localStorage.setItem(

      'notificaciones',

      JSON.stringify(
        notificaciones
      )

    );





    const contador =

    document.getElementById(
      'contadorNotificaciones'
    );





    if(contador){

      contador.innerText =
      notificaciones.length;

    }





    if(

      typeof window.renderNotificaciones ===
      'function'

    ){

      window.renderNotificaciones();

    }





    window.dispatchEvent(

      new CustomEvent(

        'nuevaNotificacion',

        {

          detail:
          nuevaNotificacion

        }

      )

    );

  }

  catch(error){

    console.log(error);

  }

};





// ======================
// GUARDAR RECEPCION
// ======================

async function guardarRecepcion(){

  try{

    if(

      !window.tienePermiso(
        'recepcion',
        'crear'
      )

    ){

      notifAlert(
        'No tiene permisos'
      );

      return;

    }
    const proveedor =

    document.getElementById(
      'proveedorInput'
    ).value.trim();
    const material =

    document.getElementById(
      'materialInput'
    ).value.trim();
    const tipoRecepcion =

    document.getElementById(
      'tipoRecepcionInput'
    ).value;
    const cantidad =

    Number(

      document.getElementById(
        'cantidadInput'
      ).value

    );

    const revisadas =

    Number(

      document.getElementById(
        'revisadasInput'
      ).value

    );





    const novedades =

    Number(

      document.getElementById(
        'novedadesInput'
      ).value

    );





    const faltantes =

    Number(

      document.getElementById(
        'faltantesInput'
      ).value

    );





    const observacion =

    document.getElementById(
      'observacionInput'
    ).value.trim();





    const estado =

    document.getElementById(
      'estadoRecepcionInput'
    ).value;





    if(

      !proveedor ||
      !material ||
      !cantidad ||
      !revisadas

    ){

  mostrarAlerta(
  '¡Ups! 😕',
  'Debes completar todos los campos'
);

      return;

    }

    if (!adjuntosCommonRecepcion ||
        totalSoportesRecepcion() < adjuntosCommonRecepcion.MIN_ADJUNTOS ||
        totalSoportesRecepcion() > adjuntosCommonRecepcion.MAX_ADJUNTOS) {
      notificarAdjuntosRecepcion('Debe agregar entre 1 y 10 soportes antes de guardar la recepción.');
      return;
    }



    const porcentajeRevisado =

    (
      revisadas /
      cantidad
    ) * 100;





    let pdfUrl = '';
    let rutasSubidasRecepcion = [];

    try {
      const carga = await subirSoportesRecepcion();
      rutasSubidasRecepcion = carga.rutasSubidas;
      pdfUrl = adjuntosCommonRecepcion.serializarRecepcion(carga.soportesGuardados);
    } catch (error) {
      console.error(error);
      notificarAdjuntosRecepcion(error.message || 'No fue posible subir los soportes.');
      return;
    }



    // ======================
    // INSERTAR
    // ======================

    const response =

    await window.supabaseClient

    .from('recepciones')

    .insert([

  {

    proveedor:
    proveedor,

    material:
    material,

    tipo_recepcion:
    tipoRecepcion,

    cantidad:
    cantidad,

    revisadas:
    revisadas,

    novedades:
    novedades,

    faltantes:
    faltantes,

    porcentaje_revisado:
    porcentajeRevisado.toFixed(1),

    observacion:
    observacion,

    comentario_validacion:
    '',

    seguimiento:
    '',

    estado:
    estado,

    novedad_original:
    estado,

    pdf_url:
    pdfUrl,

    usuario_recepcion:
    window.usuarioLogueado.usuario ||

    'Usuario',

    created_at:
    new Date().toISOString()

  }

]);




    if(response.error){

      console.log(
        response.error
      );

      await limpiarArchivosSubidosRecepcion(rutasSubidasRecepcion);

      notifAlert(
        'Error guardando recepción: ' + response.error.message
      );

      return;

    }





    // ======================
    // NOTIFICACION
    // ======================

window.crearNotificacion(

`📦 Nueva recepción registrada

Proveedor:
${proveedor}

Material:
${material}

Tipo:
${tipoRecepcion}

Cantidad:
${cantidad}

Estado:
${estado}`

);

await window.renderRecepciones();

await window.actualizarKPIsRecepcion();

await window.actualizarDashboardRecepcion();

limpiarFormulario();

notifAlert(
  'Recepción guardada correctamente'
);

  } // ← ESTA LLAVE FALTABA

  catch(error){

    console.log(error);

  }

}





// ======================
// RENDER RECEPCIONES
// ======================

window.renderRecepciones = async function(){

  try{

    const body =

    document.getElementById(
      'recepcionesBody'
    );

    if(!body){

      return;

    }

    const response =

    await window.supabaseClient

    .from('recepciones')

    .select('*')

    .order(

      'id',

      {

        ascending:false

      }

    );





    if(response.error){

      console.log(
        response.error
      );

      return;

    }





    const recepciones =
    response.data || [];

    window.recepcionesCacheSoportes = {};



    body.innerHTML = '';





    let html = '';


const usuarioActual =

window.usuarioLogueado?.usuario?.toLowerCase() || '';

const puedeGestionar =

usuarioActual === 'admin' ||
usuarioActual === 'auditor' ||
usuarioActual === 'lider' ||
usuarioActual === 'compras';

const puedeEliminar =

usuarioActual === 'admin' ||

usuarioActual === 'auditor';


    recepciones.forEach(function(item){

      window.recepcionesCacheSoportes[item.id] = adjuntosCommonRecepcion
        ? adjuntosCommonRecepcion.deserializarRecepcion(item.pdf_url)
        : [];

      let estadoClass = '';





      if(item.estado === 'Pendiente'){

        estadoClass =
        'estado-pendiente';

      }

      else if(item.estado === 'En Gestión Compras'){

        estadoClass =
        'estado-revision';

      }

      else if(item.estado === 'Esperando Proveedor'){

        estadoClass =
        'estado-revision';

      }

      else{

        estadoClass =
        'estado-cerrado';

      }





      html += `

      <tr>

        <td>
          ${item.proveedor || '-'}
        </td>

        <td>
          ${item.material || '-'}
        </td>

        <td>
          ${item.tipo_recepcion || '-'}
        </td>

        <td>
          ${item.cantidad || 0}
        </td>

        <td>
          ${item.porcentaje_revisado || 0}%
        </td>

        <td>
          ${item.novedades || 0}
        </td>

        <td>

  <span class="${estadoClass}">
    ${item.novedad_original || item.estado}
  </span>

</td>

<td>

  <span class="${estadoClass}">
    ${item.estado}
  </span>

</td>

        <td>

          ${new Date(
            item.created_at
          ).toLocaleString('es-CO')}

        </td>

        <td>

          <div class="acciones-tabla-mini">

            ${

              item.pdf_url

              ?

              `

            <button
  class="btn-mini btn-seguimiento-mini
  ${!puedeGestionar ? 'btn-bloqueado' : ''}"
  title="${
    puedeGestionar
    ? 'Seguimiento'
    : 'Solo Compras, Auditor y Admin'
  }"
  ${
    puedeGestionar
    ? `onclick="window.validarRecepcion(${item.id})"`
    : ''
  }
>

  📋

</button>

              `

              :

              ''

            }

            <button
              class="btn-mini btn-observacion-mini"
              title="Ver Observación"
              onclick="window.verObservacion(\`${item.observacion || ''}\`)"
            >

              👁️

            </button>
${
  item.pdf_url
  ?
  `
  <button
    class="btn-mini btn-pdf-mini"
    title="Ver soportes"
    onclick="window.verSoportesRecepcion(${item.id})"
  >
    📎
  </button>
  `
  :
  ''
}

            </button>

           <button
  class="btn-mini btn-eliminar-mini
  ${!puedeEliminar ? 'btn-bloqueado' : ''}"
  title="${
    puedeEliminar
    ? 'Eliminar'
    : 'Solo Admin y Auditor'
  }"
  ${
    puedeEliminar
    ? `onclick="eliminarRecepcion(${item.id})"`
    : ''
  }
>

  🗑️

</button>

          </div>

        </td>

      </tr>

      `;

    });





    body.innerHTML =
    html;

  }

  catch(error){

    console.log(error);

  }

};





// ======================
// MODAL GESTION
// ======================

window.validarRecepcion = async function(id){

  try{

    window.recepcionGestionando =
    Number(id);





    const modal =

    document.getElementById(
      'modalGestion'
    );





    const timeline =

    document.getElementById(
      'timelineSeguimiento'
    );





    const comentarioInput =

    document.getElementById(
      'gestionComentarioInput'
    );





    const estadoInput =

    document.getElementById(
      'gestionEstadoInput'
    );





    comentarioInput.value = '';

console.log(
'ID RECEPCION:',
window.recepcionGestionando
);

    const consulta =

    await window.supabaseClient

    .from('recepciones')

    .select('*')

    .eq(

      'id',

      Number(id)

    )

    .single();





    if(consulta.error){

      console.log(
        consulta.error
      );

      return;

    }





    const recepcion =
    consulta.data;





    estadoInput.value =
    recepcion.estado || 'Pendiente';





    timeline.innerHTML = '';





    if(

      !recepcion.seguimiento ||

      recepcion.seguimiento.trim() === ''

    ){

      timeline.innerHTML =

      `

      <div class="sin-notificaciones">

        Sin seguimiento registrado

      </div>

      `;

    }

    else{

      const bloques =

      recepcion.seguimiento

      .split('━━━━━━━━━━━━━━━━━━')

      .reverse();

bloques.forEach(function(item){

  if(item.trim() === ''){
    return;
  }

  let badgeClass = 'estado-default';
  let estadoTexto = 'Seguimiento';

  if(item.includes('Pendiente')){
    badgeClass = 'estado-pendiente-badge';
    estadoTexto = 'Pendiente';
  }

  else if(item.includes('En Gestión Compras')){
    badgeClass = 'estado-gestion-badge';
    estadoTexto = 'En Gestión Compras';
  }

  else if(item.includes('Contactando Proveedor')){
    badgeClass = 'estado-contacto-badge';
    estadoTexto = 'Contactando Proveedor';
  }

  else if(item.includes('Esperando Respuesta')){
    badgeClass = 'estado-espera-badge';
    estadoTexto = 'Esperando Respuesta';
  }

  else if(item.includes('Solucionado')){
    badgeClass = 'estado-solucionado-badge';
    estadoTexto = 'Solucionado';
  }

  else if(item.includes('Cerrado')){
    badgeClass = 'estado-cerrado-badge';
    estadoTexto = 'Cerrado';
  }

  timeline.innerHTML += `

  <div class="timeline-item">

      <div class="timeline-top">

          <span class="timeline-badge ${badgeClass}">
              ${estadoTexto}
          </span>

      </div>

      <div class="timeline-comentario">

          ${item.replace(/\n/g,'<br>')}

      </div>

  </div>

  `;

});
      

    }





    modal.classList.add(
      'active'
    );

  }

  catch(error){

    console.log(error);

  }

};





// ======================
// CERRAR MODAL
// ======================

window.cerrarModalGestion = function(){

  const modal =

  document.getElementById(
    'modalGestion'
  );





  if(modal){

    modal.classList.remove(
      'active'
    );

  }

};





// ======================
// GUARDAR GESTION
// ======================

window.guardarGestionBtn =
document.getElementById(
  'guardarGestionBtn'
);

if(window.guardarGestionBtn){

  window.guardarGestionBtn.onclick =

  async function(){

    try{

      const comentario =

      document.getElementById(
        'gestionComentarioInput'
      ).value.trim();

      const estado =

      document.getElementById(
        'gestionEstadoInput'
      ).value;

      if(comentario === ''){

        notifAlert(
          'Ingrese comentario'
        );

        return;

      }

      if(!window.recepcionGestionando){

        notifAlert(
          'No se encontró la recepción.'
        );

        return;

      }

      // ======================
      // CONSULTAR RECEPCION
      // ======================

      const consulta =

      await window.supabaseClient

      .from('recepciones')

      .select('*')

      .eq(
        'id',
        Number(
          window.recepcionGestionando
        )
      )

      .single();

      if(consulta.error){

        console.log(
          consulta.error
        );

        notifAlert(
          'Error consultando recepción'
        );

        return;

      }

      const recepcion =
      consulta.data;

      const fecha =

      new Date()
      .toLocaleString(
        'es-CO'
      );

      let seguimiento =

      recepcion.seguimiento || '';

      seguimiento +=

`
━━━━━━━━━━━━━━━━━━

📅 ${fecha}

👤 Usuario:
${window.usuarioLogueado.usuario}

🏷️ Estado:
${estado}

📝 Comentario:
${comentario}
`;

      // ======================
      // ACTUALIZAR
      // ======================

      const update =

      await window.supabaseClient

      .from('recepciones')

      .update({

        estado:
        estado,

        comentario_validacion:
        comentario,

        seguimiento:
        seguimiento

        // IMPORTANTE:
        // NO TOCAR novedad_original

      })

      .eq(
        'id',
        Number(
          window.recepcionGestionando
        )
      );

      if(update.error){

        console.log(
          update.error
        );

        notifAlert(
          'Error actualizando gestión'
        );

        return;

      }

      // ======================
      // NOTIFICACION
      // ======================

      window.crearNotificacion(

`🛒 Compras actualizó seguimiento

Estado:
${estado}

Comentario:
${comentario}`

      );

      // ======================
      // REFRESCAR
      // ======================

      await window.renderRecepciones();

      await window.actualizarKPIsRecepcion();

      await window.actualizarDashboardRecepcion();

      // ======================
      // CERRAR MODAL
      // ======================

      window.cerrarModalGestion();

    }

    catch(error){

      console.log(error);

    }

  };

}
// ======================
// ELIMINAR RECEPCION
// ======================

window.eliminarRecepcion = async function(id){

  try{

    const confirmar = window.Notif && typeof window.Notif.confirm === 'function'
      ? await window.Notif.confirm(
          'Esta acción no se puede deshacer.',
          '¿Eliminar recepción?'
        )
      : window.confirm('¿Eliminar recepción?');

    if(!confirmar){
      return;
    }

    const consulta = await window.supabaseClient
      .from('recepciones')
      .select('pdf_url')
      .eq('id', Number(id))
      .single();

    if (consulta.error) {
      notifAlert('No fue posible consultar los soportes: ' + consulta.error.message);
      return;
    }

    const eliminacion = await window.supabaseClient
      .from('recepciones')
      .delete()
      .eq('id', Number(id));

    if (eliminacion.error) {
      notifAlert('No fue posible eliminar la recepción: ' + eliminacion.error.message);
      return;
    }

    const soportes = adjuntosCommonRecepcion
      ? adjuntosCommonRecepcion.deserializarRecepcion(consulta.data?.pdf_url)
      : [];
    const rutas = soportes
      .filter(function (soporte) { return soporte.tipo === 'archivo' && soporte.ruta; })
      .map(function (soporte) { return soporte.ruta; });

    if (rutas.length > 0) {
      const limpieza = await window.supabaseClient
        .storage
        .from('recepciones-pdf')
        .remove(rutas);
      if (limpieza.error) {
        console.warn('La recepción se eliminó, pero algunos archivos no pudieron limpiarse:', limpieza.error);
      }
    }

    await window.renderRecepciones();
    await window.actualizarKPIsRecepcion();
    await window.actualizarDashboardRecepcion();
    notifAlert('Recepción eliminada correctamente');

  }

  catch(error){
    console.log(error);
    notifAlert(error.message || 'No fue posible eliminar la recepción');
  }

};



// ======================
// ACTUALIZAR KPIS
// ======================

window.actualizarKPIsRecepcion = async function(){

  try{

    const response =

    await window.supabaseClient

    .from('recepciones')

    .select('*');





    const recepciones =
    response.data || [];





    const kpiRecepciones =

    document.getElementById(
      'kpiRecepciones'
    );





    const kpiRevisado =

    document.getElementById(
      'kpiRevisado'
    );





    const kpiNovedades =

    document.getElementById(
      'kpiNovedades'
    );





    const kpiFaltantes =

    document.getElementById(
      'kpiFaltantes'
    );





    if(kpiRecepciones){

      kpiRecepciones.innerText =
      recepciones.length;

    }





    if(recepciones.length > 0){

      const ultima =
      recepciones[0];





      if(kpiRevisado){

        kpiRevisado.innerText =

        ultima.porcentaje_revisado + '%';

      }





      if(kpiNovedades){

        kpiNovedades.innerText =

        ultima.novedades || 0;

      }





      if(kpiFaltantes){

        kpiFaltantes.innerText =

        ultima.faltantes || 0;

      }

    }

  }

  catch(error){

    console.log(error);

  }

};





// ======================
// AUTO REFRESH
// ======================

window.iniciarRefreshRecepcion = function(){

  if(window.refreshRecepcion){

    clearInterval(
      window.refreshRecepcion
    );

  }





  window.refreshRecepcion =

  setInterval(async function(){

  await window.renderRecepciones();

await window.actualizarKPIsRecepcion();

await window.actualizarDashboardRecepcion();

  },5000);

};





// ======================
// LIMPIAR FORMULARIO
// ======================

function limpiarFormulario(){

  document.getElementById(
    'proveedorInput'
  ).value = '';

  document.getElementById(
    'materialInput'
  ).value = '';

  document.getElementById(
    'cantidadInput'
  ).value = '';

  document.getElementById(
    'revisadasInput'
  ).value = '';

  document.getElementById(
    'novedadesInput'
  ).value = '';

  document.getElementById(
    'faltantesInput'
  ).value = '';

  document.getElementById(
    'observacionInput'
  ).value = '';

  const inputSoportes = document.getElementById('pdfInput');
  if (inputSoportes) inputSoportes.value = '';

  const inputDrive = document.getElementById('driveLinkRecepcion');
  if (inputDrive) inputDrive.value = '';

  soportesRecepcionSeleccionados = [];
  renderSoportesRecepcionTemporales();

}





// ======================
// VER SOPORTES RECEPCIÓN
// ======================

window.verSoportesRecepcion = function (id) {
  const modal = document.getElementById('modalSoportesRecepcion');
  const contenido = document.getElementById('contenidoSoportesRecepcion');
  const contador = document.getElementById('contadorSoportesRecepcionModal');
  if (!modal || !contenido || !adjuntosCommonRecepcion) return;

  window.recepcionSoportesModalId = Number(id);
  const soportes = window.recepcionesCacheSoportes[id] || [];
  if (contador) contador.textContent = `${soportes.length} / ${adjuntosCommonRecepcion.MAX_ADJUNTOS}`;

  const puedeGestionar = puedeGestionarSoportesRecepcion();
  if (soportes.length === 0) {
    contenido.innerHTML = '<div class="adjunto-vacio">Esta recepción no tiene soportes registrados.</div>';
  } else {
    contenido.innerHTML = `<div class="adjuntos-lista">${soportes.map(function (soporte, index) {
      const visual = adjuntosCommonRecepcion.tipoVisual(soporte);
      const meta = soporte.tipo === 'drive'
        ? 'Google Drive'
        : `${visual.etiqueta}${soporte.tamano ? ' · ' + adjuntosCommonRecepcion.formatearTamano(soporte.tamano) : ''}`;
      const url = adjuntosCommonRecepcion.escaparHTML(soporte.url);
      return `
        <div class="adjunto-item">
          <div class="adjunto-item__info">
            <span class="adjunto-item__icono">${visual.icono}</span>
            <div class="adjunto-item__texto">
              <span class="adjunto-item__nombre">${adjuntosCommonRecepcion.escaparHTML(soporte.nombre)}</span>
              <span class="adjunto-item__meta">${adjuntosCommonRecepcion.escaparHTML(meta)}</span>
            </div>
          </div>
          <div class="adjunto-item__acciones">
            <button type="button" class="adjunto-btn adjunto-btn--abrir" data-url="${url}">Abrir</button>
            ${puedeGestionar ? `<button type="button" class="adjunto-btn adjunto-btn--eliminar" onclick="eliminarSoporteRecepcionGuardado(${index})">Eliminar</button>` : ''}
          </div>
        </div>`;
    }).join('')}</div>`;

    contenido.querySelectorAll('[data-url]').forEach(function (boton) {
      boton.onclick = function () {
        window.open(boton.dataset.url, '_blank', 'noopener,noreferrer');
      };
    });
  }

  const panelAgregar = document.getElementById('btnAgregarArchivosRecepcionModal')?.closest('.adjuntos-panel');
  if (panelAgregar) panelAgregar.style.display = puedeGestionar ? 'grid' : 'none';
  modal.classList.add('active');
};

window.cerrarModalSoportesRecepcion = function () {
  document.getElementById('modalSoportesRecepcion')?.classList.remove('active');
};


// ======================
// VER OBSERVACION
// ======================

window.verObservacion = function(observacion){

  const modal = document.getElementById(
    'modalObservacion'
  );

  const contenido = document.getElementById(
    'contenidoObservacion'
  );

  contenido.innerText =
  observacion || 'Sin observaciones registradas';

  modal.classList.add('active');

};

window.cerrarModalObservacion = function(){

  document
  .getElementById('modalObservacion')
  .classList.remove('active');

};


window.mostrarAlerta = function(
  titulo,
  mensaje
){

  document.getElementById(
    'tituloAlerta'
  ).innerText = titulo;

  document.getElementById(
    'mensajeAlerta'
  ).innerText = mensaje;

  document.getElementById(
    'modalAlerta'
  ).classList.add(
    'active'
  );

};

window.cerrarAlerta = function(){

  document.getElementById(
    'modalAlerta'
  ).classList.remove(
    'active'
  );

};


// ======================
// DASHBOARD RECEPCION
// ======================

window.actualizarDashboardRecepcion =
async function(){

  try{

    const response =

    await window.supabaseClient

    .from('recepciones')

    .select('*');

    if(response.error){

      console.log(response.error);

      return;

    }

    const datos =
    response.data || [];

    const resumenMeses = {};

    datos.forEach(function(item){

      const fecha =
      new Date(item.created_at);

      const mes =

      fecha.toLocaleString(
        'es-CO',
        {
          month:'long'
        }
      );

      if(!resumenMeses[mes]){

        resumenMeses[mes] = {

          recepciones:0,

          faltantes:0,

          sobrantes:0,

          danados:0,

          total:0

        };

      }

      // ======================
      // TOTAL RECEPCIONES
      // ======================

      resumenMeses[mes]
      .recepciones++;

      // ======================
      // NOVEDAD ORIGINAL
      // ======================

      const novedad =

      (
        item.novedad_original ||
        item.estado ||
        ''
      )

      .toString()

      .toLowerCase()

      .trim();

      // DEBUG
      console.log(
        'NOVEDAD:',
        novedad
      );

      // ======================
      // FALTANTES
      // ======================

      if(
        novedad.includes(
          'faltante'
        )
      ){

        resumenMeses[mes]
        .faltantes++;

      }

      // ======================
      // SOBRANTES
      // ======================

      if(
        novedad.includes(
          'sobrante'
        )
      ){

        resumenMeses[mes]
        .sobrantes++;

      }

      // ======================
      // DAÑADOS
      // ======================

      if(
        novedad.includes(
          'dañado'
        ) ||

        novedad.includes(
          'danado'
        )
      ){

        resumenMeses[mes]
        .danados++;

      }

      // ======================
      // TOTAL NOVEDADES
      // ======================

      if(

        novedad.includes(
          'faltante'
        ) ||

        novedad.includes(
          'sobrante'
        ) ||

        novedad.includes(
          'dañado'
        ) ||

        novedad.includes(
          'danado'
        )

      ){

        resumenMeses[mes]
        .total++;

      }

    });

    const body =

    document.getElementById(
      'dashboardRecepcionBody'
    );

    if(!body){

      return;

    }

    body.innerHTML = '';

    Object.keys(resumenMeses)

    .forEach(function(mes){

      const item =
      resumenMeses[mes];

      body.innerHTML += `

      <tr>

        <td>${mes}</td>

        <td>${item.recepciones}</td>

        <td>${item.faltantes}</td>

        <td>${item.sobrantes}</td>

        <td>${item.danados}</td>

        <td>${item.total}</td>

      </tr>

      `;

    });

  }

  catch(error){

    console.log(
      'Error Dashboard:',
      error
    );

  }

};

// ======================
// DASHBOARD EJECUTIVO
// ======================

document.addEventListener(
'click',
function(e){

if(
  e.target &&
  e.target.id ===
  'descargarDashboardRecepcion'
){

  window.open(

    'modules/dashboard-recepcion.html',

    '_blank'

  );

}

});

// ======================
// INICIO
// ======================

inicializarAdjuntosRecepcion();
window.renderRecepciones();

window.actualizarKPIsRecepcion();

window.actualizarDashboardRecepcion();

window.iniciarRefreshRecepcion();
