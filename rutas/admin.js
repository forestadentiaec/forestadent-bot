const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const { Usuario, Solicitud, Producto, Campana, Ticket } = require('../modelos/BaseDatos');
const { htmlHead, menuNavegacion } = require('../vistas/Plantillas');

// ==========================================
// 1. GENERADOR DE CÓDIGOS QR Y ESCÁNER VIP
// ==========================================
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
        
        let est = ticket.asistencia_confirmada 
            ? `<div style="background:#FEE2E2; color:#991B1B; padding:20px; text-align:center; border-radius:10px; font-weight:bold;">⚠️ ESTE TICKET YA FUE UTILIZADO</div>` 
            : `<div style="background:#D1FAE5; color:#065F46; padding:20px; text-align:center; border-radius:10px; font-weight:bold;">✅ TICKET VÁLIDO PARA INGRESO</div>
               <div style="text-align:center; margin-top:20px;">
                 <input type="password" id="pinAcceso" placeholder="PIN Staff" style="font-size:24px; width:140px; padding:10px; margin-bottom:15px; text-align:center; border:2px solid #ccc; border-radius:8px;">
                 <button onclick="marcar()" style="background:#111111; color:white; padding:15px 30px; font-size:18px; width:100%; border-radius:8px; font-weight:bold; cursor:pointer;">🎟️ CONFIRMAR ASISTENCIA</button>
               </div>`;
               
        res.send(`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Validación QR</title></head>
        <body style="font-family:sans-serif; background:#f3f4f6; padding:20px;">
            <div style="background:white; padding:30px; border-radius:15px; max-width:400px; margin:auto; box-shadow:0 4px 10px rgba(0,0,0,0.1); border-top:8px solid #B4975A;">
                <p style="text-align:center; font-size:12px; color:#888; text-transform:uppercase; font-weight:bold; margin:0;">Forestadent Ecuador VIP</p>
                <h1 style="color:#B4975A; text-align:center; margin:10px 0;">${ticket.id_unico}</h1>
                <p style="text-align:center; font-size:22px; font-weight:bold; margin:5px 0;">${ticket.nombre_cliente}</p>
                <p style="text-align:center; font-size:14px; color:#555; margin-bottom:20px;">Evento: <b>${ticket.nombre_evento}</b></p>
                ${est}
            </div>
            <script>
                async function marcar() {
                    const pin = document.getElementById('pinAcceso').value;
                    const res = await fetch('/ticket/marcar', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id: '${ticket.id_unico}', pin}) });
                    const data = await res.json();
                    if(data.success) { alert('✅ Asistencia confirmada correctamente'); window.location.reload(); } else { alert('❌ ' + data.error); }
                }
            </script>
        </body></html>`);
    } catch (e) { res.status(500).send('Error en escáner'); }
});

router.post('/ticket/marcar', async (req, res) => {
    try {
        if (req.body.pin !== '2026') return res.json({ success: false, error: 'PIN de seguridad incorrecto' });
        await Ticket.findOneAndUpdate({ id_unico: req.body.id }, { asistencia_confirmada: true, fecha_escaneo: Date.now() });
        res.json({ success: true });
    } catch (e) { res.json({ success: false, error: 'Error de servidor' }); }
});

// ==========================================
// 2. APROBACIÓN DE PAGOS Y EMISIÓN DE TICKETS
// ==========================================
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
            await new Ticket({ 
                id_unico: idTicket, 
                telefono_cliente: sol.telefono_cliente, 
                nombre_cliente: sol.nombre_cliente, 
                nombre_evento: camp ? camp.nombre_campana : 'Evento VIP Forestadent' 
            }).save();
            
            const urlQR = `https://${req.get('host')}/ticket/qr/${idTicket}`;
            await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, { 
                method: 'POST', 
                headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ 
                    messaging_product: 'whatsapp', 
                    to: sol.telefono_cliente, 
                    type: 'image', 
                    image: { link: urlQR, caption: `🎉 *¡Pago Aprobado, ${sol.nombre_cliente}!*\n\nAquí tienes tu Pase VIP Oficial (${idTicket}) para *${camp ? camp.nombre_campana : 'nuestro evento'}*.\n\nPresenta este código QR en la entrada.` } 
                }) 
            });
        } else {
            await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, { 
                method: 'POST', 
                headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ 
                    messaging_product: 'whatsapp', 
                    to: sol.telefono_cliente, 
                    type: 'text', 
                    text: { body: `🎉 *¡Pago Aprobado, ${sol.nombre_cliente}!*\n\nHemos validado tu comprobante y procederemos con el despacho de inmediato.` } 
                }) 
            });
        }
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

