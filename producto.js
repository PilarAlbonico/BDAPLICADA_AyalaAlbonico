// Drill down · nivel 3: detalle de las ventas de un producto en el mes
const idProducto = parametro('id');
const mes = parametro('mes');

async function cargar() {
  const mesUrl = encodeURIComponent(mes || '');
  document.getElementById('miga-categorias').href = `/ventas?mes=${mesUrl}`;

  try {
    const { producto, totales, ventas } = await pedirDatos(
      `/api/ventas/productos/${encodeURIComponent(idProducto)}?mes=${mesUrl}`
    );
    const volverA = `/ventas/categoria?id=${producto.id_categoria}&mes=${mesUrl}`;
    document.getElementById('volver').href = volverA;
    const migaCategoria = document.getElementById('miga-categoria');
    migaCategoria.href = volverA;
    migaCategoria.textContent = producto.categoria;
    document.getElementById('miga-producto').textContent = producto.nombre_producto;
    document.title = `Cipria · ${producto.nombre_producto}`;
    document.getElementById('bajada').textContent =
      `${producto.nombre_producto} (talle ${producto.talle}) · ${nombreMes(mes)}`;

    document.getElementById('ind-unidades').textContent = totales.unidades;
    document.getElementById('ind-monto').textContent = dinero(totales.monto);
    document.getElementById('ind-stock').innerHTML = semaforo(producto.estado, producto.stock_actual);
    document.getElementById('ind-stock-nota').textContent =
      `Mínimo ${producto.stock_minimo} u. · ${TEXTO_SEMAFORO[producto.estado]}`;

    const filas = document.getElementById('filas');
    filas.innerHTML = ventas.length
      ? ventas.map((v) => `
        <tr>
          <td>V${String(v.id_venta).padStart(4, '0')}</td>
          <td>${esc(v.fecha)}</td>
          <td>${esc(v.cliente)}</td>
          <td class="num">${v.cantidad}</td>
          <td>${esc(v.medios_pago || '—')}</td>
          <td class="num">${dinero(v.subtotal)}</td>
        </tr>`).join('')
      : '<tr><td colspan="6" class="vacio">Este producto no tuvo ventas en el mes.</td></tr>';
  } catch (error) {
    mostrarErrorDatos(error);
    document.getElementById('filas').innerHTML = '';
  }
}

cargar();
