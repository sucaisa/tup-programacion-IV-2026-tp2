const express = require('express');
const { body, param, validationResult } = require('express-validator');
const db = require('./db');

const app = express();
const PORT = 3001;

app.use(express.json());

// Middleware para atrapar y formatear los errores de express-validator
const validar = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errores: errors.array() });
  }
  next();
};

// Validaciones con express-validator exigidas por la consigna
const validarLados = [
  body('lado1')
    .exists().withMessage('El campo lado1 es obligatorio')
    .isFloat({ gt: 0 }).withMessage('El lado1 debe ser un número estrictamente mayor a 0'),
  body('lado2')
    .exists().withMessage('El campo lado2 es obligatorio')
    .isFloat({ gt: 0 }).withMessage('El lado2 debe ser un número estrictamente mayor a 0'),
  // Regla estricta de la consigna: no aceptar perímetro ni superficie desde el cliente
  body('perimetro').not().exists().withMessage('No debe enviar el perímetro; se calcula automáticamente en el servidor'),
  body('superficie').not().exists().withMessage('No debe enviar la superficie; se calcula automáticamente en el servidor')
];

const validarIdParam = [
  param('id')
    .isInt({ gt: 0 }).withMessage('El ID en el parámetro de ruta debe ser un número entero positivo')
];

// 1. GET /rectangulos -> Listar todos los rectángulos persistidos
app.get('/rectangulos', async (req, res) => {
  try {
    const [filas] = await db.query('SELECT * FROM rectangulos ORDER BY id DESC');
    return res.status(200).json(filas);
  } catch (error) {
    return res.status(500).json({ error: 'Error interno del servidor', detalle: error.message });
  }
});

// 2. GET /rectangulos/:id -> Consultar un rectángulo puntual
app.get('/rectangulos/:id', validarIdParam, validar, async (req, res) => {
  try {
    const { id } = req.params;
    const [filas] = await db.query('SELECT * FROM rectangulos WHERE id = ?', [id]);

    if (filas.length === 0) {
      return res.status(404).json({ error: `Rectángulo con ID ${id} no encontrado` });
    }

    return res.status(200).json(filas[0]);
  } catch (error) {
    return res.status(500).json({ error: 'Error interno del servidor', detalle: error.message });
  }
});

// 3. POST /rectangulos -> Crear y persistir nuevo rectángulo
app.post('/rectangulos', validarLados, validar, async (req, res) => {
  try {
    const lado1 = parseFloat(req.body.lado1);
    const lado2 = parseFloat(req.body.lado2);

    // Cálculos de datos derivados en el servidor
    const perimetro = 2 * (lado1 + lado2);
    const superficie = lado1 * lado2;

    const [resultado] = await db.query(
      'INSERT INTO rectangulos (lado1, lado2, perimetro, superficie) VALUES (?, ?, ?, ?)',
      [lado1, lado2, perimetro, superficie]
    );

    return res.status(201).json({
      id: resultado.insertId,
      lado1,
      lado2,
      perimetro,
      superficie,
      esCuadrado: lado1 === lado2
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error al insertar en la base de datos', detalle: error.message });
  }
});

// 4. PUT /rectangulos/:id -> Modificar lados de un rectángulo existente
app.put('/rectangulos/:id', [...validarIdParam, ...validarLados], validar, async (req, res) => {
  try {
    const { id } = req.params;
    const lado1 = parseFloat(req.body.lado1);
    const lado2 = parseFloat(req.body.lado2);

    const [existente] = await db.query('SELECT id FROM rectangulos WHERE id = ?', [id]);
    if (existente.length === 0) {
      return res.status(404).json({ error: `Rectángulo con ID ${id} no encontrado` });
    }

    const perimetro = 2 * (lado1 + lado2);
    const superficie = lado1 * lado2;

    await db.query(
      'UPDATE rectangulos SET lado1 = ?, lado2 = ?, perimetro = ?, superficie = ? WHERE id = ?',
      [lado1, lado2, perimetro, superficie, id]
    );

    return res.status(200).json({
      id: parseInt(id),
      lado1,
      lado2,
      perimetro,
      superficie,
      esCuadrado: lado1 === lado2
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error al actualizar el registro', detalle: error.message });
  }
});

// 5. DELETE /rectangulos/:id -> Eliminar rectángulo
app.delete('/rectangulos/:id', validarIdParam, validar, async (req, res) => {
  try {
    const { id } = req.params;
    const [resultado] = await db.query('DELETE FROM rectangulos WHERE id = ?', [id]);

    if (resultado.affectedRows === 0) {
      return res.status(404).json({ error: `Rectángulo con ID ${id} no encontrado` });
    }

    return res.status(200).json({ mensaje: `Rectángulo con ID ${id} eliminado correctamente` });
  } catch (error) {
    return res.status(500).json({ error: 'Error al eliminar el registro', detalle: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Ejercicio 1 corriendo en http://localhost:${PORT}`);
});