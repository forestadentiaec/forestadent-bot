require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

// --- 1. CONEXIÓN A MONGODB ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('🟢 Conectado a MongoDB Atlas');
        inicializarCatalogo(); 
    })
    .catch((error) => console.error('🔴 Error MongoDB:', error));

// --- 2. ESTRUCTURAS DE LA BASE DE DATOS ---
const usuarioSchema = new mongoose.Schema({
    telefono: String,
    nombre_whatsapp: String,
    estado_conversacion: { type: String, default: 'inicio' },
    tipo_establecimiento: { type: String, default: 'consultorio' },
    etiquetas: { type: String, default: '' }, 
    notas: { type: String, default: '' },
    ultima_campana: { type: String, default: '' }, // 🚨 Rastreador de la última promoción recibida
    fecha_registro: { type: Date, default: Date.now }
});
const Usuario = mongoose.model('Usuario', usuarioSchema);

const solicitudSchema = new mongoose.Schema({
    telefono_cliente: String,
    nombre_cliente: String,
    tipo_solicitud: String, 
    contenido_texto: String,
    estado_atencion: { type: String, default: 'pendiente' },
    id_campana_relacionada: { type: String, default: '' }, // Para saber qué curso pagó
    fecha: { type: Date, default: Date.now }
});
const Solicitud = mongoose.model('Solicitud', solicitudSchema);

const productoSchema = new mongoose.Schema({
    codigo: String,
    nombre: String,
    categoria: String,
    precio: Number,
    empaque: String
});
const Producto = mongoose.model('Producto', productoSchema);

// 🚨 NUEVA BASE DE DATOS PARA MÉTRICAS DE CAMPAÑAS
const campanaSchema = new mongoose.Schema({
    nombre_campana: String,
    mensaje_cuerpo: String,
    enlace_pdf: String,
    datos_bancarios: String,
    fecha_envio: { type: Date, default: Date.now },
    metricas_enviados: { type: Number, default: 0 },
    metricas_info: { type: Number, default: 0 },
    metricas_reservas: { type: Number, default: 0 },
    metricas_pagos: { type: Number, default: 0 }
});
const Campana = mongoose.model('Campana', campanaSchema);

const productosIniciales = [
    { codigo: "202-3743", nombre: "Arco acero recto superior .017x.025", categoria: "Arcos", precio: 1.00, empaque: "Paquete de 10 unidades" },
    { codigo: "202-3843", nombre: "Arco acero recto inferior .017x.025", categoria: "Arcos", precio: 1.00, empaque: "Paquete de 10 unidades" }
];

async function inicializarCatalogo() {
    try { const conteo = await Producto.countDocuments(); if (conteo === 0) await Producto.insertMany(productosIniciales); } 
    catch (error) { console.error(error); }
}

// --- 3. CEREBRO DE INTELIGENCIA ARTIFICIAL ---
async function analizarPedidoConIA(texto_del_cliente) {
    const modelos = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'];
    const prompt = `Eres un asistente comercial. Pedido informal: "${texto_del_cliente}". Devuelve ÚNICAMENTE un arreglo JSON con "producto" y "cantidad".`;
    for (const modelo of modelos) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${process.env.GEMINI_API_KEY}`;
            const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
            const data = await response.json();
            if (data.error) continue; return JSON.parse(data.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim());
        } catch (error) { continue; }
    } return null;
}

async function generarCotizacionConIA(texto_del_cliente, catalogo) {
    const modelos = ['gemini-3.8-flash', 'gemini-3.5-flash'];
    let catalogoTexto = catalogo.map(p => `- ${p.nombre} | Precio Unidad: $${(p.precio || 0).toFixed(2)} | Empaque: ${p.empaque}`).join('\n');
    const prompt = `Cotizar: "${texto_del_cliente}"\nCatálogo:\n${catalogoTexto}\nREGLA: Precio Unidad es 1 pieza suelta. Multiplica según cantidad o empaque. Formato: Saludo, Lista detallada, Total. No preguntas al final.`;
    for (const modelo of modelos) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${process.env.GEMINI_API_KEY}`;
            const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
            const data = await response.json();
            if (data.error) continue; return data.candidates[0].content.parts[0].text.trim();
        } catch (error) { continue; }
    } return "Error generando cotización.";
}

// --- 4. CONFIGURACIÓN VISUAL DEL PORTAL ---
const htmlHead = `
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap" rel="stylesheet">
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script>
        tailwind.config = { theme: { extend: { colors: { forestaBlack: '#111111', forestaGold: '#B4975A', forestaGoldHover: '#9a814b' }, fontFamily: { sans: ['Montserrat', 'sans-serif'] } } } }
    </script>
`;

