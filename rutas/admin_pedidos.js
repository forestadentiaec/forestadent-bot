const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const { Usuario, Solicitud, Producto, Campana, Ticket } = require('../modelos/BaseDatos');
const { htmlHead, menuNavegacion } = require('../vistas/Plantillas');

// GENERADOR Y ESCÁNER QR
router.get('/ticket/qr/:id', async (req, res) => {
    try {
        const urlAprobacion = `https://${req.get('host')}/escanear/${req.params.id}`;
        res.type('png');
        QRCode.toFileStream(res, urlAprobacion, { width: 400, margin: 2, color: { dark: '#111111', light: '#FFFFFF' } });
    } catch (e) { res.status(500).send('Error generando QR'); }
});

router.get('/escanear/:id', async (req, res) => {
    try {
        const ticket = await Ticket.findOne({ id_unico: req.params.id });
        if (!ticket) return res.send(`<h1 style="color:red; text-align:center; font-family:sans-serif; margin-top:50px;">❌ TICKET NO ENCONTRADO O FALSO</h1>`);
        let est = ticket.asistencia_confirmada ? `<div style="background:#FEE2E2; color:#991B1B; padding:20px; text-align:center; border-radius:10px; font-weight:bold;">⚠️ ESTE TICKET YA FUE UTILIZADO</div>` : `<div style="background:#D1FAE5; color:#065F46; padding:20px; text-align:center; border-radius:10px; font-weight:bold;">✅ TICKET VÁLIDO PARA INGRESO</div><div style="text-align:center; margin-top:20px;"><input type="password" id="pinAcceso" placeholder="PIN Staff" style="font-size:24px; width:140px; padding:10px; margin-bottom:15px; text-align:center; border:2px solid #ccc; border-radius:8px;"><button onclick="marcar()" style="background:#111111; color:white; padding:15px 30px; font-size:18px; width:100%; border-radius:8px; font-weight:bold; cursor:pointer;">🎟️ CONFIRMAR ASISTENCIA</button></div>`;
        res.send(`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Validación QR</title></head><body style="font-family:sans-serif; background:#f3f4f6; padding:20px;"><div style="background:white; padding:30px; border-radius:15px; max-width:400px; margin:auto; box-shadow:0 4px 10px rgba(0,0,0,0.1); border-top:8px solid #B4975A;"><p style="text-align:center; font-size:12px; color:#888; text-transform:uppercase; font-weight:bold; margin:0;">Forestadent Ecuador VIP</p><h1 style="color:#B4975A; text-align:center; margin:10px 0;">${ticket.id_unico}</h1><p style="text-align:center; font-size:22px; font-weight:bold; margin:5px 0;">${ticket.nombre_cliente}</p><p style="text-align:center; font-size:14px; color:#555; margin-bottom:20px;">Evento: <b>${ticket.nombre_evento}</b></p>${est}</div><script>async function marcar() { const pin = document.getElementById('pinAcceso').value; const res = await fetch('/ticket/marcar', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id: '${ticket.id_unico}', pin}) }); const data = await res.json(); if(data.success) { alert('✅ Asistencia confirmada correctamente'); window.location.reload(); } else { alert('❌ ' + data.error); } }</script></body></html>`);
    } catch (e) { res.status(500).send('Error en escáner'); }
});

router.post('/ticket/marcar', async (req, res) => {
    try {
        if (req.body.pin !== '2026') return res.json({ success: false, error: 'PIN de seguridad incorrecto' });
        await Ticket.findOneAndUpdate({ id_unico: req.body.id }, { asistencia_confirmada: true, fecha_escaneo: Date.now() });
        res.json({ success: true });
    } catch (e) { res.json({ success: false, error: 'Error de servidor' }); }
});

