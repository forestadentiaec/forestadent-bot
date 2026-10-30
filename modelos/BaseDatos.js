const mongoose = require('mongoose');

// 1. CRM DE CLIENTES
const usuarioSchema = new mongoose.Schema({
    telefono: String,
    nombre_whatsapp: String,
    estado_conversacion: { type: String, default: 'inicio' },
    tipo_establecimiento: { type: String, default: 'consultorio' },
    etiquetas: { type: String, default: '' }, 
    notas: { type: String, default: '' },
    ultima_campana: { type: String, default: '' },
    fecha_registro: { type: Date, default: Date.now }
});
const Usuario = mongoose.model('Usuario', usuarioSchema);

// 2. PEDIDOS Y COTIZACIONES
const solicitudSchema = new mongoose.Schema({
    telefono_cliente: String,
    nombre_cliente: String,
    tipo_solicitud: String, 
    contenido_texto: String,
    estado_atencion: { type: String, default: 'pendiente' },
    id_campana_relacionada: { type: String, default: '' },
    fecha: { type: Date, default: Date.now }
});
const Solicitud = mongoose.model('Solicitud', solicitudSchema);

// 3. CATÁLOGO DE PRODUCTOS
const productoSchema = new mongoose.Schema({
    codigo: String,
    nombre: String,
    categoria: String,
    precio: Number,
    empaque: String
});
const Producto = mongoose.model('Producto', productoSchema);

// 4. HISTORIAL DE CAMPAÑAS Y MÉTRICAS
const campanaSchema = new mongoose.Schema({
    nombre_campana: String,
    mensaje_cuerpo: String,
    enlace_pdf: String,
    datos_bancarios: String,
    fecha_evento: { type: Date, default: null }, // 🚨 NUEVO: Fecha y hora en que ocurrirá el evento
    recordatorio_enviado: { type: Boolean, default: false }, // 🚨 NUEVO: Para saber si ya se mandó la alerta
    fecha_envio: { type: Date, default: Date.now },
    metricas_enviados: { type: Number, default: 0 },
    metricas_info: { type: Number, default: 0 },
    metricas_reservas: { type: Number, default: 0 },
    metricas_pagos: { type: Number, default: 0 }
});
const Campana = mongoose.model('Campana', campanaSchema);

// 🚨 5. NUEVO: SISTEMA DE TICKETS Y EVENTOS
const ticketSchema = new mongoose.Schema({
    id_unico: String, // Código alfanumérico del ticket (Ej: FST-A8F9)
    telefono_cliente: String,
    nombre_cliente: String,
    nombre_evento: String,
    asistencia_confirmada: { type: Boolean, default: false }, // Cambiará a true cuando lo escanees
    fecha_emision: { type: Date, default: Date.now },
    fecha_escaneo: { type: Date, default: null }
});
const Ticket = mongoose.model('Ticket', ticketSchema);


// FUNCIÓN DE INICIO
const productosIniciales = [
    { codigo: "202-3743", nombre: "Arco acero recto superior .017x.025", categoria: "Arcos", precio: 1.00, empaque: "Paquete de 10 unidades" },
    { codigo: "202-3843", nombre: "Arco acero recto inferior .017x.025", categoria: "Arcos", precio: 1.00, empaque: "Paquete de 10 unidades" }
];

async function inicializarCatalogo() {
    try {
        const conteo = await Producto.countDocuments();
        if (conteo === 0) await Producto.insertMany(productosIniciales);
    } catch (error) { console.error("Error inicializando catálogo:", error); }
}

// 🚨 EXPORTAMOS LOS MODELOS INCLUYENDO EL TICKET
module.exports = {
    Usuario,
    Solicitud,
    Producto,
    Campana,
    Ticket,
    inicializarCatalogo
};