const menuNavegacion = `
    <div class="flex justify-between items-center mb-6 bg-white p-6 rounded-xl shadow-sm border-t-4 border-forestaGold">
        <div class="flex items-center gap-6">
            <img src="/logo-vector-forestadent.webp" alt="Forestadent Logo" class="h-16 object-contain" onerror="this.style.display='none'">
            <div><h1 class="text-3xl font-extrabold text-forestaBlack uppercase tracking-wider">Torre de Control</h1><p class="text-sm text-forestaGold font-bold tracking-widest uppercase">Ecuador B2B</p></div>
        </div>
        <span class="bg-forestaGold text-white px-5 py-2 rounded shadow font-bold text-sm uppercase tracking-wide">🟢 Sistema Activo</span>
    </div>
    <div class="flex flex-wrap gap-3 mb-8">
        <a href="/admin/dashboard" class="bg-blue-900 hover:bg-blue-800 text-white px-5 py-3 rounded shadow font-bold transition uppercase text-xs tracking-wide">📊 Dashboard BI</a>
        <a href="/admin" class="bg-forestaBlack hover:bg-gray-800 text-white px-5 py-3 rounded shadow font-bold transition uppercase text-xs tracking-wide">📦 Pedidos</a>
        <a href="/admin/clientes" class="bg-forestaGold hover:bg-forestaGoldHover text-white px-5 py-3 rounded shadow font-bold transition uppercase text-xs tracking-wide">👥 CRM</a>
        <a href="/admin/catalogo" class="bg-white border-2 border-forestaBlack text-forestaBlack hover:bg-gray-50 px-5 py-3 rounded shadow font-bold transition uppercase text-xs tracking-wide">📖 Catálogo</a>
        <a href="/admin/broadcast" class="bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded shadow font-bold transition uppercase text-xs tracking-wide">📢 Broadcast & Cursos</a>
    </div>
`;
const scriptExportarExcel = `<script>function exportarExcel(nombre) { let wb = XLSX.utils.table_to_book(document.querySelector("table")); XLSX.writeFile(wb, nombre + ".xlsx"); }</script>`;

