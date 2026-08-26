// ==========================================================
// AUDITORIAS.JS
// Módulo de Auditorías — arquitectura modular
//
// Este archivo se carga una única vez por el loader del
// dashboard (js/dashboard.js -> cargarModulo), por lo tanto
// TODO el módulo vive en este único archivo. Para mantenerlo
// ordenado se divide en bloques claramente delimitados:
//
//   1. Limpieza / bootstrap
//   2. Estado interno del módulo
//   3. Utilidades genéricas
//   4. Historial + Notificaciones (capa unificada)
//   5. Documentos temporales (formulario de creación)
//   6. Storage: subir / eliminar / reemplazar documentos
//   7. CRUD Auditorías (crear, listar, render, filtrar)
//   8. Modal "Ver documentos"
//   9. Modal "Editar auditoría" (edición integral)
//  10. Modal "Detalle de auditoría"
//  11. Eliminar auditoría / editar estado rápido
//  12. Permisos
//  13. Inicialización del módulo
// ==========================================================


// ==========================================================
// 1. LIMPIEZA / BOOTSTRAP
// ==========================================================
// El módulo puede recargarse varias veces (SPA sin recarga de
// página), así que se limpian intervalos y funciones globales
// previas antes de volver a declararlas.

if (window.refreshAuditoriasInterval) {
    clearInterval(window.refreshAuditoriasInterval);
}

[
    "renderAuditorias",
    "eliminarAuditoria",
    "editarEstado",
    "iniciarRefreshAuditorias",
    "verDocumentos",
    "abrirEditarAuditoria",
    "verDetalleAuditoria",
    "descargarDocumento",
    "cargarAuditorias",
    "filtrarAuditorias",
    "eliminarDocumentoTemporal",
    "eliminarDocumentoEdicionTemporal",
    "eliminarDocumentoAuditoria"
].forEach(function (nombre) {
    delete window[nombre];
});


// ==========================================================
// 2. ESTADO INTERNO DEL MÓDULO
// ==========================================================

const AUDITORIAS_BUCKET = "auditorias";
const AUDITORIAS_TABLA = "auditorias";
const DOCUMENTOS_TABLA = "auditoria_documentos";
const ADJUNTOS_AUDITORIA = window.AdjuntosCommon;
const PREFIJO_DRIVE = "drive::";

// Cache de la última consulta (usada por el buscador/filtro)
let auditoriasCache = [];

// Documentos seleccionados en el formulario de CREACIÓN
// (aún no subidos a Storage)
let documentosSeleccionados = [];
let documentosEdicionSeleccionados = [];
let auditoriaDocumentosModalId = null;
window.documentosAuditoriaModalCache = {};

// Snapshot de la auditoría que se está editando actualmente,
// se usa para poder comparar "antes" vs "después" y así
// registrar un historial detallado de los cambios.
let auditoriaEnEdicion = null;


// ==========================================================
// 3. UTILIDADES GENÉRICAS
// ==========================================================

function obtenerElemento(id) {
    return document.getElementById(id);
}

function obtenerValor(id) {
    const el = obtenerElemento(id);
    return el ? el.value : "";
}

function asignarValor(id, valor) {
    const el = obtenerElemento(id);
    if (el) el.value = valor ?? "";
}

function obtenerExtension(nombreArchivo) {
    return ADJUNTOS_AUDITORIA
        ? ADJUNTOS_AUDITORIA.obtenerExtension(nombreArchivo)
        : String(nombreArchivo || "").split(".").pop().toLowerCase();
}

function esRutaDrive(ruta) {
    return String(ruta || "").startsWith(PREFIJO_DRIVE);
}

function obtenerUrlDrive(ruta) {
    return esRutaDrive(ruta) ? String(ruta).slice(PREFIJO_DRIVE.length) : "";
}

function notificarAdjuntosAuditoria(mensaje, tipo = "warning") {
    if (typeof window.mostrarNotificacion === "function") {
        window.mostrarNotificacion("Soportes de auditoría", mensaje, tipo);
    } else if (typeof notifAlert === "function") {
        notifAlert(mensaje);
    }
}

function formatearFecha(fecha) {
    return fecha ? new Date(fecha).toLocaleDateString("es-CO") : "-";
}

function claseEstado(estado) {
    switch (estado) {
        case "Pendiente": return "estado-pendiente";
        case "En proceso": return "estado-proceso";
        case "Finalizada": return "estado-finalizada";
        default: return "estado-pendiente";
    }
}

function abrirModal(id) {
    const modal = obtenerElemento(id);
    if (modal) modal.classList.add("active");
}

function cerrarModal(id) {
    const modal = obtenerElemento(id);
    if (modal) modal.classList.remove("active");
}

// Cierra un modal al hacer click fuera de su contenido y
// registra el botón "cerrar" (✕), evitando repetir el mismo
// patrón de eventos en cada modal.
function configurarCierreModal(modalId, botonCerrarId) {
    const modal = obtenerElemento(modalId);
    const boton = obtenerElemento(botonCerrarId);

    if (boton) {
        boton.onclick = function () {
            cerrarModal(modalId);
        };
    }

    if (modal) {
        modal.addEventListener("click", function (e) {
            if (e.target === modal) {
                cerrarModal(modalId);
            }
        });
    }
}

function manejarErrorSupabase(error, mensajeUsuario) {
    console.error(error);
    window.mostrarNotificacion
        ? window.mostrarNotificacion("Error", mensajeUsuario || error.message, "error")
        : notifAlert(mensajeUsuario || error.message);
}


