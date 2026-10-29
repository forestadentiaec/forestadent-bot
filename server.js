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
    fecha_registro: { type: Date, default: Date.now }
});
const Usuario = mongoose.model('Usuario', usuarioSchema);

const solicitudSchema = new mongoose.Schema({
    telefono_cliente: String,
    nombre_cliente: String,
    tipo_solicitud: String, 
    contenido_texto: String,
    estado_atencion: { type: String, default: 'pendiente' }, 
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

const productosIniciales = [
    { codigo: "202-3743", nombre: "Arco acero recto superior .017x.025", categoria: "Arcos", precio: 1.00, empaque: "Paquete de 10 unidades" },
    { codigo: "202-3843", nombre: "Arco acero recto inferior .017x.025", categoria: "Arcos", precio: 1.00, empaque: "Paquete de 10 unidades" },
    { codigo: "202-3745", nombre: "Arco acero recto superior .018x.025", categoria: "Arcos", precio: 1.00, empaque: "Paquete de 10 unidades" }
];

async function inicializarCatalogo() {
    try {
        const conteo = await Producto.countDocuments();
        if (conteo === 0) await Producto.insertMany(productosIniciales);
    } catch (error) { console.error("Error inicializando catálogo:", error); }
}

// --- 3. CEREBRO DE INTELIGENCIA ARTIFICIAL ---
async function analizarPedidoConIA(texto_del_cliente) {
    const modelos = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'];
    const prompt = `Eres un asistente comercial. Pedido informal o cotización: "${texto_del_cliente}". Devuelve ÚNICAMENTE un arreglo JSON con las claves "producto" y "cantidad" (solo números). Ejemplo: [{"producto": "Tubo molar Roth", "cantidad": 5}]`;
    for (const modelo of modelos) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${process.env.GEMINI_API_KEY}`;
            const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
            const data = await response.json();
            if (data.error) continue; 
            return JSON.parse(data.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim());
        } catch (error) { continue; }
    }
    return null;
}

async function generarCotizacionConIA(texto_del_cliente, catalogo) {
    const modelos = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'];
    let catalogoTexto = catalogo.map(p => `- ${p.nombre} | Precio por Unidad: $${(p.precio || 0).toFixed(2)} | Viene en: ${p.empaque}`).join('\n');
    
    const prompt = `Eres el experto comercial de Forestadent Ecuador. El cliente solicita cotizar: "${texto_del_cliente}"\nAquí tienes la base de datos de productos (Precios con IVA incluido):\n${catalogoTexto}\nREGLA DE ORO COMERCIAL: El "Precio por Unidad" es por 1 sola pieza suelta.\n- Si pide "piezas", multiplicas cantidad x precio.\n- Si pide "paquete" o "funda", lees "Viene en" y multiplicas. Ejemplo: 1 paquete = 10 unidades x Precio Unidad.\nFormato OBLIGATORIO: Saludo amable, Lista detallada (Cantidad x Nombre = Subtotal), Total final a pagar. 🚨 PROHIBIDO TERMINAR CON PREGUNTAS.`;

    for (const modelo of modelos) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${process.env.GEMINI_API_KEY}`;
            const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
            const data = await response.json();
            if (data.error) continue; 
            return data.candidates[0].content.parts[0].text.trim();
        } catch (error) { continue; }
    }
    return "Lo siento, tuve un problema procesando tu cotización.";
}

// --- 4. PORTAL WEB DE ADMINISTRACIÓN ---
const htmlHead = `
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap" rel="stylesheet">
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <!-- 🚨 LIBRERÍA PARA CONVERTIR HTML A PDF -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
    <script>
        tailwind.config = { 
            theme: { 
                extend: { 
                    colors: { forestaBlack: '#111111', forestaGold: '#B4975A', forestaGoldHover: '#9a814b' },
                    fontFamily: { sans: ['Montserrat', 'sans-serif'] }
                } 
            } 
        }
    </script>
`;

const menuNavegacion = `
    <div class="flex justify-between items-center mb-6 bg-white p-6 rounded-xl shadow-sm border-t-4 border-forestaGold">
        <div class="flex items-center gap-6">
            <img src="/logo-vector-forestadent.webp" alt="Forestadent Logo" class="h-16 object-contain" onerror="this.style.display='none'">
            <div>
                <h1 class="text-3xl font-extrabold text-forestaBlack uppercase tracking-wider">Torre de Control</h1>
                <p class="text-sm text-forestaGold font-bold tracking-widest uppercase">Ecuador B2B</p>
            </div>
        </div>
        <span class="bg-forestaGold text-white px-5 py-2 rounded shadow font-bold text-sm uppercase tracking-wide">🟢 Sistema Activo</span>
    </div>
    <div class="flex flex-wrap gap-3 mb-8">
        <a href="/admin/dashboard" class="bg-blue-900 hover:bg-blue-800 text-white px-5 py-3 rounded shadow font-bold transition uppercase text-xs tracking-wide">📊 Dashboard BI</a>
        <a href="/admin" class="bg-forestaBlack hover:bg-gray-800 text-white px-5 py-3 rounded shadow font-bold transition uppercase text-xs tracking-wide">📦 Pedidos</a>
        <a href="/admin/clientes" class="bg-forestaGold hover:bg-forestaGoldHover text-white px-5 py-3 rounded shadow font-bold transition uppercase text-xs tracking-wide">👥 CRM</a>
        <a href="/admin/catalogo" class="bg-white border-2 border-forestaBlack text-forestaBlack hover:bg-gray-50 px-5 py-3 rounded shadow font-bold transition uppercase text-xs tracking-wide">📖 Catálogo</a>
        <a href="/admin/broadcast" class="bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded shadow font-bold transition uppercase text-xs tracking-wide">📢 Broadcast</a>
    </div>
`;
const scriptExportarExcel = `<script>function exportarExcel(nombreArchivo) { let tableOriginal = document.querySelector("table"); let tableCopia = document.createElement("table"); let rows = tableOriginal.querySelectorAll("tr"); rows.forEach(row => { if(row.style.display !== 'none') { let newRow = row.cloneNode(true); if(newRow.children.length > 0) { newRow.removeChild(newRow.lastElementChild); } let inputs = newRow.querySelectorAll("input, select, textarea"); inputs.forEach(input => { let textNode = document.createTextNode(input.value || input.options?.[input.selectedIndex]?.text || ''); input.parentNode.replaceChild(textNode, input); }); tableCopia.appendChild(newRow); } }); let wb = XLSX.utils.table_to_book(tableCopia, {sheet: "Reporte"}); XLSX.writeFile(wb, nombreArchivo + ".xlsx"); }</script>`;