// 🚨 PANTALLA BROADCAST RENOVADA (SÁNDWICH + MÉTRICAS)
app.get('/admin/broadcast', async (req, res) => {
    try {
        const clientes = await Usuario.find().sort({ nombre_whatsapp: 1 });
        const historialCampanas = await Campana.find().sort({ fecha_envio: -1 });

        let listaCheckboxes = '';
        clientes.forEach(c => { listaCheckboxes += `<label class="flex items-center gap-3 p-3 hover:bg-gray-100 rounded-lg cursor-pointer border border-transparent hover:border-gray-200"><input type="checkbox" value="${c.telefono}" class="checkbox-manual w-5 h-5 text-green-600 rounded"><span class="text-sm font-bold text-forestaBlack">${c.nombre_whatsapp} <span class="text-gray-400 font-medium ml-1">(+${c.telefono})</span></span></label>`; });
        
        let filasHistorial = '';
        historialCampanas.forEach(camp => {
            filasHistorial += `
            <tr class="hover:bg-gray-50 border-b border-gray-100">
                <td class="p-4 text-xs font-medium text-gray-500">${new Date(camp.fecha_envio).toLocaleDateString('es-EC')}</td>
                <td class="p-4 font-bold text-forestaBlack">${camp.nombre_campana}</td>
                <td class="p-4 text-center font-bold text-gray-600">${camp.metricas_enviados}</td>
                <td class="p-4 text-center font-bold text-blue-600 bg-blue-50">${camp.metricas_info}</td>
                <td class="p-4 text-center font-bold text-yellow-600 bg-yellow-50">${camp.metricas_reservas}</td>
                <td class="p-4 text-center font-bold text-green-600 bg-green-50">${camp.metricas_pagos}</td>
            </tr>`;
        });

        let html = `<!DOCTYPE html><html lang="es"><head><title>Forestadent | Campañas</title>${htmlHead}</head><body class="bg-gray-50 p-8 font-sans"><div class="max-w-7xl mx-auto">${menuNavegacion}
        
        <div class="bg-white p-8 rounded-xl shadow-lg border-l-8 border-green-600 mb-8">
            <h2 class="text-2xl font-extrabold text-forestaBlack mb-2 uppercase tracking-wide">📢 Gestor de Campañas y Cursos</h2>
            <p class="text-gray-500 font-medium mb-8">Envía promociones y recauda pagos automáticamente.</p>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                    <!-- SECCIÓN PÚBLICO -->
                    <label class="block text-sm font-bold text-forestaBlack uppercase mb-2">1. Selecciona tu público objetivo</label>
                    <select id="tipoFiltro" onchange="mostrarOpcionFiltro()" class="w-full border-2 border-gray-200 focus:border-green-600 rounded p-3 text-sm font-bold text-forestaBlack outline-none mb-4 cursor-pointer">
                        <option value="todos">🌍 Enviar a TODOS los clientes</option>
                        <option value="establecimiento">🏥 Filtrar por Tipo de Establecimiento</option>
                        <option value="etiqueta">🏷️ Filtrar por Etiqueta del CRM</option>
                        <option value="manual">🎯 Seleccionar manualmente</option>
                    </select>
                    <div id="cajaValorEstablecimiento" class="hidden mb-4"><select id="valorEstablecimiento" class="w-full border-2 border-gray-200 rounded p-3 text-sm font-medium outline-none"><option value="consultorio">Consultorio</option><option value="clínica">Clínica</option></select></div>
                    <div id="cajaValorEtiqueta" class="hidden mb-4"><input type="text" id="valorEtiqueta" placeholder="Ej: VIP" class="w-full border-2 border-gray-200 rounded p-3 text-sm font-medium outline-none"></div>
                    <div id="cajaValorManual" class="hidden mb-4"><div class="border-2 border-gray-200 rounded p-4 max-h-60 overflow-y-auto">${listaCheckboxes}</div></div>

                    <!-- SECCIÓN CONTENIDO ESTRATÉGICO -->
                    <label class="block text-sm font-bold text-forestaBlack uppercase mb-2 mt-6">2. Estructura de la Campaña</label>
                    <input type="text" id="nombreCampana" placeholder="Nombre interno (Ej: Seminario FACE Octubre)" class="w-full border-2 border-gray-200 focus:border-green-600 rounded p-3 text-sm font-bold text-forestaBlack outline-none mb-3" required>
                    <input type="text" id="linkCampana" placeholder="🔗 Enlace del PDF o Info (Opcional - Se envía si responden INFO)" class="w-full border-2 border-gray-200 focus:border-blue-500 rounded p-3 text-sm font-medium text-forestaBlack outline-none mb-3">
                    <textarea id="bancoCampana" rows="2" placeholder="🏦 Datos Bancarios (Opcional - Se envía si responden RESERVAR)\nEj: Cta Corriente Pichincha #123456 a nombre de..." class="w-full border-2 border-gray-200 focus:border-yellow-500 rounded p-3 text-sm font-medium text-forestaBlack outline-none mb-3"></textarea>

                    <label class="block text-sm font-bold text-forestaBlack uppercase mb-2 mt-4">3. Oferta Principal (El cuerpo del mensaje)</label>
                    <textarea id="mensajeCampana" rows="5" placeholder="Escribe aquí el motivo del mensaje..." class="w-full border-2 border-gray-200 focus:border-green-600 rounded p-4 text-sm font-medium text-forestaBlack outline-none"></textarea>
                    
                    <button onclick="dispararCampana()" id="btnEnviar" class="mt-6 w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-8 rounded shadow transition uppercase text-sm tracking-widest flex justify-center items-center gap-2">
                        🚀 Lanzar Campaña
                    </button>
                    <p id="textoCarga" class="text-sm text-green-600 font-bold mt-4 text-center hidden">⏳ Enviando... no cierres la página.</p>
                </div>
                
                <!-- VISTA PREVIA SÁNDWICH -->
                <div class="bg-gray-100 rounded-xl p-6 flex flex-col items-center justify-start border-4 border-dashed border-gray-200">
                    <p class="text-xs text-gray-400 font-bold mb-4 uppercase tracking-widest">Vista Previa del Celular</p>
                    <div class="bg-white p-5 rounded-xl shadow-sm w-full max-w-sm relative">
                        <p class="text-sm text-gray-800 font-medium mb-4">🦷 ¡Hola Dr. Juan Pérez! Espero que tengas un excelente día. ✨</p>
                        <p id="vistaPrevia" class="text-sm text-forestaBlack font-bold whitespace-pre-wrap">[Tu oferta aparecerá aquí]</p>
                        <p class="text-sm text-gray-800 font-medium mt-4 italic">👉 Para más información o reservar tu cupo, responde a este mensaje con la palabra <strong>INFO</strong>.</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- 🚨 NUEVA TABLA DE MÉTRICAS -->
        <div class="bg-white p-8 rounded-xl shadow-lg border border-gray-100">
            <h2 class="text-xl font-extrabold text-forestaBlack mb-6 uppercase tracking-wide">📊 Historial y Rendimiento de Campañas</h2>
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-forestaBlack text-white uppercase text-xs tracking-wider">
                            <th class="p-4">Fecha</th><th class="p-4">Campaña</th>
                            <th class="p-4 text-center">Enviados</th>
                            <th class="p-4 text-center">👀 Pidieron INFO</th>
                            <th class="p-4 text-center">🎟️ Reservas</th>
                            <th class="p-4 text-center">✅ Pagados</th>
                        </tr>
                    </thead>
                    <tbody>${filasHistorial || '<tr><td colspan="6" class="p-5 text-center text-gray-400 font-medium">Aún no hay campañas registradas.</td></tr>'}</tbody>
                </table>
            </div>
        </div>
        </div>
        
        <script>
            document.getElementById('mensajeCampana').addEventListener('input', function(e) { 
                let texto = e.target.value || '[Tu oferta aparecerá aquí]'; 
                texto = texto.replace(/</g, "&lt;").replace(/>/g, "&gt;"); 
                texto = texto.replace(/\\*(.*?)\\*/g, '<strong>$1</strong>'); 
                texto = texto.replace(/_(.*?)_/g, '<em>$1</em>'); 
                document.getElementById('vistaPrevia').innerHTML = texto; 
            }); 
            
            function mostrarOpcionFiltro() { 
                const filtro = document.getElementById('tipoFiltro').value; 
                document.getElementById('cajaValorEstablecimiento').classList.add('hidden'); 
                document.getElementById('cajaValorEtiqueta').classList.add('hidden'); 
                document.getElementById('cajaValorManual').classList.add('hidden'); 
                if (filtro === 'establecimiento') document.getElementById('cajaValorEstablecimiento').classList.remove('hidden'); 
                if (filtro === 'etiqueta') document.getElementById('cajaValorEtiqueta').classList.remove('hidden'); 
                if (filtro === 'manual') document.getElementById('cajaValorManual').classList.remove('hidden'); 
            } 
            
            async function dispararCampana() { 
                const nombre = document.getElementById('nombreCampana').value;
                const enlace = document.getElementById('linkCampana').value;
                const banco = document.getElementById('bancoCampana').value;
                const mensaje = document.getElementById('mensajeCampana').value; 
                const filtro = document.getElementById('tipoFiltro').value; 
                let valorFiltro = ''; let telefonosManuales = []; 
                
                if (filtro === 'establecimiento') valorFiltro = document.getElementById('valorEstablecimiento').value; 
                if (filtro === 'etiqueta') valorFiltro = document.getElementById('valorEtiqueta').value; 
                if (filtro === 'manual') { 
                    const checkboxes = document.querySelectorAll('.checkbox-manual:checked'); 
                    checkboxes.forEach(cb => telefonosManuales.push(cb.value)); 
                    if (telefonosManuales.length === 0) return alert("Selecciona al menos un doctor."); 
                } 
                
                if (!nombre.trim()) return alert("Ponle un nombre a la campaña.");
                if (!mensaje.trim()) return alert("El cuerpo del mensaje está vacío."); 
                if (!confirm('🚨 ¿Estás seguro de lanzar esta campaña oficial?')) return; 
                
                document.getElementById('btnEnviar').classList.add('hidden'); document.getElementById('textoCarga').classList.remove('hidden'); 
                
                try { 
                    const response = await fetch('/admin/broadcast/enviar', { 
                        method: 'POST', 
                        headers: { 'Content-Type': 'application/json' }, 
                        body: JSON.stringify({ nombre, enlace, banco, mensaje, filtro, valorFiltro, telefonosManuales }) 
                    }); 
                    const result = await response.json(); 
                    if (result.success) { alert('✅ ¡Campaña disparada! (' + result.intentos + ' envíos)'); window.location.reload(); } 
                    else { alert('❌ ERROR META:\\n' + result.error_meta); window.location.reload(); } 
                } catch (error) { console.error(error); alert('Error de conexión.'); } 
            }
        </script></body></html>`;
        res.send(html);
    } catch (error) { res.status(500).send("Error."); }
});

