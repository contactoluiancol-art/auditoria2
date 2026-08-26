// ======================
// LIMPIAR VARIABLES
// ======================

delete window.renderUsuarios;
delete window.editarUsuario;
delete window.eliminarUsuario;
// ====================

// EVENTO
// ======================

var guardarUsuarioBtn =

document.getElementById(
  'guardarUsuario'
);





if(guardarUsuarioBtn){

  guardarUsuarioBtn.addEventListener(

    'click',

    guardarUsuario

  );

}





// ======================
// GUARDAR USUARIO
// ======================

async function guardarUsuario(){

  try{

    // ======================
    // VALIDAR PERMISO
    // ======================

    if(

      !window.tienePermiso(
        'usuarios',
        'crear'
      )

    ){

      notifAlert(
        'No tiene permisos'
      );

      return;

    }





    // ======================
    // INPUTS
    // ======================

    const usuario =

    document.getElementById(
      'usuarioInput'
    )
    .value
    .trim()
    .toLowerCase();





    const password =

    document.getElementById(
      'passwordInput'
    )
    .value
    .trim();





    const rol =

    document.getElementById(
      'rolUsuario'
    )
    .value;





    // ======================
    // VALIDAR
    // ======================

    if(

      !usuario ||

      !password ||

      !rol

    ){

      notifAlert(
        'Complete todos los campos'
      );

      return;

    }





    // ======================
    // VALIDAR EXISTENTE
    // ======================

    const existente =

    await window.supabaseClient

    .from('usuarios')

    .select('*')

    .eq(

      'usuario',

      usuario

    )

    .limit(1);





    if(

      existente.data &&

      existente.data.length > 0

    ){

      notifAlert(
        'El usuario ya existe'
      );

      return;

    }





    // ======================
    // INSERTAR
    // ======================

    const response =

    await window.supabaseClient

    .from('usuarios')

    .insert([

      {

        usuario:
        usuario,

        password:
        password,

        rol:
        rol,

        estado:
        'Activo'

      }

    ]);





    if(response.error){

      console.log(
        response.error
      );

      notifAlert(
        'Error guardando usuario'
      );

      return;

    }





    // ======================
    // PERMISOS
    // ======================

    const permisos = [

      {

        usuario: usuario,

        modulo:'inventario',

        ver:
        document.getElementById(
          'inventarioVer'
        ).checked,

        crear:
        document.getElementById(
          'inventarioCrear'
        ).checked,

        editar:
        document.getElementById(
          'inventarioEditar'
        ).checked,

        eliminar:
        document.getElementById(
          'inventarioEliminar'
        ).checked

      },





      {

        usuario: usuario,

        modulo:'recepcion',

        ver:
        document.getElementById(
          'recepcionVer'
        ).checked,

        crear:
        document.getElementById(
          'recepcionCrear'
        ).checked,

        editar:
        document.getElementById(
          'recepcionEditar'
        ).checked,

        eliminar:
        document.getElementById(
          'recepcionEliminar'
        ).checked

      },





      {

        usuario: usuario,

        modulo:'auditorias',

        ver:
        document.getElementById(
          'auditoriasVer'
        ).checked,

        crear:
        document.getElementById(
          'auditoriasCrear'
        ).checked,

        editar:
        document.getElementById(
          'auditoriasEditar'
        ).checked,

        eliminar:
        document.getElementById(
          'auditoriasEliminar'
        ).checked

      },





      {

        usuario: usuario,

        modulo:'usuarios',

        ver:
        document.getElementById(
          'usuariosVer'
        ).checked,

        crear:
        document.getElementById(
          'usuariosCrear'
        ).checked,

        editar:
        document.getElementById(
          'usuariosEditar'
        ).checked,

        eliminar:
        document.getElementById(
          'usuariosEliminar'
        ).checked

      },





     {

    usuario: usuario,

    modulo:'confiabilidad',

    ver:
    document.getElementById(
      'confiabilidadVer'
    ).checked,

    crear:
    document.getElementById(
      'confiabilidadCrear'
    ).checked,

    editar:
    document.getElementById(
      'confiabilidadEditar'
    ).checked,

    eliminar:
    document.getElementById(
      'confiabilidadEliminar'
    ).checked

}

    ];





    const permisosResponse =

    await window.supabaseClient

    .from('permisos')

    .insert(permisos);





    if(permisosResponse.error){

      console.log(
        permisosResponse.error
      );

      notifAlert(
        'Error guardando permisos'
      );

      return;

    }





    // ======================
    // HISTORIAL
    // ======================

    if(typeof guardarHistorial === 'function'){

      await guardarHistorial(

        'CREAR',

        'USUARIOS',

        'Se creó el usuario ' +
        usuario

      );

    }





    renderUsuarios();

    limpiarFormulario();





    notifAlert(
      'Usuario guardado correctamente'
    );

  }

  catch(error){

    console.log(error);

  }

}





// ======================
// RENDER
// ======================