// 🚨 RUTA PÚBLICA PARA PROFORMAS WEB
app.get('/proforma/:id', async (req, res) => {
    try {
        const solicitud = await Solicitud.findById(req.params.id);
        if (!solicitud || solicitud.tipo_solicitud !== 'cotizacion') return res.status(404).send('Proforma no encontrada.');

        const fechaCorta = new Date(solicitud.fecha).toLocaleDateString('es-EC', { year: 'numeric', month: 'long', day: 'numeric' });
        const numeroProforma = solicitud._id.toString().slice(-6).toUpperCase();
        let textoLimpio = solicitud.contenido_texto.replace(/\*/g, '').replace(/_/g, '').replace(/~/g, '');

        let html = `<!DOCTYPE html><html lang="es"><head><title>Proforma | Forestadent</title>${htmlHead}</head>
        <body class="bg-gray-100 p-4 md:p-10 font-sans">
            <div id="documento-pdf" class="bg-white p-8 md:p-12 rounded-xl shadow-2xl max-w-3xl mx-auto border-t-8 border-forestaGold">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 border-b-2 border-gray-100 pb-6">
                    <img src="/logo-vector-forestadent.webp" class="h-12 md:h-16 mb-4 md:mb-0" onerror="this.style.display='none'; this.insertAdjacentHTML('afterend', '<h2 class=\\'text-2xl font-black text-forestaBlack\\'>FORESTADENT</h2>')">
                    <div class="text-left md:text-right">
                        <h1 class="text-2xl md:text-3xl font-extrabold text-forestaBlack uppercase tracking-widest">Proforma Comercial</h1>
                        <p class="text-sm font-bold text-forestaGold tracking-widest mt-1">DOC-${numeroProforma}</p>
                    </div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <div>
                        <p class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Preparado para:</p>
                        <p class="text-lg font-bold text-forestaBlack">${solicitud.nombre_cliente}</p>
                        <p class="text-sm font-medium text-gray-500">+${solicitud.telefono_cliente}</p>
                    </div>
                    <div class="md:text-right">
                        <p class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Fecha de Emisión:</p>
                        <p class="text-sm font-bold text-gray-800">${fechaCorta}</p>
                        <p class="text-xs font-medium text-gray-400 mt-2">Validez: 15 días</p>
                    </div>
                </div>
                <div class="bg-gray-50 p-6 md:p-8 rounded-xl border border-gray-200 mb-10">
                    <pre class="whitespace-pre-wrap font-sans text-sm md:text-base font-medium text-gray-800 leading-relaxed">${textoLimpio}</pre>
                </div>
                <div class="text-center border-t-2 border-gray-100 pt-6">
                    <p class="text-xs font-bold text-gray-400 uppercase tracking-widest">Documento Generado por IA • Forestadent Ecuador B2B</p>
                    <p class="text-xs font-medium text-gray-400 mt-1">Los precios incluyen impuestos de ley aplicables.</p>
                </div>
            </div>
            <div class="text-center mt-8 space-x-4 hide-on-print">
                <button onclick="descargarPDF()" class="bg-forestaBlack hover:bg-gray-800 text-white font-bold py-4 px-8 rounded shadow-lg uppercase text-sm tracking-widest transition transform hover:scale-105">📥 Descargar Proforma en PDF</button>
            </div>
            <style>@media print { .hide-on-print { display: none !important; } body { background-color: white; padding: 0; } #documento-pdf { box-shadow: none; border-top: none; } }</style>
            <script>function descargarPDF() { const elemento = document.getElementById('documento-pdf'); const opciones = { margin: 10, filename: 'Proforma_Forestadent_${numeroProforma}.pdf', image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } }; html2pdf().set(opciones).from(elemento).save(); }</script>
        </body></html>`;
        res.send(html);
    } catch (error) { res.status(500).send("Error al generar la proforma."); }
});


// MÓDULOS DEL ADMINISTRADOR (PANEL DE CONTROL)
app.get('/admin/dashboard', async (req, res) => {
    try {
        const totalClientes = await Usuario.countDocuments();
        const solicitudes = await Solicitud.find();
        const pedidos = solicitudes.filter(s => s.tipo_solicitud === 'pedido');
        const cotizaciones = solicitudes.filter(s => s.tipo_solicitud === 'cotizacion');
        const pedidosPendientes = pedidos.filter(p => p.estado_atencion === 'pendiente').length;
        const pedidosDespachados = pedidos.filter(p => p.estado_atencion === 'despachado').length;
        const cotsNuevas = cotizaciones.filter(c => c.estado_atencion === 'cotizado').length;
        const cotsAvisadas = cotizaciones.filter(c => c.estado_atencion === 'recordatorio_enviado').length;

        let html = `<!DOCTYPE html><html lang="es"><head><title>Forestadent | Dashboard BI</title>${htmlHead}</head><body class="bg-gray-50 p-8 font-sans"><div class="max-w-7xl mx-auto">${menuNavegacion}<div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8"><div class="bg-white p-6 rounded-xl shadow-sm border-l-4 border-forestaBlack"><p class="text-sm font-bold text-gray-500 uppercase tracking-widest mb-1">Total Directorio</p><h3 class="text-4xl font-extrabold text-forestaBlack">${totalClientes} <span class="text-lg text-gray-400 font-medium">Doctores</span></h3></div><div class="bg-white p-6 rounded-xl shadow-sm border-l-4 border-yellow-400"><p class="text-sm font-bold text-gray-500 uppercase tracking-widest mb-1">Pedidos Pendientes</p><h3 class="text-4xl font-extrabold text-forestaBlack">${pedidosPendientes} <span class="text-lg text-gray-400 font-medium">Por empacar</span></h3></div><div class="bg-white p-6 rounded-xl shadow-sm border-l-4 border-green-500"><p class="text-sm font-bold text-gray-500 uppercase tracking-widest mb-1">Pedidos Despachados</p><h3 class="text-4xl font-extrabold text-forestaBlack">${pedidosDespachados} <span class="text-lg text-gray-400 font-medium">Completados</span></h3></div><div class="bg-white p-6 rounded-xl shadow-sm border-l-4 border-forestaGold"><p class="text-sm font-bold text-gray-500 uppercase tracking-widest mb-1">Cotizaciones Vivas</p><h3 class="text-4xl font-extrabold text-forestaGold">${cotizaciones.length} <span class="text-lg text-gray-400 font-medium">Oportunidades</span></h3></div></div><div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8"><div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100"><h3 class="text-lg font-bold text-forestaBlack uppercase tracking-wide mb-4">Estado de la Operación</h3><canvas id="graficoOperacion" height="200"></canvas></div><div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100"><h3 class="text-lg font-bold text-forestaBlack uppercase tracking-wide mb-4">Embudo de Ventas</h3><canvas id="graficoVentas" height="200"></canvas></div></div></div><script>const ctxOperacion = document.getElementById('graficoOperacion').getContext('2d'); new Chart(ctxOperacion, { type: 'pie', data: { labels: ['Pendientes', 'Despachados'], datasets: [{ data: [${pedidosPendientes}, ${pedidosDespachados}], backgroundColor: ['#FCD34D', '#34D399'], borderWidth: 0 }] }, options: { responsive: true, plugins: { legend: { position: 'bottom' } } } }); const ctxVentas = document.getElementById('graficoVentas').getContext('2d'); new Chart(ctxVentas, { type: 'bar', data: { labels: ['Nuevas', 'Recordatorios (Cazador)'], datasets: [{ label: 'Volumen', data: [${cotsNuevas}, ${cotsAvisadas}], backgroundColor: ['#B4975A', '#1E3A8A'], borderRadius: 5 }] }, options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } } });</script></body></html>`;
        res.send(html);
    } catch (error) { res.status(500).send('Error cargando Dashboard.'); }
});

