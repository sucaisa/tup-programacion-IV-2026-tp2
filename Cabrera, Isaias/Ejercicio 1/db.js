const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '', // Si configuraste clave en tu MySQL de XAMPP, ponla aquí
  database: 'tp2_programacion_iv',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;