// ==========================================================
// 4. HISTORIAL + NOTIFICACIONES (capa unificada)
// ==========================================================
// Toda acción relevante del módulo pasa por esta única función
// para no duplicar la lógica de "guardar historial" + "avisar
// al usuario" en cada flujo (crear, editar, eliminar, etc).
//
//   accion       -> "CREAR" | "EDITAR" | "ELIMINAR"
//   descripcion  -> texto que se guarda en la tabla `historial`
//   opciones:
//     mensajeCampana -> texto de la campanita de notificaciones
//                       (por defecto usa la misma descripción)
//     popup           -> { titulo, tipo } para mostrar el modal
//                       global de notificación (success/error/info)

async function registrarEvento(accion, descripcion, opciones = {}) {
    try {
        if (typeof window.guardarHistorial === "function") {
            await window.guardarHistorial(accion, "AUDITORIAS", descripcion);
        }

        if (typeof window.crearNotificacion === "function") {
            window.crearNotificacion(opciones.mensajeCampana || descripcion);
        }

        if (opciones.popup && typeof window.mostrarNotificacion === "function") {
            window.mostrarNotificacion(
                opciones.popup.titulo || "Auditorías",
                descripcion,
                opciones.popup.tipo || "success"
            );
        }
    } catch (error) {
        // El historial/notificación nunca debe romper el flujo principal
        console.error("No fue posible registrar el evento:", error);
    }
}

// Genera los mensajes de historial a partir de la comparación
// entre los datos anteriores y los nuevos de una auditoría.
function generarCambios(anterior, nuevo, huboDocumentoNuevo) {
    const cambios = [];

    const campos = [
        { clave: "tipo", etiqueta: "el tipo" },
        { clave: "nombre", etiqueta: "el nombre" },
        { clave: "responsable", etiqueta: "el responsable" },
        { clave: "proceso", etiqueta: "el proceso" },
        { clave: "fecha", etiqueta: "la fecha" },
        { clave: "observaciones", etiqueta: "las observaciones" }
    ];

    campos.forEach(function (campo) {
        const valorAnterior = (anterior[campo.clave] || "").toString().trim();
        const valorNuevo = (nuevo[campo.clave] || "").toString().trim();

        if (valorAnterior !== valorNuevo) {
            cambios.push(`Se modificó ${campo.etiqueta}.`);
        }
    });

    if ((anterior.estado || "") !== (nuevo.estado || "")) {
        cambios.push(`Se cambió el estado de "${anterior.estado}" a "${nuevo.estado}".`);
    }

    if (huboDocumentoNuevo) {
        cambios.push("Se agregaron nuevos soportes documentales.");
    }

    return cambios;
}


// ==========================================================
// 5. SOPORTES TEMPORALES Y GESTIÓN DOCUMENTAL
// ==========================================================

const btnGuardarAuditoria = obtenerElemento("guardarAuditoria");
const btnAgregarDocumento = obtenerElemento("btnAgregarDocumento");
const documentoInput = obtenerElemento("documentoInput");
const listaDocumentos = obtenerElemento("listaDocumentos");
const btnAgregarDriveAuditoria = obtenerElemento("btnAgregarDriveAuditoria");
const driveLinkAuditoria = obtenerElemento("driveLinkAuditoria");

if (btnGuardarAuditoria) btnGuardarAuditoria.onclick = guardarAuditoria;
if (btnAgregarDocumento && documentoInput) {
    btnAgregarDocumento.onclick = function () { documentoInput.click(); };
}
if (documentoInput) {
    documentoInput.onchange = function (evento) {
        agregarArchivosALista(evento.target.files, documentosSeleccionados, renderDocumentos);
        evento.target.value = "";
    };
}
if (btnAgregarDriveAuditoria) {
    btnAgregarDriveAuditoria.onclick = function () {
        agregarDriveALista(driveLinkAuditoria, documentosSeleccionados, renderDocumentos);
    };
}
if (driveLinkAuditoria) {
    driveLinkAuditoria.onkeydown = function (evento) {
        if (evento.key === "Enter") {
            evento.preventDefault();
            agregarDriveALista(driveLinkAuditoria, documentosSeleccionados, renderDocumentos);
        }
    };
}

function agregarArchivosALista(archivos, destino, render) {
    if (!ADJUNTOS_AUDITORIA) {
        notificarAdjuntosAuditoria("No cargó el componente común de adjuntos.");
        return;
    }

    for (const archivo of Array.from(archivos || [])) {
        if (destino.length >= ADJUNTOS_AUDITORIA.MAX_ADJUNTOS) {
            notificarAdjuntosAuditoria("Solo puede seleccionar hasta 10 soportes.");
            break;
        }

        const validacion = ADJUNTOS_AUDITORIA.validarArchivo(archivo);
        if (!validacion.valido) {
            notificarAdjuntosAuditoria(validacion.mensaje);
            continue;
        }

        const duplicado = destino.some(function (item) {
            return item.tipo === "archivo" &&
                item.archivo.name === archivo.name &&
                item.archivo.size === archivo.size &&
                item.archivo.lastModified === archivo.lastModified;
        });

        if (!duplicado) {
            destino.push({
                tipo: "archivo",
                archivo,
                nombre: archivo.name,
                mime: archivo.type || "",
                tamano: archivo.size
            });
        }
    }

    render();
}

function agregarDriveALista(input, destino, render) {
    if (!input || !ADJUNTOS_AUDITORIA) return;
    if (destino.length >= ADJUNTOS_AUDITORIA.MAX_ADJUNTOS) {
        notificarAdjuntosAuditoria("Solo puede seleccionar hasta 10 soportes.");
        return;
    }

    const url = ADJUNTOS_AUDITORIA.normalizarDriveUrl(input.value);
    if (!url) {
        notificarAdjuntosAuditoria("Pegue un enlace válido de Google Drive o Google Docs que comience por https://.");
        return;
    }

    if (destino.some(function (item) { return item.url === url; })) {
        notificarAdjuntosAuditoria("Ese enlace de Drive ya fue agregado.");
        return;
    }

    destino.push({
        tipo: "drive",
        nombre: ADJUNTOS_AUDITORIA.nombreEnlaceDrive(url, destino.length + 1),
        url,
        mime: "text/uri-list",
        tamano: 0
    });
    input.value = "";
    render();
}