app.get('/admin', async (req, res) => {
    try {
        const solicitudes = await Solicitud.find().sort({ fecha: -1 });
        let html = `<!DOCTYPE html><html lang="es"><head><title>Forestadent | Pedidos</title>${htmlHead}</head><body class="bg-gray-50 p-8 font-sans"><div class="max-w-7xl mx-auto">${menuNavegacion}<div class="bg-white p-4 rounded-xl shadow-sm mb-6 flex flex-col md:flex-row gap-4 items-center border border-gray-100"><input type="text" id="buscador" onkeyup="filtrarTabla()" placeholder="🔍 Buscar por doctor o teléfono..." class="border-2 border-gray-200 focus:border-forestaGold rounded p-3 text-sm font-medium w-full md:w-2/5 outline-none transition"><select id="filtroTipo" onchange="filtrarTabla()" class="border-2 border-gray-200 focus:border-forestaGold rounded p-3 text-sm font-bold text-forestaBlack outline-none cursor-pointer w-full md:w-1/5"><option value="todos">📋 Todos</option><option value="pedido">📦 Pedidos</option><option value="cotizacion">💬 Cotizaciones</option><option value="contacto">👤 Contactos</option></select><select id="filtroEstado" onchange="filtrarTabla()" class="border-2 border-gray-200 focus:border-forestaGold rounded p-3 text-sm font-bold text-forestaBlack outline-none cursor-pointer w-full md:w-1/5"><option value="todos">🚦 Todos</option><option value="pendiente">🟡 Pendientes</option><option value="despachado">🟢 Despachados</option><option value="cotizado">💬 Cotizados</option><option value="recordatorio_enviado">🔔 Avisados</option></select><button onclick="exportarExcel('Reporte_Pedidos_Forestadent')" class="bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded shadow font-bold transition uppercase text-sm tracking-wide w-full md:w-1/5">📥 Excel</button></div><div class="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100"><table class="w-full text-left border-collapse"><thead><tr class="bg-forestaBlack text-white uppercase text-sm tracking-wider"><th class="p-5">Fecha</th><th class="p-5">Cliente</th><th class="p-5">Teléfono</th><th class="p-5">Detalle / Respuesta IA</th><th class="p-5 text-center">Estado</th><th class="p-5 text-center">Acción</th></tr></thead><tbody class="divide-y divide-gray-100">`;
        solicitudes.forEach(sol => { let fecha = new Date(sol.fecha).toLocaleString('es-EC'); let contenidoVisual = ''; if(sol.tipo_solicitud === 'pedido') { try { let productos = JSON.parse(sol.contenido_texto); contenidoVisual = '<ul class="list-disc pl-5 text-sm text-gray-800 font-medium">'; productos.forEach(item => { contenidoVisual += `<li><strong>${item.cantidad}</strong> x ${item.producto}</li>`; }); contenidoVisual += '</ul>'; } catch (e) { contenidoVisual = `<span class="text-gray-600 italic">${sol.contenido_texto}</span>`; } } else { contenidoVisual = `<div class="text-sm text-gray-800 font-medium whitespace-pre-wrap">${sol.contenido_texto}</div>`; } let badgeColor = 'bg-gray-100 text-gray-600 border border-gray-300'; if(sol.estado_atencion === 'pendiente') badgeColor = 'bg-yellow-50 text-yellow-700 border border-yellow-300'; if(sol.estado_atencion === 'despachado') badgeColor = 'bg-green-50 text-green-700 border border-green-300'; if(sol.estado_atencion === 'cotizado') badgeColor = 'bg-forestaGold text-white shadow-sm'; if(sol.estado_atencion === 'recordatorio_enviado') badgeColor = 'bg-blue-100 text-blue-700 border border-blue-300'; let botonAccion = ''; if(sol.estado_atencion === 'pendiente') { botonAccion = `<button onclick="actualizarEstado('${sol._id}', 'despachado')" class="bg-forestaBlack hover:bg-gray-800 text-white text-xs font-bold px-4 py-2 rounded shadow transition uppercase tracking-wide">📦 Despachar</button>`; } else if (sol.estado_atencion === 'cotizado') { botonAccion = `<span class="text-xs text-forestaGold font-bold uppercase tracking-wide block mb-2">💬 Cotizado</span><button onclick="recordarCotizacion('${sol._id}', '${sol.telefono_cliente}')" class="bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-bold px-3 py-1 rounded shadow transition uppercase tracking-wide">🔔 Recordar</button>`; } else if (sol.estado_atencion === 'recordatorio_enviado') { botonAccion = `<span class="text-xs text-blue-600 font-bold uppercase tracking-wide">🔔 Avisado</span>`; } else { botonAccion = `<span class="text-xs text-gray-400 font-bold uppercase tracking-wide">✔️ Completado</span>`; } html += `<tr class="fila-dato hover:bg-gray-50 transition" data-tipo="${sol.tipo_solicitud}" data-estado="${sol.estado_atencion}"><td class="p-5 text-sm text-gray-500 font-medium">${fecha}</td><td class="p-5 font-bold text-forestaBlack">${sol.nombre_cliente}</td><td class="p-5 text-sm text-gray-500 font-medium">+${sol.telefono_cliente}</td><td class="p-5">${contenidoVisual}</td><td class="p-5 text-center"><span class="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest ${badgeColor}">${sol.estado_atencion}</span></td><td class="p-5 text-center">${botonAccion}</td></tr>`; });
        html += `</tbody></table></div></div>${scriptExportarExcel}<script>function filtrarTabla() { let texto = document.getElementById('buscador').value.toLowerCase(); let tipo = document.getElementById('filtroTipo').value; let estado = document.getElementById('filtroEstado').value; let filas = document.querySelectorAll('.fila-dato'); filas.forEach(fila => { let contenido = fila.innerText.toLowerCase(); let filaTipo = fila.getAttribute('data-tipo'); let filaEstado = fila.getAttribute('data-estado'); let coincideTexto = contenido.includes(texto); let coincideTipo = (tipo === 'todos' || filaTipo === tipo); let coincideEstado = (estado === 'todos' || filaEstado === estado); if (coincideTexto && coincideTipo && coincideEstado) { fila.style.display = ''; } else { fila.style.display = 'none'; } }); } async function actualizarEstado(idPedido, nuevoEstado) { if(!confirm('¿Despachar?')) return; try { const response = await fetch('/admin/estado', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: idPedido, estado: nuevoEstado }) }); if(response.ok) { window.location.reload(); } } catch (error) { console.error(error); } } async function recordarCotizacion(idCotizacion, telefono) { if(!confirm('¿Enviar recordatorio?')) return; try { const response = await fetch('/admin/recordar-cotizacion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: idCotizacion, telefono: telefono }) }); if(response.ok) { window.location.reload(); } } catch (error) { console.error(error); } }</script></body></html>`;
        res.send(html);
    } catch (error) { res.status(500).send('Error.'); }
});