// 🚨 MOTOR DE BROADCAST CON CREACIÓN DE CAMPAÑA Y SÁNDWICH
app.post('/admin/broadcast/enviar', async (req, res) => {
    try {
        const { nombre, enlace, banco, mensaje, filtro, valorFiltro, telefonosManuales } = req.body;
        let query = {};
        if (filtro === 'establecimiento' && valorFiltro) { query = { tipo_establecimiento: valorFiltro }; } 
        else if (filtro === 'etiqueta' && valorFiltro) { query = { etiquetas: { $regex: valorFiltro, $options: 'i' } }; } 
        else if (filtro === 'manual' && telefonosManuales && telefonosManuales.length > 0) { query = { telefono: { $in: telefonosManuales } }; }
        
        const destinatarios = await Usuario.find(query);
        if (destinatarios.length === 0) return res.status(200).json({ success: false, error_meta: "No se encontraron clientes." });

        // 1. Creamos la base de la Campaña para métricas
        const nuevaCampana = new Campana({ nombre_campana: nombre, mensaje_cuerpo: mensaje, enlace_pdf: enlace, datos_bancarios: banco, metricas_enviados: destinatarios.length });
        await nuevaCampana.save();

        let erroresEncontrados = [];

        for (const dest of destinatarios) {
            // 2. Armamos el Sándwich con el nombre real
            const saludo = `🦷 *¡Hola ${dest.nombre_whatsapp}! Espero que tengas un excelente día.* ✨\n\n`;
            const pie = `\n\n👉 _Para más información o reservar tu cupo, responde a este mensaje con la palabra *INFO*._`;
            const mensajeSuelto = mensaje.replace(/{{nombre}}/gi, dest.nombre_whatsapp);
            const mensajeFinal = saludo + mensajeSuelto + pie;
            
            // 3. Huella en CRM y asignación de "última campaña"
            const nuevaNota = (dest.notas || '') + `\n[📢 ${new Date().toLocaleDateString('es-EC')}]: ${nombre}`;
            await Usuario.findByIdAndUpdate(dest._id, { notas: nuevaNota.trim(), ultima_campana: nuevaCampana._id.toString() });

            // 4. Disparo a Meta
            const metaResponse = await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, { 
                method: 'POST', headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ messaging_product: 'whatsapp', to: dest.telefono, type: 'text', text: { body: mensajeFinal } }) 
            });
            
            const metaData = await metaResponse.json();
            if (metaData.error) { erroresEncontrados.push(`Bloqueado +${dest.telefono}: ${metaData.error.message}`); }
            await new Promise(r => setTimeout(r, 500));
        }
        
        if (erroresEncontrados.length > 0) { res.status(200).json({ success: false, error_meta: erroresEncontrados[0] }); } 
        else { res.status(200).json({ success: true, intentos: destinatarios.length }); }
    } catch (error) { res.status(500).json({ success: false, error_meta: "Error del servidor." }); }
});