router.post('/admin/pago/aprobar', async (req, res) => {
    try {
        const sol = await Solicitud.findByIdAndUpdate(req.body.id_solicitud, { estado_atencion: 'pago_aprobado' });
        if (!sol) return res.json({ success: false });
        const campanaReciente = await Campana.findOne().sort({ fecha_envio: -1 });
        const idCampana = req.body.id_campana || (campanaReciente ? campanaReciente._id : null);
        if (idCampana) {
            await Campana.findByIdAndUpdate(idCampana, { $inc: { metricas_pagos: 1 } });
            const camp = await Campana.findById(idCampana);
            const idTicket = 'FST-' + Math.random().toString(36).substring(2, 7).toUpperCase();
            await new Ticket({ id_unico: idTicket, telefono_cliente: sol.telefono_cliente, nombre_cliente: sol.nombre_cliente, nombre_evento: camp ? camp.nombre_campana : 'Evento VIP Forestadent' }).save();
            const urlQR = `https://${req.get('host')}/ticket/qr/${idTicket}`;
            await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: sol.telefono_cliente, type: 'image', image: { link: urlQR, caption: `🎉 *¡Pago Aprobado, ${sol.nombre_cliente}!*\n\nAquí tienes tu Pase VIP Oficial (${idTicket}) para *${camp ? camp.nombre_campana : 'nuestro evento'}*.\n\nPresenta este código QR en la entrada.` } }) });
        } else {
            await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: sol.telefono_cliente, type: 'text', text: { body: `🎉 *¡Pago Aprobado, ${sol.nombre_cliente}!*\n\nHemos validado tu comprobante y procederemos con el despacho de inmediato.` } }) });
        }
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

