const mongoose = require('mongoose');

const pacienteSchema = new mongoose.Schema({
    nombre: { type: String, required: true },
    telefono: { type: String, required: true, unique: true }, // Número de WhatsApp del paciente
    ciudad: { type: String, required: true },
    // Esta línea mágica es la que enlazará al paciente con el ortodoncista de tu red
    doctorAsignado: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
    fechaRegistro: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Paciente', pacienteSchema);