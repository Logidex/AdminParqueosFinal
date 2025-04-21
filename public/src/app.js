require('dotenv').config({
  path: 'C:\\Users\\erick\\OneDrive\\Documents\\documentos tareas\\Ingenieria de software\\admin-parqueos-sql\\.env'
})
const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const sql = require('mssql')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const path = require('path')
const fs = require('fs').promises;
const app = express()

app.use(express.static(path.join(__dirname, 'public')))

app.get('/', (req, res) => {
  const filePath = path.join(__dirname, '../public/html/login.html');
  console.log('Intentando servir archivo:', filePath); // Para depuración
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error('Error al servir login.html:', err);
      res.status(500).json({
        success: false,
        message: 'Error al cargar la página de inicio de sesión'
      });
    }
  });
});

// Validación de variables de entorno requeridas
const requiredEnvVars = [
  'DB_USER',
  'DB_PASSWORD',
  'DB_SERVER',
  'DB_NAME',
  'JWT_SECRET'
]
requiredEnvVars.forEach(env => {
  if (!process.env[env]) {
    throw new Error(`Falta la variable de entorno requerida: ${env}`)
  }
})

// Configuración de la base de datos (sin valores por defecto)

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: true, // Si usas Azure
    trustServerCertificate: true, // Para desarrollo local
    requestTimeout: 30000 // Aumenta a 30 segundos
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

// Middlewares de seguridad
app.use(helmet()) // Headers de seguridad HTTP
app.use(express.json({ limit: '10kb' })) // Limitar tamaño del payload

// Configuración CORS segura
// Configuración CORS mejorada
// Configuración CORS mejorada
const corsOptions = {
  origin: [
    'http://127.0.0.1:5500',
    'http://localhost:5500',
    'http://localhost:3000'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Añadidos más métodos
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}
app.use(cors(corsOptions))

// Rate limiting para prevenir ataques de fuerza bruta
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // límite de 100 peticiones por IP
  message: 'Too many requests from this IP, please try again later'
})
app.use('/login', limiter)
app.use('/api/register', limiter)

// Pool de conexiones
let pool
let isDbConnected = false

async function initializePool () {
  try {
    pool = await sql.connect(dbConfig)
    isDbConnected = true
    console.log('Conexión a la base de datos establecida')

    // Verificar conexión con una consulta simple
    await pool.request().query('SELECT 1 AS test')
    console.log('Conexión verificada con éxito')

    return pool
  } catch (err) {
    console.error('Error al conectar con la base de datos:', err.message) // No mostrar detalles completos
    isDbConnected = false
    // Reintentar conexión después de 5 segundos
    setTimeout(initializePool, 5000)
    throw err
  }
}

initializePool()

// Middleware de autenticación JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Token de autenticación requerido'
    })
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.error('Error al verificar token:', err)
      return res.status(403).json({
        success: false,
        message: 'Token inválido o expirado',
        details: err.message
      })
    }
    req.user = user
    next()
  })
}
// Middleware para verificar conexión a la base de datos
const checkDbConnection = (req, res, next) => {
  if (!isDbConnected) {
    return res.status(503).json({
      success: false,
      message:
        'Servicio no disponible temporalmente. Intente nuevamente más tarde.'
    })
  }
  next()
}

// Ruta de health check
app.get('/health', (req, res) => {
  const status = {
    status: 'OK',
    db: isDbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  }
  res.json(status)
})

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')))

// Ruta de login
app.post('/login', checkDbConnection, async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Usuario y contraseña son requeridos'
      })
    }

    // Buscar usuario en la base de datos
    const result = await pool
      .request()
      .input('username', sql.VarChar(50), username)
      .query('SELECT * FROM USUARIOS WHERE username = @username AND activo = 1')

    if (result.recordset.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      })
    }

    const user = result.recordset[0]

    // Verificar contraseña
    const passwordMatch = await bcrypt.compare(
      password,
      user.password_hash.toString()
    )
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      })
    }

    // Obtener información del rol
    const rolResult = await pool
      .request()
      .input('rol_id', sql.Int, user.rol_id)
      .query('SELECT nombre, permisos FROM ROLES WHERE rol_id = @rol_id')

    const rol = rolResult.recordset[0]

    // Crear token JWT
    const token = jwt.sign(
      {
        userId: user.usuario_id,
        username: user.username,
        rol: rol.nombre,
        permisos: rol.permisos
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    )

    // Actualizar último acceso
    await pool
      .request()
      .input('usuario_id', sql.Int, user.usuario_id)
      .query(
        'UPDATE USUARIOS SET ultimo_acceso = GETDATE() WHERE usuario_id = @usuario_id'
      )

    // Responder con el token y datos del usuario (sin información sensible)
    res.json({
      success: true,
      token,
      user: {
        id: user.usuario_id,
        username: user.username,
        nombre: user.nombre,
        apellido: user.apellido,
        email: user.email,
        rol: rol.nombre,
        avatar: user.avatar_url
      }
    })
  } catch (error) {
    console.error('Error en login:', error.message)
    res.status(500).json({
      success: false,
      message: 'Error en el servidor'
    })
  }
})

// Ruta protegida de ejemplo
app.get('/profile', authenticateToken, checkDbConnection, async (req, res) => {
  try {
    const user = await pool
      .request()
      .input('usuario_id', sql.Int, req.user.userId)
      .query(
        'SELECT usuario_id, username, nombre, apellido, email, avatar_url FROM USUARIOS WHERE usuario_id = @usuario_id'
      )

    if (user.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      })
    }

    res.json({
      success: true,
      user: user.recordset[0]
    })
  } catch (error) {
    console.error('Error al obtener perfil:', error.message)
    res.status(500).json({
      success: false,
      message: 'Error en el servidor'
    })
  }
})