// DASHBOARD
router.get('/admin/dashboard', async (req, res) => {
    try {
        const solicitudes = await Solicitud.find().sort({ fecha: -1 });
        const clientes = await Usuario.find();
        const productos = await Producto.find();
        const totalPedidos = solicitudes.filter(s => s.tipo_solicitud === 'pedido').length;
        const pedidosPendientes = solicitudes.filter(s => s.tipo_solicitud === 'pedido' && s.estado_atencion === 'pendiente').length;
        const totalCotizaciones = solicitudes.filter(s => s.tipo_solicitud === 'cotizacion').length;
        const cotizacionesPendientes = solicitudes.filter(s => s.tipo_solicitud === 'cotizacion' && (s.estado_atencion === 'pendiente' || s.estado_atencion === 'cotizado')).length;
        const pagosPorValidar = solicitudes.filter(s => s.tipo_solicitud === 'validacion_pago' && s.estado_atencion === 'pendiente').length;
        const productosCriticos = productos.filter(p => (p.stock_actual || 0) <= (p.stock_seguridad || 10));
        let filasCriticos = productosCriticos.slice(0, 6).map(p => `<tr class="border-b hover:bg-red-50"><td class="p-3 font-bold text-gray-800">${p.codigo}</td><td class="p-3 text-sm text-gray-600">${p.nombre}</td><td class="p-3 text-center font-extrabold text-red-600">${p.stock_actual}</td><td class="p-3 text-center text-xs font-bold text-gray-500">${p.stock_seguridad}</td><td class="p-3 text-right"><span class="bg-red-100 text-red-800 text-xs font-extrabold px-2.5 py-1 rounded-full">🚨 CRÍTICO</span></td></tr>`).join('');
        let filasRecientes = solicitudes.slice(0, 5).map(s => `<tr class="border-b hover:bg-gray-50"><td class="p-3 text-xs text-gray-500">${new Date(s.fecha).toLocaleDateString('es-EC')}</td><td class="p-3 font-bold text-sm text-gray-800">${s.nombre_cliente}</td><td class="p-3 text-xs font-bold uppercase text-blue-600">${s.tipo_solicitud.replace('_', ' ')}</td><td class="p-3 text-xs font-bold uppercase text-gray-500">${s.estado_atencion.replace('_', ' ')}</td></tr>`).join('');
        res.send(`<!DOCTYPE html><html><head><title>Dashboard Ejecutivo</title>${htmlHead}</head><body class="bg-gray-50 p-8"><div class="max-w-7xl mx-auto">${menuNavegacion}<div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8"><div class="bg-white p-6 rounded-xl shadow border-l-8 border-forestaBlack"><p class="text-xs font-bold text-gray-400 uppercase">Pedidos Totales</p><p class="text-3xl font-extrabold text-forestaBlack mt-2">${totalPedidos}</p><p class="text-xs font-bold text-amber-600 mt-2">📦 ${pedidosPendientes} pendientes de despacho</p></div><div class="bg-white p-6 rounded-xl shadow border-l-8 border-forestaGold"><p class="text-xs font-bold text-gray-400 uppercase">Proformas IA</p><p class="text-3xl font-extrabold text-forestaBlack mt-2">${totalCotizaciones}</p><p class="text-xs font-bold text-yellow-700 mt-2">🎯 ${cotizacionesPendientes} listas para Botón Cazador</p></div><div class="bg-white p-6 rounded-xl shadow border-l-8 border-green-600"><p class="text-xs font-bold text-gray-400 uppercase">CRM Doctores</p><p class="text-3xl font-extrabold text-forestaBlack mt-2">${clientes.length}</p><p class="text-xs font-bold text-green-600 mt-2">💳 ${pagosPorValidar} pagos por aprobar</p></div><div class="bg-white p-6 rounded-xl shadow border-l-8 border-red-600"><p class="text-xs font-bold text-gray-400 uppercase">Alertas Stock</p><p class="text-3xl font-extrabold text-red-600 mt-2">${productosCriticos.length}</p><p class="text-xs font-bold text-red-500 mt-2">⚠️ SKUs bajo mínimo</p></div></div><div class="grid grid-cols-1 md:grid-cols-2 gap-8"><div class="bg-white p-6 rounded-xl shadow border-t-4 border-red-600"><div class="flex justify-between items-center mb-4"><h3 class="text-lg font-extrabold uppercase text-gray-800">🚨 Reposición Urgente</h3><a href="/admin/inventario" class="text-xs font-bold text-blue-600 hover:underline">Ir a Inventario IA →</a></div><table class="w-full text-left"><thead><tr class="bg-gray-100 text-gray-600 text-xs uppercase"><th class="p-3">SKU</th><th class="p-3">Producto</th><th class="p-3 text-center">Actual</th><th class="p-3 text-center">Mínimo</th><th class="p-3 text-right">Estado</th></tr></thead><tbody>${filasCriticos || '<tr><td colspan="5" class="p-4 text-center text-green-600 font-bold">🟢 Todo óptimo</td></tr>'}</tbody></table></div><div class="bg-white p-6 rounded-xl shadow border-t-4 border-forestaBlack"><div class="flex justify-between items-center mb-4"><h3 class="text-lg font-extrabold uppercase text-gray-800">⚡ Última Actividad</h3><a href="/admin" class="text-xs font-bold text-blue-600 hover:underline">Ver Pedidos →</a></div><table class="w-full text-left"><thead><tr class="bg-gray-100 text-gray-600 text-xs uppercase"><th class="p-3">Fecha</th><th class="p-3">Doctor</th><th class="p-3">Tipo</th><th class="p-3">Estado</th></tr></thead><tbody>${filasRecientes || '<tr><td colspan="4" class="p-4 text-center text-gray-400">Sin movimientos</td></tr>'}</tbody></table></div></div></div></body></html>`);
    } catch (e) { res.status(500).send('Error cargando el Dashboard'); }
});

