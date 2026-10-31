const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Producto } = require('../modelos/BaseDatos');
const { htmlHead, menuNavegacion } = require('../vistas/Plantillas');

router.get('/admin/inventario', async (req, res) => {
    try {
        const prod = await Producto.find().sort({ categoria: 1, nombre: 1 });
        
        let filas = prod.map(p => {
            const stockActual = Number(p.stock_actual || 0); 
            const stockSeguridad = Number(p.stock_seguridad || 10); 
            const leadTime = Number(p.lead_time_dias || 30);
            
            let badgeAlerta = ''; 
            let estiloFila = 'hover:bg-gray-50 border-b'; 
            let colorInput = 'text-blue-700 bg-gray-50 border-transparent focus:border-blue-500 focus:bg-white';
            let estadoFiltro = 'optimo';

            if (stockActual === 0) { 
                badgeAlerta = `<span class="bg-red-100 text-red-700 border border-red-200 text-[10px] font-extrabold px-2.5 py-1 rounded-sm uppercase tracking-wide shadow-sm">🚨 Agotado</span>`; 
                estiloFila = 'bg-red-50/50 hover:bg-red-50 border-b border-red-100'; 
                colorInput = 'text-red-700 bg-white border-red-300 focus:border-red-600 focus:ring-1 focus:ring-red-600';
                estadoFiltro = 'agotado';
            } else if (stockActual <= stockSeguridad) { 
                badgeAlerta = `<span class="bg-amber-100 text-amber-700 border border-amber-200 text-[10px] font-extrabold px-2.5 py-1 rounded-sm uppercase tracking-wide shadow-sm">⚠️ Reponer</span>`; 
                estiloFila = 'bg-amber-50/30 hover:bg-amber-50 border-b border-amber-100'; 
                colorInput = 'text-amber-700 bg-white border-amber-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-500';
                estadoFiltro = 'reponer';
            } else { 
                badgeAlerta = `<span class="bg-green-50 text-green-700 border border-green-200 text-[10px] font-extrabold px-2.5 py-1 rounded-sm uppercase tracking-wide">🟢 Óptimo</span>`; 
            }

            return `
            <tr class="${estiloFila} fila-inventario" data-sku="${p.codigo.toLowerCase()}" data-nombre="${p.nombre.toLowerCase()}" data-estado="${estadoFiltro}">
                <td class="p-4">
                    <p class="font-extrabold text-gray-900 text-sm tracking-tight">${p.codigo}</p>
                    <p class="font-medium text-xs text-gray-500 mt-0.5 truncate max-w-xs">${p.nombre}</p>
                </td>
                <td class="p-4 text-center">
                    <input type="number" id="st_${p._id}" value="${stockActual}" class="w-20 p-2 text-center rounded-md font-extrabold text-sm border outline-none transition-all ${colorInput}">
                </td>
                <td class="p-4 text-center">
                    <input type="number" id="seg_${p._id}" value="${stockSeguridad}" class="w-16 p-2 text-center rounded-md font-bold text-xs text-gray-600 border border-transparent bg-gray-50 focus:bg-white focus:border-gray-300 outline-none transition-all">
                </td>
                <td class="p-4 text-center">
                    <input type="number" id="lt_${p._id}" value="${leadTime}" class="w-16 p-2 text-center rounded-md font-bold text-xs text-gray-500 border border-transparent bg-gray-50 focus:bg-white focus:border-gray-300 outline-none transition-all">
                </td>
                <td class="p-4 text-center">${badgeAlerta}</td>
                <td class="p-4 text-center hide-on-print">
                    <button onclick="guardarInv('${p._id}')" class="bg-white border border-gray-300 hover:bg-gray-800 hover:text-white text-gray-700 hover:border-gray-800 px-4 py-2 rounded-lg font-extrabold text-[10px] uppercase tracking-wide shadow-sm transition-all w-full">💾 Actualizar</button>
                </td>
            </tr>`;
        }).join('');

        res.send(`<!DOCTYPE html><html><head><title>Inventario e IA | Forestadent</title>${htmlHead}
        <style>
            @media print {
                body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background-color: white !important; }
                body * { visibility: hidden; }
                #pdfReporte, #pdfReporte * { visibility: visible; }
                #pdfReporte { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 20px; border: none; box-shadow: none; }
                .hide-on-print { display: none !important; }
            }
        </style>
        </head><body class="bg-gray-100 p-8">
        <div class="max-w-7xl mx-auto hide-on-print">${menuNavegacion}</div>
        
        <div class="max-w-7xl mx-auto bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden print:border-none print:shadow-none">
            
            <div class="p-6 border-b border-gray-100 hide-on-print">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                    <div>
                        <h2 class="text-xl font-extrabold uppercase tracking-tight text-gray-900">📦 Asistente Logístico (IA)</h2>
                        <p class="text-xs text-gray-500 font-medium mt-1">Control de quiebres de stock y auditoría de abastecimiento B2B</p>
                    </div>
                    <button onclick="analizarIA()" id="btnIA" class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-extrabold text-xs uppercase tracking-wide shadow-md transition-all flex items-center gap-2">
                        🧠 Generar Reporte IA
                    </button>
                </div>
                
                <!-- BARRA DE FILTROS INTELIGENTE -->
                <div class="flex flex-col md:flex-row gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <div class="flex-1 relative">
                        <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">🔍</span>
                        <input type="text" id="filtroBuscadorInv" onkeyup="filtrarInventario()" placeholder="Buscar por SKU o Nombre del producto..." class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-all">
                    </div>
                    <select id="filtroEstadoInv" onchange="filtrarInventario()" class="border border-gray-300 rounded-md py-2 px-3 text-sm font-bold text-gray-700 bg-white cursor-pointer outline-none w-full md:w-64 focus:ring-2 focus:ring-blue-500 transition-all">
                        <option value="todos">🚦 Todos los Productos</option>
                        <option value="agotado">🚨 Solo Agotados (Críticos)</option>
                        <option value="reponer">⚠️ Por Reponer (Bajo mínimo)</option>
                        <option value="optimo">🟢 Stock Óptimo</option>
                    </select>
                </div>
            </div>
            
            <!-- CONTENEDOR DEL REPORTE IA -->
            <div id="cajaResultadoIA" class="hidden p-6 bg-gray-50 border-b border-gray-200">
                <div id="pdfReporte" class="p-8 bg-white border border-gray-300 rounded-xl shadow-sm relative">
                    <div class="absolute top-0 left-0 w-full h-2 bg-blue-600 rounded-t-xl"></div>
                    <h3 class="text-lg font-extrabold mb-6 uppercase tracking-wider text-blue-900 border-b border-gray-100 pb-4 flex items-center gap-2">
                        📑 Reporte Ejecutivo de Abastecimiento
                    </h3>
                    <div id="textoReporte" class="text-sm text-gray-700" style="line-height: 1.8;"></div>
                    <p class="text-[10px] text-gray-400 mt-8 pt-4 border-t border-gray-100 text-center font-bold uppercase tracking-widest">
                        Generado por IA • Forestadent Ecuador • ${new Date().toLocaleDateString('es-EC')}
                    </p>
                </div>
                <button onclick="window.print()" class="mt-4 bg-forestaBlack text-white font-extrabold text-xs uppercase tracking-wider py-3 px-6 rounded-lg shadow-md w-full md:w-auto hover:bg-gray-800 transition hide-on-print">
                    🖨️ Imprimir / Guardar Reporte PDF
                </button>
            </div>
            
            <!-- TABLA DE INVENTARIO -->
            <div class="overflow-x-auto">
                <table class="w-full text-left hide-on-print">
                    <thead>
                        <tr class="bg-gray-50 border-b border-gray-100 text-gray-400 text-[10px] uppercase tracking-wider">
                            <th class="p-4 font-bold">SKU & Nombre</th>
                            <th class="p-4 font-bold text-center">Stock Actual</th>
                            <th class="p-4 font-bold text-center">Mínimo (Seg)</th>
                            <th class="p-4 font-bold text-center">Tránsito (Días)</th>
                            <th class="p-4 font-bold text-center">Alerta Logística</th>
                            <th class="p-4 font-bold text-center">Acción</th>
                        </tr>
                    </thead>
                    <tbody>${filas || '<tr><td colspan="6" class="p-8 text-center text-gray-400 text-sm">Catálogo vacío</td></tr>'}</tbody>
                </table>
            </div>
        </div>

        <script>
            // Motor de Filtros en Tiempo Real
            function filtrarInventario() {
                const busqueda = document.getElementById('filtroBuscadorInv').value.toLowerCase();
                const estado = document.getElementById('filtroEstadoInv').value;
                const filas = document.querySelectorAll('.fila-inventario');
                
                filas.forEach(fila => {
                    const fSku = fila.getAttribute('data-sku');
                    const fNombre = fila.getAttribute('data-nombre');
                    const fEstado = fila.getAttribute('data-estado');
                    
                    const coincideBusqueda = fSku.includes(busqueda) || fNombre.includes(busqueda);
                    const coincideEstado = estado === 'todos' || fEstado === estado;
                    
                    if (coincideBusqueda && coincideEstado) {
                        fila.style.display = '';
                    } else {
                        fila.style.display = 'none';
                    }
                });
            }

            // Guardar Cambios
            async function guardarInv(id){ 
                const btn = event.target;
                const textoOriginal = btn.innerText;
                btn.innerText = '⏳...';
                
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
                if(data.success) {
                    btn.innerText = '✅ OK';
                    btn.classList.add('bg-green-100', 'text-green-800', 'border-green-300');
                    setTimeout(() => location.reload(), 500);
                } else {
                    alert('Error actualizando el stock');
                    btn.innerText = textoOriginal;
                }
            }

            // Motor de IA
            async function analizarIA(){
                const caja = document.getElementById('cajaResultadoIA');
                const texto = document.getElementById('textoReporte');
                caja.classList.remove('hidden');
                texto.innerHTML = '<div class="text-center font-extrabold text-blue-600 my-10 flex flex-col items-center"><span class="text-3xl mb-3">🧠</span> Cruzando niveles de stock, mínimos y tiempos de tránsito con Inteligencia Artificial...</div>';
                try {
                    const r = await fetch('/admin/inventario/analizar', {method:'POST'});
                    const d = await r.json();
                    if(d.success) {
                        texto.innerHTML = d.analisis;
                    } else {
                        texto.innerHTML = '<div class="text-red-600 font-bold text-center">❌ Error generando el reporte. Revisa los logs de Render.</div>';
                    }
                } catch(e) { 
                    texto.innerHTML = '<div class="text-red-600 font-bold text-center">❌ Error de conexión al servidor de IA.</div>'; 
                }
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
        const inv = prod.map(p => `SKU: ${p.codigo} | Stock: ${p.stock_actual} | Mínimo: ${p.stock_seguridad} | Tránsito: ${p.lead_time_dias}`).join('\n');
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const prompt = `Eres el Gerente Logístico de Forestadent. Analiza este inventario y genera un Reporte Ejecutivo de Abastecimiento corporativo claro y profesional:\n\n${inv}`;
        let result = null;
        
        const modelos = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro'];
        
        for (const m of modelos) { 
            try { 
                const model = genAI.getGenerativeModel({ model: m }); 
                result = await model.generateContent(prompt); 
                if (result && result.response) break; 
            } catch (e) {} 
        }
        
        if (result) {
            let htmlFormat = result.response.text().replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b class="text-gray-900">$1</b>');
            res.json({ success: true, analisis: htmlFormat });
        } else {
            res.json({ success: false });
        }
    } catch (e) { res.json({ success: false }); }
});

module.exports = router;