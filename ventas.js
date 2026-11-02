// Drill down · nivel 1: ventas por categoría en el mes elegido
const selectorMes = document.getElementById('mes');

async function cargarCategorias() {
  const mes = selectorMes.value;
  // Deja el mes en la URL para poder volver a este mismo nivel (drill up)
  history.replaceState(null, '', `/ventas?mes=${mes}`);

  const grafico = document.getElementById('grafico-categorias');
  try {
    const categorias = await pedirDatos(`/api/ventas/categorias?mes=${mes}`);
    grafico.classList.remove('estado-carga');
    if (!categorias.length) {
      grafico.innerHTML = '<p class="estado-carga">No hay ventas registradas en este mes.</p>';
      return;
    }
    const maximo = Math.max(...categorias.map((c) => c.monto));
    grafico.innerHTML = `<div class="barras-h">${categorias.map((c) => `
      <a href="/ventas/categoria?id=${c.id_categoria}&mes=${mes}"
         title="${esc(`${c.nombre}: ${c.unidades} unidades`)}">
        <span>${esc(c.nombre)}</span>
        <span class="pista"><span class="relleno" style="width:${(c.monto / maximo) * 100}%"></span></span>
        <span class="monto">${dinero(c.monto)}</span>
      </a>`).join('')}</div>`;
  } catch (error) {
    mostrarErrorDatos(error);
  }
}

async function iniciar() {
  try {
    const meses = await pedirDatos('/api/ventas/meses');
    if (!meses.length) {
      document.getElementById('grafico-categorias').textContent = 'Todavía no hay ventas cargadas.';
      return;
    }
    // Si llega un mes sin ventas desde el resumen, igual se agrega al combo
    const pedido = parametro('mes');
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(pedido || '') && !meses.includes(pedido)) {
      meses.push(pedido);
      meses.sort().reverse();
    }
    selectorMes.innerHTML = meses.map((m) => `<option value="${m}">${nombreMes(m)}</option>`).join('');
    selectorMes.value = pedido && meses.includes(pedido) ? pedido : meses[0];
    selectorMes.addEventListener('change', cargarCategorias);
    cargarCategorias();
  } catch (error) {
    mostrarErrorDatos(error);
  }
}

iniciar();