// Ruta de registro
app.post('/api/register', checkDbConnection, async (req, res) => {
  try {
    const { username, email, password, nombre, apellido } = req.body

    // Validaciones básicas
    if (!username || !email || !password || !nombre || !apellido) {
      return res.status(400).json({
        success: false,
        message: 'Todos los campos son requeridos'
      })
    }

    // Validar formato de email
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'El formato del email es inválido'
      })
    }

    // Validar fortaleza de contraseña
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña debe tener al menos 8 caracteres'
      })
    }

    // Verificar si el usuario ya existe
    const userExists = await pool
      .request()
      .input('username', sql.VarChar(50), username)
      .input('email', sql.VarChar(100), email).query(`
        SELECT usuario_id FROM USUARIOS 
        WHERE username = @username OR email = @email
      `)

    if (userExists.recordset.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'El usuario o email ya están registrados'
      })
    }

    // Generar salt y hash de la contraseña
    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)

    // Convertir a Buffer para SQL Server
    const passwordHashBuffer = Buffer.from(hashedPassword)
    const saltBuffer = Buffer.from(salt)

    // Crear usuario en la base de datos
    const result = await pool
      .request()
      .input('username', sql.VarChar(50), username)
      .input('email', sql.VarChar(100), email)
      .input('password_hash', sql.VarBinary(256), passwordHashBuffer)
      .input('password_salt', sql.VarBinary(128), saltBuffer)
      .input('nombre', sql.VarChar(100), nombre)
      .input('apellido', sql.VarChar(100), apellido).query(`
        INSERT INTO USUARIOS 
        (rol_id, username, password_hash, password_salt, email, nombre, apellido)
        VALUES (2, @username, @password_hash, @password_salt, @email, @nombre, @apellido);
        SELECT SCOPE_IDENTITY() AS usuario_id;
      `)

    const userId = result.recordset[0].usuario_id

    // Responder con éxito
    res.status(201).json({
      success: true,
      message: 'Usuario registrado exitosamente',
      userId
    })
  } catch (error) {
    console.error('Error en registro:', error.message)
    res.status(500).json({
      success: false,
      message: 'Error en el servidor al registrar usuario'
    })
  }
})

// Rutas del Dashboard
const dashboardRouter = express.Router()

// Ruta para obtener estadísticas del dashboard
dashboardRouter.get(
  '/stats',
  authenticateToken,
  checkDbConnection,
  async (req, res) => {
    try {
      const result = await pool.request().query(`
        SELECT 
          (SELECT COUNT(*) FROM ESPACIOS) AS totalSpaces,
          (SELECT COUNT(*) FROM ESPACIOS WHERE estado = 'Ocupado') AS occupied,
          (SELECT COUNT(*) FROM ESPACIOS WHERE estado = 'Disponible') AS available
      `)
      res.json({
        success: true,
        data: result.recordset[0]
      })
    } catch (error) {
      console.error('Error al obtener estadísticas:', error.message)
      res.status(500).json({
        success: false,
        message: 'Error al obtener estadísticas'
      })
    }
  }
)

// Ruta para obtener movimientos
dashboardRouter.get('/movements', checkDbConnection, async (req, res) => {
  try {
    const result = await pool.request().query(`
        SELECT TOP 10 
          e.codigo AS spaceCode,
          m.placa AS plate,
          m.tipo_vehiculo AS vehicleType,
          CONVERT(varchar, m.fecha_hora, 120) AS entryTime,
          m.tipo AS status,
          CASE 
            WHEN m.duracion_minutos IS NOT NULL THEN 
              CONCAT(
                FLOOR(m.duracion_minutos / 60), 'h ', 
                m.duracion_minutos % 60, 'm'
              )
            ELSE NULL
          END AS duration,
          m.tarifa_aplicada AS amount
        FROM MOVIMIENTOS m
        JOIN ESPACIOS e ON m.espacio_id = e.espacio_id
        ORDER BY m.fecha_hora DESC
      `)

    res.json({
      success: true,
      data: result.recordset
    })
  } catch (error) {
    console.error('Error al obtener movimientos:', error.message)
    res.status(500).json({
      success: false,
      message: 'Error al obtener movimientos',
      error: error.message
    })
  }
})

// Endpoint para estadísticas del dashboard
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    await pool.connect();
    const request = pool.request();
    
    const query = `
      SELECT 
        COUNT(*) AS totalSpaces,
        SUM(CASE WHEN estado = 'Ocupado' THEN 1 ELSE 0 END) AS occupied,
        SUM(CASE WHEN estado = 'Disponible' THEN 1 ELSE 0 END) AS available,
        SUM(CASE WHEN estado = 'Reservado' THEN 1 ELSE 0 END) AS reserved
      FROM ESPACIOS
    `;
    
    const result = await request.query(query);
    const data = result.recordset[0];
    
    res.json({
      success: true,
      data: {
        totalSpaces: data.totalSpaces,
        occupied: data.occupied,
        available: data.available,
        reserved: data.reserved
      }
    });
  } catch (error) {
    console.error('Error en /api/dashboard/stats:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error al obtener estadísticas'
    });
  }
});

// Ruta para obtener todos los tipos de espacio
app.get('/api/tipos-espacio', async (req, res) => {
  try {
    const result = await pool
      .request()
      .query('SELECT tipo_id, nombre FROM TIPO_ESPACIO');
    res.json({
      success: true,
      data: result.recordset
    });
  } catch (error) {
    console.error('Error al obtener tipos de espacio:', error);
    res.status(500).json({ success: false, message: 'Error al obtener tipos de espacio' });
  }
});

