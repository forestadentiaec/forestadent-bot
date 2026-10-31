require('dotenv').config();
const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// 1. CONFIGURACIÓN DE MIDDLEWARES
// ==========================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); // Permite cargar tu logo-vector-forestadent.webp

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
// 4. RUTAS DE LA TORRE DE CONTROL (CON CANDADO)
// ==========================================
const rutasAdmin = require('./rutas/admin');
app.use('/', rutasAdmin);

// ==========================================
// 5. RUTAS DEL BOT DE WHATSAPP (WEBHOOK)
// ==========================================
// Nota para Néstor: Asegúrate de que el archivo que controla 
// los mensajes de WhatsApp esté conectado aquí abajo.
// Ejemplo:
// const rutasBot = require('./rutas/bot');
// app.use('/webhook', rutasBot);

app.listen(PORT, () => {
    console.log(`🚀 Servidor B2B de Forestadent corriendo en el puerto ${PORT}`);
});