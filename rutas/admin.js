const express = require('express');
const router = express.Router();

// Importamos los cimientos que creamos en los pasos 1 y 2
const { Usuario, Solicitud, Producto, Campana } = require('../modelos/BaseDatos');
const { htmlHead, menuNavegacion, scriptExportarExcel } = require('../vistas/Plantillas');

// 1. PROFORMAS PDF WEB
router.get('/proforma/:id', async (req, res) => {
    try {
        const solicitud = await Solicitud.findById(req.params.id);
        if (!solicitud || solicitud.tipo_solicitud !== 'cotizacion') return res.status(404).send('No encontrada.');
        const fecha = new Date(solicitud.fecha).toLocaleDateString('es-EC'); const num = solicitud._id.toString().slice(-6).toUpperCase();
        let txt = solicitud.contenido_texto.replace(/[*_~]/g, '');
        let html = `<!DOCTYPE html><html><head><title>Proforma</title>${htmlHead}</head><body class="bg-gray-100 p-8"><div id="pdf" class="bg-white p-12 rounded-xl max-w-3xl mx-auto border-t-8 border-forestaGold"><div class="flex justify-between border-b-2 pb-6"><img src="/logo-vector-forestadent.webp" class="h-16" onerror="this.style.display='none'"><div class="text-right"><h1 class="text-2xl font-extrabold uppercase">Proforma</h1><p class="text-sm font-bold text-forestaGold">DOC-${num}</p></div></div><div class="grid grid-cols-2 gap-6 mb-8 mt-6"><div><p class="text-xs font-bold text-gray-400">Cliente:</p><p class="text-lg font-bold">${solicitud.nombre_cliente}</p><p class="text-sm text-gray-500">+${solicitud.telefono_cliente}</p></div><div class="text-right"><p class="text-xs font-bold text-gray-400">Fecha:</p><p class="font-bold">${fecha}</p></div></div><div class="bg-gray-50 p-8 rounded-xl border"><pre class="font-sans whitespace-pre-wrap font-medium">${txt}</pre></div><div class="text-center mt-6 pt-6 border-t-2"><p class="text-xs font-bold text-gray-400">Generado por IA • Forestadent B2B</p></div></div><div class="text-center mt-8 hide-on-print"><button onclick="html2pdf().set({margin:10, filename:'Proforma_${num}.pdf'}).from(document.getElementById('pdf')).save()" class="bg-forestaBlack text-white font-bold py-3 px-6 rounded">📥 Descargar PDF</button></div><style>@media print { .hide-on-print { display: none !important; } }</style></body></html>`;
        res.send(html);
    } catch (e) { res.status(500).send("Error"); }
});