// PEDIDOS Y PROFORMAS
router.get('/proforma/:id', async (req, res) => { 
    try { 
        const s = await Solicitud.findById(req.params.id); 
        if (!s) return res.status(404).send('Proforma no encontrada.'); 
        const f = new Date(s.fecha).toLocaleDateString('es-EC'); const n = s._id.toString().slice(-6).toUpperCase(); 
        let t = (s.contenido_texto || '').replace(/[*_~]/g, ''); 
        res.send(`<!DOCTYPE html><html><head><title>Proforma DOC-${n}</title>${htmlHead}<style>@media print { .hide-on-print { display: none !important; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white !important; } }</style></head><body class="bg-gray-100 p-8"><div id="pdf" class="bg-white p-12 rounded-xl max-w-3xl mx-auto border-t-8 border-forestaGold shadow"><div class="flex justify-between border-b-2 pb-6"><img src="/logo-vector-forestadent.webp" class="h-16" onerror="this.style.display='none'"><div class="text-right"><h1 class="text-2xl font-extrabold uppercase">Proforma Oficial</h1><p class="text-sm font-bold text-forestaGold">DOC-${n}</p></div></div><div class="grid grid-cols-2 gap-6 mb-8 mt-6"><div><p class="text-xs font-bold text-gray-400 uppercase">Doctor / Clínica:</p><p class="text-lg font-bold">${s.nombre_cliente}</p><p class="text-sm text-gray-500">+${s.telefono_cliente}</p></div><div class="text-right"><p class="text-xs font-bold text-gray-400 uppercase">Fecha de Emisión:</p><p class="font-bold">${f}</p></div></div><div class="bg-gray-50 p-8 rounded-xl border"><pre class="font-sans whitespace-pre-wrap font-medium text-sm">${t}</pre></div><div class="text-center mt-6 pt-6 border-t-2"><p class="text-xs font-bold text-gray-400">Generado por Inteligencia Artificial • Forestadent B2B Ecuador</p></div></div><div class="text-center mt-8 hide-on-print"><button onclick="window.print()" class="bg-forestaBlack text-white font-bold py-3 px-6 rounded-lg shadow-lg">🖨️ Imprimir / Guardar como PDF</button></div></body></html>`); 
    } catch (e) { res.status(500).send("Error generando proforma"); } 
});

