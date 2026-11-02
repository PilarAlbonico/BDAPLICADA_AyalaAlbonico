const formulario = document.getElementById('formulario-ingreso');
const mensajeError = document.getElementById('mensaje-error');
const botonEnviar = document.getElementById('boton-enviar');
const botonAlternar = document.getElementById('boton-alternar');
const textoAlternar = document.getElementById('texto-alternar');
const subtitulo = document.getElementById('subtitulo');
const campoRepetir = document.getElementById('campo-repetir');

let modo = 'ingreso'; // 'ingreso' o 'registro'

function mostrarError(texto) {
  mensajeError.textContent = texto;
  mensajeError.classList.add('visible');
}

// Cambia el formulario entre "Ingresar" y "Crear cuenta"
function cambiarModo() {
  modo = modo === 'ingreso' ? 'registro' : 'ingreso';
  const esRegistro = modo === 'registro';

  mensajeError.classList.remove('visible');
  campoRepetir.classList.toggle('oculto', !esRegistro);
  formulario.repetir.required = esRegistro;
  formulario.repetir.value = '';
  formulario.clave.autocomplete = esRegistro ? 'new-password' : 'current-password';

  subtitulo.textContent = esRegistro
    ? 'Creá tu cuenta para entrar al tablero de ventas.'
    : 'Ingresá para ver el tablero de ventas.';
  botonEnviar.textContent = esRegistro ? 'Crear cuenta' : 'Ingresar';
  textoAlternar.textContent = esRegistro ? '¿Ya tenés cuenta?' : '¿No tenés cuenta?';
  botonAlternar.textContent = esRegistro ? 'Ingresar' : 'Crear cuenta';
}

botonAlternar.addEventListener('click', cambiarModo);

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  mensajeError.classList.remove('visible');

  if (modo === 'registro' && formulario.clave.value !== formulario.repetir.value) {
    mostrarError('Las contraseñas no coinciden.');
    return;
  }

  botonEnviar.disabled = true;

  try {
    const ruta = modo === 'registro' ? '/registrar' : '/ingresar';
    const respuesta = await fetch(ruta, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usuario: formulario.usuario.value,
        clave: formulario.clave.value,
      }),
    });
    const datos = await respuesta.json();

    if (respuesta.ok) {
      window.location.href = datos.redirigirA; // al tablero principal
    } else {
      mostrarError(datos.mensaje);
      formulario.clave.value = '';
      formulario.repetir.value = '';
      formulario.clave.focus();
    }
  } catch {
    mostrarError('No se pudo conectar con el servidor. Intentá de nuevo.');
  } finally {
    botonEnviar.disabled = false;
  }
});