app.get('/admin/clientes', async (req, res) => {
    try {
        const clientesRaw = await Usuario.find().sort({ fecha_registro: -1 });
        const clientesConSemaforo = await Promise.all(clientesRaw.map(async (cliente) => {
            const ultimoPedido = await Solicitud.findOne({ telefono_cliente: cliente.telefono, tipo_solicitud: 'pedido' }).sort({ fecha: -1 });
            let dias = 999; if (ultimoPedido) { dias = Math.ceil(Math.abs(new Date() - new Date(ultimoPedido.fecha)) / (1000 * 60 * 60 * 24)); }
            let semaforo = '🔴 Inactivo'; let semaforoColor = 'bg-red-100 text-red-700 border-red-300';
            if (dias <= 15) { semaforo = '🟢 Activo'; semaforoColor = 'bg-green-100 text-green-700 border-green-300'; }
            else if (dias <= 30) { semaforo = '🟡 Enfriándose'; semaforoColor = 'bg-yellow-100 text-yellow-700 border-yellow-300'; }
            return { ...cliente.toObject(), semaforo, semaforoColor, dias };
        }));
        let html = `<!DOCTYPE html><html lang="es"><head><title>Forestadent | CRM</title>${htmlHead}</head><body class="bg-gray-50 p-8 font-sans"><div class="max-w-7xl mx-auto">${menuNavegacion}<div class="flex justify-end mb-4"><button onclick="exportarExcel('Reporte_CRM_Forestadent')" class="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded shadow font-bold transition uppercase text-sm tracking-wide">📥 Exportar Directorio a Excel</button></div><div class="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100"><table class="w-full text-left border-collapse"><thead><tr class="bg-forestaBlack text-white uppercase text-sm tracking-wider"><th class="p-5">Actividad</th><th class="p-5">Cliente</th><th class="p-5">Lugar de Entrega</th><th class="p-5">Etiquetas Comerciales</th><th class="p-5">Notas Internas</th><th class="p-5 text-center">Acción</th></tr></thead><tbody class="divide-y divide-gray-100">`;
        clientesConSemaforo.forEach(cliente => { let textoDias = cliente.dias === 999 ? 'Sin compras' : `Hace ${cliente.dias} días`; html += `<tr class="hover:bg-gray-50 transition"><td class="p-5 text-center"><span class="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest border ${cliente.semaforoColor} block mb-1">${cliente.semaforo}</span><span class="text-xs text-gray-500 font-medium">${textoDias}</span></td><td class="p-5 font-bold text-forestaBlack">${cliente.nombre_whatsapp}<br><span class="text-xs text-gray-500 font-medium font-normal">+${cliente.telefono}</span></td><td class="p-5"><select id="lugar_${cliente._id}" class="border-2 border-gray-200 focus:border-forestaGold rounded p-2 text-xs font-medium text-forestaBlack outline-none w-full"><option value="consultorio" ${cliente.tipo_establecimiento === 'consultorio' ? 'selected' : ''}>Consultorio</option><option value="clínica" ${cliente.tipo_establecimiento === 'clínica' ? 'selected' : ''}>Clínica</option><option value="centro médico" ${cliente.tipo_establecimiento === 'centro médico' ? 'selected' : ''}>Centro Médico</option><option value="universidad" ${cliente.tipo_establecimiento === 'universidad' ? 'selected' : ''}>Universidad</option></select></td><td class="p-5"><input type="text" id="etiq_${cliente._id}" value="${cliente.etiquetas || ''}" placeholder="Ej: VIP, Moroso" class="border-2 border-gray-200 focus:border-forestaGold rounded p-2 text-xs w-full text-forestaBlack outline-none"></td><td class="p-5"><textarea id="notas_${cliente._id}" placeholder="Notas..." class="border-2 border-gray-200 focus:border-forestaGold rounded p-2 text-xs w-full text-forestaBlack outline-none" rows="2">${cliente.notas || ''}</textarea></td><td class="p-5 text-center"><button onclick="guardarPerfil('${cliente._id}')" class="bg-forestaGold hover:bg-forestaGoldHover text-white text-xs font-bold px-4 py-2 rounded shadow uppercase tracking-wide transition">💾 Guardar</button></td></tr>`; });
        html += `</tbody></table></div></div>${scriptExportarExcel}<script>async function guardarPerfil(idCliente) { const nuevoLugar = document.getElementById('lugar_' + idCliente).value; const nuevasEtiq = document.getElementById('etiq_' + idCliente).value; const nuevasNotas = document.getElementById('notas_' + idCliente).value; try { const response = await fetch('/admin/clientes/actualizar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: idCliente, tipo_establecimiento: nuevoLugar, etiquetas: nuevasEtiq, notas: nuevasNotas }) }); if(response.ok) { alert('Perfil de CRM guardado.'); } } catch (error) { console.error(error); } }</script></body></html>`;
        res.send(html);
    } catch (error) { res.status(500).send('Error CRM.'); }
});