// Obtener lista de espacios
app.get('/api/espacios', async (req, res) => {
  try {
    const result = await pool.request().query(`
      SELECT 
        e.espacio_id,
        e.codigo,
        te.nombre AS tipo,
        e.estado,
        e.piso,
        e.zona,
        e.placa_reservada
      FROM ESPACIOS e
      JOIN TIPO_ESPACIO te ON e.tipo_id = te.tipo_id
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error al obtener espacios:', error);
    res.status(500).json({ success: false, message: 'Error al obtener espacios', error: error.message });
  }
});

// Reservar espacio
app.post('/api/reservar-espacio', async (req, res) => {
  const { espacio_id, placa, tipo_vehiculo, usuario_id } = req.body;
  if (!espacio_id || !placa || !tipo_vehiculo || !usuario_id) {
    return res.status(400).json({ success: false, message: 'Faltan parámetros requeridos' });
  }
  try {
    const espacioResult = await pool
      .request()
      .input('espacio_id', sql.Int, espacio_id)
      .query('SELECT estado, tipo_id FROM ESPACIOS WHERE espacio_id = @espacio_id');
    if (espacioResult.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Espacio no encontrado' });
    }
    const espacio = espacioResult.recordset[0];
    if (espacio.estado.toLowerCase() !== 'disponible') {
      return res.status(400).json({ success: false, message: 'El espacio no está disponible' });
    }
    const tipoResult = await pool
      .request()
      .input('nombre', sql.VarChar, tipo_vehiculo)
      .query('SELECT tipo_id FROM TIPO_ESPACIO WHERE nombre = @nombre');
    if (tipoResult.recordset.length === 0) {
      return res.status(400).json({ success: false, message: 'Tipo de vehículo inválido' });
    }
    if (tipoResult.recordset[0].tipo_id !== espacio.tipo_id) {
      return res.status(400).json({ success: false, message: 'El tipo de vehículo no coincide con el tipo de espacio' });
    }
    await pool
      .request()
      .input('espacio_id', sql.Int, espacio_id)
      .input('placa', sql.VarChar, placa.toUpperCase())
      .query(`
        UPDATE ESPACIOS
        SET estado = 'Reservado', placa_reservada = @placa
        WHERE espacio_id = @espacio_id
      `);
    await pool
      .request()
      .input('espacio_id', sql.Int, espacio_id)
      .input('usuario_id', sql.Int, usuario_id)
      .input('placa', sql.VarChar, placa.toUpperCase())
      .input('tipo_vehiculo', sql.VarChar, tipo_vehiculo)
      .input('fecha_hora', sql.DateTime, new Date())
      .query(`
        INSERT INTO MOVIMIENTOS (espacio_id, usuario_id, placa, tipo_vehiculo, tipo, fecha_hora)
        VALUES (@espacio_id, @usuario_id, @placa, @tipo_vehiculo, 'Reserva', @fecha_hora)
      `);
    res.json({ success: true, message: 'Espacio reservado correctamente' });
  } catch (error) {
    console.error('Error al reservar espacio:', error);
    res.status(500).json({ success: false, message: 'Error al reservar espacio', error: error.message });
  }
});

// Asignar vehículo a espacio
app.post('/api/asignar-vehiculo', async (req, res) => {
  const { espacio_id, placa, tipo } = req.body;
  if (!espacio_id || !placa || !tipo) {
    return res.status(400).json({ success: false, message: 'Faltan parámetros requeridos' });
  }
  try {
    const espacioResult = await pool
      .request()
      .input('espacio_id', sql.Int, espacio_id)
      .query('SELECT estado, tipo_id, placa_reservada FROM ESPACIOS WHERE espacio_id = @espacio_id');
    if (espacioResult.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Espacio no encontrado' });
    }
    const espacio = espacioResult.recordset[0];
    if (espacio.estado.toLowerCase() !== 'disponible' && espacio.estado.toLowerCase() !== 'reservado') {
      return res.status(400).json({ success: false, message: 'El espacio no está disponible ni reservado' });
    }
    const tipoResult = await pool
      .request()
      .input('nombre', sql.VarChar, tipo)
      .query('SELECT tipo_id FROM TIPO_ESPACIO WHERE nombre = @nombre');
    if (tipoResult.recordset.length === 0) {
      return res.status(400).json({ success: false, message: 'Tipo de vehículo inválido' });
    }
    if (tipoResult.recordset[0].tipo_id !== espacio.tipo_id) {
      return res.status(400).json({ success: false, message: 'El tipo de vehículo no coincide con el tipo de espacio' });
    }
    if (espacio.estado.toLowerCase() === 'reservado' && espacio.placa_reservada && espacio.placa_reservada.toUpperCase() !== placa.toUpperCase()) {
      return res.status(400).json({ success: false, message: 'La placa no coincide con la reserva' });
    }
    await pool
      .request()
      .input('espacio_id', sql.Int, espacio_id)
      .input('placa', sql.VarChar, placa.toUpperCase())
      .query(`
        UPDATE ESPACIOS
        SET estado = 'Ocupado', placa_reservada = NULL
        WHERE espacio_id = @espacio_id
      `);
    await pool
      .request()
      .input('espacio_id', sql.Int, espacio_id)
      .input('usuario_id', sql.Int, 5)
      .input('placa', sql.VarChar, placa.toUpperCase())
      .input('tipo_vehiculo', sql.VarChar, tipo)
      .input('fecha_hora', sql.DateTime, new Date())
      .query(`
        INSERT INTO MOVIMIENTOS (espacio_id, usuario_id, placa, tipo_vehiculo, tipo, fecha_hora)
        VALUES (@espacio_id, @usuario_id, @placa, @tipo_vehiculo, 'Entrada', @fecha_hora)
      `);
    res.json({ success: true, message: 'Vehículo asignado correctamente' });
  } catch (error) {
    console.error('Error al asignar vehículo:', error);
    res.status(500).json({ success: false, message: 'Error al asignar vehículo', error: error.message });
  }
});

// Liberar espacio
app.post('/api/liberar-espacio', async (req, res) => {
  const { espacio_id, usuario_id, metodo_pago, monto } = req.body;
  if (!espacio_id || !usuario_id || !metodo_pago || !monto) {
    return res.status(400).json({ success: false, message: 'Faltan parámetros requeridos' });
  }
  if (!['Efectivo', 'Tarjeta'].includes(metodo_pago)) {
    return res.status(400).json({ success: false, message: 'Método de pago inválido' });
  }
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const espacioResult = await new sql.Request(transaction)
      .input('espacio_id', sql.Int, espacio_id)
      .query('SELECT estado, tipo_id FROM ESPACIOS WHERE espacio_id = @espacio_id');
    if (espacioResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Espacio no encontrado' });
    }
    const espacio = espacioResult.recordset[0];
    if (espacio.estado.toLowerCase() === 'disponible') {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'El espacio ya está disponible' });
    }
    const movimientoResult = await new sql.Request(transaction)
      .input('espacio_id', sql.Int, espacio_id)
      .query(`
        SELECT TOP 1 placa, tipo_vehiculo, fecha_hora
        FROM MOVIMIENTOS
        WHERE espacio_id = @espacio_id
          AND tipo IN ('Entrada', 'Reserva')
        ORDER BY fecha_hora DESC
      `);
    if (movimientoResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'No se encontró registro de entrada o reserva' });
    }
    const { placa, tipo_vehiculo, fecha_hora } = movimientoResult.recordset[0];
    const duracionMinutos = Math.floor((new Date() - new Date(fecha_hora)) / (1000 * 60));
    const metodoResult = await new sql.Request(transaction)
      .input('nombre', sql.VarChar(50), metodo_pago)
      .query('SELECT metodo_id FROM METODO_PAGO WHERE nombre = @nombre');
    if (metodoResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Método de pago no encontrado' });
    }
    const metodo_id = metodoResult.recordset[0].metodo_id;
    const pagoResult = await new sql.Request(transaction)
      .input('metodo_id', sql.Int, metodo_id)
      .input('monto', sql.Decimal(10, 2), monto)
      .query(`
        INSERT INTO PAGOS (metodo_id, monto, estado, fecha_pago)
        OUTPUT INSERTED.pago_id
        VALUES (@metodo_id, @monto, 'Completado', GETDATE())
      `);
    const pago_id = pagoResult.recordset[0].pago_id;
    await new sql.Request(transaction)
      .input('espacio_id', sql.Int, espacio_id)
      .input('usuario_id', sql.Int, usuario_id)
      .input('placa', sql.VarChar, placa)
      .input('tipo_vehiculo', sql.VarChar, tipo_vehiculo)
      .input('fecha_hora', sql.DateTime, new Date())
      .input('duracion_minutos', sql.Int, duracionMinutos)
      .input('tarifa_aplicada', sql.Decimal(10, 2), monto)
      .input('pago_id', sql.Int, pago_id)
      .query(`
        INSERT INTO MOVIMIENTOS (espacio_id, usuario_id, placa, tipo_vehiculo, tipo, fecha_hora, duracion_minutos, tarifa_aplicada, pago_id)
        VALUES (@espacio_id, @usuario_id, @placa, @tipo_vehiculo, 'Salida', @fecha_hora, @duracion_minutos, @tarifa_aplicada, @pago_id)
      `);
    await new sql.Request(transaction)
      .input('espacio_id', sql.Int, espacio_id)
      .query(`
        UPDATE ESPACIOS
        SET estado = 'Disponible', placa_reservada = NULL
        WHERE espacio_id = @espacio_id
      `);
    await transaction.commit();
    res.json({
      success: true,
      message: 'Espacio liberado correctamente',
      tarifa: monto
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error al liberar espacio:', error);
    res.status(500).json({ success: false, message: 'Error al liberar espacio', error: error.message });
  }
});


// Ruta para obtener un espacio específico
app.get('/api/espacios/:id', checkDbConnection, async (req, res) => {
  try {
    const { id } = req.params

    const result = await pool.request().input('espacio_id', sql.Int, id).query(`
        SELECT 
          e.espacio_id, 
          e.codigo, 
          e.tipo_id, 
          te.nombre AS tipo_nombre,
          e.ubicacion, 
          e.estado, 
          e.piso, 
          e.zona
        FROM ESPACIOS e
        JOIN TIPO_ESPACIO te ON e.tipo_id = te.tipo_id
        WHERE e.espacio_id = @espacio_id
      `)

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Espacio no encontrado'
      })
    }

    res.json({
      success: true,
      data: result.recordset[0]
    })
  } catch (error) {
    console.error('Error al obtener espacio:', error.message)
    res.status(500).json({
      success: false,
      message: 'Error al obtener espacio'
    })
  }
})

app.get('/api/espacios-disponibles', checkDbConnection, async (req, res) => {
  try {
    const result = await pool.request().query(`
      SELECT 
        e.espacio_id as id,
        e.codigo,
        te.nombre as tipo,
        e.piso,
        e.zona,
        e.estado,
        m.placa,
        m.tipo_vehiculo
      FROM ESPACIOS e
      JOIN TIPO_ESPACIO te ON e.tipo_id = te.tipo_id
      LEFT JOIN MOVIMIENTOS m ON e.espacio_id = m.espacio_id AND m.tipo = 'Entrada'
      WHERE e.estado IN ('Disponible', 'Ocupado')
      ORDER BY e.piso, e.zona, e.codigo
    `)

    const espacios = result.recordset.map(space => ({
      id: space.id,
      codigo: space.codigo,
      tipo: space.tipo,
      piso: space.piso,
      zona: space.zona,
      estado: space.placa ? 'Ocupado' : space.estado,
      vehiculo: space.placa
        ? {
            placa: space.placa,
            tipo: space.tipo_vehiculo
          }
        : null
    }))

    res.json({ success: true, data: espacios })
  } catch (error) {
    console.error('Error al obtener espacios:', error)
    res.status(500).json({
      success: false,
      message: 'Error al obtener espacios',
      error: error.message
    })
  }
})

// Ruta para calcular cobro
app.post('/api/calcular-cobro', async (req, res) => {
  const { espacio_id, placa } = req.body;
  if (!espacio_id || !placa) {
    return res.status(400).json({ success: false, message: 'Faltan parámetros requeridos' });
  }
  try {
    const espacioResult = await pool
      .request()
      .input('espacio_id', sql.Int, espacio_id)
      .query('SELECT tipo_id FROM ESPACIOS WHERE espacio_id = @espacio_id');
    if (espacioResult.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Espacio no encontrado' });
    }
    const { tipo_id } = espacioResult.recordset[0];
    const tarifaResult = await pool
      .request()
      .input('espacio_id', sql.Int, espacio_id)
      .input('placa', sql.VarChar, placa)
      .input('tipo_id', sql.Int, tipo_id)
      .execute('SP_CALCULAR_TARIFA');
    const tarifa = tarifaResult.recordset[0]?.tarifa || 0;
    res.json({ success: true, tarifa });
  } catch (error) {
    console.error('Error al calcular cobro:', error);
    res.status(500).json({ success: false, message: 'Error al calcular cobro', error: error.message });
  }
});

// Montar las rutas bajo /api/dashboard
app.use('/api/dashboard', dashboardRouter)

// Ruta para obtener movimientos de entrada
app.post('/api/movimientos/entrada', async (req, res) => {
  const { espacio_id } = req.body;
  if (!espacio_id) {
    return res.status(400).json({ success: false, message: 'Faltan parámetros requeridos' });
  }
  try {
    const result = await pool
      .request()
      .input('espacio_id', sql.Int, espacio_id)
      .query(`
        SELECT TOP 1 *
        FROM MOVIMIENTOS
        WHERE espacio_id = @espacio_id
          AND tipo IN ('Entrada', 'Reserva')
        ORDER BY fecha_hora DESC
      `);
    if (result.recordset.length > 0) {
      res.json({ success: true, data: result.recordset[0] });
    } else {
      res.status(404).json({ success: false, message: 'No se encontró registro de entrada' });
    }
  } catch (error) {
    console.error('Error al obtener entrada:', error);
    res.status(500).json({ success: false, message: 'Error al obtener entrada', error: error.message });
  }
});

// Ruta para registrar un pago al liberar espacio
app.post('/api/registrar-pago', checkDbConnection, async (req, res) => {
  const { espacio_id, metodo_pago, monto_recibido, horas_estacionado } =
    req.body
  const transaction = new sql.Transaction(pool)

  try {
    await transaction.begin()

    // Obtener reserva activa
    const reservaResult = await new sql.Request(transaction).input(
      'espacio_id',
      sql.Int,
      espacio_id
    ).query(`
        SELECT TOP 1 reserva_id 
        FROM RESERVAS 
        WHERE espacio_id = @espacio_id 
          AND estado IN ('Confirmada', 'En curso')
        ORDER BY fecha_inicio DESC
      `)

    if (reservaResult.recordset.length === 0) {
      await transaction.rollback()
      return res
        .status(400)
        .json({ success: false, message: 'No hay reserva activa' })
    }

    const reserva_id = reservaResult.recordset[0].reserva_id

    // Obtener metodo_id
    const metodoResult = await new sql.Request(transaction)
      .input('nombre', sql.VarChar(50), metodo_pago)
      .query('SELECT metodo_id FROM METODO_PAGO WHERE nombre = @nombre')

    if (metodoResult.recordset.length === 0) {
      await transaction.rollback()
      return res
        .status(400)
        .json({ success: false, message: 'Método de pago no encontrado' })
    }

    const metodo_id = metodoResult.recordset[0].metodo_id

    // Insertar pago
    await new sql.Request(transaction)
      .input('reserva_id', sql.Int, reserva_id)
      .input('metodo_id', sql.Int, metodo_id)
      .input('monto', sql.Decimal(10, 2), monto_recibido).query(`
        INSERT INTO PAGOS (reserva_id, metodo_id, monto, estado, fecha_pago)
        VALUES (@reserva_id, @metodo_id, @monto, 'Completado', GETDATE())
      `)

    // Obtener datos de la reserva
    const movimientoResult = await new sql.Request(transaction).input(
      'espacio_id',
      sql.Int,
      espacio_id
    ).query(`
        SELECT TOP 1 usuario_id, placa 
        FROM MOVIMIENTOS 
        WHERE espacio_id = @espacio_id AND tipo IN ('Reserva', 'Entrada')
        ORDER BY fecha_hora DESC
      `)

    if (movimientoResult.recordset.length === 0) {
      await transaction.rollback()
      return res
        .status(400)
        .json({
          success: false,
          message: 'No se encontró el movimiento de reserva o entrada'
        })
    }

    const { usuario_id, placa } = movimientoResult.recordset[0]

    // Registrar salida
    await new sql.Request(transaction)
      .input('espacio_id', sql.Int, espacio_id)
      .input('usuario_id', sql.Int, usuario_id)
      .input('placa', sql.VarChar(20), placa)
      .input('tarifa_aplicada', sql.Decimal(10, 2), monto_recibido).query(`
        INSERT INTO MOVIMIENTOS (espacio_id, usuario_id, placa, tipo, fecha_hora, tarifa_aplicada)
        VALUES (@espacio_id, @usuario_id, @placa, 'Salida', GETDATE(), @tarifa_aplicada)
      `)

    // Liberar espacio
    await new sql.Request(transaction)
      .input('espacio_id', sql.Int, espacio_id)
      .query(
        "UPDATE ESPACIOS SET estado = 'Disponible' WHERE espacio_id = @espacio_id"
      )

    // Actualizar reserva
    await new sql.Request(transaction)
      .input('reserva_id', sql.Int, reserva_id)
      .query(
        "UPDATE RESERVAS SET estado = 'Finalizada' WHERE reserva_id = @reserva_id"
      )

    await transaction.commit()
    console.log('Pago registrado:', { espacio_id, metodo_pago, monto_recibido })
    res.json({ success: true, message: 'Pago registrado y espacio liberado' })
  } catch (error) {
    await transaction.rollback()
    console.error('Error al registrar pago:', error)
    res
      .status(500)
      .json({
        success: false,
        message: 'Error al registrar pago',
        error: error.message
      })
  }
})

// Ruta para el resumen de reportes
app.get('/api/reportes/resumen', async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) {
    return res.status(400).json({ success: false, message: 'Faltan fechas de inicio o fin' });
  }
  try {
    console.log('Consulta resumen:', { start, end });
    const result = await pool
      .request()
      .input('start', sql.Date, start)
      .input('end', sql.Date, end)
      .query(`
        SELECT 
          ISNULL(SUM(total), 0) AS ingresos,
          (SELECT AVG(CAST(ocupados AS FLOAT) / total * 100) 
           FROM VW_DISPONIBILIDAD 
           WHERE EXISTS (
             SELECT 1 FROM MOVIMIENTOS m 
             WHERE m.fecha_hora BETWEEN @start AND DATEADD(day, 1, @end)
           )) AS ocupacion,
          (SELECT COUNT(DISTINCT placa) 
           FROM MOVIMIENTOS 
           WHERE tipo = 'Entrada' 
           AND fecha_hora BETWEEN @start AND DATEADD(day, 1, @end)) AS movimientos
        FROM VW_INGRESOS_DIARIOS
        WHERE fecha BETWEEN @start AND @end
      `);
    console.log('Resultado resumen:', result.recordset);
    res.json({
      success: true,
      ingresos: result.recordset[0].ingresos || 0,
      ocupacion: result.recordset[0].ocupacion || 0,
      movimientos: result.recordset[0].movimientos || 0
    });
  } catch (error) {
    console.error('Error al cargar resumen:', error);
    res.status(500).json({ success: false, message: 'Error al cargar resumen' });
  }
});

// Ruta para ocupación
app.get('/api/reportes/ocupacion', async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ success: false, message: 'Faltan fechas de inicio o fin' });
    }
    console.log('Consulta ocupación:', { start, end });
    const result = await pool
      .request()
      .input('start', sql.DateTime, start)
      .input('end', sql.DateTime, end)
      .query(`
        SELECT 
          DATEPART(HOUR, fecha_hora) AS hora,
          COUNT(*) AS cantidad
        FROM MOVIMIENTOS
        WHERE tipo = 'Entrada'
          AND fecha_hora BETWEEN @start AND DATEADD(day, 1, @end)
        GROUP BY DATEPART(HOUR, fecha_hora)
        ORDER BY hora
      `);
    console.log('Resultado ocupación:', result.recordset);
    const data = Array(24).fill(0);
    result.recordset.forEach(row => {
      data[row.hora] = row.cantidad;
    });
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error en reporte ocupación:', error);
    res.status(500).json({ success: false, message: 'Error al generar reporte' });
  }
});

// Ruta para reporte detallado
app.get('/api/reportes/detalle', async (req, res) => {
  try {
    const { start, end, type } = req.query;
    if (!start || !end) {
      return res.status(400).json({ success: false, message: 'Faltan fechas de inicio o fin' });
    }

    // Validar formato de fechas (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(start) || !dateRegex.test(end)) {
      return res.status(400).json({ success: false, message: 'Formato de fecha inválido (use YYYY-MM-DD)' });
    }

    // Parsear fechas y ajustar zona horaria
    const startDate = new Date(start + 'T00:00:00.000Z');
    const endDate = new Date(end + 'T23:59:59.999Z');
    if (isNaN(startDate) || isNaN(endDate)) {
      return res.status(400).json({ success: false, message: 'Fechas no válidas' });
    }

    let query = `
      SELECT 
        CONVERT(VARCHAR, m.fecha_hora, 120) AS fecha,
        e.codigo AS espacio,
        m.tipo_vehiculo AS tipo_vehiculo,
        CONCAT(FLOOR(m.duracion_minutos / 60), 'h ', m.duracion_minutos % 60, 'm') AS tiempo,
        m.tarifa_aplicada AS ingreso,
        ISNULL(mp.nombre, 'Sin pago') AS metodo_pago
      FROM MOVIMIENTOS m
      JOIN ESPACIOS e ON m.espacio_id = e.espacio_id
      LEFT JOIN PAGOS p ON m.pago_id = p.pago_id
      LEFT JOIN METODO_PAGO mp ON p.metodo_id = mp.metodo_id
      WHERE m.tipo = 'Salida'
        AND m.fecha_hora BETWEEN @start AND @end
    `;
    const params = [
      { name: 'start', type: sql.DateTime, value: startDate },
      { name: 'end', type: sql.DateTime, value: endDate }
    ];
    if (type && type !== 'Todos') {
      query += ` AND m.tipo_vehiculo = @type`;
      params.push({ name: 'type', type: sql.VarChar(50), value: type });
    }
    query += ` ORDER BY m.fecha_hora DESC`;
    
    const request = pool.request();
    params.forEach(param => request.input(param.name, param.type, param.value));
    console.log('Consulta reporte detallado:', { query, params: params.map(p => ({ name: p.name, value: p.value })) });
    
    const result = await request.query(query);
    console.log('Resultado reporte detallado:', { count: result.recordset.length, records: result.recordset });
    
    res.json({ success: true, reportes: result.recordset });
  } catch (error) {
    console.error('Error en reporte detallado:', error.message);
    res.status(500).json({ success: false, message: 'Error al generar reporte', error: error.message });
  }
});

// Ruta para listar usuarios
app.get('/api/users', checkDbConnection, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', role = '' } = req.query;
    const offset = (page - 1) * limit;
    let query = `
      SELECT u.usuario_id, u.username, u.email, u.nombre, u.apellido, u.avatar_url, u.activo, u.ultimo_acceso, r.nombre AS rol
      FROM USUARIOS u
      JOIN ROLES r ON u.rol_id = r.rol_id
      WHERE 1=1
    `;
    const params = [];
    if (search) {
      query += ` AND (u.username LIKE @search OR u.email LIKE @search OR u.nombre LIKE @search OR u.apellido LIKE @search)`;
      params.push({ name: 'search', type: sql.VarChar, value: `%${search}%` });
    }
    if (role) {
      query += ` AND r.nombre = @role`;
      params.push({ name: 'role', type: sql.VarChar, value: role });
    }
    query += ` ORDER BY u.usuario_id OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`;
    params.push({ name: 'offset', type: sql.Int, value: offset }, { name: 'limit', type: sql.Int, value: parseInt(limit) });

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM USUARIOS u
      JOIN ROLES r ON u.rol_id = r.rol_id
      WHERE 1=1
      ${search ? 'AND (u.username LIKE @search OR u.email LIKE @search OR u.nombre LIKE @search OR u.apellido LIKE @search)' : ''}
      ${role ? 'AND r.nombre = @role' : ''}
    `;

    const request = pool.request();
    params.forEach(param => request.input(param.name, param.type, param.value));
    const result = await request.query(query);
    const countResult = await pool.request()
      .input('search', sql.VarChar, `%${search}%`)
      .input('role', sql.VarChar, role)
      .query(countQuery);

    res.json({
      success: true,
      users: result.recordset,
      totalPages: Math.ceil(countResult.recordset[0].total / limit)
    });
  } catch (error) {
    console.error('Error al obtener usuarios:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error al obtener usuarios'
    });
  }
});

