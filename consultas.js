// =====================================================================
//  Consultas SQL del tablero de control
//  Todo lo que se muestra en pantalla sale de estas consultas.
//  Los "?" son parámetros: mysql2 los reemplaza escapando los valores,
//  así se evita la inyección SQL.
// =====================================================================
const { bd } = require('./bd.js');

// Semáforo de stock, calculado en SQL:
//   crítico  -> stock igual o menor al mínimo
//   atención -> entre el mínimo y el doble del mínimo
//   normal   -> más del doble del mínimo
const SEMAFORO_STOCK = `
  CASE
    WHEN p.stock_actual <= p.stock_minimo     THEN 'critico'
    WHEN p.stock_actual <= p.stock_minimo * 2 THEN 'atencion'
    ELSE 'normal'
  END`;

// Semáforo de clientes según los días desde su última compra
const SEMAFORO_CLIENTE = `
  CASE
    WHEN MAX(v.fecha_venta) IS NULL                       THEN 'sin_compras'
    WHEN DATEDIFF(CURDATE(), MAX(v.fecha_venta)) <= 30    THEN 'activa'
    WHEN DATEDIFF(CURDATE(), MAX(v.fecha_venta)) <= 90    THEN 'riesgo'
    ELSE 'inactiva'
  END`;

// Filtro de un mes completo: desde el día 1 hasta el día 1 del mes siguiente
const FILTRO_MES = `
  v.fecha_venta >= CAST(? AS DATE)
  AND v.fecha_venta < CAST(? AS DATE) + INTERVAL 1 MONTH`;

const primerDia = (mes) => `${mes}-01`;

// ---------------------------------------------------------------------
//  RESUMEN
// ---------------------------------------------------------------------

// Indicadores del mes actual: ventas, ticket promedio, margen y stock crítico
async function indicadores() {
  const [[mes]] = await bd.query(`
    SELECT COALESCE(SUM(dv.subtotal), 0)                AS ventas_mes,
           COUNT(DISTINCT v.id_venta)                   AS cantidad_ventas,
           COALESCE(SUM(dv.cantidad * p.precio_costo), 0) AS costo_mes
    FROM venta v
    JOIN detalle_venta dv ON dv.id_venta = v.id_venta
    JOIN producto p       ON p.id_producto = dv.id_producto
    WHERE v.fecha_venta >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
  `);

  const [[{ actual }]] = await bd.query(`SELECT DATE_FORMAT(CURDATE(), '%Y-%m') AS actual`);

  const [[stock]] = await bd.query(`
    SELECT COUNT(*) AS criticos
    FROM producto
    WHERE stock_actual <= stock_minimo
  `);

  return {
    mes: actual,
    ventasMes: mes.ventas_mes,
    cantidadVentas: mes.cantidad_ventas,
    ticketPromedio: mes.cantidad_ventas ? mes.ventas_mes / mes.cantidad_ventas : 0,
    margen: mes.ventas_mes ? ((mes.ventas_mes - mes.costo_mes) / mes.ventas_mes) * 100 : 0,
    stockCritico: stock.criticos,
  };
}

// Ventas agrupadas por mes (últimos N meses, incluido el actual)
async function ventasPorMes(meses) {
  const [[{ actual }]] = await bd.query(`SELECT DATE_FORMAT(CURDATE(), '%Y-%m') AS actual`);
  const [filas] = await bd.query(
    `
    SELECT DATE_FORMAT(v.fecha_venta, '%Y-%m') AS mes,
           SUM(dv.subtotal)                    AS total,
           COUNT(DISTINCT v.id_venta)          AS cantidad
    FROM venta v
    JOIN detalle_venta dv ON dv.id_venta = v.id_venta
    WHERE v.fecha_venta >= DATE_FORMAT(CURDATE() - INTERVAL ? MONTH, '%Y-%m-01')
    GROUP BY DATE_FORMAT(v.fecha_venta, '%Y-%m')
    ORDER BY mes
  `,
    [meses - 1]
  );

  // Completa con 0 los meses sin ventas para que el gráfico no tenga huecos
  const porMes = new Map(filas.map((f) => [f.mes, f]));
  let [anio, numMes] = actual.split('-').map(Number);
  const resultado = [];
  for (let i = 0; i < meses; i++) {
    const clave = `${anio}-${String(numMes).padStart(2, '0')}`;
    const fila = porMes.get(clave);
    resultado.unshift({ mes: clave, total: fila ? fila.total : 0, cantidad: fila ? fila.cantidad : 0 });
    numMes -= 1;
    if (numMes === 0) { numMes = 12; anio -= 1; }
  }
  return { actual, meses: resultado };
}

