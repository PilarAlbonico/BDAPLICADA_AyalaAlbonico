// Drill down · nivel 2: productos de una categoría en el mes
const idCategoria = parametro('id');
const mes = parametro('mes');

async function cargar() {
  const volverA = `/ventas?mes=${encodeURIComponent(mes || '')}`;
  document.getElementById('volver').href = volverA;
  document.getElementById('miga-categorias').href = volverA;

  try {
    const { categoria, productos } = await pedirDatos(
      `/api/ventas/categorias/${encodeURIComponent(idCategoria)}?mes=${encodeURIComponent(mes)}`
    );
    document.title = `Cipria · ${categoria.nombre}`;
    document.getElementById('miga-categoria').textContent = categoria.nombre;
    document.getElementById('titulo').textContent = `Productos de ${categoria.nombre}`;
    document.getElementById('bajada').textContent = nombreMes(mes);

    const filas = document.getElementById('filas');
    if (!productos.length) {
      filas.innerHTML = '<tr><td colspan="6" class="vacio">Esta categoría no tiene productos.</td></tr>';
      return;
    }
    filas.innerHTML = productos.map((p) => {
      const destino = `/ventas/producto?id=${p.id_producto}&mes=${mes}`;
      return `
        <tr class="clic" data-destino="${destino}">
          <td><a href="${destino}">${esc(p.nombre_producto)}</a></td>
          <td>${esc(p.talle)}</td>
          <td class="num">${p.unidades}</td>
          <td class="num">${dinero(p.monto)}</td>
          <td class="num">${porcentaje(p.margen)}</td>
          <td>${semaforo(p.estado, `${p.stock_actual} u.`)}</td>
        </tr>`;
    }).join('');

    // Toda la fila es clickeable (el enlace del nombre sirve para teclado)
    filas.querySelectorAll('tr.clic').forEach((fila) => {
      fila.addEventListener('click', (evento) => {
        if (evento.target.closest('a')) return;
        window.location.href = fila.dataset.destino;
      });
    });
  } catch (error) {
    mostrarErrorDatos(error);
    document.getElementById('filas').innerHTML = '';
  }
}

cargar();
