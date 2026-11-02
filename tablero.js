// =====================================================================
//  Funciones comunes a todas las pantallas del tablero
// =====================================================================

const SECCIONES = [
  { id: 'resumen', texto: 'Resumen', ruta: '/resumen' },
  { id: 'ventas', texto: 'Ventas', ruta: '/ventas' },
  { id: 'clientes', texto: 'Clientes', ruta: '/clientes' },
  { id: 'proveedores', texto: 'Proveedores', ruta: '/proveedores' },
];

const NOMBRES_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
  'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const TEXTO_SEMAFORO = {
  normal: 'Normal', atencion: 'Atención', critico: 'Crítico',
  activa: 'Activa', riesgo: 'En riesgo', inactiva: 'Inactiva', sin_compras: 'Sin compras',
};

// Escapa texto antes de insertarlo como HTML (los datos vienen de la base)
function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

const formatoPesos = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const dinero = (n) => '$' + formatoPesos.format(Math.round(Number(n) || 0));
const porcentaje = (n) => Math.round(Number(n) || 0) + '%';

// '2026-10' -> 'Octubre 2026'  /  'Oct'
function nombreMes(clave) {
  const [anio, mes] = clave.split('-').map(Number);
  return `${NOMBRES_MES[mes - 1]} ${anio}`;
}
const mesCorto = (clave) => NOMBRES_MES[Number(clave.split('-')[1]) - 1].slice(0, 3);

// Punto de color + texto del semáforo
const semaforo = (estado, texto = TEXTO_SEMAFORO[estado]) =>
  `<span class="punto ${esc(estado)}" aria-hidden="true"></span>${esc(texto)}`;

// Lee un parámetro de la URL (?mes=2026-10&id=3)
const parametro = (nombre) => new URLSearchParams(window.location.search).get(nombre);

// Pide datos al servidor. Si la sesión venció, vuelve al ingreso.
async function pedirDatos(url) {
  const respuesta = await fetch(url);
  if (respuesta.status === 401) {
    window.location.href = '/';
    throw new Error('Sesión vencida');
  }
  const datos = await respuesta.json();
  if (!respuesta.ok) throw new Error(datos.mensaje || 'Error al obtener los datos.');
  return datos;
}

// Muestra un error arriba del contenido
function mostrarErrorDatos(error) {
  const principal = document.querySelector('.contenido');
  let caja = document.getElementById('error-datos');
  if (!caja) {
    caja = document.createElement('p');
    caja.id = 'error-datos';
    caja.className = 'error-datos';
    caja.setAttribute('role', 'alert');
    principal.prepend(caja);
  }
  caja.textContent = error.message;
}

// Arma el menú lateral, marca la sección actual y muestra el usuario
function armarLateral() {
  const lateral = document.getElementById('lateral');
  const actual = lateral.dataset.seccion;
  lateral.innerHTML = `
    <p class="marca">Cipria</p>
    <p class="saludo">Hola, <span id="nombre-usuario">…</span></p>
    <nav aria-label="Secciones del tablero">
      ${SECCIONES.map((s) => `<a href="${s.ruta}"${s.id === actual ? ' aria-current="page"' : ''}>${s.texto}</a>`).join('')}
      <button id="boton-salir" type="button">Cerrar sesión</button>
    </nav>`;

  pedirDatos('/usuario-actual')
    .then((datos) => { document.getElementById('nombre-usuario').textContent = datos.usuario; })
    .catch(() => {});

  document.getElementById('boton-salir').addEventListener('click', async () => {
    await fetch('/salir', { method: 'POST' });
    window.location.href = '/';
  });
}

armarLateral();