router.get('/admin', async (req, res) => {
    try {
        const sol = await Solicitud.find().sort({ fecha: -1 });
        let filas = sol.map(s => {
            let btn = ''; let detalleExtra = `<div class="text-xs text-gray-600 max-w-md whitespace-pre-wrap">${(s.contenido_texto || '').substring(0, 180)}${(s.contenido_texto || '').length > 180 ? '...' : ''}</div>`;
            if (s.tipo_solicitud === 'cotizacion') detalleExtra += `<a href="/proforma/${s._id}" target="_blank" class="inline-block mt-2 text-xs font-bold text-forestaGold hover:underline">📄 Abrir Proforma PDF →</a>`;
            if (s.tipo_solicitud === 'cotizacion' && (s.estado_atencion === 'pendiente' || s.estado_atencion === 'cotizado')) { btn = `<button onclick="cazar('${s._id}')" class="bg-forestaGold text-white text-xs font-bold px-3 py-2 rounded shadow mb-1 w-full hover:bg-yellow-600 transition">🎯 Cazador</button><button onclick="act('${s._id}', 'cerrado')" class="bg-gray-200 text-gray-700 text-xs font-bold px-3 py-1.5 rounded w-full hover:bg-gray-300">✔️ Cerrar</button>`; } 
            else if (s.tipo_solicitud === 'pedido' && s.estado_atencion === 'pendiente') { btn = `<button onclick="despacharPedido('${s._id}')" class="bg-forestaBlack text-white text-xs font-bold px-3 py-2 rounded shadow w-full hover:bg-gray-800">📦 Despachar</button>`; } 
            else if (s.tipo_solicitud === 'validacion_pago' && s.estado_atencion === 'pendiente') { btn = `<button onclick="aprobarPago('${s._id}')" class="bg-green-600 text-white text-xs font-bold px-3 py-2 rounded shadow w-full hover:bg-green-700">💳 Aprobar Pago</button>`; } 
            else { btn = `<span class="text-xs text-gray-500 font-extrabold uppercase block text-center bg-gray-100 py-1.5 px-2 rounded">✔️ ${s.estado_atencion.replace('_', ' ')}</span>`; }
            return `<tr class="border-b hover:bg-gray-50"><td class="p-4 text-xs font-bold text-gray-500">${new Date(s.fecha).toLocaleDateString('es-EC')}</td><td class="p-4 font-bold text-gray-800">${s.nombre_cliente}<br><span class="text-xs text-gray-400 font-normal">+${s.telefono_cliente}</span></td><td class="p-4 uppercase text-xs font-extrabold text-blue-600">${s.tipo_solicitud.replace('_', ' ')}</td><td class="p-4">${detalleExtra}</td><td class="p-4"><div class="flex flex-col gap-1 w-40">${btn}</div></td></tr>`;
        }).join('');
        res.send(`<!DOCTYPE html><html><head><title>Pedidos y Proformas</title>${htmlHead}</head><body class="bg-gray-50 p-8"><div class="max-w-7xl mx-auto">${menuNavegacion}<div class="bg-white rounded-xl shadow border-t-8 border-forestaBlack overflow-hidden"><div class="p-6 border-b flex justify-between items-center"><div><h2 class="text-xl font-extrabold uppercase">📦 Bandeja Central</h2><p class="text-xs text-gray-500 font-bold">Despacho, validación QR y Botón Cazador</p></div></div><table class="w-full text-left"><thead><tr class="bg-gray-100 text-gray-600 text-xs uppercase"><th class="p-4">Fecha</th><th class="p-4">Cliente</th><th class="p-4">Tipo</th><th class="p-4">Detalle / Proforma</th><th class="p-4">Acción</th></tr></thead><tbody>${filas}</tbody></table></div><script>async function act(id, estado){ await fetch('/admin/estado', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, estado})}); location.reload(); } async function despacharPedido(id){ if(!confirm('¿Confirmar empaque y notificar despacho?')) return; await fetch('/admin/estado', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, estado: 'despachado', notificar: true})}); location.reload(); } async function aprobarPago(id_solicitud){ if(!confirm('¿Aprobar pago y enviar QR?')) return; const r = await fetch('/admin/pago/aprobar', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id_solicitud})}); const d = await r.json(); if(d.success) { alert('✅ Aprobado'); location.reload(); } else alert('❌ Error'); } async function cazar(id) { if(!confirm('¿Disparar seguimiento?')) return; try { const res = await fetch('/admin/solicitud/cazar', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({id}) }); const data = await res.json(); if(data.success) { alert('✅ Enviado exitosamente'); location.reload(); } else { alert('❌ Error'); } } catch(e) { alert('❌ Error'); } }</script></div></body></html>`);
    } catch (e) { res.status(500).send('Error en bandeja de pedidos'); }
});

router.post('/admin/estado', async (req, res) => {
    try { 
        const sol = await Solicitud.findByIdAndUpdate(req.body.id, { estado_atencion: req.body.estado }); 
        if (req.body.notificar && sol) {
            await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: sol.telefono_cliente, type: 'text', text: { body: `🚚 *¡Hola ${sol.nombre_cliente}!*\n\nTu pedido ya fue empacado y *está en ruta de despacho*. ¡Gracias por tu confianza!` } }) });
        }
        res.json({success:true}); 
    } catch (e) { res.json({success:false}); }
});

router.post('/admin/solicitud/cazar', async (req, res) => {
    try {
        const sol = await Solicitud.findById(req.body.id);
        if (!sol) return res.json({ success: false });
        const linkPdf = `https://${req.get('host')}/proforma/${sol._id}`;
        const mensaje = `🦷 *Hola ${sol.nombre_cliente}*, le escribimos de Forestadent. ✨\n\n¿Pudo revisar la cotización que le enviamos recientemente?\n\n👉 Si desea proceder con el pedido, solo responda este mensaje con un *SÍ* y lo preparamos de inmediato.\n\n📄 Puede revisar su cotización aquí: \n${linkPdf}`;
        await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: sol.telefono_cliente, type: 'text', text: { body: mensaje } }) });
        await Solicitud.findByIdAndUpdate(req.body.id, { estado_atencion: 'recordatorio_enviado' });
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

module.exports = router;