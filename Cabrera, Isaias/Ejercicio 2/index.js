const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const db = require('./db');

const app = express();
const PORT = 3002;

app.use(express.json());

// Middleware procesador de errores de validación
const validar = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errores: errors.array() });
  }
  next();
};

const validarCrearTarea = [
  body('nombre')
    .trim()
    .notEmpty().withMessage('El nombre de la tarea no puede estar vacío')
    .isString().withMessage('El nombre debe ser una cadena de texto'),
  body('completada')
    .optional()
    .isBoolean().withMessage('El campo completada debe ser booleano (true o false)')
];

const validarActualizarTarea = [
  param('id').isInt({ gt: 0 }).withMessage('ID inválido en la ruta'),
  body('nombre')
    .trim()
    .notEmpty().withMessage('El nombre de la tarea no puede estar vacío')
    .isString().withMessage('El nombre debe ser una cadena de texto'),
  body('completada')
    .exists().withMessage('El campo completada es requerido')
    .isBoolean().withMessage('El campo completada debe ser booleano')
];

const validarFiltroTareas = [
  query('completada')
    .optional()
    .isIn(['true', 'false']).withMessage('El filtro completada debe ser "true" o "false"')
];

// GET /tareas -> Listar con filtro opcional (?completada=true|false)
app.get('/tareas', validarFiltroTareas, validar, async (req, res) => {
  try {
    const { completada } = req.query;
    let sql = 'SELECT * FROM tareas';
    const params = [];

    if (completada !== undefined) {
      const valorBooleano = completada === 'true';
      sql += ' WHERE completada = ?';
      params.push(valorBooleano);
    }

    sql += ' ORDER BY id DESC';
    const [filas] = await db.query(sql, params);
    return res.status(200).json(filas);
  } catch (error) {
    return res.status(500).json({ error: 'Error interno del servidor', detalle: error.message });
  }
});

// GET /tareas/:id -> Consultar tarea puntual
app.get('/tareas/:id', param('id').isInt({ gt: 0 }), validar, async (req, res) => {
  try {
    const { id } = req.params;
    const [filas] = await db.query('SELECT * FROM tareas WHERE id = ?', [id]);

    if (filas.length === 0) {
      return res.status(404).json({ error: `Tarea con ID ${id} no encontrada` });
    }

    return res.status(200).json(filas[0]);
  } catch (error) {
    return res.status(500).json({ error: 'Error al consultar tarea', detalle: error.message });
  }
});

// POST /tareas -> Crear tarea con control de unicidad
app.post('/tareas', validarCrearTarea, validar, async (req, res) => {
  try {
    const nombre = req.body.nombre.trim();
    const completada = req.body.completada !== undefined ? Boolean(req.body.completada) : false;

    // Control de duplicados insensible a mayúsculas/minúsculas
    const [duplicados] = await db.query(
      'SELECT id FROM tareas WHERE LOWER(TRIM(nombre)) = LOWER(?)',
      [nombre]
    );

    if (duplicados.length > 0) {
      return res.status(409).json({ error: `Ya existe una tarea registrada con el nombre "${nombre}"` });
    }

    const [resultado] = await db.query(
      'INSERT INTO tareas (nombre, completada) VALUES (?, ?)',
      [nombre, completada]
    );

    return res.status(201).json({
      id: resultado.insertId,
      nombre,
      completada
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error al insertar tarea', detalle: error.message });
  }
});

// PUT /tareas/:id -> Modificar tarea
app.put('/tareas/:id', validarActualizarTarea, validar, async (req, res) => {
  try {
    const { id } = req.params;
    const nombre = req.body.nombre.trim();
    const completada = Boolean(req.body.completada);

    const [existente] = await db.query('SELECT id FROM tareas WHERE id = ?', [id]);
    if (existente.length === 0) {
      return res.status(404).json({ error: `Tarea con ID ${id} no encontrada` });
    }

    // Comprobar colisión de nombre con otra tarea existente
    const [colision] = await db.query(
      'SELECT id FROM tareas WHERE LOWER(TRIM(nombre)) = LOWER(?) AND id != ?',
      [nombre, id]
    );

    if (colision.length > 0) {
      return res.status(409).json({ error: `Ya existe otra tarea con el nombre "${nombre}"` });
    }

    await db.query(
      'UPDATE tareas SET nombre = ?, completada = ? WHERE id = ?',
      [nombre, completada, id]
    );

    return res.status(200).json({ id: parseInt(id), nombre, completada });
  } catch (error) {
    return res.status(500).json({ error: 'Error al actualizar tarea', detalle: error.message });
  }
});

// DELETE /tareas/:id -> Eliminar tarea
app.delete('/tareas/:id', param('id').isInt({ gt: 0 }), validar, async (req, res) => {
  try {
    const { id } = req.params;
    const [resultado] = await db.query('DELETE FROM tareas WHERE id = ?', [id]);

    if (resultado.affectedRows === 0) {
      return res.status(404).json({ error: `Tarea con ID ${id} no encontrada` });
    }

    return res.status(200).json({ mensaje: `Tarea con ID ${id} eliminada correctamente` });
  } catch (error) {
    return res.status(500).json({ error: 'Error al eliminar tarea', detalle: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Ejercicio 2 corriendo en http://localhost:${PORT}`);
});