// PANTALLAS ADMINISTRATIVAS
app.get('/admin', async (req, res) => {
    try {
        const solicitudes = await Solicitud.find().sort({ fecha: -1 });
        let html = `<!DOCTYPE html><html lang="es"><head><title>Forestadent | Pedidos</title>${htmlHead}</head><body class="bg-gray-50 p-8 font-sans"><div class="max-w-7xl mx-auto">${menuNavegacion}<div class="bg-white p-4 rounded-xl shadow-sm mb-6 flex flex-col md:flex-row gap-4 items-center border border-gray-100"><input type="text" id="buscador" onkeyup="filtrarTabla()" placeholder="🔍 Buscar doctor..." class="border-2 border-gray-200 focus:border-forestaGold rounded p-3 text-sm font-medium w-full outline-none"><select id="filtroTipo" onchange="filtrarTabla()" class="border-2 border-gray-200 rounded p-3 text-sm font-bold outline-none cursor-pointer"><option value="todos">📋 Todos</option><option value="pedido">📦 Pedidos</option><option value="cotizacion">💬 Cotizaciones</option><option value="contacto">👤 Contactos</option><option value="validacion_pago">💰 Pagos</option></select><select id="filtroEstado" onchange="filtrarTabla()" class="border-2 border-gray-200 rounded p-3 text-sm font-bold outline-none cursor-pointer"><option value="todos">🚦 Todos</option><option value="pendiente">🟡 Pendientes</option><option value="despachado">🟢 Completados</option></select><button onclick="exportarExcel('Reporte')" class="bg-green-600 text-white px-5 py-3 rounded shadow font-bold text-sm">📥 Excel</button></div><div class="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100"><table class="w-full text-left border-collapse"><thead><tr class="bg-forestaBlack text-white uppercase text-sm tracking-wider"><th class="p-5">Fecha</th><th class="p-5">Cliente</th><th class="p-5">Detalle / Acción</th><th class="p-5 text-center">Estado</th><th class="p-5 text-center">Acción Operativa</th></tr></thead><tbody class="divide-y divide-gray-100">`;
        solicitudes.forEach(sol => { 
            let fecha = new Date(sol.fecha).toLocaleString('es-EC'); let contenidoVisual = `<div class="text-sm font-medium whitespace-pre-wrap">${sol.contenido_texto}</div>`;
            if(sol.tipo_solicitud === 'pedido') { try { let pr = JSON.parse(sol.contenido_texto); contenidoVisual = '<ul class="list-disc pl-5 text-sm">'; pr.forEach(i => { contenidoVisual += `<li><strong>${i.cantidad}</strong> x ${i.producto}</li>`; }); contenidoVisual += '</ul>'; } catch (e) { } }
            
            let badgeColor = sol.estado_atencion === 'pendiente' ? 'bg-yellow-100 text-yellow-800 border border-yellow-300' : 'bg-gray-100 text-gray-500 border border-gray-300';
            if(sol.estado_atencion === 'despachado' || sol.estado_atencion === 'pago_aprobado') badgeColor = 'bg-green-100 text-green-800 border border-green-300';
            
            let botonAccion = '';
            // 🚨 BOTÓN DE APROBAR PAGO
            if (sol.tipo_solicitud === 'validacion_pago' && sol.estado_atencion === 'pendiente') {
                botonAccion = `<button onclick="aprobarPago('${sol._id}', '${sol.id_campana_relacionada}')" class="bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-4 py-2 rounded shadow uppercase tracking-wide">✅ Aprobar Pago</button>`;
            } else if (sol.estado_atencion === 'pendiente' && sol.tipo_solicitud === 'pedido') {
                botonAccion = `<button onclick="actualizarEstado('${sol._id}', 'despachado')" class="bg-forestaBlack hover:bg-gray-800 text-white text-xs font-bold px-4 py-2 rounded shadow uppercase">📦 Despachar</button>`;
            } else if (sol.estado_atencion === 'pendiente') {
                botonAccion = `<button onclick="actualizarEstado('${sol._id}', 'despachado')" class="bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-bold px-4 py-2 rounded shadow uppercase">✔️ Cerrar Caso</button>`;
            } else {
                botonAccion = `<span class="text-xs text-gray-400 font-bold uppercase">✔️ Listo</span>`;
            }

            html += `<tr class="fila-dato hover:bg-gray-50 transition" data-tipo="${sol.tipo_solicitud}" data-estado="${sol.estado_atencion}"><td class="p-5 text-sm text-gray-500 font-medium">${fecha}</td><td class="p-5 font-bold text-forestaBlack">${sol.nombre_cliente}<br><span class="text-xs font-normal text-gray-500">+${sol.telefono_cliente}</span></td><td class="p-5">${contenidoVisual}</td><td class="p-5 text-center"><span class="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest ${badgeColor}">${sol.estado_atencion.replace('_', ' ')}</span></td><td class="p-5 text-center">${botonAccion}</td></tr>`; 
        });
        html += `</tbody></table></div></div>${scriptExportarExcel}<script>function filtrarTabla() { let txt = document.getElementById('buscador').value.toLowerCase(); let tipo = document.getElementById('filtroTipo').value; let est = document.getElementById('filtroEstado').value; let filas = document.querySelectorAll('.fila-dato'); filas.forEach(f => { let show = f.innerText.toLowerCase().includes(txt) && (tipo==='todos'||f.dataset.tipo===tipo) && (est==='todos'||(est==='pendiente'?f.dataset.estado==='pendiente':f.dataset.estado!=='pendiente')); f.style.display = show ? '' : 'none'; }); } async function actualizarEstado(id, nuevo) { if(!confirm('¿Cerrar caso?')) return; await fetch('/admin/estado', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({id, estado: nuevo}) }); window.location.reload(); } async function aprobarPago(idSol, idCamp) { if(!confirm('¿Aprobar el pago y notificar al doctor?')) return; await fetch('/admin/pago/aprobar', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ id_solicitud: idSol, id_campana: idCamp }) }); window.location.reload(); }</script></body></html>`;
        res.send(html);
    } catch (error) { res.status(500).send('Error.'); }
});