function htmlSoporteTemporal(soporte, index, funcionEliminar) {
    const visual = ADJUNTOS_AUDITORIA.tipoVisual(soporte);
    const meta = soporte.tipo === "drive"
        ? "Google Drive"
        : `${visual.etiqueta} · ${ADJUNTOS_AUDITORIA.formatearTamano(soporte.tamano)}`;

    return `
        <div class="adjunto-item">
            <div class="adjunto-item__info">
                <span class="adjunto-item__icono">${visual.icono}</span>
                <div class="adjunto-item__texto">
                    <span class="adjunto-item__nombre">${ADJUNTOS_AUDITORIA.escaparHTML(soporte.nombre)}</span>
                    <span class="adjunto-item__meta">${ADJUNTOS_AUDITORIA.escaparHTML(meta)}</span>
                </div>
            </div>
            <div class="adjunto-item__acciones">
                <button type="button" class="adjunto-btn adjunto-btn--eliminar" onclick="${funcionEliminar}(${index})">Quitar</button>
            </div>
        </div>`;
}

function renderDocumentos() {
    if (!listaDocumentos || !ADJUNTOS_AUDITORIA) return;
    const contador = obtenerElemento("contadorDocumentosAuditoria");
    if (contador) contador.textContent = `${documentosSeleccionados.length} / ${ADJUNTOS_AUDITORIA.MAX_ADJUNTOS}`;

    listaDocumentos.innerHTML = documentosSeleccionados.length
        ? documentosSeleccionados.map(function (doc, index) {
            return htmlSoporteTemporal(doc, index, "eliminarDocumentoTemporal");
        }).join("")
        : '<div class="documento-vacio">📄 Ningún soporte agregado.</div>';
}

window.eliminarDocumentoTemporal = function (index) {
    documentosSeleccionados.splice(Number(index), 1);
    renderDocumentos();
};

function renderDocumentosEdicion() {
    const lista = obtenerElemento("listaDocumentosEdicion");
    const contador = obtenerElemento("contadorDocumentosEdicion");
    if (!lista || !ADJUNTOS_AUDITORIA) return;

    if (contador) contador.textContent = `${documentosEdicionSeleccionados.length} nuevos`;
    lista.innerHTML = documentosEdicionSeleccionados.length
        ? documentosEdicionSeleccionados.map(function (doc, index) {
            return htmlSoporteTemporal(doc, index, "eliminarDocumentoEdicionTemporal");
        }).join("")
        : '<div class="adjunto-vacio">No hay soportes nuevos seleccionados.</div>';
}

window.eliminarDocumentoEdicionTemporal = function (index) {
    documentosEdicionSeleccionados.splice(Number(index), 1);
    renderDocumentosEdicion();
};

function limpiarDocumentos() {
    documentosSeleccionados = [];
    if (driveLinkAuditoria) driveLinkAuditoria.value = "";
    renderDocumentos();
}

function limpiarDocumentosEdicion() {
    documentosEdicionSeleccionados = [];
    const inputArchivo = obtenerElemento("editarDocumento");
    const inputDrive = obtenerElemento("driveLinkEdicionAuditoria");
    if (inputArchivo) inputArchivo.value = "";
    if (inputDrive) inputDrive.value = "";
    renderDocumentosEdicion();
}

// ==========================================================
// 6. STORAGE Y TABLA auditoria_documentos
// ==========================================================

function generarRutaStorage(auditoriaId, nombreArchivo) {
    const limpio = String(nombreArchivo || "soporte")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]/g, "_");
    const identificador = window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    return `${auditoriaId}/${identificador}_${limpio}`;
}

async function subirDocumento(auditoriaId, soporte) {
    if (soporte.tipo === "drive") {
        return window.supabaseClient
            .from(DOCUMENTOS_TABLA)
            .insert([{
                auditoria_id: auditoriaId,
                nombre_archivo: soporte.nombre,
                ruta_storage: PREFIJO_DRIVE + soporte.url,
                tipo_archivo: "DRIVE",
                tamano: 0
            }])
            .select()
            .single();
    }

    const archivo = soporte.archivo || soporte;
    const validacion = ADJUNTOS_AUDITORIA.validarArchivo(archivo);
    if (!validacion.valido) return { error: new Error(validacion.mensaje) };

    const rutaStorage = generarRutaStorage(auditoriaId, archivo.name);
    const subida = await window.supabaseClient
        .storage
        .from(AUDITORIAS_BUCKET)
        .upload(rutaStorage, archivo, { upsert: false, contentType: archivo.type || undefined });

    if (subida.error) return { error: subida.error };

    const registro = await window.supabaseClient
        .from(DOCUMENTOS_TABLA)
        .insert([{
            auditoria_id: auditoriaId,
            nombre_archivo: archivo.name,
            ruta_storage: rutaStorage,
            tipo_archivo: obtenerExtension(archivo.name).toUpperCase(),
            tamano: archivo.size
        }])
        .select()
        .single();

    if (registro.error) {
        await window.supabaseClient.storage.from(AUDITORIAS_BUCKET).remove([rutaStorage]);
        return { error: registro.error };
    }

    return { data: registro.data };
}

