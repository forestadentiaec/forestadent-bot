const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Producto } = require('../modelos/BaseDatos');
const { htmlHead, menuNavegacion } = require('../vistas/Plantillas');

router.get('/admin/inventario', async (req, res) => {
    try {
        const prod = await Producto.find().sort({ categoria: 1, nombre: 1 });
        let filas = prod.map(p => {
            const stockActual = Number(p.stock_actual || 0); const stockSeguridad = Number(p.stock_seguridad || 10); const leadTime = Number(p.lead_time_dias || 30);
            let badgeAlerta = ''; let estiloFila = 'hover:bg-gray-50 border-b'; let colorInput = 'text-blue-700 border-gray-300';
            if (stockActual === 0) { badgeAlerta = `<span class="bg-red-600 text-white text-xs font-extrabold px-3 py-1.5 rounded-full shadow-sm inline-block">🚨 AGOTADO</span>`; estiloFila = 'bg-red-50 hover:bg-red-100 border-b border-red-200'; colorInput = 'text-red-700 border-red-500 bg-white'; } 
            else if (stockActual <= stockSeguridad) { badgeAlerta = `<span class="bg-amber-100 text-amber-900 border border-amber-400 text-xs font-extrabold px-3 py-1.5 rounded-full inline-block">⚠️ REPONER</span>`; estiloFila = 'bg-amber-50/40 hover:bg-amber-50 border-b'; colorInput = 'text-amber-700 border-amber-400 bg-white'; } 
            else { badgeAlerta = `<span class="bg-green-100 text-green-800 text-xs font-extrabold px-3 py-1.5 rounded-full inline-block">🟢 ÓPTIMO</span>`; }
            return `<tr class="${estiloFila}"><td class="p-4 font-bold text-gray-800">${p.codigo}<br><span class="font-normal text-sm text-gray-500">${p.nombre}</span></td><td class="p-4 text-center"><input type="number" id="st_${p._id}" value="${stockActual}" class="border-2 ${colorInput} w-24 p-2 text-center rounded-lg font-extrabold"></td><td class="p-4 text-center"><input type="number" id="seg_${p._id}" value="${stockSeguridad}" class="border border-gray-300 w-24 p-2 text-center rounded-lg font-bold text-gray-700"></td><td class="p-4 text-center"><input type="number" id="lt_${p._id}" value="${leadTime}" class="border border-gray-300 w-20 p-2 text-center rounded-lg text-gray-600"></td><td class="p-4 text-center">${badgeAlerta}</td><td class="p-4 text-center hide-on-print"><button onclick="guardarInv('${p._id}')" class="bg-gray-800 hover:bg-black text-white px-4 py-2 rounded-lg font-bold text-xs shadow transition">💾 Guardar</button></td></tr>`;
        }).join('');
        res.send(`<!DOCTYPE html><html><head><title>Inventario e IA</title>${htmlHead}<style>@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background-color: white !important; } body * { visibility: hidden; } #pdfReporte, #pdfReporte * { visibility: visible; } #pdfReporte { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 20px; border: none; box-shadow: none; } .hide-on-print { display: none !important; } }</style></head><body class="bg-gray-50 p-8"><div class="max-w-7xl mx-auto hide-on-print">${menuNavegacion}</div><div class="max-w-7xl mx-auto bg-white p-8 rounded-xl shadow border-l-8 border-blue-600 print:border-none print:shadow-none"><div class="flex justify-between items-center mb-6 hide-on-print"><div><h2 class="text-2xl font-extrabold uppercase">📦 Asistente de Compras (IA)</h2><p class="text-xs text-gray-500 font-bold mt-1">Monitoreo en vivo de puntos de reorden</p></div><button onclick="analizarIA()" id="btnIA" class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg transition">🧠 Analizar Stock con IA</button></div><div id="cajaResultadoIA" class="hidden mb-8"><div id="pdfReporte" class="p-8 bg-white border-2 border-blue-200 rounded-xl shadow-sm"><h3 class="text-xl font-extrabold mb-6 uppercase text-blue-900 border-b-2 border-blue-100 pb-4">📑 Reporte Ejecutivo de Abastecimiento</h3><div id="textoReporte" class="text-sm text-gray-800" style="line-height: 1.7;"></div><p class="text-xs text-gray-400 mt-8 pt-4 border-t border-gray-100 text-center font-bold">Generado por IA • Forestadent • ${new Date().toLocaleDateString('es-EC')}</p></div><button onclick="window.print()" class="mt-4 bg-forestaBlack text-white font-bold py-3 px-6 rounded-lg shadow-lg w-full hover:bg-gray-800 transition hide-on-print">🖨️ Imprimir / Guardar como PDF</button></div><table class="w-full text-left hide-on-print"><thead><tr class="bg-forestaBlack text-white text-xs uppercase"><th class="p-4">SKU & Nombre</th><th class="p-4 text-center">Stock Actual</th><th class="p-4 text-center">Seguridad</th><th class="p-4 text-center">Tránsito</th><th class="p-4 text-center">Alerta</th><th class="p-4 text-center">Acción</th></tr></thead><tbody>${filas}</tbody></table></div><script>async function guardarInv(id){ const res = await fetch('/admin/inventario/actualizar', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ id, stock_actual: Number(document.getElementById('st_'+id).value), stock_seguridad: Number(document.getElementById('seg_'+id).value), lead_time_dias: Number(document.getElementById('lt_'+id).value) }) }); const data = await res.json(); if(data.success) location.reload(); else alert('Error'); } async function analizarIA(){ const caja = document.getElementById('cajaResultadoIA'); const texto = document.getElementById('textoReporte'); caja.classList.remove('hidden'); texto.innerHTML = '<div class="text-center font-bold text-blue-600 my-8">🧠 Analizando con IA...</div>'; try { const r = await fetch('/admin/inventario/analizar', {method:'POST'}); const d = await r.json(); if(d.success) { texto.innerHTML = d.analisis; } else { texto.innerHTML = '<div class="text-red-600 font-bold">❌ Error</div>'; } } catch(e) { texto.innerHTML = '<div class="text-red-600 font-bold">❌ Error de red</div>'; } }</script></body></html>`);
    } catch (e) { res.status(500).send('Error en inventario'); }
});

router.post('/admin/inventario/actualizar', async (req, res) => {
    try { await Producto.findByIdAndUpdate(req.body.id, { stock_actual: Number(req.body.stock_actual), stock_seguridad: Number(req.body.stock_seguridad), lead_time_dias: Number(req.body.lead_time_dias) }); res.json({success:true}); } catch(e) { res.json({success:false}); }
});

router.post('/admin/inventario/analizar', async (req, res) => {
    try {
        const prod = await Producto.find();
        const inv = prod.map(p => `SKU: ${p.codigo} | Stock: ${p.stock_actual} | Mínimo: ${p.stock_seguridad} | Tránsito: ${p.lead_time_dias}`).join('\n');
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const prompt = `Eres Gerente Logístico de Forestadent. Analiza este inventario y genera un Reporte Ejecutivo de Abastecimiento corporativo:\n\n${inv}`;
        let result = null;
        const modelos = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro'];
        for (const m of modelos) { try { const model = genAI.getGenerativeModel({ model: m }); result = await model.generateContent(prompt); if (result && result.response) break; } catch (e) {} }
        if (result) res.json({ success: true, analisis: result.response.text().replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>') });
        else res.json({ success: false });
    } catch (e) { res.json({ success: false }); }
});

module.exports = router;