// ==========================================
// 3. DASHBOARD EJECUTIVO (RESTAURADO AL 100%)
// ==========================================
router.get('/admin/dashboard', async (req, res) => {
    try {
        const solicitudes = await Solicitud.find().sort({ fecha: -1 });
        const clientes = await Usuario.find();
        const productos = await Producto.find();
        const campanas = await Campana.find();

        const totalPedidos = solicitudes.filter(s => s.tipo_solicitud === 'pedido').length;
        const pedidosPendientes = solicitudes.filter(s => s.tipo_solicitud === 'pedido' && s.estado_atencion === 'pendiente').length;
        const totalCotizaciones = solicitudes.filter(s => s.tipo_solicitud === 'cotizacion').length;
        const cotizacionesPendientes = solicitudes.filter(s => s.tipo_solicitud === 'cotizacion' && (s.estado_atencion === 'pendiente' || s.estado_atencion === 'cotizado')).length;
        const pagosPorValidar = solicitudes.filter(s => s.tipo_solicitud === 'validacion_pago' && s.estado_atencion === 'pendiente').length;
        
        const productosCriticos = productos.filter(p => (p.stock_actual || 0) <= (p.stock_seguridad || 10));

        let filasCriticos = productosCriticos.slice(0, 6).map(p => `
            <tr class="border-b hover:bg-red-50">
                <td class="p-3 font-bold text-gray-800">${p.codigo}</td>
                <td class="p-3 text-sm text-gray-600">${p.nombre}</td>
                <td class="p-3 text-center font-extrabold text-red-600">${p.stock_actual}</td>
                <td class="p-3 text-center text-xs font-bold text-gray-500">${p.stock_seguridad}</td>
                <td class="p-3 text-right"><span class="bg-red-100 text-red-800 text-xs font-extrabold px-2.5 py-1 rounded-full">🚨 CRÍTICO</span></td>
            </tr>
        `).join('');

        let filasRecientes = solicitudes.slice(0, 5).map(s => `
            <tr class="border-b hover:bg-gray-50">
                <td class="p-3 text-xs text-gray-500">${new Date(s.fecha).toLocaleDateString('es-EC')}</td>
                <td class="p-3 font-bold text-sm text-gray-800">${s.nombre_cliente}</td>
                <td class="p-3 text-xs font-bold uppercase text-blue-600">${s.tipo_solicitud.replace('_', ' ')}</td>
                <td class="p-3 text-xs font-bold uppercase text-gray-500">${s.estado_atencion.replace('_', ' ')}</td>
            </tr>
        `).join('');

        res.send(`<!DOCTYPE html><html><head><title>Dashboard Ejecutivo</title>${htmlHead}</head>
        <body class="bg-gray-50 p-8">
            <div class="max-w-7xl mx-auto">
                ${menuNavegacion}
                
                <!-- TARJETAS KPI -->
                <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <div class="bg-white p-6 rounded-xl shadow border-l-8 border-forestaBlack">
                        <p class="text-xs font-bold text-gray-400 uppercase">Pedidos Totales</p>
                        <p class="text-3xl font-extrabold text-forestaBlack mt-2">${totalPedidos}</p>
                        <p class="text-xs font-bold text-amber-600 mt-2">📦 ${pedidosPendientes} pendientes de despacho</p>
                    </div>
                    <div class="bg-white p-6 rounded-xl shadow border-l-8 border-forestaGold">
                        <p class="text-xs font-bold text-gray-400 uppercase">Proformas IA (Cotizaciones)</p>
                        <p class="text-3xl font-extrabold text-forestaBlack mt-2">${totalCotizaciones}</p>
                        <p class="text-xs font-bold text-yellow-700 mt-2">🎯 ${cotizacionesPendientes} listas para Botón Cazador</p>
                    </div>
                    <div class="bg-white p-6 rounded-xl shadow border-l-8 border-green-600">
                        <p class="text-xs font-bold text-gray-400 uppercase">Cartera CRM Doctores</p>
                        <p class="text-3xl font-extrabold text-forestaBlack mt-2">${clientes.length}</p>
                        <p class="text-xs font-bold text-green-600 mt-2">💳 ${pagosPorValidar} pagos por aprobar</p>
                    </div>
                    <div class="bg-white p-6 rounded-xl shadow border-l-8 border-red-600">
                        <p class="text-xs font-bold text-gray-400 uppercase">Alertas de Stock</p>
                        <p class="text-3xl font-extrabold text-red-600 mt-2">${productosCriticos.length}</p>
                        <p class="text-xs font-bold text-red-500 mt-2">⚠️ SKUs bajo mínimo de seguridad</p>
                    </div>
                </div>

                <!-- TABLAS RESUMEN -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div class="bg-white p-6 rounded-xl shadow border-t-4 border-red-600">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="text-lg font-extrabold uppercase text-gray-800">🚨 Alertas de Reposición Urgente</h3>
                            <a href="/admin/inventario" class="text-xs font-bold text-blue-600 hover:underline">Ir a Inventario IA →</a>
                        </div>
                        <table class="w-full text-left">
                            <thead><tr class="bg-gray-100 text-gray-600 text-xs uppercase"><th class="p-3">SKU</th><th class="p-3">Producto</th><th class="p-3 text-center">Actual</th><th class="p-3 text-center">Mínimo</th><th class="p-3 text-right">Estado</th></tr></thead>
                            <tbody>${filasCriticos || '<tr><td colspan="5" class="p-4 text-center text-green-600 font-bold">🟢 Todo el inventario está en niveles óptimos</td></tr>'}</tbody>
                        </table>
                    </div>

                    <div class="bg-white p-6 rounded-xl shadow border-t-4 border-forestaBlack">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="text-lg font-extrabold uppercase text-gray-800">⚡ Última Actividad en WhatsApp</h3>
                            <a href="/admin" class="text-xs font-bold text-blue-600 hover:underline">Ver Todos los Pedidos →</a>
                        </div>
                        <table class="w-full text-left">
                            <thead><tr class="bg-gray-100 text-gray-600 text-xs uppercase"><th class="p-3">Fecha</th><th class="p-3">Doctor</th><th class="p-3">Tipo</th><th class="p-3">Estado</th></tr></thead>
                            <tbody>${filasRecientes || '<tr><td colspan="4" class="p-4 text-center text-gray-400">Sin movimientos recientes</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>
            </div>
        </body></html>`);
    } catch (e) { res.status(500).send('Error cargando el Dashboard'); }
});

