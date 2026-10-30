const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const { GoogleGenerativeAI } = require('@google/generative-ai'); 

const { Usuario, Solicitud, Producto, Campana, Ticket } = require('../modelos/BaseDatos');
const { htmlHead, menuNavegacion, scriptExportarExcel } = require('../vistas/Plantillas');

// 1. GENERADOR DE IMAGEN QR
router.get('/ticket/qr/:id', async (req, res) => {
    try {
        const urlAprobacion = `https://${req.get('host')}/escanear/${req.params.id}`;
        res.type('png');
        QRCode.toFileStream(res, urlAprobacion, { width: 400, margin: 2, color: { dark: '#111111', light: '#FFFFFF' } });
    } catch(e) { res.status(500).send('Error generando QR'); }
});

// 2. PANTALLA SECRETA DE ESCÁNER
router.get('/escanear/:id', async (req, res) => {
    try {
        const ticket = await Ticket.findOne({ id_unico: req.params.id });
        if (!ticket) return res.send(`<h1 style="color:red; text-align:center; font-family:sans-serif; margin-top:50px;">❌ TICKET FALSO O INEXISTENTE</h1>`);
        let estadoHtml = ''; let btnHtml = '';
        if (ticket.asistencia_confirmada) {
            estadoHtml = `<div style="background:#FEE2E2; color:#991B1B; padding:20px; border-radius:10px; font-size:20px; font-weight:bold; margin-bottom:20px;">⚠️ ALERTA: ESTE TICKET YA FUE USADO<br><span style="font-size:14px; font-weight:normal;">Fecha de ingreso: ${new Date(ticket.fecha_escaneo).toLocaleString('es-EC')}</span></div>`;
        } else {
            estadoHtml = `<div style="background:#D1FAE5; color:#065F46; padding:20px; border-radius:10px; font-size:20px; font-weight:bold; margin-bottom:20px;">✅ TICKET VÁLIDO</div>`;
            btnHtml = `<div style="margin-top:20px;"><p style="font-size:12px; font-weight:bold; color:#6b7280; text-transform:uppercase; margin-bottom:5px;">🔑 PIN Staff:</p><input type="password" id="pinAcceso" placeholder="****" maxlength="4" style="text-align:center; font-size:24px; font-weight:bold; width:120px; padding:10px; margin-bottom:15px; border:2px solid #ccc; border-radius:8px; outline:none;"><button onclick="marcar()" style="background:#111111; color:white; padding:15px 30px; font-size:18px; font-weight:bold; border-radius:8px; border:none; cursor:pointer; width:100%; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">🎟️ PERMITIR INGRESO</button></div>`;
        }
        let html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Escáner Forestadent</title></head><body style="font-family:sans-serif; background:#f9fafb; text-align:center; padding:20px; margin:0;"><div style="background:white; padding:30px; border-radius:15px; box-shadow:0 4px 10px rgba(0,0,0,0.1); max-width:400px; margin:20px auto; border-top:8px solid #B4975A;"><h2 style="margin-top:0; color:#111111; text-transform:uppercase; font-size:16px; letter-spacing:2px;">🎫 Control de Acceso</h2><h1 style="color:#B4975A; font-size:36px; margin:10px 0;">${ticket.id_unico}</h1><p style="color:#6b7280; margin-bottom:5px; font-size:14px; text-transform:uppercase;">Doctor/a:</p><p style="font-size:24px; font-weight:bold; margin-top:0; color:#111111;">${ticket.nombre_cliente}</p><p style="color:#6b7280; margin-bottom:5px; font-size:14px; text-transform:uppercase;">Evento Oficial:</p><p style="font-size:18px; font-weight:bold; margin-top:0; margin-bottom:30px; color:#111111;">${ticket.nombre_evento}</p>${estadoHtml}${btnHtml}</div><script>async function marcar() { const pin = document.getElementById('pinAcceso').value; if(!pin) return alert('Ingresa el PIN'); if(!confirm('¿Permitir ingreso?')) return; const res = await fetch('/ticket/marcar', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id: '${ticket.id_unico}', pin: pin}) }); const data = await res.json(); if(data.success) { alert('✅ Ingreso Confirmado'); window.location.reload(); } else { alert('❌ ' + data.error); } }</script></body></html>`;
        res.send(html);
    } catch(e) { res.status(500).send('Error'); }
});
router.post('/ticket/marcar', async (req, res) => {
    try {
        if (req.body.pin !== '2026') return res.json({ success: false, error: 'PIN incorrecto' });
        await Ticket.findOneAndUpdate({ id_unico: req.body.id }, { asistencia_confirmada: true, fecha_escaneo: Date.now() }); res.json({ success: true });
    } catch(e) { res.json({ success: false, error: 'Error' }); }
});

// 3. PAGOS Y CREADOR DE TICKETS
router.post('/admin/pago/aprobar', async (req, res) => {
    try {
        const sol = await Solicitud.findByIdAndUpdate(req.body.id_solicitud, { estado_atencion: 'pago_aprobado' });
        if (req.body.id_campana) {
            await Campana.findByIdAndUpdate(req.body.id_campana, { $inc: { metricas_pagos: 1 } });
            const camp = await Campana.findById(req.body.id_campana);
            const idTicket = 'FST-' + Math.random().toString(36).substring(2, 7).toUpperCase();
            await new Ticket({ id_unico: idTicket, telefono_cliente: sol.telefono_cliente, nombre_cliente: sol.nombre_cliente, nombre_evento: camp.nombre_campana }).save();
            const urlImagenQR = `https://${req.get('host')}/ticket/qr/${idTicket}`;
            await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: sol.telefono_cliente, type: 'image', image: { link: urlImagenQR, caption: `🎉 *¡Pago Aprobado y Confirmado!*\n\nTu plaza para el evento *${camp.nombre_campana}* está asegurada.\n\n🎟️ *ESTE ES TU PASE VIP.*\nPreséntalo desde tu celular en la puerta el día del evento.` } }) });
        } else {
            await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: sol.telefono_cliente, type: 'text', text: { body: `🎉 *¡Pago Aprobado!*\n\nProcederemos con el despacho.` } }) });
        } res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

