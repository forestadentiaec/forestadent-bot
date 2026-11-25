const mongoose = require('mongoose');
const crypto = require('crypto');

// ==========================================
// HELPERS DE SEGURIDAD PARA CONTRASEÑAS (NATIVO NODE.JS)
// ==========================================
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
    return `${salt}:${derived}`;
}

function verificarPassword(password, storedHash) {
    if (!storedHash || !storedHash.includes(':')) return false;
    const [salt, key] = storedHash.split(':');
    const derived = crypto.scryptSync(String(password), salt, 64);
    const keyBuf = Buffer.from(key, 'hex');
    if (derived.length !== keyBuf.length) return false;
    return crypto.timingSafeEqual(derived, keyBuf);
}

function generarPasswordTemporal() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let pass = 'FD-';
    for (let i = 0; i < 6; i++) {
        pass += chars.charAt(crypto.randomInt(0, chars.length));
    }
    return pass;
}

// 1. CRM DE CLIENTES Y FICHAS PROFESIONALES
const usuarioSchema = new mongoose.Schema({
    telefono: String,
    nombre_whatsapp: String,
    ciudad: { type: String, default: 'Quito' },
    direccion: { type: String, default: '' },
    especialidad: { type: String, default: 'Ortodoncia' },
    cumpleanos: { type: String, default: '' },
    estado_conversacion: { type: String, default: 'inicio' },
    tipo_establecimiento: { type: String, default: 'consultorio' },
    etiquetas: { type: String, default: '' }, 
    notas: { type: String, default: '' },
    ultima_campana: { type: String, default: '' },
    fecha_registro: { type: Date, default: Date.now }
});
const Usuario = mongoose.model('Usuario', usuarioSchema);

// 2. GESTIÓN DE PEDIDOS Y COTIZACIONES
const solicitudSchema = new mongoose.Schema({
    telefono_cliente: String,
    nombre_cliente: String,
    tipo_solicitud: String, // 'pedido', 'cotizacion', 'validacion_pago'
    contenido_texto: String,
    estado_atencion: { type: String, default: 'pendiente' }, // 'pendiente', 'despachado', 'pago_aprobado'
    id_campana_relacionada: { type: String, default: null },
    fecha: { type: Date, default: Date.now }
});
const Solicitud = mongoose.model('Solicitud', solicitudSchema);

// 3. CATÁLOGO DE PRODUCTOS E INTELIGENCIA DE INVENTARIO
const productoSchema = new mongoose.Schema({
    codigo: String,
    nombre: String,
    categoria: String,
    precio: Number,
    empaque: String,
    descripcion: { type: String, default: '' },
    imagen_url: { type: String, default: '' },
    imagen_public_id: { type: String, default: '' },
    stock_actual: { type: Number, default: 0 }, 
    stock_seguridad: { type: Number, default: 10 }, 
    lead_time_dias: { type: Number, default: 30 } 
});
const Producto = mongoose.model('Producto', productoSchema);

const productosIniciales = [
    { codigo: "202-3743", nombre: "Arco acero recto superior .017x.025", categoria: "Arcos", precio: 1.00, empaque: "Paquete de 10 unidades", stock_actual: 50, stock_seguridad: 15, lead_time_dias: 30 },
    { codigo: "202-3843", nombre: "Arco acero recto inferior .017x.025", categoria: "Arcos", precio: 1.00, empaque: "Paquete de 10 unidades", stock_actual: 12, stock_seguridad: 15, lead_time_dias: 30 }
];

async function inicializarCatalogo() {
    try {
        const conteo = await Producto.countDocuments();
        if (conteo === 0) await Producto.insertMany(productosIniciales);
    } catch (error) { console.error("Error inicializando catálogo:", error); }
}