// ==========================================
// 4. INVENTARIO E IA (CON ALERTAS DE STOCK RESTAURADAS)
// ==========================================
router.get('/admin/inventario', async (req, res) => {
    try {
        const prod = await Producto.find().sort({ categoria: 1, nombre: 1 });
        
        let filas = prod.map(p => {
            const stockActual = Number(p.stock_actual || 0);
            const stockSeguridad = Number(p.stock_seguridad || 10);
            const leadTime = Number(p.lead_time_dias || 30);

            let badgeAlerta = '';
            let estiloFila = 'hover:bg-gray-50 border-b';
            let colorInput = 'text-blue-700 border-gray-300';

            if (stockActual === 0) {
                badgeAlerta = `<span class="bg-red-600 text-white text-xs font-extrabold px-3 py-1.5 rounded-full shadow-sm inline-block">🚨 AGOTADO (PEDIR YA)</span>`;
                estiloFila = 'bg-red-50 hover:bg-red-100 border-b border-red-200';
                colorInput = 'text-red-700 border-red-500 bg-white';
            } else if (stockActual <= stockSeguridad) {
                badgeAlerta = `<span class="bg-amber-100 text-amber-900 border border-amber-400 text-xs font-extrabold px-3 py-1.5 rounded-full inline-block">⚠️ REPONER STOCK</span>`;
                estiloFila = 'bg-amber-50/40 hover:bg-amber-50 border-b';
                colorInput = 'text-amber-700 border-amber-400 bg-white';
            } else {
                badgeAlerta = `<span class="bg-green-100 text-green-800 text-xs font-extrabold px-3 py-1.5 rounded-full inline-block">🟢 ÓPTIMO</span>`;
            }

            return `
            <tr class="${estiloFila}">
                <td class="p-4 font-bold text-gray-800">${p.codigo}<br><span class="font-normal text-sm text-gray-500">${p.nombre}</span></td>
                <td class="p-4 text-center"><input type="number" id="st_${p._id}" value="${stockActual}" class="border-2 ${colorInput} w-24 p-2 text-center rounded-lg font-extrabold"></td>
                <td class="p-4 text-center"><input type="number" id="seg_${p._id}" value="${stockSeguridad}" class="border border-gray-300 w-24 p-2 text-center rounded-lg font-bold text-gray-700"></td>
                <td class="p-4 text-center"><input type="number" id="lt_${p._id}" value="${leadTime}" class="border border-gray-300 w-20 p-2 text-center rounded-lg text-gray-600"></td>
                <td class="p-4 text-center">${badgeAlerta}</td>
                <td class="p-4 text-center hide-on-print"><button onclick="guardarInv('${p._id}')" class="bg-gray-800 hover:bg-black text-white px-4 py-2 rounded-lg font-bold text-xs shadow transition">💾 Guardar</button></td>
            </tr>`;
        }).join('');

        res.send(`<!DOCTYPE html><html><head><title>Inventario e IA</title>${htmlHead}
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
                <div>
                    <h2 class="text-2xl font-extrabold uppercase">📦 Asistente de Compras y Control de Stock (IA)</h2>
                    <p class="text-xs text-gray-500 font-bold mt-1">Monitoreo en vivo de puntos de reorden y tiempos de tránsito desde Alemania</p>
                </div>
                <button onclick="analizarIA()" id="btnIA" class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg transition">🧠 Analizar Stock con IA</button>
            </div>
            
            <div id="cajaResultadoIA" class="hidden mb-8">
                <div id="pdfReporte" class="p-8 bg-white border-2 border-blue-200 rounded-xl shadow-sm">
                    <h3 class="text-xl font-extrabold mb-6 uppercase text-blue-900 border-b-2 border-blue-100 pb-4">📑 Reporte Ejecutivo de Abastecimiento (Forestadent)</h3>
                    <div id="textoReporte" class="text-sm text-gray-800" style="line-height: 1.7;"></div>
                    <p class="text-xs text-gray-400 mt-8 pt-4 border-t border-gray-100 text-center font-bold">Generado por Inteligencia Artificial • Forestadent B2B Ecuador • ${new Date().toLocaleDateString('es-EC')}</p>
                </div>
                <button onclick="window.print()" class="mt-4 bg-forestaBlack text-white font-bold py-3 px-6 rounded-lg shadow-lg w-full hover:bg-gray-800 transition hide-on-print">🖨️ Imprimir / Guardar Reporte como PDF</button>
            </div>
            
            <table class="w-full text-left hide-on-print">
                <thead>
                    <tr class="bg-forestaBlack text-white text-xs uppercase">
                        <th class="p-4">SKU & Nombre</th>
                        <th class="p-4 text-center">Stock Actual</th>
                        <th class="p-4 text-center">Seguridad (Mín)</th>
                        <th class="p-4 text-center">Tránsito (Días)</th>
                        <th class="p-4 text-center">Alerta / Estado</th>
                        <th class="p-4 text-center">Acción</th>
                    </tr>
                </thead>
                <tbody>${filas}</tbody>
            </table>
        </div>
        <script>
            async function guardarInv(id){ 
                const res = await fetch('/admin/inventario/actualizar', {
                    method:'POST', 
                    headers:{'Content-Type':'application/json'}, 
                    body:JSON.stringify({
                        id, 
                        stock_actual: Number(document.getElementById('st_'+id).value), 
                        stock_seguridad: Number(document.getElementById('seg_'+id).value), 
                        lead_time_dias: Number(document.getElementById('lt_'+id).value)
                    })
                }); 
                const data = await res.json();
                if(data.success) location.reload();
                else alert('Error guardando inventario');
            }
            async function analizarIA(){
                const caja = document.getElementById('cajaResultadoIA');
                const texto = document.getElementById('textoReporte');
                caja.classList.remove('hidden');
                texto.innerHTML = '<div class="text-center font-bold text-blue-600 my-8">🧠 Cruzando niveles de stock, mínimos de seguridad y tiempos de tránsito con IA...</div>';
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
    } catch (e) { res.status(500).send('Error en inventario'); }
});

router.post('/admin/inventario/actualizar', async (req, res) => {
    try { 
        await Producto.findByIdAndUpdate(req.body.id, {
            stock_actual: Number(req.body.stock_actual),
            stock_seguridad: Number(req.body.stock_seguridad),
            lead_time_dias: Number(req.body.lead_time_dias)
        }); 
        res.json({success:true}); 
    } catch(e) { res.json({success:false}); }
});

router.post('/admin/inventario/analizar', async (req, res) => {
    try {
        const prod = await Producto.find();
        const inv = prod.map(p => `SKU: ${p.codigo} | Producto: ${p.nombre} | Stock Actual: ${p.stock_actual} | Mínimo Seguridad: ${p.stock_seguridad} | Tránsito Alemania: ${p.lead_time_dias} días`).join('\n');
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const prompt = `Eres el Gerente de Supply Chain y Logística de Forestadent Ecuador. Analiza este inventario real y genera un Reporte Ejecutivo de Abastecimiento corporativo para gerencia, priorizando los SKUs agotados o debajo del stock de seguridad, considerando el tiempo de tránsito desde Alemania y sugiriendo cantidades de reposición:\n\n${inv}`;
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

// ==========================================
// 5. CRM AVANZADO (CON SEMÁFOROS Y ETIQUETAS)
// ==========================================
router.get('/admin/clientes', async (req, res) => {
    try {
        const clRaw = await Usuario.find().sort({ ultima_interaccion: -1 });
        let filas = clRaw.map(c => {
            const diasInactivo = c.ultima_interaccion ? Math.floor((Date.now() - new Date(c.ultima_interaccion)) / (1000 * 60 * 60 * 24)) : 99;
            let semaforo = `<span class="bg-green-100 text-green-800 text-xs font-extrabold px-2.5 py-1 rounded-full">🟢 Activo (${diasInactivo}d)</span>`;
            if (diasInactivo > 15 && diasInactivo <= 45) {
                semaforo = `<span class="bg-yellow-100 text-yellow-800 text-xs font-extrabold px-2.5 py-1 rounded-full">🟡 Enfriándose (${diasInactivo}d)</span>`;
            } else if (diasInactivo > 45) {
                semaforo = `<span class="bg-red-100 text-red-800 text-xs font-extrabold px-2.5 py-1 rounded-full">🔴 En Riesgo (${diasInactivo}d)</span>`;
            }

            return `
            <tr class="border-b hover:bg-gray-50">
                <td class="p-4">
                    <p class="font-bold text-gray-800">${c.nombre_whatsapp}</p>
                    <p class="text-xs text-gray-500 mb-2">+${c.telefono}</p>
                    ${semaforo}
                </td>
                <td class="p-4">
                    <input type="text" id="ciudad_${c._id}" value="${c.ciudad || 'Quito'}" placeholder="Ciudad" class="border p-2 w-full text-xs rounded mb-1 font-bold">
                    <input type="text" id="dir_${c._id}" value="${c.direccion || ''}" placeholder="Dirección exacta" class="border p-2 w-full text-xs rounded">
                </td>
                <td class="p-4">
                    <input type="text" id="esp_${c._id}" value="${c.especialidad || 'Ortodoncia'}" placeholder="Especialidad" class="border p-2 w-full text-xs rounded mb-1">
                    <select id="lugar_${c._id}" class="border p-2 w-full text-xs rounded font-bold">
                        <option value="consultorio" ${c.tipo_establecimiento==='consultorio'?'selected':''}>🏥 Consultorio</option>
                        <option value="clínica" ${c.tipo_establecimiento==='clínica'?'selected':''}>🏢 Clínica</option>
                    </select>
                </td>
                <td class="p-4">
                    <input type="text" id="etiq_${c._id}" value="${c.etiquetas || ''}" placeholder="Ej: VIP, Autoligado, BioQuick" class="border border-amber-300 bg-amber-50/30 p-2 w-full text-xs rounded mb-1 font-bold">
                    <textarea id="notas_${c._id}" class="border p-2 w-full text-xs rounded" rows="2" placeholder="Notas comerciales...">${c.notas || ''}</textarea>
                </td>
                <td class="p-4 text-center">
                    <button onclick="guardar('${c._id}')" class="bg-forestaGold hover:bg-yellow-600 text-white font-bold px-4 py-2 rounded-lg text-xs shadow transition">💾 Guardar</button>
                </td>
            </tr>`;
        }).join('');

        res.send(`<!DOCTYPE html><html><head><title>CRM Clientes</title>${htmlHead}</head><body class="bg-gray-50 p-8"><div class="max-w-7xl mx-auto">${menuNavegacion}
        <div class="bg-white rounded-xl shadow overflow-hidden border-t-8 border-forestaGold">
            <div class="p-6 border-b flex justify-between items-center">
                <div>
                    <h2 class="text-xl font-extrabold uppercase">👥 Inteligencia Comercial & CRM B2B</h2>
                    <p class="text-xs text-gray-500 font-bold">Semáforos de retención, perfilamiento clínico y etiquetas estratégicas</p>
                </div>
            </div>
            <table class="w-full text-left">
                <thead><tr class="bg-forestaBlack text-white text-xs uppercase"><th class="p-4">Doctor & Semáforo</th><th class="p-4">Ubicación</th><th class="p-4">Perfil Clínico</th><th class="p-4">Etiquetas & Memoria</th><th class="p-4 text-center">Acción</th></tr></thead>
                <tbody>${filas}</tbody>
            </table>
        </div>
        <script>
            async function guardar(id) { 
                await fetch('/admin/clientes/actualizar', { 
                    method: 'POST', 
                    headers: {'Content-Type':'application/json'}, 
                    body: JSON.stringify({
                        id, 
                        ciudad: document.getElementById('ciudad_'+id).value, 
                        direccion: document.getElementById('dir_'+id).value, 
                        especialidad: document.getElementById('esp_'+id).value, 
                        tipo_establecimiento: document.getElementById('lugar_'+id).value, 
                        etiquetas: document.getElementById('etiq_'+id).value,
                        notas: document.getElementById('notas_'+id).value 
                    }) 
                }); 
                alert('✅ Ficha actualizada');
                location.reload(); 
            }
        </script>
        </div></body></html>`);
    } catch (e) { res.status(500).send('Error en CRM'); }
});

router.post('/admin/clientes/actualizar', async (req, res) => {
    try { await Usuario.findByIdAndUpdate(req.body.id, req.body); res.json({ success: true }); } catch (e) { res.json({ success: false }); }
});

// ==========================================
// 6. GESTOR DE CAMPAÑAS Y BROADCAST AVANZADO
// ==========================================
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
        
        let html = `<!DOCTYPE html><html><head><title>Campañas & Eventos</title>${htmlHead}</head><body class="bg-gray-50 p-8"><div class="max-w-7xl mx-auto">${menuNavegacion}
        <div class="bg-white p-8 rounded-xl shadow border-l-8 border-green-600 mb-8">
            <h2 class="text-2xl font-extrabold mb-2 uppercase">📢 Gestor de Campañas y Eventos VIP</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                    <label class="block text-sm font-bold uppercase mb-2">1. Público Objetivo</label>
                    <select id="tipoFiltro" onchange="mostrarOpcionFiltro()" class="w-full border p-3 rounded mb-4 font-bold"><option value="todos">🌍 TODOS LOS DOCTORES</option><option value="establecimiento">🏥 Por Establecimiento</option><option value="etiqueta">🏷️ Por Etiqueta CRM</option><option value="manual">🎯 Selección Manual</option></select>
                    <div id="cajaValorEstablecimiento" class="hidden mb-4"><select id="valorEstablecimiento" class="w-full border p-3 rounded"><option value="consultorio">Consultorio</option><option value="clínica">Clínica</option></select></div>
                    <div id="cajaValorEtiqueta" class="hidden mb-4"><input type="text" id="valorEtiqueta" placeholder="Ej: VIP" class="w-full border p-3 rounded"></div>
                    <div id="cajaValorManual" class="hidden mb-4"><div class="border rounded p-4 max-h-60 overflow-y-auto">${listaCheckboxes}</div></div>
                    
                    <label class="block text-sm font-bold uppercase mb-2 mt-4">2. Estructura del Evento / Campaña</label>
                    <input type="text" id="nombreCampana" placeholder="Nombre interno (Ej: Congreso BioQuick)" class="w-full border p-3 font-bold mb-3 rounded">
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Fecha y Hora del Evento:</label>
                    <input type="datetime-local" id="fechaEventoCampana" class="w-full border p-3 font-bold mb-3 bg-gray-50 rounded">
                    <input type="text" id="linkCampana" placeholder="🔗 Enlace del Brochure / PDF" class="w-full border p-3 mb-3 rounded">
                    <textarea id="bancoCampana" rows="2" placeholder="🏦 Datos Bancarios para inscripción" class="w-full border p-3 mb-3 rounded"></textarea>
                    
                    <label class="block text-sm font-bold uppercase mb-2">3. Mensaje de WhatsApp</label>
                    <textarea id="mensajeCampana" rows="5" placeholder="Escribe tu mensaje..." class="w-full border p-4 mb-4 rounded"></textarea>
                    <button onclick="disparar()" id="btnEnviar" class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-xl uppercase shadow-lg">🚀 Lanzar Campaña</button>
                    <p id="textoCarga" class="text-green-600 font-bold mt-4 text-center hidden">⏳ Enviando mensajes...</p>
                </div>
                <div class="bg-gray-100 p-6 rounded-xl flex flex-col items-center">
                    <p class="text-xs font-bold mb-4 uppercase">Vista Previa en WhatsApp</p>
                    <div class="bg-white p-5 rounded-xl shadow w-full"><p class="text-sm font-medium mb-4">🦷 ¡Hola! ✨</p><p id="vistaPrevia" class="text-sm font-bold">[Oferta]</p><p class="text-sm font-medium mt-4 italic">👉 Para más información responde INFO.</p></div>
                </div>
            </div>
        </div>
        
        <div class="bg-white p-8 rounded-xl shadow mb-8">
            <h2 class="text-xl font-extrabold mb-6 uppercase">📊 Embudo de Conversión de Campañas</h2>
            <table class="w-full text-left"><thead><tr class="bg-forestaBlack text-white text-xs uppercase"><th class="p-4">Fecha Evento</th><th class="p-4">Campaña</th><th class="p-4 text-center">Enviados</th><th class="p-4 text-center">Pidieron INFO</th><th class="p-4 text-center">Reservas</th><th class="p-4 text-center">Pagos Aprobados</th></tr></thead><tbody>${filasHistorial||'<tr><td colspan="6" class="text-center p-4">Sin campañas aún.</td></tr>'}</tbody></table>
        </div>
        
        <div class="bg-white p-8 rounded-xl shadow">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-xl font-extrabold uppercase">🎓 Control de Asistencia QR y Diplomas</h2>
                <button onclick="exportarTablaDiplomas()" class="bg-blue-900 text-white font-bold py-2 px-4 rounded text-sm">📥 Exportar Excel</button>
            </div>
            <table id="tablaDiplomas" class="w-full text-left"><thead><tr class="bg-forestaBlack text-white text-xs uppercase"><th class="p-4">Emisión</th><th class="p-4">Doctor</th><th class="p-4">Evento</th><th class="p-4">Ticket QR</th><th class="p-4 text-center">Estado</th></tr></thead><tbody>${filasAsistencia||'<tr><td colspan="5" class="text-center p-4">Sin tickets emitidos</td></tr>'}</tbody></table>
        </div>
        </div>
        <script>
            document.getElementById('mensajeCampana').addEventListener('input', function(e) { let t = e.target.value || '[Oferta]'; t = t.replace(/\\*(.*?)\\*/g, '<strong>$1</strong>'); t = t.replace(/_(.*?)_/g, '<em>$1</em>'); document.getElementById('vistaPrevia').innerHTML = t; }); 
            function mostrarOpcionFiltro() { const f = document.getElementById('tipoFiltro').value; ['Establecimiento','Etiqueta','Manual'].forEach(id => document.getElementById('cajaValor'+id).classList.add('hidden')); if(f!=='todos') document.getElementById('cajaValor'+f.charAt(0).toUpperCase()+f.slice(1)).classList.remove('hidden'); } 
            async function disparar() { 
                const nombre = document.getElementById('nombreCampana').value; const fecha_evento = document.getElementById('fechaEventoCampana').value; const enlace = document.getElementById('linkCampana').value; const banco = document.getElementById('bancoCampana').value; const mensaje = document.getElementById('mensajeCampana').value; const filtro = document.getElementById('tipoFiltro').value; let valorFiltro = ''; let telefonosManuales = []; 
                if (filtro === 'establecimiento') valorFiltro = document.getElementById('valorEstablecimiento').value; 
                if (filtro === 'etiqueta') valorFiltro = document.getElementById('valorEtiqueta').value; 
                if (filtro === 'manual') { document.querySelectorAll('.checkbox-manual:checked').forEach(cb => telefonosManuales.push(cb.value)); if (telefonosManuales.length === 0) return alert("Selecciona al menos un doctor."); } 
                if (!nombre.trim() || !mensaje.trim()) return alert("Completa el nombre y el mensaje."); 
                if (!confirm('¿Lanzar campaña por WhatsApp ahora?')) return; 
                document.getElementById('btnEnviar').classList.add('hidden'); document.getElementById('textoCarga').classList.remove('hidden'); 
                try { 
                    const res = await fetch('/admin/broadcast/enviar', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ nombre, fecha_evento, enlace, banco, mensaje, filtro, valorFiltro, telefonosManuales }) }); 
                    const result = await res.json(); 
                    if(result.success){ alert('✅ ¡Campaña disparada con éxito!'); window.location.reload(); } else { alert('❌ ERROR:\\n'+result.error_meta); window.location.reload(); } 
                } catch(e){ alert('Error de red'); } 
            } 
            function exportarTablaDiplomas() { let wb = XLSX.utils.table_to_book(document.getElementById("tablaDiplomas")); XLSX.writeFile(wb, "Asistencia_Forestadent.xlsx"); }
        </script>
        <script src="https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js"></script>
        </body></html>`; 
        res.send(html); 
    } catch (e) { res.status(500).send("Error en Broadcast."); } 
});

router.post('/admin/broadcast/enviar', async (req, res) => { 
    try { 
        const { nombre, fecha_evento, enlace, banco, mensaje, filtro, valorFiltro, telefonosManuales } = req.body; 
        let query = {}; 
        if (filtro === 'establecimiento') query = { tipo_establecimiento: valorFiltro }; 
        else if (filtro === 'etiqueta') query = { etiquetas: { $regex: valorFiltro, $options: 'i' } }; 
        else if (filtro === 'manual') query = { telefono: { $in: telefonosManuales } }; 
        
        const destinatarios = await Usuario.find(query); 
        if (destinatarios.length === 0) return res.json({ success: false, error_meta: "No se encontraron doctores con ese filtro." }); 
        
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
    } catch (e) { res.json({ success: false, error_meta: "Error interno." }); } 
});

// ==========================================
// 7. PEDIDOS, PROFORMAS Y BOTÓN CAZADOR
// ==========================================
router.get('/proforma/:id', async (req, res) => { 
    try { 
        const s = await Solicitud.findById(req.params.id); 
        if (!s) return res.status(404).send('Proforma no encontrada.'); 
        const f = new Date(s.fecha).toLocaleDateString('es-EC'); 
        const n = s._id.toString().slice(-6).toUpperCase(); 
        let t = (s.contenido_texto || '').replace(/[*_~]/g, ''); 
        let h = `<!DOCTYPE html><html><head><title>Proforma DOC-${n}</title>${htmlHead}
        <style>@media print { .hide-on-print { display: none !important; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white !important; } }</style>
        </head><body class="bg-gray-100 p-8"><div id="pdf" class="bg-white p-12 rounded-xl max-w-3xl mx-auto border-t-8 border-forestaGold shadow"><div class="flex justify-between border-b-2 pb-6"><img src="/logo-vector-forestadent.webp" class="h-16" onerror="this.style.display='none'"><div class="text-right"><h1 class="text-2xl font-extrabold uppercase">Proforma Oficial</h1><p class="text-sm font-bold text-forestaGold">DOC-${n}</p></div></div><div class="grid grid-cols-2 gap-6 mb-8 mt-6"><div><p class="text-xs font-bold text-gray-400 uppercase">Doctor / Clínica:</p><p class="text-lg font-bold">${s.nombre_cliente}</p><p class="text-sm text-gray-500">+${s.telefono_cliente}</p></div><div class="text-right"><p class="text-xs font-bold text-gray-400 uppercase">Fecha de Emisión:</p><p class="font-bold">${f}</p></div></div><div class="bg-gray-50 p-8 rounded-xl border"><pre class="font-sans whitespace-pre-wrap font-medium text-sm">${t}</pre></div><div class="text-center mt-6 pt-6 border-t-2"><p class="text-xs font-bold text-gray-400">Generado por Inteligencia Artificial • Forestadent B2B Ecuador</p></div></div>
        <div class="text-center mt-8 hide-on-print"><button onclick="window.print()" class="bg-forestaBlack text-white font-bold py-3 px-6 rounded-lg shadow-lg">🖨️ Imprimir / Guardar como PDF</button></div></body></html>`; 
        res.send(h); 
    } catch (e) { res.status(500).send("Error generando proforma"); } 
});

router.get('/admin', async (req, res) => {
    try {
        const sol = await Solicitud.find().sort({ fecha: -1 });
        let filas = sol.map(s => {
            let btn = '';
            let detalleExtra = `<div class="text-xs text-gray-600 max-w-md whitespace-pre-wrap">${(s.contenido_texto || '').substring(0, 180)}${(s.contenido_texto || '').length > 180 ? '...' : ''}</div>`;

            if (s.tipo_solicitud === 'cotizacion') {
                detalleExtra += `<a href="/proforma/${s._id}" target="_blank" class="inline-block mt-2 text-xs font-bold text-forestaGold hover:underline">📄 Abrir Proforma PDF →</a>`;
            }

            if (s.tipo_solicitud === 'cotizacion' && (s.estado_atencion === 'pendiente' || s.estado_atencion === 'cotizado')) {
                btn = `<button onclick="cazar('${s._id}')" class="bg-forestaGold text-white text-xs font-bold px-3 py-2 rounded shadow mb-1 w-full hover:bg-yellow-600 transition">🎯 Cazador (Seguimiento)</button>
                       <button onclick="act('${s._id}', 'cerrado')" class="bg-gray-200 text-gray-700 text-xs font-bold px-3 py-1.5 rounded w-full hover:bg-gray-300">✔️ Cerrar</button>`;
            } else if (s.tipo_solicitud === 'pedido' && s.estado_atencion === 'pendiente') {
                btn = `<button onclick="despacharPedido('${s._id}')" class="bg-forestaBlack text-white text-xs font-bold px-3 py-2 rounded shadow w-full hover:bg-gray-800">📦 Despachar y Notificar</button>`;
            } else if (s.tipo_solicitud === 'validacion_pago' && s.estado_atencion === 'pendiente') {
                btn = `<button onclick="aprobarPago('${s._id}')" class="bg-green-600 text-white text-xs font-bold px-3 py-2 rounded shadow w-full hover:bg-green-700">💳 Aprobar Pago / QR</button>`;
            } else {
                btn = `<span class="text-xs text-gray-500 font-extrabold uppercase block text-center bg-gray-100 py-1.5 px-2 rounded">✔️ ${s.estado_atencion.replace('_', ' ')}</span>`;
            }

            return `<tr class="border-b hover:bg-gray-50">
                        <td class="p-4 text-xs font-bold text-gray-500">${new Date(s.fecha).toLocaleDateString('es-EC')}</td>
                        <td class="p-4 font-bold text-gray-800">${s.nombre_cliente}<br><span class="text-xs text-gray-400 font-normal">+${s.telefono_cliente}</span></td>
                        <td class="p-4 uppercase text-xs font-extrabold text-blue-600">${s.tipo_solicitud.replace('_', ' ')}</td>
                        <td class="p-4">${detalleExtra}</td>
                        <td class="p-4"><div class="flex flex-col gap-1 w-40">${btn}</div></td>
                    </tr>`;
        }).join('');

        res.send(`<!DOCTYPE html><html><head><title>Pedidos y Proformas</title>${htmlHead}</head><body class="bg-gray-50 p-8"><div class="max-w-7xl mx-auto">${menuNavegacion}
        <div class="bg-white rounded-xl shadow border-t-8 border-forestaBlack overflow-hidden">
            <div class="p-6 border-b flex justify-between items-center">
                <div>
                    <h2 class="text-xl font-extrabold uppercase">📦 Bandeja Central de Pedidos, Proformas y Pagos</h2>
                    <p class="text-xs text-gray-500 font-bold">Despacho automatizado, validación de pagos QR y seguimiento con Botón Cazador</p>
                </div>
            </div>
            <table class="w-full text-left">
                <thead><tr class="bg-gray-100 text-gray-600 text-xs uppercase"><th class="p-4">Fecha</th><th class="p-4">Cliente</th><th class="p-4">Tipo</th><th class="p-4">Detalle / Proforma</th><th class="p-4">Acción</th></tr></thead>
                <tbody>${filas}</tbody>
            </table>
        </div>
        
        <script>
            async function act(id, estado){ 
                await fetch('/admin/estado', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, estado})}); 
                location.reload(); 
            }
            async function despacharPedido(id){
                if(!confirm('¿Confirmar empaque y notificar despacho al WhatsApp del doctor?')) return;
                await fetch('/admin/estado', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, estado: 'despachado', notificar: true})}); 
                location.reload();
            }
            async function aprobarPago(id_solicitud){
                if(!confirm('¿Aprobar este pago y enviar confirmación/QR por WhatsApp al doctor?')) return;
                const r = await fetch('/admin/pago/aprobar', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id_solicitud})});
                const d = await r.json();
                if(d.success) { alert('✅ Pago aprobado y cliente notificado'); location.reload(); }
                else alert('❌ Error al aprobar el pago');
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
    } catch (e) { res.status(500).send('Error en bandeja de pedidos'); }
});

