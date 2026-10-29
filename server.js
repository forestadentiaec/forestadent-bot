require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const app = express();
app.use(express.json());
app.use(express.static('public'));
const PORT = process.env.PORT || 3000;

// --- 1. CONEXIÓN A MONGODB ---
mongoose.connect(process.env.MONGO_URI).then(() => { console.log('🟢 Conectado a MongoDB Atlas'); inicializarCatalogo(); }).catch((err) => console.error('🔴 Error MongoDB:', err));

// --- 2. ESTRUCTURAS DE LA BASE DE DATOS ---
const usuarioSchema = new mongoose.Schema({ telefono: String, nombre_whatsapp: String, estado_conversacion: { type: String, default: 'inicio' }, tipo_establecimiento: { type: String, default: 'consultorio' }, etiquetas: { type: String, default: '' }, notas: { type: String, default: '' }, ultima_campana: { type: String, default: '' }, fecha_registro: { type: Date, default: Date.now } });
const Usuario = mongoose.model('Usuario', usuarioSchema);

const solicitudSchema = new mongoose.Schema({ telefono_cliente: String, nombre_cliente: String, tipo_solicitud: String, contenido_texto: String, estado_atencion: { type: String, default: 'pendiente' }, id_campana_relacionada: { type: String, default: '' }, fecha: { type: Date, default: Date.now } });
const Solicitud = mongoose.model('Solicitud', solicitudSchema);

const productoSchema = new mongoose.Schema({ codigo: String, nombre: String, categoria: String, precio: Number, empaque: String });
const Producto = mongoose.model('Producto', productoSchema);

const campanaSchema = new mongoose.Schema({ nombre_campana: String, mensaje_cuerpo: String, enlace_pdf: String, datos_bancarios: String, fecha_envio: { type: Date, default: Date.now }, metricas_enviados: { type: Number, default: 0 }, metricas_info: { type: Number, default: 0 }, metricas_reservas: { type: Number, default: 0 }, metricas_pagos: { type: Number, default: 0 } });
const Campana = mongoose.model('Campana', campanaSchema);

const productosIniciales = [ { codigo: "202-3743", nombre: "Arco acero recto superior .017x.025", categoria: "Arcos", precio: 1.00, empaque: "Paquete de 10 unidades" }, { codigo: "202-3843", nombre: "Arco acero recto inferior .017x.025", categoria: "Arcos", precio: 1.00, empaque: "Paquete de 10 unidades" } ];
async function inicializarCatalogo() { try { const conteo = await Producto.countDocuments(); if (conteo === 0) await Producto.insertMany(productosIniciales); } catch (error) { console.error(error); } }

// --- 3. INTELIGENCIA ARTIFICIAL ---
async function analizarPedidoConIA(texto) {
    const modelos = ['gemini-3.8-flash', 'gemini-3.5-flash'];
    const prompt = `Eres un asistente comercial. Pedido: "${texto}". Devuelve ÚNICAMENTE un arreglo JSON con "producto" y "cantidad" (solo números).`;
    for (const modelo of modelos) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${process.env.GEMINI_API_KEY}`;
            const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
            const data = await response.json(); if (data.error) continue; return JSON.parse(data.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim());
        } catch (error) { continue; }
    } return null;
}

async function generarCotizacionConIA(texto, catalogo) {
    const modelos = ['gemini-3.8-flash', 'gemini-3.5-flash'];
    let catTxt = catalogo.map(p => `- ${p.nombre} | Precio Unidad: $${(p.precio || 0).toFixed(2)} | Empaque: ${p.empaque}`).join('\n');
    const prompt = `Cotizar: "${texto}"\nCatálogo:\n${catTxt}\nREGLA: Precio Unidad es 1 pieza suelta. Multiplica según cantidad/empaque. Formato: Saludo, Lista (Cant x Nombre = Subtotal), Total. PROHIBIDO TERMINAR CON PREGUNTAS.`;
    for (const modelo of modelos) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${process.env.GEMINI_API_KEY}`;
            const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
            const data = await response.json(); if (data.error) continue; return data.candidates[0].content.parts[0].text.trim();
        } catch (error) { continue; }
    } return "Error de cotización.";
}