app.get('/admin/catalogo', async (req, res) => {
    try {
        const productos = await Producto.find().sort({ categoria: 1, nombre: 1 });
        let html = `<!DOCTYPE html><html lang="es"><head><title>Forestadent | Catálogo</title>${htmlHead}</head><body class="bg-gray-50 p-8 font-sans"><div class="max-w-7xl mx-auto">${menuNavegacion}<div class="bg-white p-8 rounded-xl shadow-lg mb-8 border-l-8 border-forestaGold"><h2 class="text-xl font-extrabold text-forestaBlack mb-6 uppercase tracking-wide">➕ Agregar Nuevo Producto</h2><div class="grid grid-cols-1 md:grid-cols-6 gap-5"><input type="text" id="nuevo_codigo" placeholder="SKU" class="border-2 border-gray-200 focus:border-forestaGold rounded p-3 font-medium text-forestaBlack outline-none"><input type="text" id="nuevo_nombre" placeholder="Nombre" class="border-2 border-gray-200 focus:border-forestaGold rounded p-3 font-medium text-forestaBlack outline-none md:col-span-2"><input type="text" id="nueva_categoria" placeholder="Categoría" class="border-2 border-gray-200 focus:border-forestaGold rounded p-3 font-medium text-forestaBlack outline-none"><input type="text" id="nuevo_empaque" placeholder="Empaque" class="border-2 border-gray-200 focus:border-forestaGold rounded p-3 font-medium text-forestaBlack outline-none"><input type="number" step="0.01" id="nuevo_precio" placeholder="Precio ($)" class="border-2 border-gray-200 focus:border-forestaGold rounded p-3 font-medium text-forestaBlack outline-none"></div><button onclick="agregarProducto()" class="mt-6 bg-forestaBlack hover:bg-gray-800 text-white font-bold py-3 px-8 rounded shadow transition uppercase text-sm tracking-widest">Guardar</button></div><div class="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100"><table class="w-full text-left border-collapse"><thead><tr class="bg-forestaBlack text-white uppercase text-sm tracking-wider"><th class="p-5">SKU</th><th class="p-5">Nombre del Producto</th><th class="p-5">Empaque</th><th class="p-5">Categoría</th><th class="p-5 text-right w-32">Precio ($)</th><th class="p-5 text-center">Acción</th></tr></thead><tbody class="divide-y divide-gray-100">`;
        productos.forEach(prod => { html += `<tr class="hover:bg-gray-50 transition"><td class="p-5 text-sm font-bold text-gray-500">${prod.codigo}</td><td class="p-5 font-bold text-forestaBlack">${prod.nombre}</td><td class="p-5 text-sm font-medium text-gray-500">${prod.empaque}</td><td class="p-5 text-sm font-medium text-gray-500">${prod.categoria}</td><td class="p-5 text-right"><input type="number" step="0.01" id="precio_${prod._id}" value="${prod.precio.toFixed(2)}" class="border border-gray-300 focus:border-forestaGold rounded p-1 w-20 text-right font-bold text-forestaGold outline-none"></td><td class="p-5 text-center space-x-2"><button onclick="editarPrecio('${prod._id}')" class="bg-forestaGold hover:bg-forestaGoldHover text-white text-xs font-bold px-3 py-2 rounded transition uppercase tracking-wide">✏️</button><button onclick="eliminarProducto('${prod._id}')" class="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-xs font-bold px-3 py-2 rounded transition uppercase tracking-wide">❌</button></td></tr>`; });
        html += `</tbody></table></div></div><script>async function agregarProducto() { const codigo = document.getElementById('nuevo_codigo').value; const nombre = document.getElementById('nuevo_nombre').value; const categoria = document.getElementById('nueva_categoria').value; const empaque = document.getElementById('nuevo_empaque').value; const precio = document.getElementById('nuevo_precio').value; if(!codigo || !nombre || !precio) return alert("Faltan datos"); try { const response = await fetch('/admin/catalogo/agregar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo, nombre, categoria, precio: parseFloat(precio), empaque: empaque || "Unidad" }) }); if(response.ok) { window.location.reload(); } } catch (error) { console.error(error); } } async function editarPrecio(idProducto) { const nuevoPrecio = document.getElementById('precio_' + idProducto).value; try { const response = await fetch('/admin/catalogo/editar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: idProducto, precio: parseFloat(nuevoPrecio) }) }); if(response.ok) { alert('Precio actualizado.'); } } catch (error) { console.error(error); } } async function eliminarProducto(idProducto) { if(!confirm("¿Borrar?")) return; try { const response = await fetch('/admin/catalogo/eliminar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: idProducto }) }); if(response.ok) { window.location.reload(); } } catch (error) { console.error(error); } }</script></body></html>`;
        res.send(html);
    } catch (error) { res.status(500).send('Error.'); }
});