// Ruta para actualizar usuario
app.put('/api/users/:id', checkDbConnection, async (req, res) => {
  try {
    const { id } = req.params;
    const { email, nombre, apellido, rol, activo } = req.body;

    if (!email || !nombre || !apellido || !rol) {
      return res.status(400).json({
        success: false,
        message: 'Email, nombre, apellido y rol son requeridos'
      });
    }

    const rolResult = await pool
      .request()
      .input('nombre', sql.VarChar, rol)
      .query('SELECT rol_id FROM ROLES WHERE nombre = @nombre');
    if (rolResult.recordset.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Rol inválido'
      });
    }
    const rol_id = rolResult.recordset[0].rol_id;

    await pool
      .request()
      .input('usuario_id', sql.Int, id)
      .input('email', sql.VarChar(100), email)
      .input('nombre', sql.VarChar(100), nombre)
      .input('apellido', sql.VarChar(100), apellido)
      .input('rol_id', sql.Int, rol_id)
      .input('activo', sql.Bit, activo ? 1 : 0)
      .query(`
        UPDATE USUARIOS
        SET email = @email, nombre = @nombre, apellido = @apellido, rol_id = @rol_id, activo = @activo
        WHERE usuario_id = @usuario_id
      `);

    res.json({
      success: true,
      message: 'Usuario actualizado exitosamente'
    });
  } catch (error) {
    console.error('Error al actualizar usuario:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar usuario'
    });
  }
});