// 🚨 4. GESTOR DE INVENTARIO E INTELIGENCIA ARTIFICIAL (CON CASCADA)
router.get('/admin/inventario', async (req, res) => {
    try {
        const prod = await Producto.find().sort({ categoria: 1, nombre: 1 });
        let html = `<!DOCTYPE html><html><head><title>Inventario & IA</title>${htmlHead}</head><body class="bg-gray-50 p-8"><div class="max-w-7xl mx-auto">${menuNavegacion}
        <div class="bg-white p-8 rounded-xl shadow-lg border-l-8 border-blue-600 mb-8">
            <div class="flex justify-between items-center mb-4">
                <div><h2 class="text-2xl font-extrabold uppercase text-forestaBlack">📦 Asistente de Compras (IA)</h2><p class="text-sm text-gray-500 font-medium mt-1">Sincronización simulada de stock. La IA cruza tu inventario con los tiempos de importación.</p></div>
                <button onclick="analizarIA()" id="btnIA" class="bg-blue-600 hover:bg-blue-800 text-white px-6 py-4 rounded-xl font-bold shadow-lg transition flex items-center gap-2">🧠 Analizar Stock con IA</button>
            </div>
            
            <div id="respuestaIA" class="hidden bg-blue-50 p-6 rounded-xl border border-blue-200 mb-8 text-sm text-gray-800 shadow-inner" style="line-height: 1.6;"></div>
            
            <div class="overflow-x-auto"><table class="w-full text-left">
                <thead><tr class="bg-forestaBlack text-white text-xs uppercase"><th class="p-4 rounded-tl-lg">SKU & Nombre</th><th class="p-4 text-center">Stock Actual</th><th class="p-4 text-center">Stock Seguridad</th><th class="p-4 text-center">Lead Time (Días)</th><th class="p-4 text-center rounded-tr-lg">Acción</th></tr></thead>
                <tbody class="divide-y">`;
        
        prod.forEach(p => {
            let alerta = '';
            if (p.stock_actual <= p.stock_seguridad) alerta = '<span class="text-red-600 text-xs font-bold block mt-1 uppercase tracking-wide">⚠️ Peligro de Quiebre</span>';
            else if (p.stock_actual <= (p.stock_seguridad * 1.5)) alerta = '<span class="text-yellow-600 text-xs font-bold block mt-1 uppercase tracking-wide">⚡ Reposición Próxima</span>';
            
            html += `<tr class="hover:bg-gray-50 transition">
                <td class="p-4"><p class="font-bold text-gray-800">${p.codigo}</p><p class="text-sm font-medium text-gray-600">${p.nombre}</p>${alerta}</td>
                <td class="p-4 text-center"><input type="number" id="st_${p._id}" value="${p.stock_actual}" class="border-2 border-gray-300 w-24 p-2 text-center rounded-lg font-extrabold text-lg text-blue-700"></td>
                <td class="p-4 text-center"><input type="number" id="seg_${p._id}" value="${p.stock_seguridad}" class="border w-24 p-2 text-center rounded-lg bg-gray-50"></td>
                <td class="p-4 text-center"><div class="flex items-center justify-center"><input type="number" id="lt_${p._id}" value="${p.lead_time_dias}" class="border w-20 p-2 text-center rounded-lg mr-2"> <span class="text-xs font-bold text-gray-400">días</span></div></td>
                <td class="p-4 text-center"><button onclick="guardarInv('${p._id}')" class="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded text-xs font-bold transition">Actualizar</button></td>
            </tr>`;
        });
        
        html += `</tbody></table></div></div></div>
        <script>
            async function guardarInv(id){ 
                const data = { id, stock_actual: document.getElementById('st_'+id).value, stock_seguridad: document.getElementById('seg_'+id).value, lead_time_dias: document.getElementById('lt_'+id).value }; 
                await fetch('/admin/inventario/actualizar', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)}); 
                alert('✅ Parámetros guardados'); window.location.reload();
            }
            async function analizarIA(){
                const btn = document.getElementById('btnIA'); const resp = document.getElementById('respuestaIA');
                btn.innerHTML = '⏳ Analizando matriz de datos...'; btn.disabled = true; btn.classList.add('opacity-50');
                resp.classList.remove('hidden'); resp.innerHTML = '<div class="text-center font-bold text-blue-600">🧠 Iniciando motor lógico... Cruzando stock físico vs. tiempos de tránsito internacionales...</div>';
                try {
                    const res = await fetch('/admin/inventario/analizar', {method:'POST'});
                    const data = await res.json();
                    if(data.success){
                        let texto = data.analisis.replace(/\\*\\*(.*?)\\*\\*/g, '<strong class="text-blue-900">$1</strong>').replace(/\\*(.*?)\\*/g, '<em>$1</em>').replace(/\\n/g, '<br>');
                        resp.innerHTML = '<h3 class="text-lg font-extrabold mb-4 uppercase text-blue-900">📑 Reporte Ejecutivo de Abastecimiento</h3>' + texto;
                    } else { resp.innerHTML = '❌ Error de procesamiento en la IA.'; }
                } catch(e) { resp.innerHTML = '❌ Error de conexión al servidor AI.'; }
                btn.innerHTML = '🧠 Analizar Stock con IA'; btn.disabled = false; btn.classList.remove('opacity-50');
            }
        </script></body></html>`;
        res.send(html);
    } catch (e) { res.status(500).send('Error'); }
});