app.get('/admin/broadcast', async (req, res) => {
    try {
        const clientes = await Usuario.find().sort({ nombre_whatsapp: 1 });
        let listaCheckboxes = '';
        clientes.forEach(c => { listaCheckboxes += `<label class="flex items-center gap-3 p-3 hover:bg-gray-100 rounded-lg cursor-pointer border border-transparent hover:border-gray-200 transition"><input type="checkbox" value="${c.telefono}" class="checkbox-manual w-5 h-5 text-green-600 rounded focus:ring-green-500"><span class="text-sm font-bold text-forestaBlack">${c.nombre_whatsapp} <span class="text-gray-400 font-medium ml-1">(+${c.telefono})</span></span></label>`; });
        let html = `<!DOCTYPE html><html lang="es"><head><title>Forestadent | Broadcast</title>${htmlHead}</head><body class="bg-gray-50 p-8 font-sans"><div class="max-w-7xl mx-auto">${menuNavegacion}<div class="bg-white p-8 rounded-xl shadow-lg border-l-8 border-green-600"><h2 class="text-2xl font-extrabold text-forestaBlack mb-2 uppercase tracking-wide">📢 Lanzar Campaña Masiva</h2><p class="text-gray-500 font-medium mb-8">Envía promociones o avisos a tus doctores directamente por WhatsApp.</p><div class="grid grid-cols-1 md:grid-cols-2 gap-8"><div><label class="block text-sm font-bold text-forestaBlack uppercase mb-2">1. Selecciona tu público objetivo</label><select id="tipoFiltro" onchange="mostrarOpcionFiltro()" class="w-full border-2 border-gray-200 focus:border-green-600 rounded p-4 text-sm font-bold text-forestaBlack outline-none mb-4 cursor-pointer"><option value="todos">🌍 Enviar a TODOS los clientes</option><option value="establecimiento">🏥 Filtrar por Tipo de Establecimiento</option><option value="etiqueta">🏷️ Filtrar por Etiqueta del CRM</option><option value="manual">🎯 Seleccionar doctores manualmente</option></select><div id="cajaValorEstablecimiento" class="hidden mb-4 transition-all"><select id="valorEstablecimiento" class="w-full border-2 border-gray-200 focus:border-green-600 rounded p-4 text-sm font-medium text-forestaBlack outline-none cursor-pointer"><option value="consultorio">Consultorio</option><option value="clínica">Clínica</option><option value="centro médico">Centro Médico</option><option value="universidad">Universidad</option></select></div><div id="cajaValorEtiqueta" class="hidden mb-4 transition-all"><input type="text" id="valorEtiqueta" placeholder="Escribe la etiqueta exacta (Ej: VIP, Acero, Moroso)" class="w-full border-2 border-gray-200 focus:border-green-600 rounded p-4 text-sm font-medium text-forestaBlack outline-none"></div><div id="cajaValorManual" class="hidden mb-4 transition-all"><div class="border-2 border-gray-200 rounded p-4 max-h-60 overflow-y-auto bg-gray-50"><p class="text-xs font-bold text-gray-500 uppercase mb-3">Marca los doctores específicos:</p>${listaCheckboxes}</div></div><label class="block text-sm font-bold text-forestaBlack uppercase mb-0 mt-6">2. Escribe tu mensaje corporativo</label><div class="flex flex-wrap gap-x-4 gap-y-2 mb-2 mt-2 bg-gray-50 p-3 rounded border border-gray-200"><p class="text-xs text-gray-600 font-bold">🪄 Personalizar: <span class="bg-white px-1 border border-gray-300 rounded text-forestaBlack cursor-default">{{nombre}}</span></p><p class="text-xs text-gray-600 font-bold">✒️ Formato WhatsApp: <span class="bg-white px-1 border border-gray-300 rounded text-forestaBlack font-bold cursor-default">*Negrita*</span> y <span class="bg-white px-1 border border-gray-300 rounded text-forestaBlack italic cursor-default">_Cursiva_</span></p></div><textarea id="mensajeCampana" rows="7" placeholder="¡Hola {{nombre}}! 👋..." class="w-full border-2 border-gray-200 focus:border-green-600 rounded p-4 text-sm font-medium text-forestaBlack outline-none"></textarea><button onclick="dispararCampana()" id="btnEnviar" class="mt-6 w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-8 rounded shadow transition uppercase text-sm tracking-widest flex justify-center items-center gap-2">🚀 Enviar Campaña por WhatsApp</button><p id="textoCarga" class="text-sm text-green-600 font-bold mt-4 text-center hidden">⏳ Disparando mensajes...</p></div><div class="bg-gray-100 rounded-xl p-6 flex flex-col items-center justify-center border-4 border-dashed border-gray-200"><img src="/logo-vector-forestadent.webp" class="h-10 mb-4 opacity-50"><div class="bg-white p-4 rounded-xl shadow-sm w-full max-w-sm relative"><p class="text-xs text-gray-400 font-bold mb-2 border-b border-gray-100 pb-2">Así lo verá el Doctor en su celular:</p><p id="vistaPrevia" class="text-sm text-gray-800 whitespace-pre-wrap font-medium">Empieza a escribir tu mensaje...</p></div></div></div></div><script>document.getElementById('mensajeCampana').addEventListener('input', function(e) { let texto = e.target.value || 'Empieza a escribir tu mensaje...'; texto = texto.replace(/{{nombre}}/gi, 'Dr. Juan Pérez'); texto = texto.replace(/</g, "&lt;").replace(/>/g, "&gt;"); texto = texto.replace(/\\*(.*?)\\*/g, '<strong>$1</strong>'); texto = texto.replace(/_(.*?)_/g, '<em>$1</em>'); texto = texto.replace(/~(.*?)~/g, '<del>$1</del>'); document.getElementById('vistaPrevia').innerHTML = texto; }); function mostrarOpcionFiltro() { const filtro = document.getElementById('tipoFiltro').value; document.getElementById('cajaValorEstablecimiento').classList.add('hidden'); document.getElementById('cajaValorEtiqueta').classList.add('hidden'); document.getElementById('cajaValorManual').classList.add('hidden'); if (filtro === 'establecimiento') document.getElementById('cajaValorEstablecimiento').classList.remove('hidden'); if (filtro === 'etiqueta') document.getElementById('cajaValorEtiqueta').classList.remove('hidden'); if (filtro === 'manual') document.getElementById('cajaValorManual').classList.remove('hidden'); } async function dispararCampana() { const mensaje = document.getElementById('mensajeCampana').value; const filtro = document.getElementById('tipoFiltro').value; let valorFiltro = ''; let telefonosManuales = []; if (filtro === 'establecimiento') valorFiltro = document.getElementById('valorEstablecimiento').value; if (filtro === 'etiqueta') valorFiltro = document.getElementById('valorEtiqueta').value; if (filtro === 'manual') { const checkboxes = document.querySelectorAll('.checkbox-manual:checked'); checkboxes.forEach(cb => telefonosManuales.push(cb.value)); if (telefonosManuales.length === 0) return alert("Selecciona al menos un doctor."); } if (!mensaje.trim()) return alert("El mensaje está vacío."); if (!confirm('🚨 ATENCIÓN: Estás a punto de enviar un mensaje oficial por WhatsApp. ¿Deseas proceder?')) return; document.getElementById('btnEnviar').classList.add('hidden'); document.getElementById('textoCarga').classList.remove('hidden'); try { const response = await fetch('/admin/broadcast/enviar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mensaje, filtro, valorFiltro, telefonosManuales }) }); const result = await response.json(); if (result.success) { alert('✅ ¡Campaña disparada con éxito!'); window.location.reload(); } else { alert('Error enviando la campaña.'); } } catch (error) { console.error(error); alert('Error de conexión.'); } finally { document.getElementById('btnEnviar').classList.remove('hidden'); document.getElementById('textoCarga').classList.add('hidden'); } }</script></body></html>`;
        res.send(html);
    } catch (error) { res.status(500).send("Error."); }
});