async function obtenerDocumentosDeAuditoria(auditoriaId) {
    return window.supabaseClient
        .from(DOCUMENTOS_TABLA)
        .select("*")
        .eq("auditoria_id", auditoriaId)
        .order("id");
}

async function eliminarDocumentos(documentos) {
    if (!documentos || documentos.length === 0) return;

    const rutas = documentos
        .map(function (doc) { return doc.ruta_storage; })
        .filter(function (ruta) { return ruta && !esRutaDrive(ruta); });

    if (rutas.length) {
        await window.supabaseClient.storage.from(AUDITORIAS_BUCKET).remove(rutas);
    }

    const ids = documentos.map(function (doc) { return doc.id; });
    await window.supabaseClient.from(DOCUMENTOS_TABLA).delete().in("id", ids);
}

async function contarDocumentosAuditoria(auditoriaId) {
    const { count, error } = await window.supabaseClient
        .from(DOCUMENTOS_TABLA)
        .select("id", { count: "exact", head: true })
        .eq("auditoria_id", auditoriaId);
    return { count: Number(count || 0), error };
}

async function agregarSoportesDirectos(auditoriaId, soportes) {
    const conteo = await contarDocumentosAuditoria(auditoriaId);
    if (conteo.error) return { error: conteo.error };
    if (conteo.count + soportes.length > ADJUNTOS_AUDITORIA.MAX_ADJUNTOS) {
        return { error: new Error(`La auditoría ya tiene ${conteo.count} soportes. El máximo permitido es 10.`) };
    }

    const guardados = [];
    for (const soporte of soportes) {
        const resultado = await subirDocumento(auditoriaId, soporte);
        if (resultado.error) {
            await eliminarDocumentos(guardados);
            return { error: resultado.error };
        }
        guardados.push(resultado.data);
    }
    return { data: guardados };
}

// ==========================================================
// 7. CRUD AUDITORÍAS
// ==========================================================

async function guardarAuditoria() {
    try {
        if (!window.tienePermiso("auditorias", "crear")) {
            window.mostrarNotificacion
                ? window.mostrarNotificacion("Sin permisos", "No tiene permisos para crear auditorías.", "warning")
                : notifAlert("No tiene permisos.");
            return;
        }

        const tipo = obtenerValor("tipoInput");
        const nombre = obtenerValor("nombreInput").trim();
        const proceso = obtenerValor("procesoInput").trim();
        const responsable = obtenerValor("responsableInput").trim();
        const estado = obtenerValor("estadoInput");
        const fecha = obtenerValor("fechaInput");
        const observaciones = obtenerValor("observacionesInput").trim();

        if (!tipo || !nombre || !proceso || !responsable || !fecha) {
            window.mostrarNotificacion
                ? window.mostrarNotificacion("Datos incompletos", "Complete todos los campos obligatorios.", "warning")
                : notifAlert("Complete todos los campos obligatorios.");
            return;
        }

        if (!ADJUNTOS_AUDITORIA ||
            documentosSeleccionados.length < ADJUNTOS_AUDITORIA.MIN_ADJUNTOS ||
            documentosSeleccionados.length > ADJUNTOS_AUDITORIA.MAX_ADJUNTOS) {
            notificarAdjuntosAuditoria("Debe agregar entre 1 y 10 soportes antes de guardar la auditoría.");
            return;
        }

        const { data, error } = await window.supabaseClient
            .from(AUDITORIAS_TABLA)
            .insert([{ tipo, nombre, proceso, responsable, estado, fecha, observaciones }])
            .select()
            .single();

        if (error) {
            manejarErrorSupabase(error, "Error guardando la auditoría.");
            return;
        }

        const auditoriaId = data.id;
        const resultadoSoportes = await agregarSoportesDirectos(auditoriaId, documentosSeleccionados);

        if (resultadoSoportes.error) {
            await window.supabaseClient.from(AUDITORIAS_TABLA).delete().eq("id", auditoriaId);
            manejarErrorSupabase(
                resultadoSoportes.error,
                "No fue posible guardar los soportes: " + resultadoSoportes.error.message
            );
            return;
        }

        await registrarEvento(
            "CREAR",
            `Nueva auditoría registrada: ${nombre}.`,
            { popup: { titulo: "Auditoría creada", tipo: "success" } }
        );

        limpiarFormulario();
        await window.cargarAuditorias();
    } catch (error) {
        manejarErrorSupabase(error, "Ocurrió un error inesperado.");
    }
}

function limpiarFormulario() {
    asignarValor("tipoInput", "");
    asignarValor("nombreInput", "");
    asignarValor("procesoInput", "");
    asignarValor("responsableInput", "");
    asignarValor("estadoInput", "Pendiente");
    asignarValor("fechaInput", "");
    asignarValor("observacionesInput", "");
    limpiarDocumentos();
}

window.cargarAuditorias = async function () {
    try {
        const { data, error } = await window.supabaseClient
            .from(AUDITORIAS_TABLA)
            .select("*")
            .order("created_at", { ascending: false });

        if (error) {
            console.error(error);
            return;
        }

        auditoriasCache = data || [];
        window.renderAuditorias(auditoriasCache);
    } catch (error) {
        console.error(error);
    }
};