// --- 4. PLANTILLAS VISUALES ---
const htmlHead = `<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap" rel="stylesheet"><script src="https://cdn.tailwindcss.com"></script><script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script><script src="https://cdn.jsdelivr.net/npm/chart.js"></script><script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script><script>tailwind.config = { theme: { extend: { colors: { forestaBlack: '#111111', forestaGold: '#B4975A', forestaGoldHover: '#9a814b' }, fontFamily: { sans: ['Montserrat', 'sans-serif'] } } } }</script>`;
const menuNavegacion = `<div class="flex justify-between items-center mb-6 bg-white p-6 rounded-xl shadow-sm border-t-4 border-forestaGold"><div class="flex items-center gap-6"><img src="/logo-vector-forestadent.webp" alt="Logo" class="h-16 object-contain" onerror="this.style.display='none'"><div><h1 class="text-3xl font-extrabold text-forestaBlack uppercase tracking-wider">Torre de Control</h1><p class="text-sm text-forestaGold font-bold tracking-widest uppercase">Ecuador B2B</p></div></div><span class="bg-forestaGold text-white px-5 py-2 rounded shadow font-bold text-sm uppercase tracking-wide">🟢 Sistema Activo</span></div><div class="flex flex-wrap gap-3 mb-8"><a href="/admin/dashboard" class="bg-blue-900 hover:bg-blue-800 text-white px-5 py-3 rounded shadow font-bold uppercase text-xs">📊 Dashboard BI</a><a href="/admin" class="bg-forestaBlack hover:bg-gray-800 text-white px-5 py-3 rounded shadow font-bold uppercase text-xs">📦 Pedidos</a><a href="/admin/clientes" class="bg-forestaGold hover:bg-forestaGoldHover text-white px-5 py-3 rounded shadow font-bold uppercase text-xs">👥 CRM</a><a href="/admin/catalogo" class="bg-white border-2 border-forestaBlack text-forestaBlack hover:bg-gray-50 px-5 py-3 rounded shadow font-bold uppercase text-xs">📖 Catálogo</a><a href="/admin/broadcast" class="bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded shadow font-bold uppercase text-xs">📢 Cursos & Broadcast</a></div>`;
const scriptExportarExcel = `<script>function exportarExcel(n) { let wb = XLSX.utils.table_to_book(document.querySelector("table")); XLSX.writeFile(wb, n + ".xlsx"); }</script>`;

// --- 5. RUTAS DEL SISTEMA CORE ---

// PROFORMAS PDF
app.get('/proforma/:id', async (req, res) => {
    try {
        const solicitud = await Solicitud.findById(req.params.id);
        if (!solicitud || solicitud.tipo_solicitud !== 'cotizacion') return res.status(404).send('No encontrada.');
        const fecha = new Date(solicitud.fecha).toLocaleDateString('es-EC'); const num = solicitud._id.toString().slice(-6).toUpperCase();
        let txt = solicitud.contenido_texto.replace(/[*_~]/g, '');
        let html = `<!DOCTYPE html><html><head><title>Proforma</title>${htmlHead}</head><body class="bg-gray-100 p-8"><div id="pdf" class="bg-white p-12 rounded-xl max-w-3xl mx-auto border-t-8 border-forestaGold"><div class="flex justify-between border-b-2 pb-6"><img src="/logo-vector-forestadent.webp" class="h-16" onerror="this.style.display='none'"><div class="text-right"><h1 class="text-2xl font-extrabold uppercase">Proforma</h1><p class="text-sm font-bold text-forestaGold">DOC-${num}</p></div></div><div class="grid grid-cols-2 gap-6 mb-8 mt-6"><div><p class="text-xs font-bold text-gray-400">Cliente:</p><p class="text-lg font-bold">${solicitud.nombre_cliente}</p><p class="text-sm text-gray-500">+${solicitud.telefono_cliente}</p></div><div class="text-right"><p class="text-xs font-bold text-gray-400">Fecha:</p><p class="font-bold">${fecha}</p></div></div><div class="bg-gray-50 p-8 rounded-xl border"><pre class="font-sans whitespace-pre-wrap font-medium">${txt}</pre></div><div class="text-center mt-6 pt-6 border-t-2"><p class="text-xs font-bold text-gray-400">Generado por IA • Forestadent B2B</p></div></div><div class="text-center mt-8 hide-on-print"><button onclick="html2pdf().set({margin:10, filename:'Proforma_${num}.pdf'}).from(document.getElementById('pdf')).save()" class="bg-forestaBlack text-white font-bold py-3 px-6 rounded">📥 Descargar PDF</button></div><style>@media print { .hide-on-print { display: none !important; } }</style></body></html>`;
        res.send(html);
    } catch (e) { res.status(500).send("Error"); }
});

