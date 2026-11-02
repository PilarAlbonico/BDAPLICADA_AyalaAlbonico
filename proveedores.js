// Proveedores: órdenes de compra y productos a reponer
function textoPendiente(p) {
  const partes = [];
  if (p.pendientes) partes.push(`${p.pendientes} ${p.pendientes === 1 ? 'orden' : 'órdenes'}`);
  if (p.parciales) partes.push(`${p.parciales} parcial${p.parciales === 1 ? '' : 'es'}`);
  return partes.length ? partes.join(' · ') : '—';
}

async function cargar() {
  try {
    const { proveedores, reponer } = await pedirDatos('/api/proveedores');

    document.getElementById('filas').innerHTML = proveedores.length
      ? proveedores.map((p) => `
        <tr>
          <td>${esc(p.nombre)}</td>
          <td class="num">${p.ordenes}</td>
          <td class="num">${dinero(p.comprado)}</td>
          <td>${esc(textoPendiente(p))}</td>
        </tr>`).join('')
      : '<tr><td colspan="4" class="vacio">No hay proveedores cargados.</td></tr>';

    document.getElementById('lista-reponer').innerHTML = reponer.length
      ? reponer.map((r) => `
        <li>
          <span>${semaforo('critico', r.nombre_producto)}</span>
          <span class="detalle">${r.stock_actual} / mín. ${r.stock_minimo}${r.en_camino ? ` · ${r.en_camino} en camino` : ''}</span>
        </li>`).join('')
      : '<li>No hay productos para reponer.</li>';
  } catch (error) {
    mostrarErrorDatos(error);
  }
}

cargar();
