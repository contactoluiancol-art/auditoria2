// =====================================
// LOGIN JS
// =====================================

const form = document.getElementById('loginForm');

if (form) {
  form.addEventListener('submit', login);
}

async function login(e) {
  try {
    e.preventDefault();

    const usuarioInput = document.getElementById('usuario');
    const passwordInput = document.getElementById('password');

    if (!usuarioInput || !passwordInput) {
      notifAlert('Inputs no encontrados');
      return;
    }

    const usuario = usuarioInput.value.trim().toLowerCase();
    const password = passwordInput.value.trim();

    if (!usuario || !password) {
      notifAlert('Complete todos los campos');
      return;
    }

    if (!window.supabaseClient) {
      notifAlert('Error de conexión con la base de datos');
      return;
    }

    const { data, error } = await window.supabaseClient
      .from('usuarios')
      .select('*')
      .eq('usuario', usuario)
      .eq('password', password)
      .limit(1);

    if (error) {
      console.error(error);
      notifAlert('Error conectando con Supabase');
      return;
    }

    if (!data || data.length === 0) {
      notifAlert('Usuario o contraseña incorrectos');
      return;
    }

    const usuarioData = data[0];

    if (usuarioData.estado === 'Inactivo') {
      notifAlert('Usuario inactivo');
      return;
    }

    localStorage.setItem(
      'usuarioLogueado',
      JSON.stringify(usuarioData)
    );

    window.mostrarBienvenida(
      usuarioData.usuario,
      usuarioData.rol
    );

  } catch (error) {
    console.error(error);
    notifAlert('Error general en login');
  }
}

window.mostrarBienvenida = function (usuario, rol) {
  const userEl = document.getElementById('bienvenidaUsuario');
  const rolEl = document.getElementById('bienvenidaRol');
  const modal = document.getElementById('modalBienvenida');

  if (userEl) userEl.innerText = usuario;
  if (rolEl) rolEl.innerText = rol;
  if (modal) modal.style.display = 'flex';
};

window.cerrarModalBienvenida = function () {
  const modal = document.getElementById('modalBienvenida');
  if (modal) modal.style.display = 'none';
  window.location.href = 'dashboard.html';
};

document.addEventListener('DOMContentLoaded', function () {
  const modal = document.getElementById('modalBienvenida');
  if (modal) {
    modal.style.display = 'none';
  }
});