// 📊 DASHBOARD BI (COMPLETO)
app.get('/admin/dashboard', async (req, res) => {
    try {
        const totalClientes = await Usuario.countDocuments();
        const solicitudes = await Solicitud.find();
        const pedidos = solicitudes.filter(s => s.tipo_solicitud === 'pedido');
        const cotizaciones = solicitudes.filter(s => s.tipo_solicitud === 'cotizacion');
        const pedPend = pedidos.filter(p => p.estado_atencion === 'pendiente').length;
        const pedDesp = pedidos.filter(p => p.estado_atencion === 'despachado').length;
        const cotsNuevas = cotizaciones.filter(c => c.estado_atencion === 'cotizado').length;
        const cotsAvisadas = cotizaciones.filter(c => c.estado_atencion === 'recordatorio_enviado').length;

        let html = `<!DOCTYPE html><html><head><title>Dashboard</title>${htmlHead}</head><body class="bg-gray-50 p-8"><div class="max-w-7xl mx-auto">${menuNavegacion}<div class="grid grid-cols-4 gap-6 mb-8"><div class="bg-white p-6 rounded-xl border-l-4 border-forestaBlack"><p class="text-xs font-bold text-gray-500 uppercase">Directorio</p><h3 class="text-3xl font-extrabold">${totalClientes}</h3></div><div class="bg-white p-6 rounded-xl border-l-4 border-yellow-400"><p class="text-xs font-bold text-gray-500 uppercase">Pendientes</p><h3 class="text-3xl font-extrabold">${pedPend}</h3></div><div class="bg-white p-6 rounded-xl border-l-4 border-green-500"><p class="text-xs font-bold text-gray-500 uppercase">Despachados</p><h3 class="text-3xl font-extrabold">${pedDesp}</h3></div><div class="bg-white p-6 rounded-xl border-l-4 border-forestaGold"><p class="text-xs font-bold text-gray-500 uppercase">Proformas</p><h3 class="text-3xl font-extrabold">${cotizaciones.length}</h3></div></div><div class="grid grid-cols-2 gap-8 mb-8"><div class="bg-white p-6 rounded-xl"><h3 class="font-bold mb-4">Logística</h3><canvas id="grafOp"></canvas></div><div class="bg-white p-6 rounded-xl"><h3 class="font-bold mb-4">Embudo Cotizaciones</h3><canvas id="grafVen"></canvas></div></div></div><script>new Chart(document.getElementById('grafOp'), { type: 'pie', data: { labels: ['Pendientes', 'Despachados'], datasets: [{ data: [${pedPend}, ${pedDesp}], backgroundColor: ['#FCD34D', '#34D399'] }] }}); new Chart(document.getElementById('grafVen'), { type: 'bar', data: { labels: ['Nuevas', 'Avisadas'], datasets: [{ data: [${cotsNuevas}, ${cotsAvisadas}], backgroundColor: ['#B4975A', '#1E3A8A'] }] }});</script></body></html>`;
        res.send(html);
    } catch (e) { res.status(500).send('Error'); }
});

// 👥 CRM CLIENTES (COMPLETO)
app.get('/admin/clientes', async (req, res) => {
    try {
        const clRaw = await Usuario.find().sort({ fecha_registro: -1 });
        const clientes = await Promise.all(clRaw.map(async (c) => {
            const uPed = await Solicitud.findOne({ telefono_cliente: c.telefono, tipo_solicitud: 'pedido' }).sort({ fecha: -1 });
            let dias = 999; if (uPed) dias = Math.ceil(Math.abs(new Date() - new Date(uPed.fecha)) / 86400000);
            let sem = '🔴 Inactivo'; let col = 'bg-red-100 text-red-700';
            if (dias <= 15) { sem = '🟢 Activo'; col = 'bg-green-100 text-green-700'; } else if (dias <= 30) { sem = '🟡 Enfriándose'; col = 'bg-yellow-100 text-yellow-700'; }
            return { ...c.toObject(), sem, col, dias };
        }));
        let html = `<!DOCTYPE html><html><head><title>CRM</title>${htmlHead}</head><body class="bg-gray-50 p-8"><div class="max-w-7xl mx-auto">${menuNavegacion}<div class="bg-white rounded-xl shadow-lg"><table class="w-full text-left"><thead><tr class="bg-forestaBlack text-white text-xs uppercase"><th class="p-4">Actividad</th><th class="p-4">Cliente</th><th class="p-4">Lugar</th><th class="p-4">Etiquetas</th><th class="p-4">Notas</th><th class="p-4">Acción</th></tr></thead><tbody class="divide-y">`;
        clientes.forEach(c => { html += `<tr><td class="p-4"><span class="px-2 py-1 text-xs font-bold rounded ${c.col}">${c.sem}</span></td><td class="p-4 font-bold">${c.nombre_whatsapp}<br><span class="text-xs font-normal">+${c.telefono}</span></td><td class="p-4"><select id="lugar_${c._id}" class="border p-2 text-xs"><option value="consultorio" ${c.tipo_establecimiento==='consultorio'?'selected':''}>Consultorio</option><option value="clínica" ${c.tipo_establecimiento==='clínica'?'selected':''}>Clínica</option></select></td><td class="p-4"><input id="etiq_${c._id}" value="${c.etiquetas}" class="border p-2 text-xs w-full"></td><td class="p-4"><textarea id="notas_${c._id}" class="border p-2 text-xs w-full" rows="2">${c.notas}</textarea></td><td class="p-4"><button onclick="guardar('${c._id}')" class="bg-forestaGold text-white text-xs font-bold px-3 py-2 rounded">Guardar</button></td></tr>`; });
        html += `</tbody></table></div></div><script>async function guardar(id) { await fetch('/admin/clientes/actualizar', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ id, tipo_establecimiento: document.getElementById('lugar_'+id).value, etiquetas: document.getElementById('etiq_'+id).value, notas: document.getElementById('notas_'+id).value }) }); alert('Guardado'); }</script></body></html>`;
        res.send(html);
    } catch (e) { res.status(500).send('Error'); }
});