router.post('/admin/inventario/actualizar', async (req, res) => {
    try {
        await Producto.findByIdAndUpdate(req.body.id, { stock_actual: req.body.stock_actual, stock_seguridad: req.body.stock_seguridad, lead_time_dias: req.body.lead_time_dias });
        res.json({success:true});
    } catch(e) { res.json({success:false}); }
});

router.post('/admin/inventario/analizar', async (req, res) => {
    try {
        const prod = await Producto.find().sort({ categoria: 1 });
        let datosInventario = prod.map(p => `- [SKU: ${p.codigo}]${p.nombre} | Stock Físico: ${p.stock_actual} | Stock Seguridad Mínimo: ${p.stock_seguridad} | Tránsito desde Alemania: ${p.lead_time_dias} días`).join('\n');
        
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        
        const prompt = `Eres el Gerente Experto de Supply Chain e IA Corporativa de Forestadent Ecuador (distribuidor B2B de ortodoncia).
        Actúas como asesor logístico directo para Néstor Bernal (CEO/Gerente).
        
        Aquí tienes la matriz actual de inventario:
        ${datosInventario}
        
        Instrucciones estrictas:
        1. Identifica de inmediato qué referencias están en estado CRÍTICO (stock actual por debajo o igual al stock de seguridad).
        2. Advierte los riesgos considerando los "días de tránsito". Si el stock es bajo y el tránsito es largo, la urgencia es máxima.
        3. Redacta una sugerencia de ORDEN DE COMPRA (Purchase Order) clara, calculando cuántas unidades pedir a Casa Matriz (Alemania) para salir de la zona de riesgo y cubrir la venta del próximo trimestre.
        4. Tono: Directo, corporativo, B2B y muy analítico. No uses saludos genéricos ni te despidas afectuosamente. Ve directo a los datos y la estrategia. Usa Markdown (negritas) para los números y SKUs importantes.`;

        // 🚨 SISTEMA DE CASCADA (FALLBACK) RESTAURADO 🚨
        const modelosDisponibles = ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-pro", "gemini-1.0-pro"];
        let result = null;

        for (const nombreModelo of modelosDisponibles) {
            try {
                console.log(`🧠 Intentando analizar inventario con: ${nombreModelo}`);
                const model = genAI.getGenerativeModel({ model: nombreModelo });
                result = await model.generateContent(prompt);
                
                if (result && result.response) {
                    console.log(`✅ Éxito con el modelo: ${nombreModelo}`);
                    break; // Rompemos el ciclo si funcionó exitosamente
                }
            } catch (errorModelo) {
                console.log(`⚠️ Falló el modelo ${nombreModelo}, saltando al siguiente en la lista...`);
            }
        }

        if (!result || !result.response) {
            return res.json({ success: false, error: "Todos los modelos de la cascada fallaron." });
        }

        res.json({ success: true, analisis: result.response.text() });
    } catch (e) { 
        console.error(e); 
        res.json({ success: false }); 
    }
});