window.renderUsuarios = async function(){

  try{

    const body =

    document.getElementById(
      'usuariosBody'
    );





    if(!body){

      return;

    }





    body.innerHTML = '';





    const response =

    await window.supabaseClient

    .from('usuarios')

    .select('*')

    .order(

      'id',

      {

        ascending:false

      }

    );





    const data =
    response.data;





    if(!data || data.length === 0){

      body.innerHTML =

      '<tr>' +

      '<td colspan="4">' +

      'No hay usuarios registrados' +

      '</td>' +

      '</tr>';



      return;

    }





    data.forEach(function(item){

      let estadoClase =

      item.estado === 'Activo'

      ?

      'estado-cerrado'

      :

      'estado-pendiente';





      body.innerHTML +=

      '<tr>' +





      '<td>' +

      (item.usuario || '-') +

      '</td>' +





      '<td>' +

      (item.rol || '-') +

      '</td>' +





      '<td>' +

      '<span class="' +

      estadoClase +

      '">' +

      (item.estado || 'Activo') +

      '</span>' +

      '</td>' +





      '<td>' +

      '<div class="acciones-tabla">' +





      (

        window.tienePermiso(
          'usuarios',
          'editar'
        )

        ?

        '<button ' +

        'class="btn-editar" ' +

        'onclick="editarUsuario(' +

        item.id +

        ')"' +

        '>' +

        'Editar' +

        '</button>'

        :

        ''

      )





      +





      (

        window.tienePermiso(
          'usuarios',
          'eliminar'
        )

        ?

        '<button ' +

        'class="btn-eliminar" ' +

        'onclick="eliminarUsuario(' +

        item.id +

        ')"' +

        '>' +

        'Eliminar' +

        '</button>'

        :

        ''

      )





      +





      '</div>' +

      '</td>' +





      '</tr>';

    });

  }

  catch(error){

    console.log(error);

  }

};





// ======================
// EDITAR
// ======================

window.editarUsuario = async function(id){

  try{

    if(

      !window.tienePermiso(
        'usuarios',
        'editar'
      )

    ){

      notifAlert(
        'No tiene permisos'
      );

      return;

    }





    const response =

    await window.supabaseClient

    .from('usuarios')

    .select('*')

    .eq(

      'id',

      id

    )

    .single();





    const usuario =
    response.data;





    if(!usuario){

      notifAlert(
        'Usuario no encontrado'
      );

      return;

    }





    const nuevaPassword = await Notif.prompt(

      'Escriba la nueva contraseña para este usuario.',
      'Cambiar contraseña',
      usuario.password || ''

    );





    if(nuevaPassword === null){

      return;

    }





    const nuevoRol = await Notif.prompt(

      'Seleccione el nuevo rol del usuario.',
      'Cambiar rol',
      usuario.rol,
      ['admin', 'lider', 'jefe', 'auditor', 'compras']

    );





    if(!nuevoRol){

      return;

    }





    const nuevoEstado = await Notif.prompt(

      'Seleccione el nuevo estado del usuario.',
      'Cambiar estado',
      usuario.estado || 'Activo',
      ['Activo', 'Inactivo']

    );





    const update =

    await window.supabaseClient

    .from('usuarios')

    .update({

      password:
      nuevaPassword,

      rol:
      nuevoRol,

      estado:
      nuevoEstado

    })

    .eq(

      'id',

      id

    );





    if(update.error){

      console.log(
        update.error
      );

      notifAlert(
        'Error actualizando usuario'
      );

      return;

    }





    renderUsuarios();





    notifAlert(
      'Usuario actualizado'
    );

  }

  catch(error){

    console.log(error);

  }

};





// ======================
// ELIMINAR
// ======================

window.eliminarUsuario = async function(id){

  try{

    if(

      !window.tienePermiso(
        'usuarios',
        'eliminar'
      )

    ){

      notifAlert(
        'No tiene permisos'
      );

      return;

    }





    const confirmar = await Notif.confirm(
      'Esta acción no se puede deshacer.',
      '¿Eliminar usuario?'
    );





    if(!confirmar){

      return;

    }





    const consulta =

    await window.supabaseClient

    .from('usuarios')

    .select('*')

    .eq(

      'id',

      id

    )

    .single();





    const usuario =
    consulta.data;





    const response =

    await window.supabaseClient

    .from('usuarios')

    .delete()

    .eq(

      'id',

      id

    );





    if(response.error){

      console.log(
        response.error
      );

      notifAlert(
        'Error eliminando usuario'
      );

      return;

    }





    await window.supabaseClient

    .from('permisos')

    .delete()

    .eq(

      'usuario',

      usuario.usuario

    );





    renderUsuarios();





    notifAlert(
      'Usuario eliminado'
    );

  }

  catch(error){

    console.log(error);

  }

};





// ======================
// BUSCADOR
// ======================

var buscarUsuario =

document.getElementById(
  'buscarUsuario'
);

if(buscarUsuario){

  buscarUsuario.onkeyup = null;

  buscarUsuario.onkeyup =
  function(){

    const filtro =
    this.value.toLowerCase();

    const filas =

    document.querySelectorAll(
      '#usuariosBody tr'
    );

    filas.forEach(fila => {

      fila.style.display =

      fila.innerText
      .toLowerCase()
      .includes(filtro)

      ? ''

      : 'none';

    });

  };

}



// ======================
// LIMPIAR
// ======================

function limpiarFormulario(){

  document.getElementById(
    'usuarioInput'
  ).value = '';





  document.getElementById(
    'passwordInput'
  ).value = '';





  document.getElementById(
    'rolUsuario'
  ).value = 'admin';





  document.querySelectorAll(

    '.permisos-container input[type="checkbox"]'

  )

  .forEach(check => {

    check.checked = false;

  });

}





// ======================
// INICIO
// ======================

renderUsuarios();
