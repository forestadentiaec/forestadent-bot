const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const { Usuario, Solicitud, Producto, Campana, Ticket } = require('../modelos/BaseDatos');
const { htmlHead, menuNavegacion } = require('../vistas/Plantillas');

// 1. GENERADOR DE CÓDIGOS QR
router.get('/ticket/qr/:id', async (req, res) => {
    try {
        const urlAprobacion = `https://${req.get('host')}/escanear/${req.params.id}`;
        res.type('png');
        QRCode.toFileStream(res, urlAprobacion, { width: 400, margin: 2, color: { dark: '#111111', light: '#FFFFFF' } });
    } catch(e) { res.status(500).send('Error'); }
});

// 2. ESCÁNER CON PIN DE SEGURIDAD
router.get('/escanear/:id', async (req, res) => {
    try {
        const ticket = await Ticket.findOne({ id_unico: req.params.id });
        if (!ticket) return res.send(`<h1 style="color:red; text-align:center;">❌ TICKET FALSO</h1>`);
        
        let est = ticket.asistencia_confirmada 
            ? `<div style="background:#FEE2E2; color:#991B1B; padding:20px; text-align:center;">⚠️ TICKET YA FUE USADO</div>` 
            : `<div style="background:#D1FAE5; color:#065F46; padding:20px; text-align:center;">✅ TICKET VÁLIDO</div>
               <div style="text-align:center; margin-top:20px;">
                 <input type="password" id="pinAcceso" placeholder="PIN" style="font-size:24px; width:120px; padding:10px; margin-bottom:15px; text-align:center;">
                 <button onclick="marcar()" style="background:#111111; color:white; padding:15px 30px; font-size:18px; width:100%;">🎟️ INGRESAR</button>
               </div>`;
               
        res.send(`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family:sans-serif; background:#f9fafb; padding:20px;">
            <div style="background:white; padding:30px; border-radius:15px; max-width:400px; margin:auto;">
                <h1 style="color:#B4975A; text-align:center;">${ticket.id_unico}</h1>
                <p style="text-align:center; font-size:24px; font-weight:bold;">${ticket.nombre_cliente}</p>
                ${est}
            </div>
            <script>
                async function marcar() {
                    const pin = document.getElementById('pinAcceso').value;
                    const res = await fetch('/ticket/marcar', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id: '${ticket.id_unico}', pin}) });
                    const data = await res.json();
                    if(data.success) { alert('✅ Confirmado'); window.location.reload(); } else { alert('❌ ' + data.error); }
                }
            </script>
        </body></html>`);
    } catch(e) { res.status(500).send('Error'); }
});

router.post('/ticket/marcar', async (req, res) => {
    try {
        if (req.body.pin !== '2026') return res.json({ success: false, error: 'PIN incorrecto' });
        await Ticket.findOneAndUpdate({ id_unico: req.body.id }, { asistencia_confirmada: true, fecha_escaneo: Date.now() });
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); }
});

// 3. APROBACIÓN DE PAGO
router.post('/admin/pago/aprobar', async (req, res) => {
    try {
        const sol = await Solicitud.findByIdAndUpdate(req.body.id_solicitud, { estado_atencion: 'pago_aprobado' });
        if (req.body.id_campana) {
            await Campana.findByIdAndUpdate(req.body.id_campana, { $inc: { metricas_pagos: 1 } });
            const camp = await Campana.findById(req.body.id_campana);
            const idTicket = 'FST-' + Math.random().toString(36).substring(2, 7).toUpperCase();
            await new Ticket({ id_unico: idTicket, telefono_cliente: sol.telefono_cliente, nombre_cliente: sol.nombre_cliente, nombre_evento: camp.nombre_campana }).save();
            const urlQR = `https://${req.get('host')}/ticket/qr/${idTicket}`;
            await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: sol.telefono_cliente, type: 'image', image: { link: urlQR, caption: `🎉 ¡Aprobado!\nTu ticket VIP para ${camp.nombre_campana}.` } }) });
        } else {
            await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: sol.telefono_cliente, type: 'text', text: { body: `🎉 Pago Aprobado. Despacharemos pronto.` } }) });
        }
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