// 📖 CATÁLOGO (COMPLETO)
app.get('/admin/catalogo', async (req, res) => {
    try {
        const prod = await Producto.find().sort({ categoria: 1, nombre: 1 });
        let html = `<!DOCTYPE html><html><head><title>Catálogo</title>${htmlHead}</head><body class="bg-gray-50 p-8"><div class="max-w-7xl mx-auto">${menuNavegacion}<div class="bg-white p-6 rounded-xl shadow mb-8"><h2 class="font-bold mb-4">Agregar Producto</h2><div class="flex gap-4"><input id="n_cod" placeholder="SKU" class="border p-2"><input id="n_nom" placeholder="Nombre" class="border p-2 w-full"><input id="n_cat" placeholder="Categoría" class="border p-2"><input id="n_pre" placeholder="Precio" type="number" step="0.01" class="border p-2"><button onclick="add()" class="bg-forestaBlack text-white px-4 py-2 font-bold rounded">Add</button></div></div><div class="bg-white rounded-xl shadow"><table class="w-full text-left"><thead><tr class="bg-forestaBlack text-white text-xs uppercase"><th class="p-4">SKU</th><th class="p-4">Nombre</th><th class="p-4">Categoría</th><th class="p-4">Precio</th><th class="p-4">Acciones</th></tr></thead><tbody>`;
        prod.forEach(p => { html += `<tr><td class="p-4 font-bold text-gray-500">${p.codigo}</td><td class="p-4 font-bold">${p.nombre}</td><td class="p-4">${p.categoria}</td><td class="p-4"><input id="p_${p._id}" value="${p.precio.toFixed(2)}" class="border w-20 p-1"></td><td class="p-4"><button onclick="edit('${p._id}')" class="bg-forestaGold text-white px-2 py-1 rounded text-xs mr-2">Guardar</button><button onclick="del('${p._id}')" class="bg-red-500 text-white px-2 py-1 rounded text-xs">X</button></td></tr>`; });
        html += `</tbody></table></div></div><script>async function add(){ await fetch('/admin/catalogo/agregar', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({codigo:document.getElementById('n_cod').value, nombre:document.getElementById('n_nom').value, categoria:document.getElementById('n_cat').value, precio:document.getElementById('n_pre').value, empaque:'Unidad'})}); window.location.reload(); } async function edit(id){ await fetch('/admin/catalogo/editar', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, precio:document.getElementById('p_'+id).value})}); alert('OK'); } async function del(id){ await fetch('/admin/catalogo/eliminar', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id})}); window.location.reload(); }</script></body></html>`;
        res.send(html);
    } catch (e) { res.status(500).send('Error'); }
});

// 📦 PEDIDOS Y PAGOS (COMPLETO)
app.get('/admin', async (req, res) => {
    try {
        const solicitudes = await Solicitud.find().sort({ fecha: -1 });
        let html = `<!DOCTYPE html><html><head><title>Pedidos</title>${htmlHead}</head><body class="bg-gray-50 p-8"><div class="max-w-7xl mx-auto">${menuNavegacion}<div class="bg-white p-4 rounded-xl shadow mb-6 flex gap-4"><input type="text" id="buscador" onkeyup="filtrarTabla()" placeholder="🔍 Buscar..." class="border p-3 w-full rounded"><select id="filtroTipo" onchange="filtrarTabla()" class="border p-3 rounded font-bold"><option value="todos">📋 Todos</option><option value="pedido">📦 Pedidos</option><option value="cotizacion">💬 Proformas</option><option value="validacion_pago">💰 Pagos</option></select></div><div class="bg-white rounded-xl shadow overflow-hidden"><table class="w-full text-left"><thead><tr class="bg-forestaBlack text-white uppercase text-xs"><th class="p-4">Fecha</th><th class="p-4">Cliente</th><th class="p-4">Detalle</th><th class="p-4 text-center">Estado</th><th class="p-4 text-center">Acción</th></tr></thead><tbody class="divide-y">`;
        solicitudes.forEach(sol => { 
            let fecha = new Date(sol.fecha).toLocaleString('es-EC'); let cont = `<div class="text-sm whitespace-pre-wrap">${sol.contenido_texto}</div>`;
            if(sol.tipo_solicitud === 'pedido') { try { let pr = JSON.parse(sol.contenido_texto); cont = '<ul class="list-disc pl-5 text-sm">'; pr.forEach(i => { cont += `<li><strong>${i.cantidad}</strong> x ${i.producto}</li>`; }); cont += '</ul>'; } catch (e) {} }
            let color = sol.estado_atencion === 'pendiente' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-500';
            if(sol.estado_atencion === 'despachado' || sol.estado_atencion === 'pago_aprobado') color = 'bg-green-100 text-green-800';
            
            let btn = '';
            if (sol.tipo_solicitud === 'validacion_pago' && sol.estado_atencion === 'pendiente') { btn = `<button onclick="aprobarPago('${sol._id}', '${sol.id_campana_relacionada}')" class="bg-green-600 text-white text-xs font-bold px-4 py-2 rounded">✅ Aprobar Pago</button>`; } 
            else if (sol.estado_atencion === 'pendiente' && sol.tipo_solicitud === 'pedido') { btn = `<button onclick="act('${sol._id}', 'despachado')" class="bg-forestaBlack text-white text-xs font-bold px-4 py-2 rounded">📦 Despachar</button>`; } 
            else if (sol.estado_atencion === 'pendiente') { btn = `<button onclick="act('${sol._id}', 'despachado')" class="bg-gray-300 text-gray-700 text-xs font-bold px-4 py-2 rounded">✔️ Cerrar</button>`; } 
            else { btn = `<span class="text-xs text-gray-400 font-bold uppercase">✔️ Listo</span>`; }

            html += `<tr class="fila-dato" data-tipo="${sol.tipo_solicitud}"><td class="p-4 text-sm text-gray-500">${fecha}</td><td class="p-4 font-bold">${sol.nombre_cliente}<br><span class="text-xs font-normal">+${sol.telefono_cliente}</span></td><td class="p-4">${cont}</td><td class="p-4 text-center"><span class="px-2 py-1 rounded text-xs font-bold uppercase ${color}">${sol.estado_atencion.replace('_',' ')}</span></td><td class="p-4 text-center">${btn}</td></tr>`; 
        });
        html += `</tbody></table></div></div><script>function filtrarTabla() { let txt = document.getElementById('buscador').value.toLowerCase(); let tipo = document.getElementById('filtroTipo').value; document.querySelectorAll('.fila-dato').forEach(f => { let show = f.innerText.toLowerCase().includes(txt) && (tipo==='todos'||f.dataset.tipo===tipo); f.style.display = show ? '' : 'none'; }); } async function act(id, est) { await fetch('/admin/estado', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({id, estado:est}) }); window.location.reload(); } async function aprobarPago(idSol, idCamp) { if(!confirm('¿Aprobar pago?')) return; await fetch('/admin/pago/aprobar', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ id_solicitud: idSol, id_campana: idCamp }) }); window.location.reload(); }</script></body></html>`;
        res.send(html);
    } catch (e) { res.status(500).send('Error.'); }
});


