const express = require('express');
const { body, param, validationResult } = require('express-validator');
const db = require('./db');

const app = express();
const PORT = 3003;

app.use(express.json());

const validar = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errores: errors.array() });
  }
  next();
};

// Validaciones exigidas: alumno presente, materia_id entero positivo, exactamente 3 notas entre 1 y 10
const validarCalificacion = [
  body('alumno')
    .trim()
    .notEmpty().withMessage('El nombre del alumno es obligatorio')
    .isString().withMessage('El nombre del alumno debe ser una cadena de texto'),
  body('materia_id')
    .isInt({ gt: 0 }).withMessage('El ID de la materia debe ser un número entero positivo'),
  body('notas')
    .isArray({ min: 3, max: 3 }).withMessage('Debe informar un arreglo con exactamente tres notas'),
  body('notas.*')
    .isFloat({ min: 1, max: 10 }).withMessage('Cada nota debe ser un número numérico comprendido entre 1 y 10')
];

// GET /materias -> Listar materias registradas
app.get('/materias', async (req, res) => {
  try {
    const [materias] = await db.query('SELECT * FROM materias ORDER BY id ASC');
    return res.status(200).json(materias);
  } catch (error) {
    return res.status(500).json({ error: 'Error al obtener materias', detalle: error.message });
  }
});

// GET /calificaciones -> Listar calificaciones con JOIN a la tabla materias
app.get('/calificaciones', async (req, res) => {
  try {
    const [filas] = await db.query(`
      SELECT 
        c.id,
        c.alumno,
        c.materia_id,
        m.nombre AS materia_nombre,
        c.nota1,
        c.nota2,
        c.nota3,
        ROUND((c.nota1 + c.nota2 + c.nota3) / 3, 2) AS promedio
      FROM calificaciones c
      INNER JOIN materias m ON c.materia_id = m.id
      ORDER BY c.id DESC
    `);
    return res.status(200).json(filas);
  } catch (error) {
    return res.status(500).json({ error: 'Error al consultar calificaciones', detalle: error.message });
  }
});

// GET /calificaciones/:id -> Consultar un registro puntual
app.get('/calificaciones/:id', param('id').isInt({ gt: 0 }), validar, async (req, res) => {
  try {
    const { id } = req.params;
    const [filas] = await db.query(`
      SELECT 
        c.id,
        c.alumno,
        c.materia_id,
        m.nombre AS materia_nombre,
        c.nota1,
        c.nota2,
        c.nota3,
        ROUND((c.nota1 + c.nota2 + c.nota3) / 3, 2) AS promedio
      FROM calificaciones c
      INNER JOIN materias m ON c.materia_id = m.id
      WHERE c.id = ?
    `, [id]);

    if (filas.length === 0) {
      return res.status(404).json({ error: `Registro con ID ${id} no encontrado` });
    }

    return res.status(200).json(filas[0]);
  } catch (error) {
    return res.status(500).json({ error: 'Error al consultar calificación', detalle: error.message });
  }
});

// POST /calificaciones -> Registrar calificaciones con validación de existencia y unicidad
app.post('/calificaciones', validarCalificacion, validar, async (req, res) => {
  try {
    const alumno = req.body.alumno.trim();
    const materia_id = parseInt(req.body.materia_id);
    const [n1, n2, n3] = req.body.notas.map(n => parseFloat(n));

    // 1. Verificar existencia de la materia vinculada
    const [materia] = await db.query('SELECT id, nombre FROM materias WHERE id = ?', [materia_id]);
    if (materia.length === 0) {
      return res.status(404).json({ error: `La materia con ID ${materia_id} no existe` });
    }

    // 2. Verificar regla de unicidad de combinación alumno-materia
    const [duplicado] = await db.query(
      'SELECT id FROM calificaciones WHERE LOWER(TRIM(alumno)) = LOWER(?) AND materia_id = ?',
      [alumno, materia_id]
    );

    if (duplicado.length > 0) {
      return res.status(409).json({
        error: `El alumno "${alumno}" ya cuenta con un registro para la materia "${materia[0].nombre}"`
      });
    }

    const [resultado] = await db.query(
      'INSERT INTO calificaciones (alumno, materia_id, nota1, nota2, nota3) VALUES (?, ?, ?, ?, ?)',
      [alumno, materia_id, n1, n2, n3]
    );

    return res.status(201).json({
      id: resultado.insertId,
      alumno,
      materia_id,
      materia_nombre: materia[0].nombre,
      notas: [n1, n2, n3],
      promedio: Number(((n1 + n2 + n3) / 3).toFixed(2))
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error al insertar calificaciones', detalle: error.message });
  }
});

// PUT /calificaciones/:id -> Modificar calificaciones
app.put('/calificaciones/:id', [param('id').isInt({ gt: 0 }), ...validarCalificacion], validar, async (req, res) => {
  try {
    const { id } = req.params;
    const alumno = req.body.alumno.trim();
    const materia_id = parseInt(req.body.materia_id);
    const [n1, n2, n3] = req.body.notas.map(n => parseFloat(n));

    const [existente] = await db.query('SELECT id FROM calificaciones WHERE id = ?', [id]);
    if (existente.length === 0) {
      return res.status(404).json({ error: `Registro con ID ${id} no encontrado` });
    }

    // Verificar existencia de la materia
    const [materia] = await db.query('SELECT id, nombre FROM materias WHERE id = ?', [materia_id]);
    if (materia.length === 0) {
      return res.status(404).json({ error: `La materia con ID ${materia_id} no existe` });
    }

    // Verificar colisión con otro registro distinto
    const [colision] = await db.query(
      'SELECT id FROM calificaciones WHERE LOWER(TRIM(alumno)) = LOWER(?) AND materia_id = ? AND id != ?',
      [alumno, materia_id, id]
    );

    if (colision.length > 0) {
      return res.status(409).json({
        error: `Ya existe otro registro para el alumno "${alumno}" en la materia "${materia[0].nombre}"`
      });
    }

    await db.query(
      'UPDATE calificaciones SET alumno = ?, materia_id = ?, nota1 = ?, nota2 = ?, nota3 = ? WHERE id = ?',
      [alumno, materia_id, n1, n2, n3, id]
    );

    return res.status(200).json({
      id: parseInt(id),
      alumno,
      materia_id,
      materia_nombre: materia[0].nombre,
      notas: [n1, n2, n3],
      promedio: Number(((n1 + n2 + n3) / 3).toFixed(2))
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error al actualizar calificaciones', detalle: error.message });
  }
});

// DELETE /calificaciones/:id -> Eliminar registro
app.delete('/calificaciones/:id', param('id').isInt({ gt: 0 }), validar, async (req, res) => {
  try {
    const { id } = req.params;
    const [resultado] = await db.query('DELETE FROM calificaciones WHERE id = ?', [id]);

    if (resultado.affectedRows === 0) {
      return res.status(404).json({ error: `Registro con ID ${id} no encontrado` });
    }

    return res.status(200).json({ mensaje: `Registro de calificación con ID ${id} eliminado correctamente` });
  } catch (error) {
    return res.status(500).json({ error: 'Error al eliminar calificación', detalle: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Ejercicio 3 corriendo en http://localhost:${PORT}`);
});