// 4. INVENTARIO E IA CON EXPORTACIÓN NATIVA (INFALIBLE)
router.get('/admin/inventario', async (req, res) => {
    try {
        const prod = await Producto.find().sort({ categoria: 1, nombre: 1 });
        let filas = prod.map(p => `
            <tr class="hover:bg-gray-50 border-b">
                <td class="p-4 font-bold text-gray-800">${p.codigo}<br><span class="font-normal text-gray-500">${p.nombre}</span></td>
                <td class="p-4"><input type="number" id="st_${p._id}" value="${p.stock_actual}" class="border-2 border-gray-300 w-24 p-2 text-center rounded-lg font-bold text-blue-700"></td>
                <td class="p-4"><input type="number" id="seg_${p._id}" value="${p.stock_seguridad}" class="border w-24 p-2 text-center rounded-lg"></td>
                <td class="p-4"><input type="number" id="lt_${p._id}" value="${p.lead_time_dias}" class="border w-20 p-2 text-center rounded-lg"></td>
                <td class="p-4 hide-on-print"><button onclick="guardarInv('${p._id}')" class="bg-gray-200 px-4 py-2 rounded font-bold">Guardar</button></td>
            </tr>
        `).join('');

        res.send(`<!DOCTYPE html><html><head>${htmlHead}
        <style>
            @media print {
                body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background-color: white !important; }
                body * { visibility: hidden; }
                #pdfReporte, #pdfReporte * { visibility: visible; }
                #pdfReporte { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 20px; border: none; box-shadow: none; }
                .hide-on-print { display: none !important; }
            }
        </style>
        </head><body class="bg-gray-50 p-8">
        <div class="max-w-7xl mx-auto hide-on-print">${menuNavegacion}</div>
        <div class="max-w-7xl mx-auto bg-white p-8 rounded-xl shadow border-l-8 border-blue-600 print:border-none print:shadow-none">
            <div class="flex justify-between items-center mb-6 hide-on-print">
                <h2 class="text-2xl font-extrabold uppercase">📦 Asistente de Compras (IA)</h2>
                <button onclick="analizarIA()" id="btnIA" class="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold shadow">🧠 Analizar Stock con IA</button>
            </div>
            
            <div id="cajaResultadoIA" class="hidden mb-8">
                <div id="pdfReporte" class="p-8 bg-white border border-gray-200 rounded-lg shadow-sm">
                    <h3 class="text-xl font-extrabold mb-6 uppercase text-blue-900 border-b-2 border-blue-100 pb-4">📑 Reporte Ejecutivo de Abastecimiento</h3>
                    <div id="textoReporte" class="text-sm text-gray-800" style="line-height: 1.6;"></div>
                    <p class="text-xs text-gray-400 mt-8 pt-4 border-t border-gray-100 text-center font-bold">Generado por Inteligencia Artificial • Forestadent B2B Ecuador • ${new Date().toLocaleDateString('es-EC')}</p>
                </div>
                <button onclick="window.print()" class="mt-4 bg-forestaBlack text-white font-bold py-3 px-6 rounded-lg shadow-lg w-full hover:bg-gray-800 transition hide-on-print">🖨️ Imprimir / Guardar como PDF</button>
            </div>
            
            <table class="w-full text-left hide-on-print">
                <thead><tr class="bg-forestaBlack text-white text-xs uppercase"><th class="p-4">SKU & Nombre</th><th class="p-4">Stock Actual</th><th class="p-4">Seguridad</th><th class="p-4">Tránsito</th><th class="p-4">Acción</th></tr></thead>
                <tbody>${filas}</tbody>
            </table>
        </div>
        <script>
            async function guardarInv(id){ 
                await fetch('/admin/inventario/actualizar', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, stock_actual: document.getElementById('st_'+id).value, stock_seguridad: document.getElementById('seg_'+id).value, lead_time_dias: document.getElementById('lt_'+id).value})}); 
                location.reload();
            }
            async function analizarIA(){
                const caja = document.getElementById('cajaResultadoIA');
                const texto = document.getElementById('textoReporte');
                caja.classList.remove('hidden');
                texto.innerHTML = '<div class="text-center font-bold text-blue-600 my-8">🧠 Analizando modelos lógicos de inventario...</div>';
                try {
                    const r = await fetch('/admin/inventario/analizar', {method:'POST'});
                    const d = await r.json();
                    if(d.success) {
                        texto.innerHTML = d.analisis;
                    } else {
                        texto.innerHTML = '<div class="text-red-600 font-bold">❌ Error evaluando stock. Revisa los logs de Render.</div>';
                    }
                } catch(e) { texto.innerHTML = '<div class="text-red-600 font-bold">❌ Error de conexión.</div>'; }
            }
        </script></body></html>`);
    } catch (e) { res.status(500).send('Error'); }
});

