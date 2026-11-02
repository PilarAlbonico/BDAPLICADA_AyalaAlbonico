// Pantalla principal: indicadores del mes, ventas por mes y estado del stock
const selectorPeriodo = document.getElementById('periodo');

function dibujarGrafico({ actual, meses }) {
  const maximo = Math.max(...meses.map((m) => m.total), 1);
  const barras = meses.map((m) => {
    const alto = (m.total / maximo) * 100;
    const titulo = `${nombreMes(m.mes)}: ${dinero(m.total)} en ${m.cantidad} ventas`;
    return `
      <a href="/ventas?mes=${m.mes}" class="${m.mes === actual ? 'actual' : ''}" title="${esc(titulo)}" aria-label="${esc(titulo)}">
        <span class="monto">${m.total ? dinero(m.total) : ''}</span>
        <span class="barra" style="height:${alto}%"></span>
      </a>`;
  }).join('');
  const eje = meses.map((m) => `<span>${mesCorto(m.mes)}</span>`).join('');

  const grafico = document.getElementById('grafico-meses');
  grafico.classList.remove('estado-carga');
  grafico.innerHTML = `<div class="barras-v">${barras}</div><div class="meses-eje">${eje}</div>`;
}

function dibujarStock(productos) {
  document.getElementById('lista-stock').innerHTML = productos.map((p) => `
    <li>
      <span>${semaforo(p.estado, p.nombre_producto)}</span>
      <span class="detalle">${p.stock_actual} u. / mín. ${p.stock_minimo}</span>
    </li>`).join('');
}

async function cargar() {
  try {
    const datos = await pedirDatos(`/api/resumen?meses=${selectorPeriodo.value}`);
    const ind = datos.indicadores;
    document.getElementById('ind-ventas').textContent = dinero(ind.ventasMes);
    document.getElementById('ind-ventas-nota').textContent =
      `${nombreMes(ind.mes)} · ${ind.cantidadVentas} ${ind.cantidadVentas === 1 ? 'venta' : 'ventas'}`;
    document.getElementById('ind-ticket').textContent = dinero(ind.ticketPromedio);
    document.getElementById('ind-margen').textContent = porcentaje(ind.margen);
    document.getElementById('ind-critico').textContent = ind.stockCritico;

    dibujarGrafico(datos.ventasPorMes);
    dibujarStock(datos.stock);
  } catch (error) {
    mostrarErrorDatos(error);
  }
}

selectorPeriodo.addEventListener('change', cargar);
cargar();