router.post('/admin/estado', async (req, res) => {
    try { 
        const sol = await Solicitud.findByIdAndUpdate(req.body.id, { estado_atencion: req.body.estado }); 
        if (req.body.notificar && sol) {
            await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ messaging_product: 'whatsapp', to: sol.telefono_cliente, type: 'text', text: { body: `🚚 *¡Hola ${sol.nombre_cliente}!*\n\nTe informamos desde Forestadent Ecuador que tu pedido ya fue empacado y *está en ruta de despacho*. ¡Gracias por tu confianza!` } })
            });
        }
        res.json({success:true}); 
    } catch (e) { res.json({success:false}); }
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

// ==========================================
// 8. CATÁLOGO VIVO (EDICIÓN Y CREACIÓN DE SKUs)
// ==========================================
router.get('/admin/catalogo', async (req, res) => {
    try {
        const prod = await Producto.find().sort({ categoria: 1, nombre: 1 });
        let filas = prod.map(p => `
            <tr class="border-b hover:bg-gray-50">
                <td class="p-4 font-bold text-gray-800">${p.codigo}</td>
                <td class="p-4"><input type="text" id="nom_${p._id}" value="${p.nombre}" class="border p-2 rounded w-full text-sm"></td>
                <td class="p-4"><input type="text" id="cat_${p._id}" value="${p.categoria || 'General'}" class="border p-2 rounded w-full text-sm"></td>
                <td class="p-4"><input type="number" step="0.01" id="pre_${p._id}" value="${p.precio}" class="border-2 border-blue-200 p-2 rounded w-28 text-center font-extrabold text-blue-700"></td>
                <td class="p-4 text-center"><button onclick="guardarProd('${p._id}')" class="bg-forestaBlack text-white px-4 py-2 rounded text-xs font-bold hover:bg-gray-800">💾 Actualizar</button></td>
            </tr>
        `).join('');

        res.send(`<!DOCTYPE html><html><head><title>Catálogo Vivo</title>${htmlHead}</head><body class="bg-gray-50 p-8"><div class="max-w-7xl mx-auto">${menuNavegacion}
        <div class="bg-white p-6 rounded-xl shadow mb-8 border-l-8 border-forestaGold">
            <h3 class="text-lg font-extrabold uppercase mb-4">➕ Crear Nuevo Producto / SKU</h3>
            <div class="grid grid-cols-1 md:grid-cols-5 gap-4">
                <input type="text" id="nuevoCodigo" placeholder="SKU (Ej: 206-1010)" class="border p-2.5 rounded font-bold text-sm">
                <input type="text" id="nuevoNombre" placeholder="Nombre del Producto" class="border p-2.5 rounded text-sm md:col-span-2">
                <input type="number" step="0.01" id="nuevoPrecio" placeholder="Precio USD" class="border p-2.5 rounded font-bold text-sm">
                <button onclick="crearProd()" class="bg-forestaGold text-white font-bold rounded px-4 py-2.5 text-sm shadow hover:bg-yellow-600">➕ Agregar al Catálogo</button>
            </div>
        </div>
        <div class="bg-white rounded-xl shadow overflow-hidden"><table class="w-full text-left"><thead><tr class="bg-forestaBlack text-white text-xs uppercase"><th class="p-4">SKU</th><th class="p-4">Nombre</th><th class="p-4">Categoría</th><th class="p-4">Precio USD</th><th class="p-4 text-center">Acción</th></tr></thead><tbody>${filas}</tbody></table></div>
        <script>
            async function guardarProd(id){
                await fetch('/admin/catalogo/actualizar', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, nombre: document.getElementById('nom_'+id).value, categoria: document.getElementById('cat_'+id).value, precio: Number(document.getElementById('pre_'+id).value)})});
                alert('✅ Precio y producto sincronizados con la IA');
                location.reload();
            }
            async function crearProd(){
                const codigo = document.getElementById('nuevoCodigo').value;
                const nombre = document.getElementById('nuevoNombre').value;
                const precio = Number(document.getElementById('nuevoPrecio').value);
                if(!codigo || !nombre || !precio) return alert('Completa SKU, nombre y precio');
                await fetch('/admin/catalogo/crear', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({codigo, nombre, precio})});
                location.reload();
            }
        </script>
        </div></body></html>`);
    } catch (e) { res.status(500).send('Error en catálogo'); }
});

router.post('/admin/catalogo/actualizar', async (req, res) => {
    try { await Producto.findByIdAndUpdate(req.body.id, { nombre: req.body.nombre, categoria: req.body.categoria, precio: req.body.precio }); res.json({success:true}); } catch (e) { res.json({success:false}); }
});

router.post('/admin/catalogo/crear', async (req, res) => {
    try { await new Producto({ codigo: req.body.codigo, nombre: req.body.nombre, precio: req.body.precio, stock_actual: 10, stock_seguridad: 5, lead_time_dias: 30 }).save(); res.json({success:true}); } catch (e) { res.json({success:false}); }
});

module.exports = router;