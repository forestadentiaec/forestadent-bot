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
    const prompt = `Eres el experto comercial de Forestadent Ecuador. El cliente solicita cotizar: "${texto_del_cliente}"\nAquí tienes la base de datos de productos:\n${catalogoTexto}\nREGLA: El "Precio Unidad" es por 1 pieza suelta.\n- Si pide "paquete" o "funda", lees "Viene en" y multiplicas.\nFormato: Saludo amable, Lista detallada (Cant x Nombre = Subtotal), Total a pagar. 🚨 PROHIBIDO TERMINAR CON PREGUNTAS.`;

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

// --- 4. CONFIGURACIÓN VISUAL DEL PORTAL ---
const htmlHead = `
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap" rel="stylesheet">
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
    <script>
        tailwind.config = { theme: { extend: { colors: { forestaBlack: '#111111', forestaGold: '#B4975A', forestaGoldHover: '#9a814b' }, fontFamily: { sans: ['Montserrat', 'sans-serif'] } } } }
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

// --- 5. RUTAS DEL PORTAL ADMINISTRATIVO ---

// 🚨 PANTALLA BROADCAST REPARADA
app.get('/admin/broadcast', async (req, res) => {
    try {
        const clientes = await Usuario.find().sort({ nombre_whatsapp: 1 });
        let listaCheckboxes = '';
        clientes.forEach(c => { 
            listaCheckboxes += `<label class="flex items-center gap-3 p-3 hover:bg-gray-100 rounded-lg cursor-pointer border border-transparent hover:border-gray-200 transition"><input type="checkbox" value="${c.telefono}" class="checkbox-manual w-5 h-5 text-green-600 rounded focus:ring-green-500"><span class="text-sm font-bold text-forestaBlack">${c.nombre_whatsapp} <span class="text-gray-400 font-medium ml-1">(+${c.telefono})</span></span></label>`; 
        });
        
        let html = `<!DOCTYPE html><html lang="es"><head><title>Forestadent | Broadcast</title>${htmlHead}</head><body class="bg-gray-50 p-8 font-sans"><div class="max-w-7xl mx-auto">${menuNavegacion}
        
        <div class="bg-white p-8 rounded-xl shadow-lg border-l-8 border-green-600">
            <h2 class="text-2xl font-extrabold text-forestaBlack mb-2 uppercase tracking-wide">📢 Lanzar Campaña Masiva</h2>
            <p class="text-gray-500 font-medium mb-8">Envía promociones o avisos a tus doctores directamente por WhatsApp.</p>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                    <label class="block text-sm font-bold text-forestaBlack uppercase mb-2">1. Selecciona tu público objetivo</label>
                    <select id="tipoFiltro" onchange="mostrarOpcionFiltro()" class="w-full border-2 border-gray-200 focus:border-green-600 rounded p-4 text-sm font-bold text-forestaBlack outline-none mb-4 cursor-pointer">
                        <option value="todos">🌍 Enviar a TODOS los clientes</option>
                        <option value="establecimiento">🏥 Filtrar por Tipo de Establecimiento</option>
                        <option value="etiqueta">🏷️ Filtrar por Etiqueta del CRM</option>
                        <option value="manual">🎯 Seleccionar doctores manualmente</option>
                    </select>

                    <div id="cajaValorEstablecimiento" class="hidden mb-4 transition-all">
                        <select id="valorEstablecimiento" class="w-full border-2 border-gray-200 focus:border-green-600 rounded p-4 text-sm font-medium text-forestaBlack outline-none cursor-pointer">
                            <option value="consultorio">Consultorio</option>
                            <option value="clínica">Clínica</option>
                            <option value="centro médico">Centro Médico</option>
                            <option value="universidad">Universidad</option>
                        </select>
                    </div>

                    <div id="cajaValorEtiqueta" class="hidden mb-4 transition-all">
                        <input type="text" id="valorEtiqueta" placeholder="Escribe la etiqueta exacta (Ej: VIP, Acero, Moroso)" class="w-full border-2 border-gray-200 focus:border-green-600 rounded p-4 text-sm font-medium text-forestaBlack outline-none">
                    </div>

                    <!-- CAJA MANUAL REPARADA -->
                    <div id="cajaValorManual" class="hidden mb-4 transition-all">
                        <div class="border-2 border-gray-200 rounded p-4 max-h-60 overflow-y-auto bg-gray-50">
                            <p class="text-xs font-bold text-gray-500 uppercase mb-3">Marca los doctores específicos:</p>
                            ${listaCheckboxes}
                        </div>
                    </div>

                    <label class="block text-sm font-bold text-forestaBlack uppercase mb-0 mt-6">2. Escribe tu mensaje corporativo</label>
                    <div class="flex flex-wrap gap-x-4 gap-y-2 mb-2 mt-2 bg-gray-50 p-3 rounded border border-gray-200">
                        <p class="text-xs text-gray-600 font-bold">🪄 Personalizar: <span class="bg-white px-1 border border-gray-300 rounded text-forestaBlack cursor-default">{{nombre}}</span></p>
                        <p class="text-xs text-gray-600 font-bold">✒️ Formato WhatsApp: <span class="bg-white px-1 border border-gray-300 rounded text-forestaBlack font-bold cursor-default">*Negrita*</span> y <span class="bg-white px-1 border border-gray-300 rounded text-forestaBlack italic cursor-default">_Cursiva_</span></p>
                    </div>
                    
                    <textarea id="mensajeCampana" rows="7" placeholder="¡Hola {{nombre}}! 👋..." class="w-full border-2 border-gray-200 focus:border-green-600 rounded p-4 text-sm font-medium text-forestaBlack outline-none"></textarea>
                    
                    <button onclick="dispararCampana()" id="btnEnviar" class="mt-6 w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-8 rounded shadow transition uppercase text-sm tracking-widest flex justify-center items-center gap-2">
                        🚀 Enviar Campaña por WhatsApp
                    </button>
                    <p id="textoCarga" class="text-sm text-green-600 font-bold mt-4 text-center hidden">⏳ Disparando y analizando respuesta de Meta...</p>
                </div>
                
                <div class="bg-gray-100 rounded-xl p-6 flex flex-col items-center justify-center border-4 border-dashed border-gray-200">
                    <img src="/logo-vector-forestadent.webp" class="h-10 mb-4 opacity-50">
                    <div class="bg-white p-4 rounded-xl shadow-sm w-full max-w-sm relative">
                        <p class="text-xs text-gray-400 font-bold mb-2 border-b border-gray-100 pb-2">Así lo verá el Doctor en su celular:</p>
                        <p id="vistaPrevia" class="text-sm text-gray-800 whitespace-pre-wrap font-medium">Empieza a escribir tu mensaje...</p>
                    </div>
                </div>
            </div>
        </div></div>
        
        <script>
            // Lógica de vista previa
            document.getElementById('mensajeCampana').addEventListener('input', function(e) { 
                let texto = e.target.value || 'Empieza a escribir tu mensaje...'; 
                texto = texto.replace(/{{nombre}}/gi, 'Dr. Juan Pérez'); 
                texto = texto.replace(/</g, "&lt;").replace(/>/g, "&gt;"); 
                texto = texto.replace(/\\*(.*?)\\*/g, '<strong>$1</strong>'); 
                texto = texto.replace(/_(.*?)_/g, '<em>$1</em>'); 
                texto = texto.replace(/~(.*?)~/g, '<del>$1</del>'); 
                document.getElementById('vistaPrevia').innerHTML = texto; 
            }); 
            
            // Lógica para mostrar/ocultar filtros (REPARADA)
            function mostrarOpcionFiltro() { 
                const filtro = document.getElementById('tipoFiltro').value; 
                document.getElementById('cajaValorEstablecimiento').classList.add('hidden'); 
                document.getElementById('cajaValorEtiqueta').classList.add('hidden'); 
                document.getElementById('cajaValorManual').classList.add('hidden'); 
                
                if (filtro === 'establecimiento') document.getElementById('cajaValorEstablecimiento').classList.remove('hidden'); 
                if (filtro === 'etiqueta') document.getElementById('cajaValorEtiqueta').classList.remove('hidden'); 
                if (filtro === 'manual') document.getElementById('cajaValorManual').classList.remove('hidden'); 
            } 
            
            // Lógica de envío
            async function dispararCampana() { 
                const mensaje = document.getElementById('mensajeCampana').value; 
                const filtro = document.getElementById('tipoFiltro').value; 
                let valorFiltro = ''; 
                let telefonosManuales = []; 
                
                if (filtro === 'establecimiento') valorFiltro = document.getElementById('valorEstablecimiento').value; 
                if (filtro === 'etiqueta') valorFiltro = document.getElementById('valorEtiqueta').value; 
                if (filtro === 'manual') { 
                    const checkboxes = document.querySelectorAll('.checkbox-manual:checked'); 
                    checkboxes.forEach(cb => telefonosManuales.push(cb.value)); 
                    if (telefonosManuales.length === 0) return alert("Selecciona al menos un doctor."); 
                } 
                
                if (!mensaje.trim()) return alert("El mensaje está vacío."); 
                if (!confirm('🚨 ATENCIÓN: Estás a punto de enviar un mensaje oficial por WhatsApp. ¿Deseas proceder?')) return; 
                
                document.getElementById('btnEnviar').classList.add('hidden'); 
                document.getElementById('textoCarga').classList.remove('hidden'); 
                
                try { 
                    const response = await fetch('/admin/broadcast/enviar', { 
                        method: 'POST', 
                        headers: { 'Content-Type': 'application/json' }, 
                        body: JSON.stringify({ mensaje, filtro, valorFiltro, telefonosManuales }) 
                    }); 
                    const result = await response.json(); 
                    if (result.success) { 
                        alert('✅ ¡Proceso terminado!\\n\\nMensajes intentados: ' + result.intentos); 
                        window.location.reload(); 
                    } else { 
                        alert('❌ META BLOQUEÓ EL MENSAJE:\\n\\n' + result.error_meta); 
                    } 
                } catch (error) { 
                    console.error(error); alert('Error de conexión con el servidor.'); 
                } finally { 
                    document.getElementById('btnEnviar').classList.remove('hidden'); 
                    document.getElementById('textoCarga').classList.add('hidden'); 
                } 
            }
        </script></body></html>`;
        res.send(html);
    } catch (error) { res.status(500).send("Error cargando panel de Broadcast."); }
});

// MOTOR DE BROADCAST CON ESCÁNER DE ERRORES DE META
app.post('/admin/broadcast/enviar', async (req, res) => {
    try {
        const { mensaje, filtro, valorFiltro, telefonosManuales } = req.body;
        let query = {};
        if (filtro === 'establecimiento' && valorFiltro) { query = { tipo_establecimiento: valorFiltro }; } 
        else if (filtro === 'etiqueta' && valorFiltro) { query = { etiquetas: { $regex: valorFiltro,$options: 'i' } }; } 
        else if (filtro === 'manual' && telefonosManuales && telefonosManuales.length > 0) { query = { telefono: { $in: telefonosManuales } }; }
        
        const destinatarios = await Usuario.find(query);
        let erroresEncontrados = [];

        for (const dest of destinatarios) {
            let mensajePersonalizado = mensaje.replace(/{{nombre}}/gi, dest.nombre_whatsapp);
            
            // 🚨 HUELLA CRM:
            const nuevaNota = (dest.notas || '') + `\n[📢 Campaña ${new Date().toLocaleDateString('es-EC')}]: ` + mensajePersonalizado.substring(0, 30) + '...';
            await Usuario.findByIdAndUpdate(dest._id, { notas: nuevaNota.trim() });

            const metaResponse = await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, { 
                method: 'POST', 
                headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ messaging_product: 'whatsapp', to: dest.telefono, type: 'text', text: { body: mensajePersonalizado } }) 
            });
            
            const metaData = await metaResponse.json();
            if (metaData.error) { erroresEncontrados.push(`Error al enviar a +${dest.telefono}: ${metaData.error.message}`); }
            await new Promise(r => setTimeout(r, 500));
        }
        
        if (erroresEncontrados.length > 0) { res.status(200).json({ success: false, error_meta: erroresEncontrados[0] }); } 
        else { res.status(200).json({ success: true, intentos: destinatarios.length }); }
    } catch (error) { res.status(500).json({ success: false, error_meta: "Fallo interno en Render." }); }
});

// PROFORMAS
app.get('/proforma/:id', async (req, res) => {
    try {
        const solicitud = await Solicitud.findById(req.params.id);
        if (!solicitud || solicitud.tipo_solicitud !== 'cotizacion') return res.status(404).send('Proforma no encontrada.');
        const fechaCorta = new Date(sol