// 5. RESTO DE RUTAS ESTÁNDAR COMPACTADAS
router.get('/admin/broadcast', async (req, res) => { try { const clientes = await Usuario.find().sort({ nombre_whatsapp: 1 }); const historialCampanas = await Campana.find().sort({ fecha_envio: -1 }); const tickets = await Ticket.find().sort({ fecha_emision: -1 }); let listaCheckboxes = ''; clientes.forEach(c => { listaCheckboxes += `<label class="flex items-center gap-3 p-3 hover:bg-gray-100 rounded-lg cursor-pointer"><input type="checkbox" value="${c.telefono}" class="checkbox-manual w-5 h-5 text-green-600 rounded"><span class="text-sm font-bold text-forestaBlack">${c.nombre_whatsapp} <span class="text-gray-400 font-medium ml-1">(+${c.telefono})</span></span></label>`; }); let filasHistorial = ''; historialCampanas.forEach(camp => { let fechaEvt = camp.fecha_evento ? new Date(camp.fecha_evento).toLocaleString('es-EC') : 'Sin fecha'; filasHistorial += `<tr class="border-b"><td class="p-4 text-xs font-medium text-gray-500">${fechaEvt}</td><td class="p-4 font-bold text-forestaBlack">${camp.nombre_campana}</td><td class="p-4 text-center font-bold">${camp.metricas_enviados}</td><td class="p-4 text-center font-bold text-blue-600 bg-blue-50">${camp.metricas_info}</td><td class="p-4 text-center font-bold text-yellow-600 bg-yellow-50">${camp.metricas_reservas}</td><td class="p-4 text-center font-bold text-green-600 bg-green-50">${camp.metricas_pagos}</td></tr>`; }); let filasAsistencia = ''; tickets.forEach(t => { let estado = t.asistencia_confirmada ? '<span class="text-green-600 font-bold bg-green-100 px-3 py-1 rounded-full text-xs">🟢 Asistió</span>' : '<span class="text-red-500 font-bold bg-red-100 px-3 py-1 rounded-full text-xs">🔴 Ausente</span>'; filasAsistencia += `<tr class="border-b hover:bg-gray-50"><td class="p-4 text-xs font-medium text-gray-500">${new Date(t.fecha_emision).toLocaleDateString('es-EC')}</td><td class="p-4 font-bold text-forestaBlack">${t.nombre_cliente}</td><td class="p-4 font-bold text-gray-700">${t.nombre_evento}</td><td class="p-4 text-sm font-medium text-gray-500">${t.id_unico}</td><td class="p-4 text-center">${estado}</td></tr>`; }); let html = `<!DOCTYPE html><html><head><title>Campañas</title>${htmlHead}</head><body class="bg-gray-50 p-8"><div class="max-w-7xl mx-auto">${menuNavegacion}<div class="bg-white p-8 rounded-xl shadow border-l-8 border-green-600 mb-8"><h2 class="text-2xl font-extrabold mb-2 uppercase">📢 Gestor de Campañas</h2><div class="grid grid-cols-2 gap-8"><div><label class="block text-sm font-bold uppercase mb-2">1. Público</label><select id="tipoFiltro" onchange="mostrarOpcionFiltro()" class="w-full border p-3 rounded mb-4 font-bold"><option value="todos">🌍 TODOS</option><option value="establecimiento">🏥 Por Establecimiento</option><option value="etiqueta">🏷️ Por Etiqueta</option><option value="manual">🎯 Manual</option></select><div id="cajaValorEstablecimiento" class="hidden mb-4"><select id="valorEstablecimiento" class="w-full border p-3 rounded"><option value="consultorio">Consultorio</option><option value="clínica">Clínica</option></select></div><div id="cajaValorEtiqueta" class="hidden mb-4"><input type="text" id="valorEtiqueta" placeholder="Ej: VIP" class="w-full border p-3 rounded"></div><div id="cajaValorManual" class="hidden mb-4"><div class="border rounded p-4 max-h-60 overflow-y-auto">${listaCheckboxes}</div></div><label class="block text-sm font-bold uppercase mb-2 mt-4">2. Estructura</label><input type="text" id="nombreCampana" placeholder="Nombre interno" class="w-full border p-3 font-bold mb-3"><label class="block text-xs font-bold text-gray-500 uppercase mb-1">Fecha y Hora del Evento:</label><input type="datetime-local" id="fechaEventoCampana" class="w-full border p-3 font-bold mb-3 bg-gray-50"><input type="text" id="linkCampana" placeholder="🔗 Enlace del PDF" class="w-full border p-3 mb-3"><textarea id="bancoCampana" rows="2" placeholder="🏦 Datos Bancarios" class="w-full border p-3 mb-3"></textarea><label class="block text-sm font-bold uppercase mb-2">3. Mensaje</label><textarea id="mensajeCampana" rows="5" placeholder="Escribe tu mensaje..." class="w-full border p-4 mb-4"></textarea><button onclick="disparar()" id="btnEnviar" class="w-full bg-green-600 text-white font-bold py-4 rounded uppercase">🚀 Lanzar</button><p id="textoCarga" class="text-green-600 font-bold mt-4 text-center hidden">⏳ Enviando...</p></div><div class="bg-gray-100 p-6 rounded-xl flex flex-col items-center"><p class="text-xs font-bold mb-4 uppercase">Vista Previa</p><div class="bg-white p-5 rounded-xl shadow w-full"><p class="text-sm font-medium mb-4">🦷 ¡Hola! ✨</p><p id="vistaPrevia" class="text-sm font-bold">[Oferta]</p><p class="text-sm font-medium mt-4 italic">👉 Para más información responde INFO.</p></div></div></div></div><div class="bg-white p-8 rounded-xl shadow mb-8"><h2 class="text-xl font-extrabold mb-6 uppercase">📊 Historial</h2><table class="w-full text-left"><thead><tr class="bg-forestaBlack text-white text-xs uppercase"><th class="p-4">Fecha Evento</th><th class="p-4">Campaña</th><th class="p-4">Enviados</th><th class="p-4">INFO</th><th class="p-4">Reservas</th><th class="p-4">Pagos</th></tr></thead><tbody>${filasHistorial||'<tr><td colspan="6" class="text-center p-4">Nada aún.</td></tr>'}</tbody></table></div><div class="bg-white p-8 rounded-xl shadow"><div class="flex justify-between items-center mb-6"><h2 class="text-xl font-extrabold uppercase">🎓 Asistencia</h2><button onclick="exportarTablaDiplomas()" class="bg-blue-900 text-white font-bold py-2 px-4 rounded text-sm">📥 Exportar</button></div><table id="tablaDiplomas" class="w-full text-left"><thead><tr class="bg-forestaBlack text-white text-xs uppercase"><th class="p-4">Emisión</th><th class="p-4">Doctor</th><th class="p-4">Evento</th><th class="p-4">Ticket</th><th class="p-4">Estado</th></tr></thead><tbody>${filasAsistencia||'<tr><td colspan="5" class="text-center p-4">Vacio</td></tr>'}</tbody></table></div></div><script>document.getElementById('mensajeCampana').addEventListener('input', function(e) { let t = e.target.value || '