// Productos con menos stock en relación a su mínimo (para el panel "Estado del stock")
async function estadoStock() {
  const [filas] = await bd.query(`
    SELECT p.id_producto, p.nombre_producto, p.stock_actual, p.stock_minimo,
           ${SEMAFORO_STOCK} AS estado
    FROM producto p
    ORDER BY p.stock_actual / NULLIF(p.stock_minimo, 0), p.nombre_producto
    LIMIT 7
  `);
  return filas;
}

// ---------------------------------------------------------------------
//  VENTAS · DRILL DOWN
// ---------------------------------------------------------------------

// Meses en los que hubo ventas (para el combobox)
async function mesesConVentas() {
  const [filas] = await bd.query(`
    SELECT DISTINCT DATE_FORMAT(fecha_venta, '%Y-%m') AS mes
    FROM venta
    ORDER BY mes DESC
  `);
  return filas.map((f) => f.mes);
}

// Nivel 1: ventas por categoría en un mes
async function ventasPorCategoria(mes) {
  const [filas] = await bd.query(
    `
    SELECT c.id_categoria, c.nombre,
           SUM(dv.subtotal) AS monto,
           SUM(dv.cantidad) AS unidades
    FROM categoria c
    JOIN producto p       ON p.id_categoria = c.id_categoria
    JOIN detalle_venta dv ON dv.id_producto = p.id_producto
    JOIN venta v          ON v.id_venta     = dv.id_venta
    WHERE ${FILTRO_MES}
    GROUP BY c.id_categoria, c.nombre
    ORDER BY monto DESC
  `,
    [primerDia(mes), primerDia(mes)]
  );
  return filas;
}

// Nivel 2: productos de una categoría con lo vendido en el mes
async function productosDeCategoria(idCategoria, mes) {
  const [[categoria]] = await bd.query(
    'SELECT id_categoria, nombre FROM categoria WHERE id_categoria = ?',
    [idCategoria]
  );
  if (!categoria) return null;

  const [productos] = await bd.query(
    `
    SELECT p.id_producto, p.nombre_producto, p.talle,
           p.stock_actual, p.stock_minimo,
           ${SEMAFORO_STOCK} AS estado,
           ROUND((p.precio_venta - p.precio_costo) / p.precio_venta * 100) AS margen,
           COALESCE(SUM(vm.cantidad), 0) AS unidades,
           COALESCE(SUM(vm.subtotal), 0) AS monto
    FROM producto p
    LEFT JOIN (
      SELECT dv.id_producto, dv.cantidad, dv.subtotal
      FROM detalle_venta dv
      JOIN venta v ON v.id_venta = dv.id_venta
      WHERE ${FILTRO_MES}
    ) vm ON vm.id_producto = p.id_producto
    WHERE p.id_categoria = ?
    GROUP BY p.id_producto, p.nombre_producto, p.talle, p.stock_actual,
             p.stock_minimo, p.precio_venta, p.precio_costo
    ORDER BY monto DESC, p.nombre_producto
  `,
    [primerDia(mes), primerDia(mes), idCategoria]
  );
  return { categoria, productos };
}

// Nivel 3: detalle de las ventas de un producto en el mes
async function detalleProducto(idProducto, mes) {
  const [[producto]] = await bd.query(
    `
    SELECT p.id_producto, p.nombre_producto, p.talle, p.precio_venta,
           p.stock_actual, p.stock_minimo,
           ${SEMAFORO_STOCK} AS estado,
           c.id_categoria, c.nombre AS categoria
    FROM producto p
    JOIN categoria c ON c.id_categoria = p.id_categoria
    WHERE p.id_producto = ?
  `,
    [idProducto]
  );
  if (!producto) return null;

  const [[totales]] = await bd.query(
    `
    SELECT COALESCE(SUM(dv.cantidad), 0) AS unidades,
           COALESCE(SUM(dv.subtotal), 0) AS monto
    FROM detalle_venta dv
    JOIN venta v ON v.id_venta = dv.id_venta
    WHERE dv.id_producto = ? AND ${FILTRO_MES}
  `,
    [idProducto, primerDia(mes), primerDia(mes)]
  );

  const [ventas] = await bd.query(
    `
    SELECT v.id_venta,
           DATE_FORMAT(v.fecha_venta, '%d/%m/%Y') AS fecha,
           CONCAT(cl.nombre_cliente, ' ', cl.apellido_cliente) AS cliente,
           dv.cantidad,
           dv.subtotal,
           (SELECT GROUP_CONCAT(DISTINCT mp.tipo ORDER BY mp.tipo SEPARATOR ' / ')
              FROM detalle_pago dp
              JOIN medio_de_pago mp ON mp.id_medio_pago = dp.id_medio_pago
             WHERE dp.id_venta = v.id_venta) AS medios_pago
    FROM detalle_venta dv
    JOIN venta v    ON v.id_venta    = dv.id_venta
    JOIN cliente cl ON cl.id_cliente = v.id_cliente
    WHERE dv.id_producto = ? AND ${FILTRO_MES}
    ORDER BY v.fecha_venta DESC
  `,
    [idProducto, primerDia(mes), primerDia(mes)]
  );

  return { producto, totales, ventas };
}

