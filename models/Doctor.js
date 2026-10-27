const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema({
    nombre: { type: String, required: true },
    telefono: { type: String, required: true, unique: true }, // Número de WhatsApp
    ciudad: { type: String, required: true },
    nivel: { type: String, default: 'regular' }, // Clasificación: VIP, regular, prospecto
    puntosFidelizacion: { type: Number, default: 0 }, // Para el programa de recompensas
    fechaRegistro: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Doctor', doctorSchema);