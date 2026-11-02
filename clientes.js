// Clientes: ranking por total gastado y semáforo de actividad
const buscador = document.getElementById('buscar');
let ultimoPedido = 0;

async function cargar() {
  const numero = ++ultimoPedido;
  try {
    const datos = await pedirDatos(`/api/clientes?buscar=${encodeURIComponent(buscador.value.trim())}`);
    if (numero !== ultimoPedido) return; // llegó una respuesta vieja: se descarta

    document.getElementById('ind-activas').textContent = datos.resumen.activa;
    document.getElementById('ind-riesgo').textContent = datos.resumen.riesgo;
    document.getElementById('ind-inactivas').textContent = datos.resumen.inactiva;

    document.getElementById('filas').innerHTML = datos.clientes.length
      ? datos.clientes.map((c) => `
        <tr>
          <td>${esc(c.nombre_cliente)} ${esc(c.apellido_cliente)}</td>
          <td>${esc(c.user_ig || '—')}</td>
          <td class="num">${c.compras}</td>
          <td class="num">${dinero(c.total_gastado)}</td>
          <td class="num">${esc(c.ultima_compra || '—')}</td>
          <td>${semaforo(c.actividad)}</td>
        </tr>`).join('')
      : '<tr><td colspan="6" class="vacio">No se encontraron clientes con esa búsqueda.</td></tr>';
  } catch (error) {
    mostrarErrorDatos(error);
  }
}

// Busca mientras se escribe, esperando a que se deje de tipear
let espera;
buscador.addEventListener('input', () => {
  clearTimeout(espera);
  espera = setTimeout(cargar, 250);
});

cargar();