// 📢 BROADCAST & CURSOS (LA MÁQUINA NUEVA)
app.get('/admin/broadcast', async (req, res) => {
    try {
        const clientes = await Usuario.find().sort({ nombre_whatsapp: 1 });
        const historialCampanas = await Campana.find().sort({ fecha_envio: -1 });

        let listaCheckboxes = '';
        clientes.forEach(c => { listaCheckboxes += `<label class="flex items-center gap-3 p-3 hover:bg-gray-100 rounded-lg cursor-pointer"><input type="checkbox" value="${c.telefono}" class="checkbox-manual w-5 h-5 text-green-600 rounded"><span class="text-sm font-bold text-forestaBlack">${c.nombre_whatsapp} <span class="text-gray-400 font-medium ml-1">(+${c.telefono})</span></span></label>`; });
        
        let filasHistorial = '';
        historialCampanas.forEach(camp => {
            filasHistorial += `<tr class="border-b"><td class="p-4 text-xs font-medium text-gray-500">${new Date(camp.fecha_envio).toLocaleDateString('es-EC')}</td><td class="p-4 font-bold text-forestaBlack">${camp.nombre_campana}</td><td class="p-4 text-center font-bold">${camp.metricas_enviados}</td><td class="p-4 text-center font-bold text-blue-600 bg-blue-50">${camp.metricas_info}</td><td class="p-4 text-center font-bold text-yellow-600 bg-yellow-50">${camp.metricas_reservas}</td><td class="p-4 text-center font-bold text-green-600 bg-green-50">${camp.metricas_pagos}</td></tr>`;
        });

        let html = `<!DOCTYPE html><html><head><title>Campañas</title>${htmlHead}</head><body class="bg-gray-50 p-8"><div class="max-w-7xl mx-auto">${menuNavegacion}<div class="bg-white p-8 rounded-xl shadow-lg border-l-8 border-green-600 mb-8"><h2 class="text-2xl font-extrabold mb-2 uppercase">📢 Gestor de Campañas y Cursos</h2><div class="grid grid-cols-2 gap-8"><div><label class="block text-sm font-bold uppercase mb-2">1. Público</label><select id="tipoFiltro" onchange="mostrarOpcionFiltro()" class="w-full border p-3 rounded mb-4 font-bold"><option value="todos">🌍 TODOS</option><option value="establecimiento">🏥 Por Establecimiento</option><option value="etiqueta">🏷️ Por Etiqueta</option><option value="manual">🎯 Manual</option></select><div id="cajaValorEstablecimiento" class="hidden mb-4"><select id="valorEstablecimiento" class="w-full border p-3 rounded"><option value="consultorio">Consultorio</option><option value="clínica">Clínica</option></select></div><div id="cajaValorEtiqueta" class="hidden mb-4"><input type="text" id="valorEtiqueta" placeholder="Ej: VIP" class="w-full border p-3 rounded"></div><div id="cajaValorManual" class="hidden mb-4"><div class="border rounded p-4 max-h-60 overflow-y-auto">${listaCheckboxes}</div></div><label class="block text-sm font-bold uppercase mb-2 mt-4">2. Estructura</label><input type="text" id="nombreCampana" placeholder="Nombre interno (Ej: Seminario FACE)" class="w-full border p-3 font-bold mb-3"><input type="text" id="linkCampana" placeholder="🔗 Enlace del PDF (Se envía si piden INFO)" class="w-full border p-3 mb-3"><textarea id="bancoCampana" rows="2" placeholder="🏦 Datos Bancarios (Se envía si dicen RESERVAR)" class="w-full border p-3 mb-3"></textarea><label class="block text-sm font-bold uppercase mb-2">3. Oferta Principal</label><textarea id="mensajeCampana" rows="5" placeholder="Escribe tu mensaje..." class="w-full border p-4 mb-4"></textarea><button onclick="disparar()" id="btnEnviar" class="w-full bg-green-600 text-white font-bold py-4 rounded uppercase">🚀 Lanzar Campaña</button><p id="textoCarga" class="text-green-600 font-bold mt-4 text-center hidden">⏳ Enviando...</p></div><div class="bg-gray-100 p-6 rounded-xl flex flex-col items-center"><p class="text-xs font-bold mb-4 uppercase">Vista Previa Celular</p><div class="bg-white p-5 rounded-xl shadow w-full"><p class="text-sm font-medium mb-4">🦷 ¡Hola Dr. Juan Pérez! Espero que tengas un excelente día. ✨</p><p id="vistaPrevia" class="text-sm font-bold whitespace-pre-wrap">[Oferta]</p><p class="text-sm font-medium mt-4 italic">👉 Para más información o reservar tu cupo, responde a este mensaje con la palabra <strong>INFO</strong>.</p></div></div></div></div><div class="bg-white p-8 rounded-xl shadow"><h2 class="text-xl font-extrabold mb-6 uppercase">📊 Historial y Rendimiento</h2><table class="w-full text-left"><thead><tr class="bg-forestaBlack text-white text-xs uppercase"><th class="p-4">Fecha</th><th class="p-4">Campaña</th><th class="p-4 text-center">Enviados</th><th class="p-4 text-center">Pidieron INFO</th><th class="p-4 text-center">Reservas</th><th class="p-4 text-center">Pagados</th></tr></thead><tbody>${filasHistorial || '<tr><td colspan="6" class="text-center p-4">No hay campañas.</td></tr>'}</tbody></table></div></div><script>document.getElementById('mensajeCampana').addEventListener('input', function(e) { let t = e.target.value || '[Oferta]'; t = t.replace(/\\*(.*?)\\*/g, '<strong>$1</strong>'); t = t.replace(/_(.*?)_/g, '<em>$1</em>'); document.getElementById('vistaPrevia').innerHTML = t; }); function mostrarOpcionFiltro() { const f = document.getElementById('tipoFiltro').value; ['Establecimiento','Etiqueta','Manual'].forEach(id => document.getElementById('cajaValor'+id).classList.add('hidden')); if(f!=='todos') document.getElementById('cajaValor'+f.charAt(0).toUpperCase()+f.slice(1)).classList.remove('hidden'); } async function disparar() { const nombre = document.getElementById('nombreCampana').value; const enlace = document.getElementById('linkCampana').value; const banco = document.getElementById('bancoCampana').value; const mensaje = document.getElementById('mensajeCampana').value; const filtro = document.getElementById('tipoFiltro').value; let valorFiltro = ''; let telefonosManuales = []; if (filtro === 'establecimiento') valorFiltro = document.getElementById('valorEstablecimiento').value; if (filtro === 'etiqueta') valorFiltro = document.getElementById('valorEtiqueta').value; if (filtro === 'manual') { document.querySelectorAll('.checkbox-manual:checked').forEach(cb => telefonosManuales.push(cb.value)); if (telefonosManuales.length === 0) return alert("Selecciona doctor."); } if (!nombre.trim() || !mensaje.trim()) return alert("Faltan datos."); if (!confirm('¿Lanzar campaña oficial?')) return; document.getElementById('btnEnviar').classList.add('hidden'); document.getElementById('textoCarga').classList.remove('hidden'); try { const res = await fetch('/admin/broadcast/enviar', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ nombre, enlace, banco, mensaje, filtro, valorFiltro, telefonosManuales }) }); const result = await res.json(); if(result.success){ alert('✅ ¡Disparada!'); window.location.reload(); } else { alert('❌ ERROR META:\\n'+result.error_meta); window.location.reload(); } } catch(e){ alert('Error'); } }</script></body></html>`;
        res.send(html);
    } catch (e) { res.status(500).send("Error."); }
});

