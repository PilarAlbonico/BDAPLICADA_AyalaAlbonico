const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const { bd, prepararTabla } = require('./bd.js');
const consultas = require('./consultas.js');

const aplicacion = express();
const PUERTO = process.env.PORT || 3000;

// Carpeta raíz del proyecto (BD APLICADA), un nivel arriba de NODE JS
const RAIZ = path.join(__dirname, '..');

aplicacion.use(express.json());
aplicacion.use(
  session({
    secret: process.env.SESSION_SECRET || 'cambiar-este-secreto-en-produccion',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax' },
  })
);

// Para páginas: si no hay sesión iniciada, vuelve al ingreso.
function requiereSesionPagina(pedido, respuesta, siguiente) {
  if (pedido.session.usuarioId) return siguiente();
  respuesta.redirect('/');
}

// Para datos: si no hay sesión iniciada, responde 401 (no autorizado).
function requiereSesionDatos(pedido, respuesta, siguiente) {
  if (pedido.session.usuarioId) return siguiente();
  respuesta.status(401).json({ mensaje: 'No autenticado.' });
}

// Guarda al usuario en la sesión y avisa al navegador que vaya al resumen (pantalla principal).
function iniciarSesion(pedido, respuesta, usuario) {
  // Regenera la sesión al autenticar (previene la fijación de sesión)
  pedido.session.regenerate((error) => {
    if (error) return respuesta.status(500).json({ mensaje: 'Error del servidor.' });
    pedido.session.usuarioId = usuario.id;
    pedido.session.usuario = usuario.usuario;
    respuesta.json({ ok: true, redirigirA: '/resumen' });
  });
}

// Hash falso para comparar cuando el usuario no existe
// (evita revelar por el tiempo de respuesta si un usuario está registrado).
const HASH_FALSO = bcrypt.hashSync('no-existe', 10);

// Nombre de usuario: 3 a 30 caracteres entre letras, números, punto, guion y guion bajo
const FORMATO_USUARIO = /^[A-Za-z0-9._-]{3,30}$/;

// Archivos públicos: solo CSS y JS del navegador.
// La carpeta HTML NO se expone, así las páginas quedan protegidas.
aplicacion.use('/css', express.static(path.join(RAIZ, 'CSS')));
aplicacion.use('/js', express.static(path.join(RAIZ, 'JS')));

// Pantalla de ingreso (si ya hay sesión, va directo al resumen)
aplicacion.get('/', (pedido, respuesta) => {
  if (pedido.session.usuarioId) return respuesta.redirect('/resumen');
  respuesta.sendFile(path.join(RAIZ, 'HTML', 'vista', 'ingreso.html'));
});

// Pantalla para crear una cuenta (si ya hay sesión, va directo al resumen)
aplicacion.get('/registro', (pedido, respuesta) => {
  if (pedido.session.usuarioId) return respuesta.redirect('/resumen');
  respuesta.sendFile(path.join(RAIZ, 'HTML', 'vista', 'registro.html'));
});

// Ingresar: verifica las credenciales contra la tabla de usuarios (MySQL)
aplicacion.post('/ingresar', async (pedido, respuesta) => {
  const usuario = String(pedido.body.usuario || '').trim();
  const clave = String(pedido.body.clave || '');

  try {
    const [filas] = await bd.execute(
      'SELECT id, usuario, clave_hash FROM usuarios WHERE usuario = ?',
      [usuario]
    );
    const fila = filas[0];
    const coincide = await bcrypt.compare(clave, fila ? fila.clave_hash : HASH_FALSO);

    if (!fila || !coincide) {
      return respuesta
        .status(401)
        .json({ mensaje: 'Usuario o contraseña incorrectos. Revisá los datos e intentá de nuevo.' });
    }

    iniciarSesion(pedido, respuesta, fila);
  } catch (error) {
    console.error('Error al consultar la base de datos:', error.message);
    respuesta.status(500).json({ mensaje: 'No se pudo consultar la base de datos.' });
  }
});

// Registrar: crea una cuenta nueva y entra directamente al inicio
aplicacion.post('/registrar', async (pedido, respuesta) => {
  const usuario = String(pedido.body.usuario || '').trim();
  const clave = String(pedido.body.clave || '');

  if (!FORMATO_USUARIO.test(usuario)) {
    return respuesta.status(400).json({
      mensaje: 'El usuario debe tener entre 3 y 30 caracteres: letras, números, punto, guion o guion bajo.',
    });
  }
  if (clave.length < 6) {
    return respuesta.status(400).json({ mensaje: 'La contraseña debe tener al menos 6 caracteres.' });
  }

  try {
    const hash = await bcrypt.hash(clave, 10);
    const [resultado] = await bd.execute(
      'INSERT INTO usuarios (usuario, clave_hash) VALUES (?, ?)',
      [usuario, hash]
    );
    iniciarSesion(pedido, respuesta, { id: resultado.insertId, usuario });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return respuesta.status(409).json({
        mensaje: 'Ese nombre de usuario ya existe. Elegí otro o ingresá con tu cuenta.',
      });
    }
    console.error('Error al registrar el usuario:', error.message);
    respuesta.status(500).json({ mensaje: 'No se pudo crear la cuenta.' });
  }
});