// Ruta para eliminar usuario
app.delete('/api/users/:id', checkDbConnection, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool
      .request()
      .input('usuario_id', sql.Int, id)
      .query('UPDATE USUARIOS SET activo = 0 WHERE usuario_id = @usuario_id');

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Usuario eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar usuario:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar usuario'
    });
  }
});

// Ruta para obtener configuración general
app.get('/api/config/general', checkDbConnection, async (req, res) => {
  try {
    const result = await pool.request().query(`
      SELECT clave, valor
      FROM CONFIGURACION
      WHERE clave IN ('parking_nombre', 'parking_telefono', 'parking_email', 'parking_direccion')
    `);
    const config = {};
    result.recordset.forEach(row => {
      config[row.clave.replace('parking_', '')] = row.valor;
    });
    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('Error al obtener configuración general:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error al obtener configuración general'
    });
  }
});

// Ruta para guardar configuración general
app.post('/api/config/general', checkDbConnection, async (req, res) => {
  let transaction;
  try {
    const { nombre, telefono, email, direccion } = req.body;
    if (!nombre || !telefono || !email || !direccion) {
      return res.status(400).json({
        success: false,
        message: 'Todos los campos son requeridos'
      });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'El formato del email es inválido'
      });
    }
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // Consulta para parking_nombre
    let request = new sql.Request(transaction);
    await request
      .input('clave', sql.VarChar, 'parking_nombre')
      .input('valor', sql.Text, nombre)
      .query(`
        IF EXISTS (SELECT 1 FROM CONFIGURACION WHERE clave = @clave)
          UPDATE CONFIGURACION SET valor = @valor, fecha_actualizacion = GETDATE() WHERE clave = @clave
        ELSE
          INSERT INTO CONFIGURACION (clave, valor, tipo, modulo, descripcion)
          VALUES (@clave, @valor, 'String', 'General', 'Nombre del estacionamiento')
      `);

    // Consulta para parking_telefono
    request = new sql.Request(transaction);
    await request
      .input('clave', sql.VarChar, 'parking_telefono')
      .input('valor', sql.Text, telefono)
      .query(`
        IF EXISTS (SELECT 1 FROM CONFIGURACION WHERE clave = @clave)
          UPDATE CONFIGURACION SET valor = @valor, fecha_actualizacion = GETDATE() WHERE clave = @clave
        ELSE
          INSERT INTO CONFIGURACION (clave, valor, tipo, modulo, descripcion)
          VALUES (@clave, @valor, 'String', 'General', 'Teléfono del estacionamiento')
      `);

    // Consulta para parking_email
    request = new sql.Request(transaction);
    await request
      .input('clave', sql.VarChar, 'parking_email')
      .input('valor', sql.Text, email)
      .query(`
        IF EXISTS (SELECT 1 FROM CONFIGURACION WHERE clave = @clave)
          UPDATE CONFIGURACION SET valor = @valor, fecha_actualizacion = GETDATE() WHERE clave = @clave
        ELSE
          INSERT INTO CONFIGURACION (clave, valor, tipo, modulo, descripcion)
          VALUES (@clave, @valor, 'String', 'General', 'Email del estacionamiento')
      `);

    // Consulta para parking_direccion
    request = new sql.Request(transaction);
    await request
      .input('clave', sql.VarChar, 'parking_direccion')
      .input('valor', sql.Text, direccion)
      .query(`
        IF EXISTS (SELECT 1 FROM CONFIGURACION WHERE clave = @clave)
          UPDATE CONFIGURACION SET valor = @valor, fecha_actualizacion = GETDATE() WHERE clave = @clave
        ELSE
          INSERT INTO CONFIGURACION (clave, valor, tipo, modulo, descripcion)
          VALUES (@clave, @valor, 'String', 'General', 'Dirección del estacionamiento')
      `);

    await transaction.commit();
    res.json({
      success: true,
      message: 'Configuración general guardada exitosamente'
    });
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    console.error('Error al guardar configuración general:', error);
    res.status(500).json({
      success: false,
      message: 'Error al guardar configuración general',
      details: error.message
    });
  }
});