app.post('/admin/broadcast/enviar', async (req, res) => {
    try {
        const { mensaje, filtro, valorFiltro, telefonosManuales } = req.body;
        let query = {};
        if (filtro === 'establecimiento' && valorFiltro) { query = { tipo_establecimiento: valorFiltro }; } 
        else if (filtro === 'etiqueta' && valorFiltro) { query = { etiquetas: { $regex: valorFiltro, $options: 'i' } }; } 
        else if (filtro === 'manual' && telefonosManuales && telefonosManuales.length > 0) { query = { telefono: { $in: telefonosManuales } }; }
        
        const destinatarios = await Usuario.find(query);
        for (const dest of destinatarios) {
            let mensajePersonalizado = mensaje.replace(/{{nombre}}/gi, dest.nombre_whatsapp);
            
            // 🚨 1. LA HUELLA EN EL CRM: Escribir en las notas que se envió esta campaña
            const nuevaNota = dest.notas + `\n[📢 Campaña enviada el ${new Date().toLocaleDateString('es-EC')}]: ` + mensajePersonalizado.substring(0, 30) + '...';
            await Usuario.findByIdAndUpdate(dest._id, { notas: nuevaNota.trim() });

            await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: dest.telefono, type: 'text', text: { body: mensajePersonalizado } }) });
            await new Promise(r => setTimeout(r, 500));
        }
        res.status(200).json({ success: true, enviados: destinatarios.length });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.post('/admin/catalogo/editar', async (req, res) => { try { await Producto.findByIdAndUpdate(req.body.id, { precio: req.body.precio }); res.status(200).json({ success: true }); } catch (error) { res.status(500).json({ success: false }); } });
app.post('/admin/catalogo/agregar', async (req, res) => { try { await new Producto(req.body).save(); res.status(200).json({ success: true }); } catch (error) { res.status(500).json({ success: false }); } });
app.post('/admin/catalogo/eliminar', async (req, res) => { try { await Producto.findByIdAndDelete(req.body.id); res.status(200).json({ success: true }); } catch (error) { res.status(500).json({ success: false }); } });
app.post('/admin/clientes/actualizar', async (req, res) => { try { await Usuario.findByIdAndUpdate(req.body.id, { tipo_establecimiento: req.body.tipo_establecimiento, etiquetas: req.body.etiquetas, notas: req.body.notas }); res.status(200).json({ success: true }); } catch (error) { res.status(500).json({ success: false }); } });
app.post('/admin/recordar-cotizacion', async (req, res) => { try { const { id, telefono } = req.body; await Solicitud.findByIdAndUpdate(id, { estado_atencion: 'recordatorio_enviado' }); const mensaje_recordatorio = `👋 Hola Doctor/a, espero te encuentres excelente hoy.\n\nTe escribo rápidamente para saber si pudiste revisar la cotización que te envié. ¿Tienes alguna duda o te gustaría que procedamos a armar el pedido? 📦🦷`; await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: telefono, type: 'text', text: { body: mensaje_recordatorio } }) }); res.status(200).json({ success: true }); } catch (error) { res.status(500).json({ success: false }); } });
app.post('/admin/estado', async (req, res) => { try { const { id, estado } = req.body; const pedidoActualizado = await Solicitud.findByIdAndUpdate(id, { estado_atencion: estado }, { new: true }); if (estado === 'despachado' && pedidoActualizado) { const perfilCliente = await Usuario.findOne({ telefono: pedidoActualizado.telefono_cliente }); const lugarDeEntrega = perfilCliente ? perfilCliente.tipo_establecimiento : 'consultorio'; const mensaje_notificacion = `🚚 *¡Buenas noticias, ${pedidoActualizado.nombre_cliente}!*\n\nTu pedido ha sido empacado y acaba de ser *DESPACHADO* a tu ${lugarDeEntrega}.\n\nGracias por confiar en Forestadent Ecuador. 🦷`; await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: pedidoActualizado.telefono_cliente, type: 'text', text: { body: mensaje_notificacion } }) }); } res.status(200).json({ success: true }); } catch (error) { res.status(500).json({ success: false }); } });

// --- 5. RUTAS DE WHATSAPP (BOT) ---
app.get('/activar-meta', async (req, res) => { try { const response = await fetch(`https://graph.facebook.com/v25.0/2048355149178743/subscribed_apps`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }}); res.status(200).json({ resultado: await response.json() }); } catch (error) { res.status(500).json({ error: error.message }); } });
app.get('/webhook', (req, res) => { if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === process.env.VERIFY_TOKEN) { res.status(200).send(req.query['hub.challenge']); } else { res.sendStatus(403); } });
async function enviarMensajeInmediato(telefono, texto_mensaje) { try { await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: telefono, type: 'text', text: { body: texto_mensaje } }) }); } catch (error) { console.error("Error buffer:", error); } }