// 2. DASHBOARD BI
router.get('/admin/dashboard', async (req, res) => {
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

// 3. CRM CLIENTES
router.get('/admin/clientes', async (req, res) => {
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

// 4. CATÁLOGO
router.get('/admin/catalogo', async (req, res) => {
    try {
        const prod = await Producto.find().sort({ categoria: 1, nombre: 1 });
        let html = `<!DOCTYPE html><html><head><title>Catálogo</title>${htmlHead}</head><body class="bg-gray-50 p-8"><div class="max-w-7xl mx-auto">${menuNavegacion}<div class="bg-white p-6 rounded-xl shadow mb-8"><h2 class="font-bold mb-4">Agregar Producto</h2><div class="flex gap-4"><input id="n_cod" placeholder="SKU" class="border p-2"><input id="n_nom" placeholder="Nombre" class="border p-2 w-full"><input id="n_cat" placeholder="Categoría" class="border p-2"><input id="n_pre" placeholder="Precio" type="number" step="0.01" class="border p-2"><button onclick="add()" class="bg-forestaBlack text-white px-4 py-2 font-bold rounded">Add</button></div></div><div class="bg-white rounded-xl shadow"><table class="w-full text-left"><thead><tr class="bg-forestaBlack text-white text-xs uppercase"><th class="p-4">SKU</th><th class="p-4">Nombre</th><th class="p-4">Categoría</th><th class="p-4">Precio</th><th class="p-4">Acciones</th></tr></thead><tbody>`;
        prod.forEach(p => { html += `<tr><td class="p-4 font-bold text-gray-500">${p.codigo}</td><td class="p-4 font-bold">${p.nombre}</td><td class="p-4">${p.categoria}</td><td class="p-4"><input id="p_${p._id}" value="${p.precio.toFixed(2)}" class="border w-20 p-1"></td><td class="p-4"><button onclick="edit('${p._id}')" class="bg-forestaGold text-white px-2 py-1 rounded text-xs mr-2">Guardar</button><button onclick="del('${p._id}')" class="bg-red-500 text-white px-2 py-1 rounded text-xs">X</button></td></tr>`; });
        html += `</tbody></table></div></div><script>async function add(){ await fetch('/admin/catalogo/agregar', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({codigo:document.getElementById('n_cod').value, nombre:document.getElementById('n_nom').value, categoria:document.getElementById('n_cat').value, precio:document.getElementById('n_pre').value, empaque:'Unidad'})}); window.location.reload(); } async function edit(id){ await fetch('/admin/catalogo/editar', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, precio:document.getElementById('p_'+id).value})}); alert('OK'); } async function del(id){ await fetch('/admin/catalogo/eliminar', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id})}); window.location.reload(); }</script></body></html>`;
        res.send(html);
    } catch (e) { res.status(500).send('Error'); }
});

// 5. PEDIDOS Y PAGOS
router.get('/admin', async (req, res) => {
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

// 6. CAMPAÑAS Y BROADCAST
router.get('/admin/broadcast', async (req, res) => {
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

// 7. FUNCIONES POST (BOTONES DE ACCIÓN)
router.post('/admin/catalogo/editar', async (req, res) => { try { await Producto.findByIdAndUpdate(req.body.id, { precio: req.body.precio }); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });
router.post('/admin/catalogo/agregar', async (req, res) => { try { await new Producto(req.body).save(); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });
router.post('/admin/catalogo/eliminar', async (req, res) => { try { await Producto.findByIdAndDelete(req.body.id); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });
router.post('/admin/clientes/actualizar', async (req, res) => { try { await Usuario.findByIdAndUpdate(req.body.id, { tipo_establecimiento: req.body.tipo_establecimiento, etiquetas: req.body.etiquetas, notas: req.body.notas }); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });

router.post('/admin/estado', async (req, res) => { 
    try { 
        const u = await Solicitud.findByIdAndUpdate(req.body.id, { estado_atencion: req.body.estado }, {new:true}); 
        if(req.body.estado==='despachado'){ 
            await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, { method:'POST', headers:{'Authorization':`Bearer ${process.env.WHATSAPP_TOKEN}`,'Content-Type':'application/json'}, body:JSON.stringify({messaging_product:'whatsapp', to:u.telefono_cliente, type:'text', text:{body:`🚚 ¡Buenas noticias!\nTu pedido fue DESPACHADO.`}}) }); 
        } 
        res.json({ success: true }); 
    } catch (e) { res.json({ success: false }); } 
});

router.post('/admin/pago/aprobar', async (req, res) => {
    try {
        const sol = await Solicitud.findByIdAndUpdate(req.body.id_solicitud, { estado_atencion: 'pago_aprobado' });
        if (req.body.id_campana) await Campana.findByIdAndUpdate(req.body.id_campana, { $inc: { metricas_pagos: 1 } });
        await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: sol.telefono_cliente, type: 'text', text: { body: `🎉 *¡Pago Aprobado y Confirmado!*\n\nTu plaza está 100% asegurada. Nos emociona mucho contar contigo. Si hay material previo, te lo enviaremos por este medio en los próximos días.` } }) });
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

router.post('/admin/broadcast/enviar', async (req, res) => {
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

// EXPORTAMOS EL ROUTER
module.exports = router;