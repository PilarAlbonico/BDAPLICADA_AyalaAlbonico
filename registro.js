const formulario = document.getElementById('formulario-registro');
const mensajeError = document.getElementById('mensaje-error');
const botonEnviar = document.getElementById('boton-enviar');

function mostrarError(texto) {
  mensajeError.textContent = texto;
  mensajeError.classList.add('visible');
}

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  mensajeError.classList.remove('visible');

  if (formulario.clave.value !== formulario.repetir.value) {
    mostrarError('Las contraseñas no coinciden.');
    return;
  }

  botonEnviar.disabled = true;

  try {
    const respuesta = await fetch('/registrar', {
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