// ---------------------------------------------------------------------
//  CLIENTES
// ---------------------------------------------------------------------
async function clientes(busqueda) {
  const texto = `%${busqueda}%`;
  const [lista] = await bd.query(
    `
    SELECT c.id_cliente, c.nombre_cliente, c.apellido_cliente, c.user_ig,
           COUNT(DISTINCT v.id_venta)                 AS compras,
           COALESCE(SUM(dv.subtotal), 0)              AS total_gastado,
           DATE_FORMAT(MAX(v.fecha_venta), '%d/%m/%Y') AS ultima_compra,
           ${SEMAFORO_CLIENTE} AS actividad
    FROM cliente c
    LEFT JOIN venta v          ON v.id_cliente = c.id_cliente
    LEFT JOIN detalle_venta dv ON dv.id_venta  = v.id_venta
    WHERE CONCAT(c.nombre_cliente, ' ', c.apellido_cliente, ' ', COALESCE(c.user_ig, '')) LIKE ?
    GROUP BY c.id_cliente, c.nombre_cliente, c.apellido_cliente, c.user_ig
    ORDER BY total_gastado DESC
  `,
    [texto]
  );

  // Cantidad de clientes en cada estado (sobre todos, sin filtrar por búsqueda)
  const [conteo] = await bd.query(`
    SELECT actividad, COUNT(*) AS cantidad
    FROM (
      SELECT c.id_cliente, ${SEMAFORO_CLIENTE} AS actividad
      FROM cliente c
      LEFT JOIN venta v ON v.id_cliente = c.id_cliente
      GROUP BY c.id_cliente
    ) AS t
    GROUP BY actividad
  `);
  const resumen = { activa: 0, riesgo: 0, inactiva: 0, sin_compras: 0 };
  conteo.forEach((f) => { resumen[f.actividad] = f.cantidad; });

  return { resumen, clientes: lista };
}

// ---------------------------------------------------------------------
//  PROVEEDORES Y REPOSICIÓN
// ---------------------------------------------------------------------
async function proveedores() {
  const [lista] = await bd.query(`
    SELECT pr.id_proveedor, pr.nombre, pr.numero_telefono,
           COUNT(DISTINCT oc.id_orden_compra) AS ordenes,
           COALESCE(SUM(CASE WHEN e.nombre_estado <> 'Cancelada' THEN dor.subtotal END), 0) AS comprado,
           COUNT(DISTINCT CASE WHEN e.nombre_estado = 'Pendiente'
                               THEN oc.id_orden_compra END) AS pendientes,
           COUNT(DISTINCT CASE WHEN e.nombre_estado = 'Recibida parcialmente'
                               THEN oc.id_orden_compra END) AS parciales
    FROM proveedor pr
    LEFT JOIN orden_compra oc  ON oc.id_proveedor    = pr.id_proveedor
    LEFT JOIN estado e         ON e.id_estado_orden  = oc.id_estado_orden
    LEFT JOIN detalle_orden dor ON dor.id_orden_compra = oc.id_orden_compra
    GROUP BY pr.id_proveedor, pr.nombre, pr.numero_telefono
    ORDER BY comprado DESC
  `);

  // Productos a reponer: stock igual o menor al mínimo.
  // "en_camino" = unidades pedidas en órdenes pendientes o parciales que todavía no llegaron.
  const [reponer] = await bd.query(`
    SELECT p.id_producto, p.nombre_producto, p.stock_actual, p.stock_minimo,
           c.nombre AS categoria,
           (SELECT COALESCE(SUM(dor.cantidad_ordenada - dor.cantidad_recibida), 0)
              FROM detalle_orden dor
              JOIN orden_compra oc ON oc.id_orden_compra = dor.id_orden_compra
              JOIN estado e        ON e.id_estado_orden  = oc.id_estado_orden
             WHERE dor.id_producto = p.id_producto
               AND e.nombre_estado IN ('Pendiente', 'Recibida parcialmente')) AS en_camino
    FROM producto p
    JOIN categoria c ON c.id_categoria = p.id_categoria
    WHERE p.stock_actual <= p.stock_minimo
    ORDER BY p.stock_actual - p.stock_minimo, p.nombre_producto
  `);

  return { proveedores: lista, reponer };
}

module.exports = {
  indicadores,
  ventasPorMes,
  estadoStock,
  mesesConVentas,
  ventasPorCategoria,
  productosDeCategoria,
  detalleProducto,
  clientes,
  proveedores,
};
