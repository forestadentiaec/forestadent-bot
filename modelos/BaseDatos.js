const mongoose = require('mongoose');

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

module.exports = {
    Usuario,
    Solicitud,
    Producto,
    Campana,
    Ticket,
    inicializarCatalogo
};