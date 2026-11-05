require('dotenv').config();
const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// 1. CONFIGURACIÓN DE MIDDLEWARES
// ==========================================
app.set('view engine', 'ejs'); // <-- Agregado para que el servidor pueda dibujar las vistas HTML/EJS
app.set('views', './vistas');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); // Permite cargar recursos como el logo de Forestadent

// ==========================================
// 2. CONFIGURACIÓN DE SEGURIDAD (EL LLAVERO)
// ==========================================
app.use(session({
    secret: 'foresta_b2b_seguridad_extrema_2026',
    resave: false,
    saveUninitialized: false
}));

// ==========================================
// 3. CONEXIÓN A BASE DE DATOS MONGODB
// ==========================================
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ Conectado a MongoDB Atlas'))
    .catch(err => console.error('❌ Error conectando a MongoDB:', err));

// ==========================================
// 4. RUTAS OPTIMIZADAS (SEPARADAS EN MÓDULOS)
// ==========================================

// A. Rutas de la Página Web Pública (Landing Page)
const rutasWeb = require('./rutas/web');
app.use('/', rutasWeb);

// B. Rutas de la Torre de Control (Con Candado)
const rutasAdmin = require('./rutas/admin');
app.use('/', rutasAdmin);

// C. Rutas del Bot de WhatsApp (IA y Webhook)
const rutasBot = require('./rutas/bot');
app.use('/', rutasBot);

app.listen(PORT, () => {
    console.log(`🚀 Servidor B2B de Forestadent corriendo en el puerto ${PORT}`);
});