router.post('/admin/inventario/actualizar', async (req, res) => {
    try { await Producto.findByIdAndUpdate(req.body.id, req.body); res.json({success:true}); } catch(e) { res.json({success:false}); }
});

router.post('/admin/inventario/analizar', async (req, res) => {
    try {
        const prod = await Producto.find();
        const inv = prod.map(p => `SKU: ${p.codigo} | Stock: ${p.stock_actual} | Mínimo: ${p.stock_seguridad} | Tránsito: ${p.lead_time_dias}días`).join('\n');
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const prompt = `Eres el Gerente Logístico de Forestadent. Analiza este stock y genera un reporte corporativo claro indicando qué pedir a Casa Matriz.\n${inv}`;
        let result = null;
        
        const modelos = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro'];
        
        for (const m of modelos) {
            try { 
                const model = genAI.getGenerativeModel({ model: m }); 
                result = await model.generateContent(prompt); 
                if (result && result.response) break; 
            } catch (e) {}
        }
        
        if (result) res.json({ success: true, analisis: result.response.text().replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>') });
        else res.json({ success: false });
    } catch (e) { res.json({ success: false }); }
});

// 5. CRM DE CLIENTES
router.get('/admin/clientes', async (req, res) => {
    try {
        const clRaw = await Usuario.find().sort({ fecha_registro: -1 });
        let filas = clRaw.map(c => `
            <tr class="border-b hover:bg-gray-50">
                <td class="p-4 font-bold">${c.nombre_whatsapp}<br><span class="text-xs font-normal text-gray-500">+${c.telefono}</span></td>
                <td class="p-4"><input type="text" id="ciudad_${c._id}" value="${c.ciudad || 'Quito'}" class="border p-2 w-full text-sm mb-1"><input type="text" id="dir_${c._id}" value="${c.direccion || ''}" placeholder="Dirección" class="border p-2 w-full text-sm"></td>
                <td class="p-4"><input type="text" id="esp_${c._id}" value="${c.especialidad || 'Ortodoncia'}" class="border p-2 w-full text-sm mb-1"><select id="lugar_${c._id}" class="border p-2 w-full text-sm"><option value="consultorio" ${c.tipo_establecimiento==='consultorio'?'selected':''}>Consultorio</option><option value="clínica" ${c.tipo_establecimiento==='clínica'?'selected':''}>Clínica</option></select></td>
                <td class="p-4"><textarea id="notas_${c._id}" class="border p-2 w-full text-sm" rows="2" placeholder="Notas...">${c.notas || ''}</textarea></td>
                <td class="p-4"><button onclick="guardar('${c._id}')" class="bg-forestaGold text-white font-bold px-4 py-2 rounded text-sm">Guardar</button></td>
            </tr>
        `).join('');

        res.send(`<!DOCTYPE html><html><head>${htmlHead}</head><body class="bg-gray-50 p-8"><div class="max-w-7xl mx-auto">${menuNavegacion}
        <div class="bg-white rounded-xl shadow overflow-hidden"><table class="w-full text-left">
        <thead><tr class="bg-forestaBlack text-white text-xs uppercase"><th class="p-4">Cliente</th><th class="p-4">Ubicación</th><th class="p-4">Perfil</th><th class="p-4">Notas</th><th class="p-4">Acción</th></tr></thead>
        <tbody>${filas}</tbody></table></div>
        <script>async function guardar(id) { await fetch('/admin/clientes/actualizar', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({id, ciudad: document.getElementById('ciudad_'+id).value, direccion: document.getElementById('dir_'+id).value, especialidad: document.getElementById('esp_'+id).value, tipo_establecimiento: document.getElementById('lugar_'+id).value, notas: document.getElementById('notas_'+id).value }) }); location.reload(); }</script>
        </div></body></html>`);
    } catch (e) { res.status(500).send('Error'); }
});

router.post('/admin/clientes/actualizar', async (req, res) => {
    try { await Usuario.findByIdAndUpdate(req.body.id, req.body); res.json({ success: true }); } catch (e) { res.json({ success: false }); }
});

// 6. GESTOR DE CAMPAÑAS Y BROADCAST (VERSIÓN AVANZADA RESTAURADA)
router.get('/admin/broadcast', async (req, res) => { 
    try { 
        const clientes = await Usuario.find().sort({ nombre_whatsapp: 1 }); 
        const historialCampanas = await Campana.find().sort({ fecha_envio: -1 }); 
        const tickets = await Ticket.find().sort({ fecha_emision: -1 }); 
        
        let listaCheckboxes = ''; 
        clientes.forEach(c => { listaCheckboxes += `<label class="flex items-center gap-3 p-3 hover:bg-gray-100 rounded-lg cursor-pointer"><input type="checkbox" value="${c.telefono}" class="checkbox-manual w-5 h-5 text-green-600 rounded"><span class="text-sm font-bold text-forestaBlack">${c.nombre_whatsapp} <span class="text-gray-400 font-medium ml-1">(+${c.telefono})</span></span></label>`; }); 
        
        let filasHistorial = ''; 
        historialCampanas.forEach(camp => { let fechaEvt = camp.fecha_evento ? new Date(camp.fecha_evento).toLocaleString('es-EC') : 'Sin fecha'; filasHistorial += `<tr class="border-b"><td class="p-4 text-xs font-medium text-gray-500">${fechaEvt}</td><td class="p-4 font-bold text-forestaBlack">${camp.nombre_campana}</td><td class="p-4 text-center font-bold">${camp.metricas_enviados}</td><td class="p-4 text-center font-bold text-blue-600 bg-blue-50">${camp.metricas_info}</td><td class="p-4 text-center font-bold text-yellow-600 bg-yellow-50">${camp.metricas_reservas}</td><td class="p-4 text-center font-bold text-green-600 bg-green-50">${camp.metricas_pagos}</td></tr>`; }); 
        
        let filasAsistencia = ''; 
        tickets.forEach(t => { let estado = t.asistencia_confirmada ? '<span class="text-green-600 font-bold bg-green-100 px-3 py-1 rounded-full text-xs">🟢 Asistió</span>' : '<span class="text-red-500 font-bold bg-red-100 px-3 py-1 rounded-full text-xs">🔴 Ausente</span>'; filasAsistencia += `<tr class="border-b hover:bg-gray-50"><td class="p-4 text-xs font-medium text-gray-500">${new Date(t.fecha_emision).toLocaleDateString('es-EC')}</td><td class="p-4 font-bold text-forestaBlack">${t.nombre_cliente}</td><td class="p-4 font-bold text-gray-700">${t.nombre_evento}</td><td class="p-4 text-sm font-medium text-gray-500">${t.id_unico}</td><td class="p-4 text-center">${estado}</td></tr>`; }); 
        
        let html = `<!DOCTYPE html><html><head><title>Campañas</title>${htmlHead}</head><body class="bg-gray-50 p-8"><div class="max-w-7xl mx-auto">${menuNavegacion}
        <div class="bg-white p-8 rounded-xl shadow border-l-8 border-green-600 mb-8">
            <h2 class="text-2xl font-extrabold mb-2 uppercase">📢 Gestor de Campañas</h2>
            <div class="grid grid-cols-2 gap-8">
                <div>
                    <label class="block text-sm font-bold uppercase mb-2">1. Público</label>
                    <select id="tipoFiltro" onchange="mostrarOpcionFiltro()" class="w-full border p-3 rounded mb-4 font-bold"><option value="todos">🌍 TODOS</option><option value="establecimiento">🏥 Por Establecimiento</option><option value="etiqueta">🏷️ Por Etiqueta</option><option value="manual">🎯 Manual</option></select>
                    <div id="cajaValorEstablecimiento" class="hidden mb-4"><select id="valorEstablecimiento" class="w-full border p-3 rounded"><option value="consultorio">Consultorio</option><option value="clínica">Clínica</option></select></div>
                    <div id="cajaValorEtiqueta" class="hidden mb-4"><input type="text" id="valorEtiqueta" placeholder="Ej: VIP" class="w-full border p-3 rounded"></div>
                    <div id="cajaValorManual" class="hidden mb-4"><div class="border rounded p-4 max-h-60 overflow-y-auto">${listaCheckboxes}</div></div>
                    
                    <label class="block text-sm font-bold uppercase mb-2 mt-4">2. Estructura</label>
                    <input type="text" id="nombreCampana" placeholder="Nombre interno" class="w-full border p-3 font-bold mb-3">
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Fecha y Hora del Evento:</label>
                    <input type="datetime-local" id="fechaEventoCampana" class="w-full border p-3 font-bold mb-3 bg-gray-50">
                    <input type="text" id="linkCampana" placeholder="🔗 Enlace del PDF" class="w-full border p-3 mb-3">
                    <textarea id="bancoCampana" rows="2" placeholder="🏦 Datos Bancarios" class="w-full border p-3 mb-3"></textarea>
                    
                    <label class="block text-sm font-bold uppercase mb-2">3. Mensaje</label>
                    <textarea id="mensajeCampana" rows="5" placeholder="Escribe tu mensaje..." class="w-full border p-4 mb-4"></textarea>
                    <button onclick="disparar()" id="btnEnviar" class="w-full bg-green-600 text-white font-bold py-4 rounded uppercase">🚀 Lanzar</button>
                    <p id="textoCarga" class="text-green-600 font-bold mt-4 text-center hidden">⏳ Enviando...</p>
                </div>
                <div class="bg-gray-100 p-6 rounded-xl flex flex-col items-center">
                    <p class="text-xs font-bold mb-4 uppercase">Vista Previa</p>
                    <div class="bg-white p-5 rounded-xl shadow w-full"><p class="text-sm font-medium mb-4">🦷 ¡Hola! ✨</p><p id="vistaPrevia" class="text-sm font-bold">[Oferta]</p><p class="text-sm font-medium mt-4 italic">👉 Para más información responde INFO.</p></div>
                </div>
            </div>
        </div>
        
        <div class="bg-white p-8 rounded-xl shadow mb-8">
            <h2 class="text-xl font-extrabold mb-6 uppercase">📊 Historial</h2>
            <table class="w-full text-left"><thead><tr class="bg-forestaBlack text-white text-xs uppercase"><th class="p-4">Fecha Evento</th><th class="p-4">Campaña</th><th class="p-4">Enviados</th><th class="p-4">INFO</th><th class="p-4">Reservas</th><th class="p-4">Pagos</th></tr></thead><tbody>${filasHistorial||'<tr><td colspan="6" class="text-center p-4">Nada aún.</td></tr>'}</tbody></table>
        </div>
        
        <div class="bg-white p-8 rounded-xl shadow">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-xl font-extrabold uppercase">🎓 Asistencia</h2>
                <button onclick="exportarTablaDiplomas()" class="bg-blue-900 text-white font-bold py-2 px-4 rounded text-sm">📥 Exportar Excel</button>
            </div>
            <table id="tablaDiplomas" class="w-full text-left"><thead><tr class="bg-forestaBlack text-white text-xs uppercase"><th class="p-4">Emisión</th><th class="p-4">Doctor</th><th class="p-4">Evento</th><th class="p-4">Ticket</th><th class="p-4">Estado</th></tr></thead><tbody>${filasAsistencia||'<tr><td colspan="5" class="text-center p-4">Vacio</td></tr>'}</tbody></table>
        </div>
        </div>
        <script>
            document.getElementById('mensajeCampana').addEventListener('input', function(e) { let t = e.target.value || '[Oferta]'; t = t.replace(/\\*(.*?)\\*/g, '<strong>$1</strong>'); t = t.replace(/_(.*?)_/g, '<em>$1</em>'); document.getElementById('vistaPrevia').innerHTML = t; }); 
            function mostrarOpcionFiltro() { const f = document.getElementById('tipoFiltro').value; ['Establecimiento','Etiqueta','Manual'].forEach(id => document.getElementById('cajaValor'+id).classList.add('hidden')); if(f!=='todos') document.getElementById('cajaValor'+f.charAt(0).toUpperCase()+f.slice(1)).classList.remove('hidden'); } 
            async function disparar() { 
                const nombre = document.getElementById('nombreCampana').value; const fecha_evento = document.getElementById('fechaEventoCampana').value; const enlace = document.getElementById('linkCampana').value; const banco = document.getElementById('bancoCampana').value; const mensaje = document.getElementById('mensajeCampana').value; const filtro = document.getElementById('tipoFiltro').value; let valorFiltro = ''; let telefonosManuales = []; 
                if (filtro === 'establecimiento') valorFiltro = document.getElementById('valorEstablecimiento').value; 
                if (filtro === 'etiqueta') valorFiltro = document.getElementById('valorEtiqueta').value; 
                if (filtro === 'manual') { document.querySelectorAll('.checkbox-manual:checked').forEach(cb => telefonosManuales.push(cb.value)); if (telefonosManuales.length === 0) return alert("Selecciona doctor."); } 
                if (!nombre.trim() || !mensaje.trim()) return alert("Faltan datos."); 
                if (!confirm('¿Lanzar campaña?')) return; 
                document.getElementById('btnEnviar').classList.add('hidden'); document.getElementById('textoCarga').classList.remove('hidden'); 
                try { 
                    const res = await fetch('/admin/broadcast/enviar', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ nombre, fecha_evento, enlace, banco, mensaje, filtro, valorFiltro, telefonosManuales }) }); 
                    const result = await res.json(); 
                    if(result.success){ alert('✅ ¡Disparada!'); window.location.reload(); } else { alert('❌ ERROR:\\n'+result.error_meta); window.location.reload(); } 
                } catch(e){ alert('Error'); } 
            } 
            function exportarTablaDiplomas() { let wb = XLSX.utils.table_to_book(document.getElementById("tablaDiplomas")); XLSX.writeFile(wb, "Asistencia.xlsx"); }
        </script>
        <!-- Librería para Exportar a Excel -->
        <script src="https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js"></script>
        </body></html>`; 
        res.send(html); 
    } catch (e) { res.status(500).send("Error."); } 
});

router.post('/admin/broadcast/enviar', async (req, res) => { 
    try { 
        const { nombre, fecha_evento, enlace, banco, mensaje, filtro, valorFiltro, telefonosManuales } = req.body; 
        let query = {}; 
        if (filtro === 'establecimiento') query = { tipo_establecimiento: valorFiltro }; 
        else if (filtro === 'etiqueta') query = { etiquetas: { $regex: valorFiltro, $options: 'i' } }; 
        else if (filtro === 'manual') query = { telefono: { $in: telefonosManuales } }; 
        
        const destinatarios = await Usuario.find(query); 
        if (destinatarios.length === 0) return res.json({ success: false, error_meta: "Nadie encontrado." }); 
        
        const nuevaCampana = new Campana({ nombre_campana: nombre, fecha_evento: fecha_evento ? new Date(fecha_evento) : null, mensaje_cuerpo: mensaje, enlace_pdf: enlace, datos_bancarios: banco, metricas_enviados: destinatarios.length }); 
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
        
        if (errores.length > 0) res.json({ success: false, error_meta: errores[0] }); 
        else res.json({ success: true, intentos: destinatarios.length }); 
    } catch (e) { res.json({ success: false, error_meta: "Error." }); } 
});

// 7. DASHBOARD Y PEDIDOS (CON BOTÓN CAZADOR PARA PROFORMAS)
router.get('/proforma/:id', async (req, res) => { 
    try { 
        const s = await Solicitud.findById(req.params.id); 
        if (!s || s.tipo_solicitud !== 'cotizacion') return res.status(404).send('No encontrada.'); 
        const f = new Date(s.fecha).toLocaleDateString('es-EC'); const n = s._id.toString().slice(-6).toUpperCase(); 
        let t = s.contenido_texto.replace(/[*_~]/g, ''); 
        let h = `<!DOCTYPE html><html><head><title>Proforma DOC-${n}</title>${htmlHead}
        <style>@media print { .hide-on-print { display: none !important; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }</style>
        </head><body class="bg-gray-100 p-8"><div id="pdf" class="bg-white p-12 rounded-xl max-w-3xl mx-auto border-t-8 border-forestaGold"><div class="flex justify-between border-b-2 pb-6"><img src="/logo-vector-forestadent.webp" class="h-16" onerror="this.style.display='none'"><div class="text-right"><h1 class="text-2xl font-extrabold uppercase">Proforma</h1><p class="text-sm font-bold text-forestaGold">DOC-${n}</p></div></div><div class="grid grid-cols-2 gap-6 mb-8 mt-6"><div><p class="text-xs font-bold text-gray-400">Cliente:</p><p class="text-lg font-bold">${s.nombre_cliente}</p><p class="text-sm text-gray-500">+${s.telefono_cliente}</p></div><div class="text-right"><p class="text-xs font-bold text-gray-400">Fecha:</p><p class="font-bold">${f}</p></div></div><div class="bg-gray-50 p-8 rounded-xl border"><pre class="font-sans whitespace-pre-wrap font-medium">${t}</pre></div><div class="text-center mt-6 pt-6 border-t-2"><p class="text-xs font-bold text-gray-400">Generado por IA • Forestadent B2B</p></div></div>
        <div class="text-center mt-8 hide-on-print"><button onclick="window.print()" class="bg-forestaBlack text-white font-bold py-3 px-6 rounded">🖨️ Imprimir / Guardar como PDF</button></div></body></html>`; 
        res.send(h); 
    } catch (e) { res.status(500).send("Error"); } 
});

router.get('/admin', async (req, res) => {
    try {
        const sol = await Solicitud.find().sort({ fecha: -1 });
        let filas = sol.map(s => {
            let btn = '';
            
            if (s.tipo_solicitud === 'cotizacion' && (s.estado_atencion === 'pendiente' || s.estado_atencion === 'cotizado')) {
                btn = `<button onclick="cazar('${s._id}')" class="bg-forestaGold text-white text-xs font-bold px-4 py-2 rounded shadow mb-1 w-full hover:bg-yellow-600 transition">🎯 Cazador (Seguimiento)</button><br>
                       <button onclick="act('${s._id}', 'cerrado')" class="bg-gray-300 text-gray-700 text-xs font-bold px-4 py-2 rounded w-full">✔️ Cerrar</button>`;
            } else if (s.tipo_solicitud === 'pedido' && s.estado_atencion === 'pendiente') {
                btn = `<button onclick="act('${s._id}', 'despachado')" class="bg-forestaBlack text-white text-xs font-bold px-4 py-2 rounded shadow w-full">📦 Despachar</button>`;
            } else {
                btn = `<span class="text-xs text-gray-400 font-bold uppercase block text-center">✔️ ${s.estado_atencion.replace('_', ' ')}</span>`;
            }

            return `<tr class="border-b hover:bg-gray-50">
                        <td class="p-4 text-sm text-gray-500">${new Date(s.fecha).toLocaleDateString()}</td>
                        <td class="p-4 font-bold text-gray-800">${s.nombre_cliente}<br><span class="text-xs text-gray-400 font-normal">+${s.telefono_cliente}</span></td>
                        <td class="p-4 uppercase text-xs font-bold text-blue-600">${s.tipo_solicitud}</td>
                        <td class="p-4"><div class="flex flex-col gap-1 w-32">${btn}</div></td>
                    </tr>`;
        }).join('');

        res.send(`<!DOCTYPE html><html><head>${htmlHead}</head><body class="bg-gray-50 p-8"><div class="max-w-7xl mx-auto">${menuNavegacion}
        <div class="bg-white rounded-xl shadow border-t-8 border-forestaBlack overflow-hidden"><table class="w-full text-left">
        <thead><tr class="bg-gray-100 text-gray-600 text-xs uppercase"><th class="p-4">Fecha</th><th class="p-4">Cliente</th><th class="p-4">Tipo</th><th class="p-4">Acción</th></tr></thead>
        <tbody>${filas}</tbody></table></div>
        
        <script>
            async function act(id, estado){ 
                await fetch('/admin/estado', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, estado})}); 
                location.reload(); 
            }
            
            async function cazar(id) {
                if(!confirm('¿Disparar mensaje corporativo de seguimiento por WhatsApp a este doctor?')) return;
                try {
                    const res = await fetch('/admin/solicitud/cazar', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({id}) });
                    const data = await res.json();
                    if(data.success) { alert('✅ ¡Mensaje de seguimiento enviado exitosamente!'); location.reload(); }
                    else { alert('❌ Hubo un error al enviar el seguimiento.'); }
                } catch(e) { alert('❌ Error de conexión.'); }
            }
        </script></div></body></html>`);
    } catch(e) { res.status(500).send('Error'); }
});

router.post('/admin/estado', async (req, res) => {
    try { await Solicitud.findByIdAndUpdate(req.body.id, { estado_atencion: req.body.estado }); res.json({success:true}); } catch(e) { res.json({success:false}); }
});

router.post('/admin/solicitud/cazar', async (req, res) => {
    try {
        const sol = await Solicitud.findById(req.body.id);
        if (!sol) return res.json({ success: false });

        const linkPdf = `https://${req.get('host')}/proforma/${sol._id}`;
        const mensaje = `🦷 *Hola ${sol.nombre_cliente}*, le escribimos de Forestadent. ✨\n\n¿Pudo revisar la cotización que le enviamos recientemente?\n\n👉 Si desea proceder con el pedido, solo responda este mensaje con un *SÍ* y lo preparamos de inmediato.\n\n📄 Puede revisar el detalle corporativo de su cotización aquí: \n${linkPdf}`;

        await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ messaging_product: 'whatsapp', to: sol.telefono_cliente, type: 'text', text: { body: mensaje } })
        });
        
        await Solicitud.findByIdAndUpdate(req.body.id, { estado_atencion: 'recordatorio_enviado' });
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

router.get('/admin/dashboard', (req, res) => res.redirect('/admin'));
router.get('/admin/catalogo', async (req, res) => {
    try {
        const prod = await Producto.find();
        let filas = prod.map(p => `<tr><td class="p-4">${p.codigo}</td><td class="p-4">${p.nombre}</td><td class="p-4 font-bold text-blue-600">$${p.precio}</td></tr>`).join('');
        res.send(`<!DOCTYPE html><html><head>${htmlHead}</head><body class="bg-gray-50 p-8"><div class="max-w-7xl mx-auto">${menuNavegacion}<div class="bg-white rounded-xl shadow"><table class="w-full text-left"><thead><tr class="bg-forestaBlack text-white text-xs uppercase"><th class="p-4">SKU</th><th class="p-4">Nombre</th><th class="p-4">Precio</th></tr></thead><tbody>${filas}</tbody></table></div></div></body></html>`);
    } catch(e) { res.status(500).send('Error'); }
});

module.exports = router;