// Ruta para listar tarifas
app.get('/api/tarifas', checkDbConnection, async (req, res) => {
  try {
    const result = await pool.request().query(`
      SELECT t.tarifa_id, te.nombre AS tipo, t.monto AS primera_hora,
             t.monto * 0.5 AS horas_adicionales, t.monto * 5 AS dia_completo
      FROM TARIFAS t
      JOIN TIPO_ESPACIO te ON t.tipo_id = te.tipo_id
      WHERE t.tipo_tarifa = 'Hora'
    `);
    res.json({
      success: true,
      tarifas: result.recordset
    });
  } catch (error) {
    console.error('Error al obtener tarifas:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error al obtener tarifas'
    });
  }
});

// Ruta para crear tarifa
app.post('/api/tarifas', checkDbConnection, async (req, res) => {
  try {
    const { tipo_id, primera_hora, horas_adicionales, dia_completo } = req.body;
    if (!tipo_id || !primera_hora || !horas_adicionales || !dia_completo) {
      return res.status(400).json({
        success: false,
        message: 'Todos los campos son requeridos'
      });
    }
    const monto = parseFloat(primera_hora);
    await pool.request()
      .input('tipo_id', sql.Int, tipo_id)
      .input('monto', sql.Decimal(10, 2), monto)
      .query(`
        INSERT INTO TARIFAS (tipo_id, nombre, tipo_tarifa, monto, vigencia_desde)
        VALUES (@tipo_id, 'Tarifa por hora', 'Hora', @monto, GETDATE())
      `);
    res.json({
      success: true,
      message: 'Tarifa creada exitosamente'
    });
  } catch (error) {
    console.error('Error al crear tarifa:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error al crear tarifa'
    });
  }
});