app.post('/webhook', async (req, res) => {
    const body = req.body;
    res.sendStatus(200); 

    if (body.object && body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
        let valor = body.entry[0].changes[0].value;
        let from = valor.messages[0].from; 
        let msg_body = valor.messages[0].text?.body.trim() || ''; 
        let nombre_cliente = valor.contacts[0].profile.name; 

        if (from !== '16315551181') {
            try {
                let usuario = await Usuario.findOne({ telefono: from });
                let mensaje_respuesta = '';
                const texto_menu = `Por favor, responde con el *NÚMERO* de la opción:\n\n1️⃣ Catálogo\n2️⃣ Cotizar Productos\n3️⃣ Nuevo Pedido\n4️⃣ Contacto\n5️⃣ Estado de Cuenta`;

                if (!usuario) {
                    usuario = new Usuario({ telefono: from, nombre_whatsapp: nombre_cliente, estado_conversacion: 'menu_principal' });
                    await usuario.save();
                    mensaje_respuesta = `¡Hola ${nombre_cliente}! Bienvenido a Forestadent Ecuador.\n\n` + texto_menu;
                } else {
                    // 🚨 2. EL GATILLO DE VENTA (INFO)
                    if (msg_body.toLowerCase() === 'info') {
                        const nuevaSolicitud = new Solicitud({ 
                            telefono_cliente: from, 
                            nombre_cliente: nombre_cliente, 
                            tipo_solicitud: 'contacto', 
                            contenido_texto: '🎯 [LEAD DE CAMPAÑA] El doctor está muy interesado en la última promoción/broadcast enviado. Requiere contacto inmediato.' 
                        });
                        await nuevaSolicitud.save();
                        mensaje_respuesta = `✅ ¡Excelente decisión!\n\nAcabo de notificar a Néstor y a nuestro equipo comercial para que te contacten de inmediato y apliquen tu beneficio exclusivo.\n\n_(Escribe *Menu* para volver)_`;
                    }
                    else if (msg_body.toLowerCase() === 'menu' || msg_body.toLowerCase() === 'menú') {
                        usuario.estado_conversacion = 'menu_principal'; await usuario.save(); mensaje_respuesta = texto_menu;
                    } 
                    else if (usuario.estado_conversacion === 'esperando_pedido') {
                        await enviarMensajeInmediato(from, "⏳ *Organizando tu pedido...*\nDame unos segunditos mientras reviso las existencias y organizo los productos. 📦");
                        const datosEstructurados = await analizarPedidoConIA(msg_body);
                        if (datosEstructurados) {
                            let resumenVisual = datosEstructurados.map(item => `✔️ ${item.cantidad} x ${item.producto}`).join('\n');
                            const nuevaSolicitud = new Solicitud({ telefono_cliente: from, nombre_cliente: nombre_cliente, tipo_solicitud: 'pedido', contenido_texto: JSON.stringify(datosEstructurados) });
                            await nuevaSolicitud.save();
                            mensaje_respuesta = `✅ ¡Pedido procesado!\n\nEsto es lo que hemos registrado en sistema:\n${resumenVisual}\n\nPronto te confirmaremos el despacho.\n\n_(Escribe *Menu* para volver)_`;
                        } else {
                            mensaje_respuesta = `Tuve un pequeño problema analizando el pedido. Por favor, escribe *Menu* e inténtalo de nuevo.`;
                        }
                        usuario.estado_conversacion = 'menu_principal'; await usuario.save();
                    } 
                    else if (usuario.estado_conversacion === 'esperando_cotizacion') {
                        await enviarMensajeInmediato(from, "⏳ *Calculando proforma...*\nEstoy revisando el inventario y generando tu documento oficial. Dame unos segunditos por favor. 🧮");
                        const catalogoCompleto = await Producto.find().lean();
                        const textoCotizacionIA = await generarCotizacionConIA(msg_body, catalogoCompleto);
                        
                        const nuevaSolicitud = new Solicitud({ telefono_cliente: from, nombre_cliente: nombre_cliente, tipo_solicitud: 'cotizacion', contenido_texto: textoCotizacionIA, estado_atencion: 'cotizado' });
                        await nuevaSolicitud.save();

                        // 🚨 DOMINIO DINÁMICO (Adiós al error de ting-col)
                        const url_host = req.get('host');
                        const enlaceProforma = `https://${url_host}/proforma/${nuevaSolicitud._id}`;
                        
                        mensaje_respuesta = `✅ Listo ${nombre_cliente}, he calculado los valores exactos.\n\n📄 *Puedes ver y descargar tu Proforma Oficial aquí:*\n👉 ${enlaceProforma}\n\n_¿Deseas convertir esta cotización en un pedido formal?_ Responde *SI* para confirmar, o escribe *Menu* para regresar.`;
                        usuario.estado_conversacion = 'decidiendo_cotizacion'; 
                        await usuario.save();
                    } 
                    else if (usuario.estado_conversacion === 'decidiendo_cotizacion') {
                        const esAfirmativo = ['si', 'sí', 'claro', 'generar', 'pedido', 'ok', 'dale'].some(palabra => msg_body.toLowerCase().includes(palabra));
                        if (esAfirmativo) {
                            await enviarMensajeInmediato(from, "⏳ *Generando tu pedido a partir de la cotización...*");
                            const ultimaCotizacion = await Solicitud.findOne({ telefono_cliente: from, tipo_solicitud: 'cotizacion' }).sort({ fecha: -1 });
                            if (ultimaCotizacion) {
                                const datosEstructurados = await analizarPedidoConIA(ultimaCotizacion.contenido_texto);
                                if (datosEstructurados) {
                                    let resumenVisual = datosEstructurados.map(item => `✔️ ${item.cantidad} x ${item.producto}`).join('\n');
                                    const nuevoPedido = new Solicitud({ telefono_cliente: from, nombre_cliente: nombre_cliente, tipo_solicitud: 'pedido', contenido_texto: JSON.stringify(datosEstructurados) });
                                    await nuevoPedido.save();
                                    mensaje_respuesta = `✅ ¡Pedido generado con éxito a partir de tu proforma!\n\n${resumenVisual}\n\nPronto te confirmaremos el despacho.\n\n_(Escribe *Menu* para volver)_`;
                                } else { mensaje_respuesta = `Tuve un problema. Escribe *Menu* e intenta pedirlo por la opción 3 (Nuevo Pedido).`; }
                            } else { mensaje_respuesta = `No encontré tu cotización. Escribe *Menu* para volver al inicio.`; }
                        } else { mensaje_respuesta = `De acuerdo, tu proforma queda guardada en el sistema.\n\n` + texto_menu; }
                        usuario.estado_conversacion = 'menu_principal'; await usuario.save();
                    }
                    else if (usuario.estado_conversacion === 'esperando_contacto') {
                        const nuevaSolicitud = new Solicitud({ telefono_cliente: from, nombre_cliente: nombre_cliente, tipo_solicitud: 'contacto', contenido_texto: msg_body });
                        await nuevaSolicitud.save();
                        usuario.estado_conversacion = 'menu_principal'; await usuario.save();
                        mensaje_respuesta = `✅ Hemos registrado tu contacto exitosamente. Nos pondremos a trabajar en ello de inmediato.\n\n_(Escribe *Menu* para volver)_`;
                    } 
                    else if (usuario.estado_conversacion === 'menu_principal' || usuario.estado_conversacion === 'inicio') {
                        if (usuario.estado_conversacion === 'inicio') { usuario.estado_conversacion = 'menu_principal'; await usuario.save(); }
                        switch(msg_body) {
                            case '1': mensaje_respuesta = `📘 *Catálogo*\nEnlace: https://www.forestadent.com \n\n_(Escribe *Menu* para volver)_`; break;
                            case '2': usuario.estado_conversacion = 'esperando_cotizacion'; await usuario.save(); mensaje_respuesta = `📊 *Cotizar*\nEscribe los productos a cotizar:`; break;
                            case '3': usuario.estado_conversacion = 'esperando_pedido'; await usuario.save(); mensaje_respuesta = `📦 *Nuevo Pedido*\nEscribe en un solo mensaje los productos y cantidades. Mi inteligencia artificial lo organizará automáticamente:`; break;
                            case '4': usuario.estado_conversacion = 'esperando_contacto'; await usuario.save(); mensaje_respuesta = `👤 *Contacto*\nDescríbeme el motivo de tu consulta:`; break;
                            case '5': mensaje_respuesta = `💳 *Estado de Cuenta*\nRevisaré tu saldo internamente y te lo enviaré en breve.\n\n_(Escribe *Menu* para volver)_`; break;
                            default: mensaje_respuesta = `No reconocí esa opción. 😅\n\n` + texto_menu; break;
                        }
                    } else { mensaje_respuesta = `Recibí tu mensaje.\n\n_(Escribe *Menu* para ver las opciones)_`; }
                }
                
                await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, {
                    method: 'POST', headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ messaging_product: 'whatsapp', to: from, type: 'text', text: { body: mensaje_respuesta } })
                });
            } catch (error) { console.error('🔴 Error:', error); }
        }
    }
});

app.listen(PORT, () => { console.log(`🚀 Motor encendido y escuchando en el puerto ${PORT}`); });