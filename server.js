require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// --- CONEXIÓN A LA BASE DE DATOS (MONGODB) ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('🟢 Conectado exitosamente a la base de datos MongoDB Atlas'))
    .catch((error) => console.error('🔴 Error conectando a MongoDB:', error));

// --- RUTA DE PRUEBA LOCAL ---
app.get('/', (req, res) => {
    res.send('Servidor de Forestadent Connect operando y conectado a BD.');
});

// --- INICIO DE CONFIGURACIÓN DE WHATSAPP (WEBHOOK) ---

// Ruta GET: Meta la usa por única vez para confirmar que somos los dueños del servidor
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
            console.log('✅ Webhook verificado exitosamente por Meta');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403); // Rechaza peticiones si la contraseña no coincide
        }
    }
});

// Ruta POST: Por aquí entrarán todos los mensajes de los ortodoncistas y pacientes
app.post('/webhook', (req, res) => {
    const body = req.body;

    // Verificamos que la petición venga realmente de la API de WhatsApp
    if (body.object) {
        if (body.entry && 
            body.entry[0].changes && 
            body.entry[0].changes[0].value.messages && 
            body.entry[0].changes[0].value.messages[0]) {
            
            let from = body.entry[0].changes[0].value.messages[0].from; // Número de quien escribe
            let msg_body = body.entry[0].changes[0].value.messages[0].text.body; // Lo que escribió

            console.log(`📩 Nuevo mensaje de WhatsApp de [${from}]: ${msg_body}`);
        }
        res.sendStatus(200); // Le decimos a Meta "Recibido, gracias" para que no reenvíe el mensaje
    } else {
        res.sendStatus(404);
    }
});
// --- FIN DE CONFIGURACIÓN DE WHATSAPP ---

// --- ENCENDIDO DEL MOTOR ---
app.listen(PORT, () => {
    console.log(`🚀 Motor encendido y escuchando en el puerto ${PORT}`);
});