// Ruta para actualizar tarifa
app.put('/api/tarifas/:id', checkDbConnection, async (req, res) => {
  try {
    const { id } = req.params;
    const { primera_hora, horas_adicionales, dia_completo } = req.body;
    if (!primera_hora || !horas_adicionales || !dia_completo) {
      return res.status(400).json({
        success: false,
        message: 'Todos los campos son requeridos'
      });
    }
    const monto = parseFloat(primera_hora);
    const result = await pool.request()
      .input('tarifa_id', sql.Int, id)
      .input('monto', sql.Decimal(10, 2), monto)
      .query(`
        UPDATE TARIFAS
        SET monto = @monto
        WHERE tarifa_id = @tarifa_id
      `);
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tarifa no encontrada'
      });
    }
    res.json({
      success: true,
      message: 'Tarifa actualizada exitosamente'
    });
  } catch (error) {
    console.error('Error al actualizar tarifa:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar tarifa'
    });
  }
});

// Ruta para listar roles
app.get('/api/roles', checkDbConnection, async (req, res) => {
  try {
    const result = await pool.request().query(`
      SELECT rol_id, nombre, descripcion, permisos
      FROM ROLES
      WHERE activo = 1
    `);
    res.json({
      success: true,
      roles: result.recordset
    });
  } catch (error) {
    console.error('Error al obtener roles:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error al obtener roles'
    });
  }
});