// RUTAS INTERNAS ADMINISTRATIVAS
app.post('/admin/catalogo/editar', async (req, res) => { try { await Producto.findByIdAndUpdate(req.body.id, { precio: req.body.precio }); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });
app.post('/admin/catalogo/agregar', async (req, res) => { try { await new Producto(req.body).save(); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });
app.post('/admin/catalogo/eliminar', async (req, res) => { try { await Producto.findByIdAndDelete(req.body.id); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });
app.post('/admin/clientes/actualizar', async (req, res) => { try { await Usuario.findByIdAndUpdate(req.body.id, { tipo_establecimiento: req.body.tipo_establecimiento, etiquetas: req.body.etiquetas, notas: req.body.notas }); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });
app.post('/admin/estado', async (req, res) => { try { const u = await Solicitud.findByIdAndUpdate(req.body.id, { estado_atencion: req.body.estado }, {new:true}); if(req.body.estado==='despachado'){ await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, { method:'POST', headers:{'Authorization':`Bearer ${process.env.WHATSAPP_TOKEN}`,'Content-Type':'application/json'}, body:JSON.stringify({messaging_product:'whatsapp', to:u.telefono_cliente, type:'text', text:{body:`🚚 ¡Tu pedido fue DESPACHADO!`}}) }); } res.json({ success: true }); } catch (e) { res.json({ success: false }); } });

// RUTA MOTOR BROADCAST
app.post('/admin/broadcast/enviar', async (req, res) => {
    try {
        const { nombre, enlace, banco, mensaje, filtro, valorFiltro, telefonosManuales } = req.body;
        let query = {};
        if (filtro === 'establecimiento') query = { tipo_establecimiento: valorFiltro }; 
        else if (filtro === 'etiqueta') query = { etiquetas: { $regex: valorFiltro, $options: 'i' } }; 
        else if (filtro === 'manual') query = { telefono: { $in: telefonosManuales } };
        
        const destinatarios = await Usuario.find(query);
        if (destinatarios.length === 0) return res.json({ success: false, error_meta: "No se encontraron clientes." });

        const nuevaCampana = new Campana({ nombre_campana: nombre, mensaje_cuerpo: mensaje, enlace_pdf: enlace, datos_bancarios: banco, metricas_enviados: destinatarios.length });
        await nuevaCampana.save();

        let errores = [];
        for (const dest of destinatarios) {
            const saludo = `🦷 *¡Hola ${dest.nombre_whatsapp}! Espero que tengas un excelente día.* ✨\n\n`;
            const pie = `\n\n👉 _Para más información o reservar tu cupo, responde a este mensaje con la palabra *INFO*._`;
            const msjFinal = saludo + mensaje.replace(/{{nombre}}/gi, dest.nombre_whatsapp) + pie;
            
            await Usuario.findByIdAndUpdate(dest._id, { notas: (dest.notas || '')+`\n[📢 ${new Date().toLocaleDateString('es-EC')}]: ${nombre}`, ultima_campana: nuevaCampana._id });
            const metaRes = await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: dest.telefono, type: 'text', text: { body: msjFinal } }) });
            const metaData = await metaRes.json();
            if (metaData.error) errores.push(`Bloqueado +${dest.telefono}: ${metaData.error.message}`);
            await new Promise(r => setTimeout(r, 500));
        }
        
        if (errores.length > 0) res.json({ success: false, error_meta: errores[0] }); else res.json({ success: true, intentos: destinatarios.length });
    } catch (e) { res.json({ success: false, error_meta: "Error del servidor." }); }
});