window.renderAuditorias = function (lista = auditoriasCache) {
    try {
        const body = obtenerElemento("auditoriasBody");
        if (!body) return;

        if (!lista || lista.length === 0) {
            body.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center;padding:30px;">
                        No existen auditorías registradas.
                    </td>
                </tr>
            `;
            return;
        }

        const puedeEditar = window.tienePermiso("auditorias", "editar");
        const puedeEliminar = window.tienePermiso("auditorias", "eliminar");

        body.innerHTML = lista.map(function (item) {
            return `
                <tr>
                    <td>${item.tipo}</td>
                    <td>${item.nombre}</td>
                    <td>${item.responsable}</td>
                    <td><span class="${claseEstado(item.estado)}">${item.estado}</span></td>
                    <td>${formatearFecha(item.fecha)}</td>
                    <td>
                        <div class="acciones-tabla">
                            ${puedeEditar ? `
                                <button class="btn-ver" title="Ver detalle" onclick="verDetalleAuditoria(${item.id})">👁️</button>
                                <button class="btn-primary" title="Documentos" onclick="verDocumentos(${item.id})">📁</button>
                                <button class="btn-editar" title="Editar" onclick="abrirEditarAuditoria(${item.id})">✏️</button>
                            ` : ""}
                            ${puedeEliminar ? `
                                <button class="btn-eliminar" title="Eliminar" onclick="eliminarAuditoria(${item.id})">🗑️</button>
                            ` : ""}
                        </div>
                    </td>
                </tr>
            `;
        }).join("");
    } catch (error) {
        console.error(error);
    }
};

window.filtrarAuditorias = function () {
    const input = obtenerElemento("buscarAuditoria");
    if (!input) return;

    const texto = input.value.toLowerCase().trim();

    if (texto === "") {
        window.renderAuditorias(auditoriasCache);
        return;
    }

    const campos = ["tipo", "nombre", "proceso", "responsable", "estado", "fecha"];

    const resultado = auditoriasCache.filter(function (item) {
        return campos.some(function (campo) {
            return String(item[campo] || "").toLowerCase().includes(texto);
        });
    });

    window.renderAuditorias(resultado);
};


// ==========================================================
// 8. MODAL "VER DOCUMENTOS"
// ==========================================================

window.verDocumentos = async function (id) {
    try {
        const lista = obtenerElemento("listaDocumentosModal");
        const contador = obtenerElemento("contadorDocumentosModal");
        if (!lista || !ADJUNTOS_AUDITORIA) return;

        auditoriaDocumentosModalId = Number(id);
        lista.innerHTML = '<div class="adjunto-vacio">Cargando soportes...</div>';

        const { data, error } = await obtenerDocumentosDeAuditoria(id);
        if (error) {
            manejarErrorSupabase(error, "Error consultando los soportes.");
            return;
        }

        const documentos = data || [];
        window.documentosAuditoriaModalCache = {};
        documentos.forEach(function (doc) {
            window.documentosAuditoriaModalCache[doc.id] = doc;
        });

        if (contador) contador.textContent = `${documentos.length} / ${ADJUNTOS_AUDITORIA.MAX_ADJUNTOS}`;

        const puedeEditar = window.tienePermiso("auditorias", "editar");
        const panelAgregar = obtenerElemento("btnAgregarArchivoModal")?.closest(".adjuntos-panel");
        if (panelAgregar) panelAgregar.style.display = puedeEditar ? "grid" : "none";

        if (documentos.length === 0) {
            lista.innerHTML = '<div class="adjunto-vacio">No existen soportes para esta auditoría. Agregue al menos uno.</div>';
        } else {
            lista.innerHTML = documentos.map(function (doc) {
                const esDrive = esRutaDrive(doc.ruta_storage);
                const mime = String(doc.tipo_archivo || "").toLowerCase();
                const soporteVisual = {
                    tipo: esDrive ? "drive" : "archivo",
                    mime,
                    nombre: doc.nombre_archivo,
                    tamano: doc.tamano
                };
                const visual = ADJUNTOS_AUDITORIA.tipoVisual(soporteVisual);
                const meta = esDrive
                    ? "Google Drive"
                    : `${visual.etiqueta}${doc.tamano ? " · " + ADJUNTOS_AUDITORIA.formatearTamano(doc.tamano) : ""}`;

                return `
                    <div class="adjunto-item">
                        <div class="adjunto-item__info">
                            <span class="adjunto-item__icono">${visual.icono}</span>
                            <div class="adjunto-item__texto">
                                <span class="adjunto-item__nombre">${ADJUNTOS_AUDITORIA.escaparHTML(doc.nombre_archivo)}</span>
                                <span class="adjunto-item__meta">${ADJUNTOS_AUDITORIA.escaparHTML(meta)}</span>
                            </div>
                        </div>
                        <div class="adjunto-item__acciones">
                            <button type="button" class="adjunto-btn adjunto-btn--abrir" onclick="descargarDocumento(${doc.id})">Abrir</button>
                            ${puedeEditar ? `<button type="button" class="adjunto-btn adjunto-btn--eliminar" onclick="eliminarDocumentoAuditoria(${doc.id}, ${Number(id)})">Eliminar</button>` : ""}
                        </div>
                    </div>`;
            }).join("");
        }

        abrirModal("modalDocumentos");
    } catch (error) {
        manejarErrorSupabase(error, "Ocurrió un error consultando los soportes.");
    }
};

window.descargarDocumento = async function (documentoId) {
    try {
        const doc = window.documentosAuditoriaModalCache[Number(documentoId)];
        if (!doc) {
            notificarAdjuntosAuditoria("No se encontró el soporte seleccionado.");
            return;
        }

        if (esRutaDrive(doc.ruta_storage)) {
            window.open(obtenerUrlDrive(doc.ruta_storage), "_blank", "noopener,noreferrer");
            return;
        }

        const { data, error } = await window.supabaseClient
            .storage
            .from(AUDITORIAS_BUCKET)
            .createSignedUrl(doc.ruta_storage, 300);

        if (error) {
            manejarErrorSupabase(error, "No fue posible generar el enlace de apertura.");
            return;
        }

        window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
        manejarErrorSupabase(error, "No fue posible abrir el soporte.");
    }
};

window.eliminarDocumentoAuditoria = async function (documentoId, auditoriaId) {
    try {
        if (!window.tienePermiso("auditorias", "editar")) {
            notificarAdjuntosAuditoria("No tiene permisos para eliminar soportes.");
            return;
        }

        const conteo = await contarDocumentosAuditoria(auditoriaId);
        if (conteo.error) {
            manejarErrorSupabase(conteo.error, "No fue posible validar la cantidad de soportes.");
            return;
        }
        if (conteo.count <= ADJUNTOS_AUDITORIA.MIN_ADJUNTOS) {
            notificarAdjuntosAuditoria("La auditoría debe conservar mínimo un soporte.");
            return;
        }

        const doc = window.documentosAuditoriaModalCache[Number(documentoId)];
        if (!doc) return;

        const confirmar = window.Notif && typeof window.Notif.confirm === "function"
            ? await window.Notif.confirm("El soporte se eliminará definitivamente.", "¿Eliminar soporte?")
            : window.confirm("¿Eliminar soporte?");
        if (!confirmar) return;

        await eliminarDocumentos([doc]);
        await registrarEvento("ELIMINAR", `Se eliminó el soporte “${doc.nombre_archivo}” de la auditoría ${auditoriaId}.`);
        await window.verDocumentos(auditoriaId);
    } catch (error) {
        manejarErrorSupabase(error, "No fue posible eliminar el soporte.");
    }
};

async function cargarArchivosDesdeModal(archivos) {
    if (!auditoriaDocumentosModalId) return;
    if (!window.tienePermiso("auditorias", "editar")) {
        notificarAdjuntosAuditoria("No tiene permisos para agregar soportes.");
        return;
    }
    const temporales = [];
    agregarArchivosALista(archivos, temporales, function () {});
    if (!temporales.length) return;

    const resultado = await agregarSoportesDirectos(auditoriaDocumentosModalId, temporales);
    if (resultado.error) {
        manejarErrorSupabase(resultado.error, resultado.error.message);
        return;
    }

    await registrarEvento("EDITAR", `Se agregaron ${temporales.length} soporte(s) a la auditoría ${auditoriaDocumentosModalId}.`);
    await window.verDocumentos(auditoriaDocumentosModalId);
}

async function cargarDriveDesdeModal() {
    if (!window.tienePermiso("auditorias", "editar")) {
        notificarAdjuntosAuditoria("No tiene permisos para agregar soportes.");
        return;
    }
    const input = obtenerElemento("driveLinkModalAuditoria");
    if (!input || !auditoriaDocumentosModalId) return;
    const temporales = [];
    agregarDriveALista(input, temporales, function () {});
    if (!temporales.length) return;

    const resultado = await agregarSoportesDirectos(auditoriaDocumentosModalId, temporales);
    if (resultado.error) {
        manejarErrorSupabase(resultado.error, resultado.error.message);
        return;
    }

    await registrarEvento("EDITAR", `Se agregó un enlace de Drive a la auditoría ${auditoriaDocumentosModalId}.`);
    await window.verDocumentos(auditoriaDocumentosModalId);
}

const actualizarDocumentoInput = obtenerElemento("actualizarDocumentoInput");
const btnAgregarArchivoModal = obtenerElemento("btnAgregarArchivoModal");
const btnAgregarDriveModal = obtenerElemento("btnAgregarDriveModal");
const driveLinkModalAuditoria = obtenerElemento("driveLinkModalAuditoria");

if (btnAgregarArchivoModal && actualizarDocumentoInput) {
    btnAgregarArchivoModal.onclick = function () { actualizarDocumentoInput.click(); };
    actualizarDocumentoInput.onchange = async function (evento) {
        await cargarArchivosDesdeModal(evento.target.files);
        evento.target.value = "";
    };
}
if (btnAgregarDriveModal) btnAgregarDriveModal.onclick = cargarDriveDesdeModal;
if (driveLinkModalAuditoria) {
    driveLinkModalAuditoria.onkeydown = function (evento) {
        if (evento.key === "Enter") {
            evento.preventDefault();
            cargarDriveDesdeModal();
        }
    };
}

configurarCierreModal("modalDocumentos", "cerrarModalDocumentos");


// ==========================================================
// 9. MODAL "EDITAR AUDITORÍA" (edición integral)
// ==========================================================
// Único punto de edición: datos generales + documento.
// Flujo al guardar (ver guardarCambiosAuditoria):
//   1. Actualizar tabla `auditorias`
//   2. Agregar soportes nuevos sin reemplazar los existentes
//   3. Registrar historial (granular, por campo modificado)
//   4. Notificar
//   5. Cerrar modal + recargar tabla

window.abrirEditarAuditoria = async function (id) {
    try {
        const { data, error } = await window.supabaseClient
            .from(AUDITORIAS_TABLA)
            .select("*")
            .eq("id", id)
            .single();

        if (error) {
            manejarErrorSupabase(error, "No fue posible cargar la auditoría.");
            return;
        }

        // Se guarda el estado original para poder comparar
        // después y construir el historial de cambios.
        auditoriaEnEdicion = data;

        asignarValor("editarAuditoriaId", data.id);
        asignarValor("editarTipo", data.tipo);
        asignarValor("editarNombre", data.nombre);
        asignarValor("editarResponsable", data.responsable);
        asignarValor("editarProceso", data.proceso);
        asignarValor("editarEstado", data.estado);
        asignarValor("editarFecha", data.fecha);
        asignarValor("editarObservaciones", data.observaciones || "");

        limpiarDocumentosEdicion();
        abrirModal("modalEditarAuditoria");
    } catch (error) {
        console.error(error);
    }
};

configurarCierreModal("modalEditarAuditoria", "cerrarEditarAuditoria");

const guardarEdicionAuditoria = obtenerElemento("guardarEdicionAuditoria");
if (guardarEdicionAuditoria) {
    guardarEdicionAuditoria.onclick = guardarCambiosAuditoria;
}

const editarDocumentoInput = obtenerElemento("editarDocumento");
const btnAgregarDocumentoEdicion = obtenerElemento("btnAgregarDocumentoEdicion");
const btnAgregarDriveEdicion = obtenerElemento("btnAgregarDriveEdicion");
const driveLinkEdicionAuditoria = obtenerElemento("driveLinkEdicionAuditoria");

if (btnAgregarDocumentoEdicion && editarDocumentoInput) {
    btnAgregarDocumentoEdicion.onclick = function () { editarDocumentoInput.click(); };
    editarDocumentoInput.onchange = function (evento) {
        agregarArchivosALista(evento.target.files, documentosEdicionSeleccionados, renderDocumentosEdicion);
        evento.target.value = "";
    };
}
if (btnAgregarDriveEdicion) {
    btnAgregarDriveEdicion.onclick = function () {
        agregarDriveALista(driveLinkEdicionAuditoria, documentosEdicionSeleccionados, renderDocumentosEdicion);
    };
}
if (driveLinkEdicionAuditoria) {
    driveLinkEdicionAuditoria.onkeydown = function (evento) {
        if (evento.key === "Enter") {
            evento.preventDefault();
            agregarDriveALista(driveLinkEdicionAuditoria, documentosEdicionSeleccionados, renderDocumentosEdicion);
        }
    };
}

async function guardarCambiosAuditoria() {
    if (!auditoriaEnEdicion) return;

    // Evita doble click mientras se procesa la edición
    if (guardarEdicionAuditoria) guardarEdicionAuditoria.disabled = true;

    try {
        const id = Number(obtenerValor("editarAuditoriaId"));

        const datosNuevos = {
            tipo: obtenerValor("editarTipo"),
            nombre: obtenerValor("editarNombre").trim(),
            responsable: obtenerValor("editarResponsable").trim(),
            proceso: obtenerValor("editarProceso").trim(),
            estado: obtenerValor("editarEstado"),
            fecha: obtenerValor("editarFecha"),
            observaciones: obtenerValor("editarObservaciones").trim()
        };

        if (!datosNuevos.tipo || !datosNuevos.nombre || !datosNuevos.proceso ||
            !datosNuevos.responsable || !datosNuevos.fecha) {
            window.mostrarNotificacion
                ? window.mostrarNotificacion("Datos incompletos", "Complete todos los campos obligatorios.", "warning")
                : notifAlert("Complete todos los campos obligatorios.");
            return;
        }

        const conteoActual = await contarDocumentosAuditoria(id);
        if (conteoActual.error) {
            manejarErrorSupabase(conteoActual.error, "No fue posible validar los soportes actuales.");
            return;
        }

        const totalFinal = conteoActual.count + documentosEdicionSeleccionados.length;
        if (totalFinal < ADJUNTOS_AUDITORIA.MIN_ADJUNTOS || totalFinal > ADJUNTOS_AUDITORIA.MAX_ADJUNTOS) {
            notificarAdjuntosAuditoria(`La auditoría debe conservar entre 1 y 10 soportes. Total previsto: ${totalFinal}.`);
            return;
        }

        // 1. Actualizar tabla `auditorias`
        const { error } = await window.supabaseClient
            .from(AUDITORIAS_TABLA)
            .update(datosNuevos)
            .eq("id", id);

        if (error) {
            manejarErrorSupabase(error, "Error actualizando la auditoría.");
            return;
        }

        // 2. Agregar soportes nuevos sin reemplazar los existentes
        if (documentosEdicionSeleccionados.length > 0) {
            const resultado = await agregarSoportesDirectos(id, documentosEdicionSeleccionados);
            if (resultado.error) {
                manejarErrorSupabase(resultado.error, "Error agregando soportes: " + resultado.error.message);
                return;
            }
        }

        // 3 y 4. Historial + notificaciones (granular por campo)
        const cambios = generarCambios(
            auditoriaEnEdicion,
            datosNuevos,
            documentosEdicionSeleccionados.length > 0
        );

        if (cambios.length === 0) {
            await registrarEvento(
                "EDITAR",
                `Se editó la auditoría "${datosNuevos.nombre}" sin cambios detectados.`,
                { popup: { titulo: "Auditoría actualizada", tipo: "info" } }
            );
        } else {
            for (const cambio of cambios) {
                await registrarEvento("EDITAR", `${cambio} (Auditoría: ${datosNuevos.nombre})`);
            }

            window.mostrarNotificacion
                ? window.mostrarNotificacion("Auditoría actualizada", "Los cambios se guardaron correctamente.", "success")
                : notifAlert("Información actualizada correctamente.");
        }

        // 5. Cerrar modal + recargar tabla
        cerrarModal("modalEditarAuditoria");
        limpiarDocumentosEdicion();
        auditoriaEnEdicion = null;

        await window.cargarAuditorias();
    } catch (error) {
        manejarErrorSupabase(error, "Ocurrió un error inesperado editando la auditoría.");
    } finally {
        if (guardarEdicionAuditoria) guardarEdicionAuditoria.disabled = false;
    }
}


// ==========================================================
// 10. MODAL "DETALLE DE AUDITORÍA"
// ==========================================================

window.verDetalleAuditoria = async function (id) {
    try {
        if (!obtenerElemento("modalDetalleAuditoria")) {
            console.error("No existe #modalDetalleAuditoria");
            return;
        }

        const { data, error } = await window.supabaseClient
            .from(AUDITORIAS_TABLA)
            .select("*")
            .eq("id", id)
            .single();

        if (error) {
            manejarErrorSupabase(error, "No fue posible cargar la auditoría.");
            return;
        }

        const setText = function (elId, valor) {
            const el = obtenerElemento(elId);
            if (el) el.textContent = valor;
        };

        setText("detalleTipo", data.tipo || "-");
        setText("detalleEstado", data.estado || "-");
        setText("detalleNombre", data.nombre || "-");
        setText("detalleResponsable", data.responsable || "-");
        setText("detalleProceso", data.proceso || "-");
        setText("detalleFecha", formatearFecha(data.fecha));

        const estadoEl = obtenerElemento("detalleEstado");
        if (estadoEl) {
            estadoEl.className = "";
            estadoEl.classList.add(claseEstado(data.estado));
        }

        const observacionesEl = obtenerElemento("detalleObservaciones");
        if (observacionesEl) {
            observacionesEl.textContent =
                data.observaciones && data.observaciones.trim() !== ""
                    ? data.observaciones
                    : "Sin observaciones registradas.";
        }

        const docsEl = obtenerElemento("detalleDocumentos");
        if (docsEl) {
            docsEl.innerHTML = `
                <div class="detalle-vacio">
                    Abra "Documentos" en la tabla para ver los archivos adjuntos.
                </div>
            `;
        }

        abrirModal("modalDetalleAuditoria");
    } catch (error) {
        manejarErrorSupabase(error, "Ocurrió un error.");
    }
};

configurarCierreModal("modalDetalleAuditoria", "cerrarDetalleAuditoria");


// ==========================================================
// 11. ELIMINAR AUDITORÍA / EDITAR ESTADO RÁPIDO
// ==========================================================

window.eliminarAuditoria = async function (id) {
    try {
        if (!window.tienePermiso("auditorias", "eliminar")) {
            window.mostrarNotificacion
                ? window.mostrarNotificacion("Sin permisos", "No tiene permisos para eliminar auditorías.", "warning")
                : notifAlert("No tiene permisos.");
            return;
        }

        const confirmar = await Notif.confirm("Esta acción también eliminará sus documentos adjuntos.\nEsta acción no se puede deshacer.", "¿Eliminar esta auditoría?");
        if (!confirmar) return;

        // Se eliminan primero los documentos (Storage + BD) para
        // no dejar archivos huérfanos en el bucket.
        const { data: documentos } = await obtenerDocumentosDeAuditoria(id);
        await eliminarDocumentos(documentos);

        const { error } = await window.supabaseClient
            .from(AUDITORIAS_TABLA)
            .delete()
            .eq("id", Number(id));

        if (error) {
            manejarErrorSupabase(error, "Error eliminando la auditoría.");
            return;
        }

        await registrarEvento(
            "ELIMINAR",
            "Se eliminó una auditoría.",
            { popup: { titulo: "Auditoría eliminada", tipo: "success" } }
        );

        await window.cargarAuditorias();
    } catch (error) {
        manejarErrorSupabase(error, "Ocurrió un error eliminando la auditoría.");
    }
};

// Atajo rápido para cambiar solo el estado desde la tabla,
// sin abrir el modal completo de edición.
window.editarEstado = async function (id) {
    try {
        if (!window.tienePermiso("auditorias", "editar")) {
            window.mostrarNotificacion
                ? window.mostrarNotificacion("Sin permisos", "No tiene permisos para editar auditorías.", "warning")
                : notifAlert("No tiene permisos.");
            return;
        }

        const nuevoEstado = await Notif.prompt("Seleccione el nuevo estado de la auditoría.", "Cambiar estado", null, ["Pendiente", "En proceso", "Finalizada"]);
        if (!nuevoEstado) return;

        const { error } = await window.supabaseClient
            .from(AUDITORIAS_TABLA)
            .update({ estado: nuevoEstado })
            .eq("id", Number(id));

        if (error) {
            manejarErrorSupabase(error, "Error actualizando el estado.");
            return;
        }

        await registrarEvento(
            "EDITAR",
            `Se cambió el estado de la auditoría a "${nuevoEstado}".`,
            { popup: { titulo: "Estado actualizado", tipo: "success" } }
        );

        await window.cargarAuditorias();
    } catch (error) {
        manejarErrorSupabase(error, "Ocurrió un error actualizando el estado.");
    }
};


// ==========================================================
// 12. PERMISOS
// ==========================================================

function aplicarPermisosAuditorias() {
    if (!window.tienePermiso("auditorias", "crear") && btnGuardarAuditoria) {
        btnGuardarAuditoria.style.display = "none";
    }
}


// ==========================================================
// 13. INICIALIZACIÓN DEL MÓDULO
// ==========================================================

renderDocumentos();
renderDocumentosEdicion();

function cargarFechaActual() {
    const fecha = obtenerElemento("fechaInput");
    if (fecha && fecha.value === "") {
        fecha.value = new Date().toISOString().split("T")[0];
    }
}

window.iniciarRefreshAuditorias = function () {
    if (window.refreshAuditoriasInterval) {
        clearInterval(window.refreshAuditoriasInterval);
    }

    window.refreshAuditoriasInterval = setInterval(function () {
        if (obtenerElemento("auditoriasBody")) {
            window.cargarAuditorias();
        }
    }, 5000);
};

(function inicializarModuloAuditorias() {
    aplicarPermisosAuditorias();
    cargarFechaActual();
    renderDocumentos();
    window.cargarAuditorias();
    window.iniciarRefreshAuditorias();

    const buscarAuditoria = obtenerElemento("buscarAuditoria");
    if (buscarAuditoria) {
        buscarAuditoria.addEventListener("input", window.filtrarAuditorias);
    }
})();