// 🚨 RUTA PARA APROBAR PAGO
app.post('/admin/pago/aprobar', async (req, res) => {
    try {
        const { id_solicitud, id_campana } = req.body;
        const solicitud = await Solicitud.findByIdAndUpdate(id_solicitud, { estado_atencion: 'pago_aprobado' });
        if (id_campana) await Campana.findByIdAndUpdate(id_campana, { $inc: { metricas_pagos: 1 } });
        
        const mensaje_exito = `🎉 *¡Pago Aprobado y Confirmado!*\n\nTu plaza está 100% asegurada. Nos emociona mucho contar contigo. Si hay material previo, te lo enviaremos por este medio en los próximos días.`;
        await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: solicitud.telefono_cliente, type: 'text', text: { body: mensaje_exito } }) });
        
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false }); }
});

// RUTAS AUXILIARES ESTÁNDAR
app.post('/admin/estado', async (req, res) => { try { await Solicitud.findByIdAndUpdate(req.body.id, { estado_atencion: req.body.estado }); res.status(200).json({ success: true }); } catch (error) { res.status(500).json({ success: false }); } });
app.get('/admin/dashboard', async (req, res) => { res.send(`<!DOCTYPE html><html><head>${htmlHead}</head><body class="p-8">${menuNavegacion}<h2 class="text-2xl font-bold">📊 Las métricas principales ahora están dentro de la pestaña Broadcast.</h2></body></html>`); });
app.get('/admin/clientes', async (req, res) => { res.send(`<!DOCTYPE html><html><head>${htmlHead}</head><body class="p-8">${menuNavegacion}<h2 class="text-2xl font-bold">👥 Para no saturar, el CRM está funcional pero su vista se ha simplificado en este MVP. Los datos se guardan correctamente.</h2></body></html>`); });
app.get('/admin/catalogo', async (req, res) => { res.send(`<!DOCTYPE html><html><head>${htmlHead}</head><body class="p-8">${menuNavegacion}<h2 class="text-2xl font-bold">📖 Para no saturar, el Catálogo está funcional pero su vista se ha simplificado en este MVP.</h2></body></html>`); });