// Ruta para obtener un rol específico
app.get('/api/roles/:id', checkDbConnection, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.request()
      .input('rol_id', sql.Int, id)
      .query(`
        SELECT rol_id, nombre, descripcion, permisos
        FROM ROLES
        WHERE rol_id = @rol_id AND activo = 1
      `);
    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Rol no encontrado'
      });
    }
    res.json({
      success: true,
      rol: result.recordset[0]
    });
  } catch (error) {
    console.error('Error al obtener rol:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error al obtener rol'
    });
  }
});

// Ruta para crear rol
app.post('/api/roles', checkDbConnection, async (req, res) => {
  try {
    const { nombre, descripcion, permisos } = req.body;
    if (!nombre || !permisos) {
      return res.status(400).json({
        success: false,
        message: 'Nombre y permisos son requeridos'
      });
    }
    await pool.request()
      .input('nombre', sql.VarChar(50), nombre)
      .input('descripcion', sql.VarChar(255), descripcion || null)
      .input('permisos', sql.Text, JSON.stringify(permisos))
      .query(`
        INSERT INTO ROLES (nombre, descripcion, permisos)
        VALUES (@nombre, @descripcion, @permisos)
      `);
    res.json({
      success: true,
      message: 'Rol creado exitosamente'
    });
  } catch (error) {
    console.error('Error al crear rol:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error al crear rol'
    });
  }
});

// Ruta para actualizar rol
app.put('/api/roles/:id', checkDbConnection, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, permisos } = req.body;
    if (!nombre || !permisos) {
      return res.status(400).json({
        success: false,
        message: 'Nombre y permisos son requeridos'
      });
    }
    const result = await pool.request()
      .input('rol_id', sql.Int, id)
      .input('nombre', sql.VarChar(50), nombre)
      .input('descripcion', sql.VarChar(255), descripcion || null)
      .input('permisos', sql.Text, JSON.stringify(permisos))
      .query(`
        UPDATE ROLES
        SET nombre = @nombre, descripcion = @descripcion, permisos = @permisos
        WHERE rol_id = @rol_id
      `);
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({
        success: false,
        message: 'Rol no encontrado'
      });
    }
    res.json({
      success: true,
      message: 'Rol actualizado exitosamente'
    });
  } catch (error) {
    console.error('Error al actualizar rol:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar rol'
    });
  }
});

// Ruta para configuración de backup
app.post('/api/config/backup', checkDbConnection, async (req, res) => {
  let transaction;
  try {
      const { frecuencia, directorio } = req.body;
      if (!frecuencia || !directorio) {
          return res.status(400).json({
              success: false,
              message: 'Frecuencia y directorio son requeridos'
          });
      }
      transaction = new sql.Transaction(pool);
      await transaction.begin();

      // Query for backup_frecuencia
      let request = new sql.Request(transaction);
      await request
          .input('clave', sql.VarChar, 'backup_frecuencia')
          .input('valor', sql.Text, frecuencia)
          .query(`
              IF EXISTS (SELECT 1 FROM CONFIGURACION WHERE clave = @clave)
                  UPDATE CONFIGURACION SET valor = @valor, fecha_actualizacion = GETDATE() WHERE clave = @clave
              ELSE
                  INSERT INTO CONFIGURACION (clave, valor, tipo, modulo, descripcion, fecha_creacion, fecha_actualizacion)
                  VALUES (@clave, @valor, 'String', 'Backup', 'Frecuencia de backup', GETDATE(), GETDATE())
          `);

      // Query for backup_directorio
      request = new sql.Request(transaction);
      await request
          .input('clave', sql.VarChar, 'backup_directorio')
          .input('valor', sql.Text, directorio)
          .query(`
              IF EXISTS (SELECT 1 FROM CONFIGURACION WHERE clave = @clave)
                  UPDATE CONFIGURACION SET valor = @valor, fecha_actualizacion = GETDATE() WHERE clave = @clave
              ELSE
                  INSERT INTO CONFIGURACION (clave, valor, tipo, modulo, descripcion, fecha_creacion, fecha_actualizacion)
                  VALUES (@clave, @valor, 'String', 'Backup', 'Directorio de backup', GETDATE(), GETDATE())
          `);

      await transaction.commit();
      res.json({
          success: true,
          message: 'Configuración de backup guardada exitosamente'
      });
  } catch (error) {
      if (transaction) {
          await transaction.rollback();
      }
      console.error('Error al guardar configuración de backup:', error);
      res.status(500).json({
          success: false,
          message: 'Error al guardar configuración de backup',
          details: error.message
      });
  }
});

// Ruta para realizar backup
app.post('/api/backup', checkDbConnection, async (req, res) => {
  try {
    // Obtener el directorio de backup desde CONFIGURACION
    const configResult = await pool.request()
      .query("SELECT valor FROM CONFIGURACION WHERE clave = 'backup_directorio'");
    
    if (!configResult.recordset.length) {
      throw new Error('Directorio de backup no configurado');
    }
    
    const backupDir = configResult.recordset[0].valor;
    
    // Asegurar que el directorio exista
    await fs.mkdir(backupDir, { recursive: true });
    
    // Generar nombre único para el archivo de backup
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dbName = process.env.DB_NAME || 'ParkingAdmin';
    const backupFile = path.join(backupDir, `Backup_${dbName}_${timestamp}.bak`);
    
    // Ejecutar comando de backup
    await pool.request()
      .query(`
        BACKUP DATABASE [${dbName}]
        TO DISK = '${backupFile}'
        WITH INIT, FORMAT, NAME = 'Full Backup of ${dbName}'
      `);
    
    console.log(`Backup realizado: ${backupFile}`);
    res.json({
      success: true,
      message: 'Backup realizado exitosamente'
    });
  } catch (error) {
    console.error('Error al realizar backup:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error al realizar backup',
      details: error.message
    });
  }
});


// Manejador de errores global
app.use((err, req, res, next) => {
  console.error('Error global:', err.message)
  res.status(500).json({
    success: false,
    message: 'Error interno del servidor'
  })
})

// Ruta 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Ruta no encontrada'
  })
})

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

// Manejo de cierre de conexión
process.on('SIGINT', async () => {
  try {
    await pool.close()
    console.log('Conexión a la base de datos cerrada')
    process.exit(0)
  } catch (err) {
    console.error('Error al cerrar la conexión:', err.message)
    process.exit(1)
  }
})
