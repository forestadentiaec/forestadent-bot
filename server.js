require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

// 1. Conexión a la Base de Datos (Importada del nuevo archivo)
const { inicializarCatalogo } = require('./modelos/BaseDatos');
mongoose.connect(process.env.MONGO_URI)
    .then(() => { console.log('🟢 Conectado a MongoDB Atlas'); inicializarCatalogo(); })
    .catch((err) => console.error('🔴 Error MongoDB:', err));

// 2. Conectar las Rutas (Pantallas y Bot)
app.use('/', require('./rutas/admin'));
app.use('/', require('./rutas/bot'));
app.use('/', require('./rutas/recordatorios'));

// 3. Encender el Servidor
app.listen(PORT, () => { console.log(`🚀 Motor Modularizado encendido en el puerto ${PORT}`); });