// 4. HISTORIAL DE CAMPAÑAS, CURSOS Y RECORDATORIOS
const campanaSchema = new mongoose.Schema({
    nombre_campana: String,
    mensaje_cuerpo: String,
    enlace_pdf: String,
    datos_bancarios: String,
    fecha_evento: { type: Date, default: null },
    recordatorio_enviado: { type: Boolean, default: false },
    fecha_envio: { type: Date, default: Date.now },
    metricas_enviados: { type: Number, default: 0 },
    metricas_info: { type: Number, default: 0 },
    metricas_reservas: { type: Number, default: 0 },
    metricas_pagos: { type: Number, default: 0 }
});
const Campana = mongoose.model('Campana', campanaSchema);

// 5. TICKETS DE ACCESO (CÓDIGOS QR Y DIPLOMAS)
const ticketSchema = new mongoose.Schema({
    id_unico: String,
    telefono_cliente: String,
    nombre_cliente: String,
    nombre_evento: String,
    asistencia_confirmada: { type: Boolean, default: false },
    fecha_emision: { type: Date, default: Date.now },
    fecha_escaneo: { type: Date, default: null }
});
const Ticket = mongoose.model('Ticket', ticketSchema);

// 6. MULTI-TENANT: DOCTORES, CLÍNICAS Y UNIVERSIDADES ALIADAS
const clinicaSchema = new mongoose.Schema({
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    nombre: { type: String, required: true, trim: true },
    tipo: { type: String, default: 'consultorio' }, // 'consultorio', 'clinica', 'universidad'
    responsable: { type: String, default: '' },
    telefono_whatsapp: { type: String, default: '' },
    ciudad: { type: String, default: 'Quito' },
    direccion: { type: String, default: '' },
    horarios: { type: String, default: 'Lunes a Viernes 09:00 - 18:00' },
    logo_url: { type: String, default: '' },
    logo_public_id: { type: String, default: '' },
    color_primario: { type: String, default: '#0b1f38' },
    color_acento: { type: String, default: '#cda434' },
    servicios: { type: String, default: 'Ortodoncia convencional, Autoligado estético y metálico, Alineadores invisibles, Valoración inicial' },
    mensaje_bienvenida: { type: String, default: '¡Hola! Soy el asistente virtual del consultorio. Déjame tus datos para ayudarte con información de tratamientos y agendar tu valoración.' },
    instrucciones_ia: { type: String, default: '' },
    // Credenciales de acceso privado del doctor/clínica
    usuario_acceso: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password_hash: { type: String, required: true },
    debe_cambiar_password: { type: Boolean, default: true },
    activo: { type: Boolean, default: true },
    // Espacios reservados para Fase 3B (WhatsApp Cloud API propia opcional)
    whatsapp_api_phone_id: { type: String, default: '' },
    whatsapp_api_token: { type: String, default: '' },
    fecha_creacion: { type: Date, default: Date.now }
});
const Clinica = mongoose.model('Clinica', clinicaSchema);

// 7. MULTI-TENANT: PACIENTES CAPTURADOS POR CADA CLÍNICA (AISLADOS DE TU CRM B2B)
const pacienteClinicaSchema = new mongoose.Schema({
    clinica_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinica', required: true, index: true },
    clinica_slug: { type: String, required: true, index: true },
    nombre: { type: String, required: true, trim: true },
    telefono: { type: String, required: true, trim: true },
    motivo: { type: String, default: '' },
    resumen_ia: { type: String, default: '' },
    estado: { type: String, default: 'nuevo' }, // 'nuevo', 'contactado', 'agendado', 'descartado'
    notas: { type: String, default: '' },
    fecha: { type: Date, default: Date.now }
});
const PacienteClinica = mongoose.model('PacienteClinica', pacienteClinicaSchema);

module.exports = {
    Usuario,
    Solicitud,
    Producto,
    Campana,
    Ticket,
    Clinica,
    PacienteClinica,
    inicializarCatalogo,
    hashPassword,
    verificarPassword,
    generarPasswordTemporal
};