// ---------------------------------------------------------------------
//  Páginas del tablero: solo para usuarios autenticados
// ---------------------------------------------------------------------
const PAGINAS = {
  '/resumen': 'resumen.html',
  '/ventas': 'ventas.html',                  // drill down nivel 1: categorías
  '/ventas/categoria': 'categoria.html',     // drill down nivel 2: productos
  '/ventas/producto': 'producto.html',       // drill down nivel 3: detalle de ventas
  '/clientes': 'clientes.html',
  '/proveedores': 'proveedores.html',
};
for (const [ruta, archivo] of Object.entries(PAGINAS)) {
  aplicacion.get(ruta, requiereSesionPagina, (pedido, respuesta) => {
    respuesta.sendFile(path.join(RAIZ, 'HTML', 'vista', archivo));
  });
}

// ---------------------------------------------------------------------
//  API de datos (JSON). Cada ruta llama a una consulta de consultas.js
// ---------------------------------------------------------------------
const FORMATO_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

// Envuelve cada ruta para responder un error prolijo si falla la base de datos
const conDatos = (manejador) => async (pedido, respuesta) => {
  try {
    await manejador(pedido, respuesta);
  } catch (error) {
    console.error(`Error en ${pedido.originalUrl}:`, error.message);
    respuesta.status(500).json({ mensaje: 'No se pudo consultar la base de datos.' });
  }
};

// Valida el parámetro ?mes=AAAA-MM
function leerMes(pedido, respuesta) {
  const mes = String(pedido.query.mes || '');
  if (!FORMATO_MES.test(mes)) {
    respuesta.status(400).json({ mensaje: 'Mes inválido (formato AAAA-MM).' });
    return null;
  }
  return mes;
}

// Valida un id numérico de la URL
function leerId(pedido, respuesta) {
  const id = Number(pedido.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    respuesta.status(400).json({ mensaje: 'Identificador inválido.' });
    return null;
  }
  return id;
}

const api = express.Router();
api.use(requiereSesionDatos);

api.get('/resumen', conDatos(async (pedido, respuesta) => {
  const meses = [3, 6, 12].includes(Number(pedido.query.meses)) ? Number(pedido.query.meses) : 6;
  const [indicadores, ventasPorMes, stock] = await Promise.all([
    consultas.indicadores(),
    consultas.ventasPorMes(meses),
    consultas.estadoStock(),
  ]);
  respuesta.json({ indicadores, ventasPorMes, stock });
}));

api.get('/ventas/meses', conDatos(async (pedido, respuesta) => {
  respuesta.json(await consultas.mesesConVentas());
}));

api.get('/ventas/categorias', conDatos(async (pedido, respuesta) => {
  const mes = leerMes(pedido, respuesta);
  if (!mes) return;
  respuesta.json(await consultas.ventasPorCategoria(mes));
}));

api.get('/ventas/categorias/:id', conDatos(async (pedido, respuesta) => {
  const mes = leerMes(pedido, respuesta);
  const id = mes && leerId(pedido, respuesta);
  if (!id) return;
  const datos = await consultas.productosDeCategoria(id, mes);
  if (!datos) return respuesta.status(404).json({ mensaje: 'La categoría no existe.' });
  respuesta.json(datos);
}));

api.get('/ventas/productos/:id', conDatos(async (pedido, respuesta) => {
  const mes = leerMes(pedido, respuesta);
  const id = mes && leerId(pedido, respuesta);
  if (!id) return;
  const datos = await consultas.detalleProducto(id, mes);
  if (!datos) return respuesta.status(404).json({ mensaje: 'El producto no existe.' });
  respuesta.json(datos);
}));

api.get('/clientes', conDatos(async (pedido, respuesta) => {
  const busqueda = String(pedido.query.buscar || '').trim().slice(0, 60);
  respuesta.json(await consultas.clientes(busqueda));
}));

api.get('/proveedores', conDatos(async (pedido, respuesta) => {
  respuesta.json(await consultas.proveedores());
}));

aplicacion.use('/api', api);

// Nombre del usuario que inició sesión
aplicacion.get('/usuario-actual', requiereSesionDatos, (pedido, respuesta) => {
  respuesta.json({ usuario: pedido.session.usuario });
});

// Cerrar sesión
aplicacion.post('/salir', (pedido, respuesta) => {
  pedido.session.destroy(() => respuesta.json({ ok: true }));
});

// Primero prepara la tabla en MySQL y recién después arranca el servidor
prepararTabla()
  .then(() => {
    aplicacion.listen(PUERTO, () => console.log(`Cipria en http://localhost:${PUERTO}`));
  })
  .catch((error) => {
    console.error('No se pudo conectar con MySQL:', error.message);
    process.exit(1);
  });