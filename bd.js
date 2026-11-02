const mysql = require('mysql2/promise');

// Datos de conexión: completá con los de tu MySQL
// (también se pueden pasar por variables de entorno DB_HOST, DB_USER, etc.)
const bd = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD ?? 'Violeta0328#',
  database: process.env.DB_NAME || 'cipria',
  decimalNumbers: true, // los DECIMAL llegan como número y no como texto
  dateStrings: true,    // las fechas llegan tal cual están en MySQL (sin corrimiento de zona horaria)
});

// Crea la tabla de usuarios si todavía no existe.
// La contraseña se guarda SOLO como hash (bcrypt).
async function prepararTabla() {
  await bd.execute(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      usuario    VARCHAR(50)  NOT NULL UNIQUE,
      clave_hash VARCHAR(100) NOT NULL
    )
  `);

  // Aviso si todavía no se ejecutó MYSQL.sql (tablas del negocio)
  try {
    await bd.query('SELECT 1 FROM venta LIMIT 1');
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') {
      console.warn('⚠  Faltan las tablas del negocio: ejecutá MYSQL.sql en MySQL Workbench.');
    } else {
      throw error;
    }
  }
}

module.exports = { bd, prepararTabla };