// APROBAR PAGOS
app.post('/admin/pago/aprobar', async (req, res) => {
    try {
        const sol = await Solicitud.findByIdAndUpdate(req.body.id_solicitud, { estado_atencion: 'pago_aprobado' });
        if (req.body.id_campana) await Campana.findByIdAndUpdate(req.body.id_campana, { $inc: { metricas_pagos: 1 } });
        await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: sol.telefono_cliente, type: 'text', text: { body: `🎉 *¡Pago Aprobado!*\nTu plaza está 100% asegurada. Nos emociona contar contigo.` } }) });
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

// --- 6. BOT DE WHATSAPP (WEBHOOK) ---
app.get('/webhook', (req, res) => { if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === process.env.VERIFY_TOKEN) res.status(200).send(req.query['hub.challenge']); else res.sendStatus(403); });
async function enviarMensajeInmediato(tel, txt) { await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: tel, type: 'text', text: { body: txt } }) }); }

app.post('/webhook', async (req, res) => {
    res.sendStatus(200); 
    if (req.body.entry?.[0]?.changes?.[0]?.value?.messages) {
        let val = req.body.entry[0].changes[0].value;
        let from = val.messages[0].from; 
        if (from === '16315551181') return; // Ignorar el número del propio bot

        let mType = val.messages[0].type;
        let mBody = mType === 'text' ? val.messages[0].text.body.trim() : ''; 
        let nombre = val.contacts[0].profile.name; 

        try {
            let u = await Usuario.findOne({ telefono: from });
            let resp = ''; const txtM = `1️⃣ Catálogo\n2️⃣ Cotizar Productos\n3️⃣ Nuevo Pedido\n4️⃣ Contacto`;

            if (!u) { u = new Usuario({ telefono: from, nombre_whatsapp: nombre }); await u.save(); }

            // LÓGICA DE COMPROBANTES DE PAGO
            if (mType === 'image' && u.estado_conversacion === 'esperando_pago') {
                await new Solicitud({ telefono_cliente: from, nombre_cliente: nombre, tipo_solicitud: 'validacion_pago', id_campana_relacionada: u.ultima_campana, contenido_texto: '💰 [COMPROBANTE RECIBIDO]\nEl doctor envió una FOTO por WhatsApp. Revisa el celular de la empresa y aprueba el pago en la Torre.' }).save();
                u.estado_conversacion = 'menu_principal'; await u.save();
                return await enviarMensajeInmediato(from, "📸 *¡Comprobante recibido!*\nValidaremos la transferencia y te enviaremos confirmación en breve.");
            } else if (mType === 'image') {
                return await enviarMensajeInmediato(from, "Recibí tu imagen. Si deseas un pedido, escribe *Menu*.");
            }

            // LÓGICA DEL EMBUDO DE CAMPAÑAS
            let msgL = mBody.toLowerCase();
            if (msgL === 'info') {
                if (u.ultima_campana) {
                    const c = await Campana.findById(u.ultima_campana);
                    if (c) {
                        await Campana.findByIdAndUpdate(c._id, { $inc: { metricas_info: 1 } });
                        resp = `¡Excelente decisión, ${nombre}! 🎉\n\nInfo detallada:\n🔗 ${c.enlace_pdf || 'Sin enlace'}\n\n🎟️ *¿Deseas asegurar tu cupo?* Responde: *RESERVAR*.`;
                        u.estado_conversacion = 'esperando_reserva'; await u.save();
                    } else resp = `La campaña expiró. Escribe *Menu*.`;
                } else resp = `No hay campañas activas. Escribe *Menu*.`;
            }
            else if (msgL === 'reservar' && u.estado_conversacion === 'esperando_reserva') {
                const c = await Campana.findById(u.ultima_campana);
                if (c) {
                    await Campana.findByIdAndUpdate(c._id, { $inc: { metricas_reservas: 1 } });
                    resp = `✅ *¡Pre-reserva confirmada!*\n\nRealiza tu transferencia a:\n${c.datos_bancarios || 'Cta. Forestadent'}\n\n📸 *Cuando transfieras, envíame la foto del comprobante aquí mismo.*`;
                    u.estado_conversacion = 'esperando_pago'; await u.save();
                }
            }
            // LÓGICA DEL CORE (PEDIDOS Y COTIZACIONES)
            else if (msgL === 'menu' || msgL === 'menú') { u.estado_conversacion = 'menu_principal'; await u.save(); resp = txtM; }
            else if (u.estado_conversacion === 'esperando_pedido') {
                await enviarMensajeInmediato(from, "⏳ Organizando...");
                const data = await analizarPedidoConIA(mBody);
                if (data) { await new Solicitud({ telefono_cliente: from, nombre_cliente: nombre, tipo_solicitud: 'pedido', contenido_texto: JSON.stringify(data) }).save(); resp = `✅ ¡Pedido procesado! Pronto despacharemos.`; } 
                else { resp = `Error analizando.`; }
                u.estado_conversacion = 'menu_principal'; await u.save();
            }
            else if (u.estado_conversacion === 'esperando_cotizacion') {
                await enviarMensajeInmediato(from, "⏳ Calculando...");
                const cot = await generarCotizacionConIA(mBody, await Producto.find().lean());
                const nSol = await new Solicitud({ telefono_cliente: from, nombre_cliente: nombre, tipo_solicitud: 'cotizacion', contenido_texto: cot, estado_atencion: 'cotizado' }).save();
                resp = `✅ Listo.\n📄 *Descarga tu Proforma:* https://${req.get('host')}/proforma/${nSol._id}\n\n¿Convertir en pedido? Responde *SI*.`;
                u.estado_conversacion = 'decidiendo_cotizacion'; await u.save();
            }
            else if (u.estado_conversacion === 'decidiendo_cotizacion') {
                if (['si', 'sí', 'ok'].some(p => msgL.includes(p))) {
                    await enviarMensajeInmediato(from, "⏳ Generando pedido...");
                    const uCot = await Solicitud.findOne({ telefono_cliente: from, tipo_solicitud: 'cotizacion' }).sort({ fecha: -1 });
                    if (uCot) {
                        const data = await analizarPedidoConIA(uCot.contenido_texto);
                        if(data){ await new Solicitud({ telefono_cliente: from, nombre_cliente: nombre, tipo_solicitud: 'pedido', contenido_texto: JSON.stringify(data) }).save(); resp = `✅ ¡Pedido generado desde proforma!`; } else resp = `Error procesando.`;
                    } else resp = `Proforma no encontrada.`;
                } else { resp = `Guardado.\n\n` + txtM; }
                u.estado_conversacion = 'menu_principal'; await u.save();
            }
            else if (u.estado_conversacion === 'esperando_contacto') {
                await new Solicitud({ telefono_cliente: from, nombre_cliente: nombre, tipo_solicitud: 'contacto', contenido_texto: mBody }).save();
                u.estado_conversacion = 'menu_principal'; await u.save(); resp = `✅ Contacto registrado.`;
            }
            else if (u.estado_conversacion === 'menu_principal' || u.estado_conversacion === 'inicio') {
                if (u.estado_conversacion === 'inicio') { u.estado_conversacion = 'menu_principal'; await u.save(); }
                switch(mBody) {
                    case '1': resp = `📘 *Catálogo*\nwww.forestadent.com`; break;
                    case '2': u.estado_conversacion = 'esperando_cotizacion'; await u.save(); resp = `Escribe a cotizar:`; break;
                    case '3': u.estado_conversacion = 'esperando_pedido'; await u.save(); resp = `Escribe tu pedido:`; break;
                    case '4': u.estado_conversacion = 'esperando_contacto'; await u.save(); resp = `Motivo:`; break;
                    default: resp = `No reconocí.\n\n` + txtM; break;
                }
            } else { resp = `Recibí tu mensaje.\n_(Escribe *Menu*)_`; }
            
            if (resp !== '') await enviarMensajeInmediato(from, resp);
        } catch (e) { console.error(e); }
    }
});

app.listen(PORT, () => { console.log(`🚀 Motor Full Stack en puerto ${PORT}`); });