// --- 5. RUTAS DE WHATSAPP (BOT Y EMBUDO) ---
app.get('/webhook', (req, res) => { if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === process.env.VERIFY_TOKEN) { res.status(200).send(req.query['hub.challenge']); } else { res.sendStatus(403); } });
async function enviarMensajeInmediato(telefono, texto_mensaje) { try { await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: telefono, type: 'text', text: { body: texto_mensaje } }) }); } catch (error) {} }

app.post('/webhook', async (req, res) => {
    const body = req.body;
    res.sendStatus(200); 

    if (body.object && body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
        let valor = body.entry[0].changes[0].value;
        let from = valor.messages[0].from; 
        let msg_type = valor.messages[0].type;
        let msg_body = msg_type === 'text' ? valor.messages[0].text.body.trim() : ''; 
        let nombre_cliente = valor.contacts[0].profile.name; 

        if (from !== '16315551181') {
            try {
                let usuario = await Usuario.findOne({ telefono: from });
                let mensaje_respuesta = '';
                const texto_menu = `1️⃣ Catálogo\n2️⃣ Cotizar Productos\n3️⃣ Nuevo Pedido\n4️⃣ Contacto\n5️⃣ Estado de Cuenta`;

                if (!usuario) { usuario = new Usuario({ telefono: from, nombre_whatsapp: nombre_cliente }); await usuario.save(); }

                // 🚨 1. EL DOCTOR ENVÍA LA FOTO DEL COMPROBANTE
                if (msg_type === 'image' && usuario.estado_conversacion === 'esperando_pago') {
                    const nuevaSolicitud = new Solicitud({ 
                        telefono_cliente: from, nombre_cliente: nombre_cliente, tipo_solicitud: 'validacion_pago', id_campana_relacionada: usuario.ultima_campana,
                        contenido_texto: '💰 [COMPROBANTE RECIBIDO]\nEl doctor envió una FOTO por WhatsApp. Por favor, revisa tu celular de empresa para ver la imagen y aprueba el pago aquí si es correcto.' 
                    });
                    await nuevaSolicitud.save();
                    usuario.estado_conversacion = 'menu_principal'; await usuario.save();
                    return await enviarMensajeInmediato(from, "📸 *¡Comprobante recibido exitosamente!*\n\nNuestro equipo administrativo está validando la transferencia. Te enviaremos tu confirmación oficial en un momento. ¡Gracias!");
                }
                // (Si manda imagen pero no estaba pagando, la ignoramos suavemente)
                else if (msg_type === 'image') {
                    return await enviarMensajeInmediato(from, "Recibí tu imagen. Si deseas hacer un pedido, por favor escribe *Menu*.");
                }

                // 🚨 2. EL DOCTOR PIDE INFO DE LA CAMPAÑA
                if (msg_body.toLowerCase() === 'info') {
                    if (usuario.ultima_campana) {
                        const campanaActiva = await Campana.findById(usuario.ultima_campana);
                        if (campanaActiva) {
                            await Campana.findByIdAndUpdate(campanaActiva._id, { $inc: { metricas_info: 1 } });
                            mensaje_respuesta = `¡Excelente decisión, ${nombre_cliente}! 🎉\n\nAquí tienes toda la información detallada:\n🔗 ${campanaActiva.enlace_pdf || 'Sin enlace'}\n\n🎟️ *¿Deseas asegurar tu cupo ahora mismo?*\nResponde a este mensaje con la palabra *RESERVAR*.`;
                            usuario.estado_conversacion = 'esperando_reserva'; await usuario.save();
                        } else { mensaje_respuesta = `Lo siento, la campaña ya no está disponible. Escribe *Menu* para otras opciones.`; }
                    } else { mensaje_respuesta = `No tienes campañas activas. Escribe *Menu*.`; }
                }
                // 🚨 3. EL DOCTOR DICE RESERVAR
                else if (msg_body.toLowerCase() === 'reservar' && usuario.estado_conversacion === 'esperando_reserva') {
                    const campanaActiva = await Campana.findById(usuario.ultima_campana);
                    if (campanaActiva) {
                        await Campana.findByIdAndUpdate(campanaActiva._id, { $inc: { metricas_reservas: 1 } });
                        mensaje_respuesta = `✅ *¡Tu pre-reserva está confirmada!*\n\nPara finalizar, realiza la transferencia a:\n\n${campanaActiva.datos_bancarios || 'Cta. Empresa Forestadent'}\n\n📸 *IMPORTANTE:* Cuando transfieras, envíame la foto o captura del comprobante por aquí mismo.`;
                        usuario.estado_conversacion = 'esperando_pago'; await usuario.save();
                    }
                }
                // FLUJO ESTÁNDAR
                else if (msg_body.toLowerCase() === 'menu' || msg_body.toLowerCase() === 'menú') {
                    usuario.estado_conversacion = 'menu_principal'; await usuario.save(); mensaje_respuesta = texto_menu;
                } 
                else if (usuario.estado_conversacion === 'esperando_pedido') {
                    await enviarMensajeInmediato(from, "⏳ Organizando...");
                    const data = await analizarPedidoConIA(msg_body);
                    if (data) {
                        const nuevaSolicitud = new Solicitud({ telefono_cliente: from, nombre_cliente: nombre_cliente, tipo_solicitud: 'pedido', contenido_texto: JSON.stringify(data) });
                        await nuevaSolicitud.save();
                        mensaje_respuesta = `✅ ¡Pedido procesado! Pronto despacharemos.`;
                    } else { mensaje_respuesta = `Error analizando.`; }
                    usuario.estado_conversacion = 'menu_principal'; await usuario.save();
                } 
                else if (usuario.estado_conversacion === 'esperando_cotizacion') {
                    await enviarMensajeInmediato(from, "⏳ Calculando...");
                    const cat = await Producto.find().lean();
                    const cot = await generarCotizacionConIA(msg_body, cat);
                    mensaje_respuesta = cot + `\n\n¿Deseas pedirlo? Responde *Menu* para volver.`;
                    usuario.estado_conversacion = 'menu_principal'; await usuario.save();
                } 
                else if (usuario.estado_conversacion === 'menu_principal' || usuario.estado_conversacion === 'inicio') {
                    if (usuario.estado_conversacion === 'inicio') { usuario.estado_conversacion = 'menu_principal'; await usuario.save(); }
                    switch(msg_body) {
                        case '1': mensaje_respuesta = `📘 *Catálogo*\nhttps://www.forestadent.com`; break;
                        case '2': usuario.estado_conversacion = 'esperando_cotizacion'; await usuario.save(); mensaje_respuesta = `Escribe a cotizar:`; break;
                        case '3': usuario.estado_conversacion = 'esperando_pedido'; await usuario.save(); mensaje_respuesta = `Escribe tu pedido:`; break;
                        case '4': usuario.estado_conversacion = 'esperando_contacto'; await usuario.save(); mensaje_respuesta = `Motivo de consulta:`; break;
                        case '5': mensaje_respuesta = `Revisando estado...`; break;
                        default: mensaje_respuesta = `No reconocí. \n\n` + texto_menu; break;
                    }
                } else { mensaje_respuesta = `Recibí tu mensaje.\n\n_(Escribe *Menu*)_`; }
                
                if (mensaje_respuesta !== '') {
                    await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: from, type: 'text', text: { body: mensaje_respuesta } }) });
                }
            } catch (error) { console.error('🔴 Error:', error); }
        }
    }
});

app.listen(PORT, () => { console.log(`🚀 Motor encendido en puerto ${PORT}`); });