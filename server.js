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
    { codigo: "202-3745", nombre: "Arco acero recto superior .018x.025", categoria: "Arcos", precio: 1.00, empaque: "Paquete de 10 unidades" },
    { codigo: "202-3845", nombre: "Arco acero recto inferior .018x.025", categoria: "Arcos", precio: 1.00, empaque: "Paquete de 10 unidades" },
    { codigo: "202-3748", nombre: "Arco acero recto superior .019x.025", categoria: "Arcos", precio: 1.00, empaque: "Paquete de 10 unidades" },
    { codigo: "202-3848", nombre: "Arco acero recto inferior .019x.025", categoria: "Arcos", precio: 1.00, empaque: "Paquete de 10 unidades" },
    { codigo: "206-0840", nombre: "Arco Titanol budget superior .016", categoria: "Arcos", precio: 2.50, empaque: "Paquete de 10 unidades" },
    { codigo: "206-2035", nombre: "Arco Titanol budget superior .014x025", categoria: "Arcos", precio: 3.50, empaque: "Paquete de 10 unidades" },
    { codigo: "206-2135", nombre: "Arco Titanol budget inferior .014x.025", categoria: "Arcos", precio: 3.50, empaque: "Paquete de 10 unidades" },
    { codigo: "KIT-BQ", nombre: "Kit Autoligado BioQuick FACE", categoria: "Kits", precio: 199.00, empaque: "Kit Completo" },
    { codigo: "KIT-MS", nombre: "Kit Mini Sprint II FACE Evolution", categoria: "Kits", precio: 82.00, empaque: "Kit Completo" },
    { codigo: "KIT-QK", nombre: "Kit QuickKlear FACE Evolution", categoria: "Kits", precio: 320.00, empaque: "Kit Completo" },
    { codigo: "706-1006", nombre: "Easy Eco MOD MST .022", categoria: "Brackets", precio: 35.00, empaque: "Caso" },
    { codigo: "729-0702", nombre: "Tubo FACE sup. 6 derecha", categoria: "Tubos", precio: 5.00, empaque: "Funda de 10 unidades" },
    { codigo: "730-0702", nombre: "Tubo FACE sup. 6 izquierda", categoria: "Tubos", precio: 5.00, empaque: "Funda de 10 unidades" },
    { codigo: "729-1702", nombre: "Tubo FACE inf. 6 izquierda", categoria: "Tubos", precio: 5.00, empaque: "Funda de 10 unidades" },
    { codigo: "729-1702-D", nombre: "Tubo FACE inf. 6 derecha", categoria: "Tubos", precio: 5.00, empaque: "Funda de 10 unidades" }
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
    
    const prompt = `
    Eres el experto comercial de Forestadent Ecuador. El cliente solicita cotizar: "${texto_del_cliente}"
    Aquí tienes la base de datos de productos (Precios con IVA incluido):
    ${catalogoTexto}
    REGLA DE ORO COMERCIAL: El "Precio por Unidad" es por 1 sola pieza suelta. 
    - Si el cliente pide "piezas" o "unidades", multiplicas la cantidad por el precio por unidad.
    - Si pide "1 paquete" o "1 funda", lees la columna "Viene en" y multiplicas. Ejemplo: 1 paquete = 10 unidades x Precio Unidad.
    
    Formato OBLIGATORIO:
    - Saludo amable.
    - Lista detallada con: Cantidad x Nombre = Subtotal.
    - Total final a pagar.
    - Si pide algo que no está en la lista, dile cortésmente que no disponemos de ese artículo.
    
    🚨 INSTRUCCIÓN CRÍTICA 🚨: ESTÁ ESTRICTAMENTE PROHIBIDO TERMINAR EL MENSAJE CON PREGUNTAS COMO "¿Te puedo ayudar en algo más?", "¿Deseas confirmar el pedido?", o "Cualquier duda contáctame". Simplemente entrega el precio total y finaliza.
    `;

    for (const modelo of modelos) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${process.env.GEMINI_API_KEY}`;
            const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
            const data = await response.json();
            if (data.error) continue; 
            return data.candidates[0].content.parts[0].text.trim();
        } catch (error) { continue; }
    }
    return "Lo siento, tuve un problema procesando el catálogo para tu cotización.";
}

// --- 4. PORTAL WEB DE ADMINISTRACIÓN (IDENTIDAD VISUAL FORESTADENT) ---

const htmlHead = `
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap" rel="stylesheet">
    <script src="https://cdn.tailwindcss.com"></script>
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
    
    <div class="flex gap-4 mb-8">
        <a href="/admin" class="bg-forestaBlack hover:bg-gray-800 text-white px-6 py-3 rounded shadow font-bold transition uppercase text-sm tracking-wide">📦 Pedidos</a>
        <a href="/admin/clientes" class="bg-forestaGold hover:bg-forestaGoldHover text-white px-6 py-3 rounded shadow font-bold transition uppercase text-sm tracking-wide">👥 Directorio CRM</a>
        <a href="/admin/catalogo" class="bg-white border-2 border-forestaBlack text-forestaBlack hover:bg-gray-50 px-6 py-3 rounded shadow font-bold transition uppercase text-sm tracking-wide">📖 Catálogo</a>
    </div>
`;

// PANTALLA 1: PEDIDOS (AHORA CON FILTROS INTELIGENTES)
app.get('/admin', async (req, res) => {
    try {
        const solicitudes = await Solicitud.find().sort({ fecha: -1 });
        let html = `<!DOCTYPE html><html lang="es"><head><title>Forestadent | Pedidos</title>${htmlHead}</head><body class="bg-gray-50 p-8 font-sans"><div class="max-w-7xl mx-auto">${menuNavegacion}
        
        <!-- BARRA DE BÚSQUEDA Y FILTROS -->
        <div class="bg-white p-4 rounded-xl shadow-sm mb-6 flex flex-col md:flex-row gap-4 items-center border border-gray-100">
            <input type="text" id="buscador" onkeyup="filtrarTabla()" placeholder="🔍 Buscar por doctor o teléfono..." class="border-2 border-gray-200 focus:border-forestaGold rounded p-3 text-sm font-medium w-full md:w-1/2 outline-none transition">
            
            <select id="filtroTipo" onchange="filtrarTabla()" class="border-2 border-gray-200 focus:border-forestaGold rounded p-3 text-sm font-bold text-forestaBlack outline-none cursor-pointer w-full md:w-1/4">
                <option value="todos">📋 Todos los Tipos</option>
                <option value="pedido">📦 Solo Pedidos</option>
                <option value="cotizacion">💬 Solo Cotizaciones</option>
                <option value="contacto">👤 Solo Contactos</option>
            </select>

            <select id="filtroEstado" onchange="filtrarTabla()" class="border-2 border-gray-200 focus:border-forestaGold rounded p-3 text-sm font-bold text-forestaBlack outline-none cursor-pointer w-full md:w-1/4">
                <option value="todos">🚦 Todos los Estados</option>
                <option value="pendiente">🟡 Pendientes</option>
                <option value="despachado">🟢 Despachados</option>
                <option value="cotizado">💬 Cotizados</option>
                <option value="recordatorio_enviado">🔔 Avisados</option>
            </select>
        </div>

        <div class="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100"><table class="w-full text-left border-collapse"><thead><tr class="bg-forestaBlack text-white uppercase text-sm tracking-wider"><th class="p-5">Fecha</th><th class="p-5">Cliente</th><th class="p-5">Teléfono</th><th class="p-5">Detalle / Respuesta IA</th><th class="p-5 text-center">Estado</th><th class="p-5 text-center">Acción</th></tr></thead><tbody class="divide-y divide-gray-100">`;

        solicitudes.forEach(sol => {
            let fecha = new Date(sol.fecha).toLocaleString('es-EC');
            let contenidoVisual = '';
            if(sol.tipo_solicitud === 'pedido') {
                try {
                    let productos = JSON.parse(sol.contenido_texto);
                    contenidoVisual = '<ul class="list-disc pl-5 text-sm text-gray-800 font-medium">';
                    productos.forEach(item => { contenidoVisual += `<li><strong>${item.cantidad}</strong> x ${item.producto}</li>`; });
                    contenidoVisual += '</ul>';
                } catch (e) { contenidoVisual = `<span class="text-gray-600 italic">${sol.contenido_texto}</span>`; }
            } else { contenidoVisual = `<div class="text-sm text-gray-800 font-medium whitespace-pre-wrap">${sol.contenido_texto}</div>`; }

            let badgeColor = 'bg-gray-100 text-gray-600 border border-gray-300';
            if(sol.estado_atencion === 'pendiente') badgeColor = 'bg-yellow-50 text-yellow-700 border border-yellow-300';
            if(sol.estado_atencion === 'despachado') badgeColor = 'bg-green-50 text-green-700 border border-green-300';
            if(sol.estado_atencion === 'cotizado') badgeColor = 'bg-forestaGold text-white shadow-sm';
            if(sol.estado_atencion === 'recordatorio_enviado') badgeColor = 'bg-blue-100 text-blue-700 border border-blue-300';

            let botonAccion = '';
            if(sol.estado_atencion === 'pendiente') { 
                botonAccion = `<button onclick="actualizarEstado('${sol._id}', 'despachado')" class="bg-forestaBlack hover:bg-gray-800 text-white text-xs font-bold px-4 py-2 rounded shadow transition uppercase tracking-wide">📦 Despachar</button>`; 
            }
            else if (sol.estado_atencion === 'cotizado') { 
                botonAccion = `
                    <span class="text-xs text-forestaGold font-bold uppercase tracking-wide block mb-2">💬 Cotizado</span>
                    <button onclick="recordarCotizacion('${sol._id}', '${sol.telefono_cliente}')" class="bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-bold px-3 py-1 rounded shadow transition uppercase tracking-wide">🔔 Recordar</button>
                `; 
            }
            else if (sol.estado_atencion === 'recordatorio_enviado') {
                botonAccion = `<span class="text-xs text-blue-600 font-bold uppercase tracking-wide">🔔 Avisado</span>`;
            }
            else { 
                botonAccion = `<span class="text-xs text-gray-400 font-bold uppercase tracking-wide">✔️ Completado</span>`; 
            }
            
            // Inyectamos las variables data-tipo y data-estado para que el buscador funcione
            html += `<tr class="fila-dato hover:bg-gray-50 transition" data-tipo="${sol.tipo_solicitud}" data-estado="${sol.estado_atencion}">
                <td class="p-5 text-sm text-gray-500 font-medium">${fecha}</td>
                <td class="p-5 font-bold text-forestaBlack">${sol.nombre_cliente}</td>
                <td class="p-5 text-sm text-gray-500 font-medium">+${sol.telefono_cliente}</td>
                <td class="p-5">${contenidoVisual}</td>
                <td class="p-5 text-center"><span class="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest ${badgeColor}">${sol.estado_atencion}</span></td>
                <td class="p-5 text-center">${botonAccion}</td>
            </tr>`;
        });

        html += `</tbody></table></div></div>
        <script>
            // EL MOTOR DE BÚSQUEDA EN TIEMPO REAL
            function filtrarTabla() {
                let texto = document.getElementById('buscador').value.toLowerCase();
                let tipo = document.getElementById('filtroTipo').value;
                let estado = document.getElementById('filtroEstado').value;
                let filas = document.querySelectorAll('.fila-dato');

                filas.forEach(fila => {
                    let contenido = fila.innerText.toLowerCase();
                    let filaTipo = fila.getAttribute('data-tipo');
                    let filaEstado = fila.getAttribute('data-estado');

                    let coincideTexto = contenido.includes(texto);
                    let coincideTipo = (tipo === 'todos' || filaTipo === tipo);
                    let coincideEstado = (estado === 'todos' || filaEstado === estado);

                    if (coincideTexto && coincideTipo && coincideEstado) {
                        fila.style.display = '';
                    } else {
                        fila.style.display = 'none';
                    }
                });
            }

            async function actualizarEstado(idPedido, nuevoEstado) { 
                if(!confirm('¿Confirmas que este pedido ya fue empacado y despachado?')) return; 
                try { 
                    const response = await fetch('/admin/estado', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: idPedido, estado: nuevoEstado }) }); 
                    if(response.ok) { window.location.reload(); } else { alert('Error al actualizar.'); } 
                } catch (error) { console.error('Error:', error); } 
            }
            async function recordarCotizacion(idCotizacion, telefono) {
                if(!confirm('¿Deseas enviar un recordatorio automático por WhatsApp a este doctor?')) return;
                try {
                    const response = await fetch('/admin/recordar-cotizacion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: idCotizacion, telefono: telefono }) });
                    if(response.ok) { window.location.reload(); } else { alert('Error enviando recordatorio.'); }
                } catch (error) { console.error('Error:', error); }
            }
        </script></body></html>`;
        res.send(html);
    } catch (error) { res.status(500).send('Error cargando el panel.'); }
});

app.get('/admin/clientes', async (req, res) => {
    try {
        const clientesRaw = await Usuario.find().sort({ fecha_registro: -1 });
        const clientesConSemaforo = await Promise.all(clientesRaw.map(async (cliente) => {
            const ultimoPedido = await Solicitud.findOne({ telefono_cliente: cliente.telefono, tipo_solicitud: 'pedido' }).sort({ fecha: -1 });
            let dias = 999;
            if (ultimoPedido) {
                const diffTime = Math.abs(new Date() - new Date(ultimoPedido.fecha));
                dias = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            }
            let semaforo = '🔴 Inactivo'; let semaforoColor = 'bg-red-100 text-red-700 border-red-300';
            if (dias <= 15) { semaforo = '🟢 Activo'; semaforoColor = 'bg-green-100 text-green-700 border-green-300'; }
            else if (dias <= 30) { semaforo = '🟡 Enfriándose'; semaforoColor = 'bg-yellow-100 text-yellow-700 border-yellow-300'; }
            return { ...cliente.toObject(), semaforo, semaforoColor, dias };
        }));

        let html = `<!DOCTYPE html><html lang="es"><head><title>Forestadent | CRM</title>${htmlHead}</head><body class="bg-gray-50 p-8 font-sans"><div class="max-w-7xl mx-auto">${menuNavegacion}<div class="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100"><table class="w-full text-left border-collapse"><thead><tr class="bg-forestaBlack text-white uppercase text-sm tracking-wider"><th class="p-5">Actividad</th><th class="p-5">Cliente</th><th class="p-5">Lugar de Entrega</th><th class="p-5">Etiquetas Comerciales</th><th class="p-5">Notas Internas</th><th class="p-5 text-center">Acción</th></tr></thead><tbody class="divide-y divide-gray-100">`;
        clientesConSemaforo.forEach(cliente => { 
            let textoDias = cliente.dias === 999 ? 'Sin compras' : `Hace ${cliente.dias} días`;
            html += `<tr class="hover:bg-gray-50 transition"><td class="p-5 text-center"><span class="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest border ${cliente.semaforoColor} block mb-1">${cliente.semaforo}</span><span class="text-xs text-gray-500 font-medium">${textoDias}</span></td><td class="p-5 font-bold text-forestaBlack">${cliente.nombre_whatsapp}<br><span class="text-xs text-gray-500 font-medium font-normal">+${cliente.telefono}</span></td><td class="p-5"><select id="lugar_${cliente._id}" class="border-2 border-gray-200 focus:border-forestaGold rounded p-2 text-xs font-medium text-forestaBlack outline-none w-full"><option value="consultorio" ${cliente.tipo_establecimiento === 'consultorio' ? 'selected' : ''}>Consultorio</option><option value="clínica" ${cliente.tipo_establecimiento === 'clínica' ? 'selected' : ''}>Clínica</option><option value="centro médico" ${cliente.tipo_establecimiento === 'centro médico' ? 'selected' : ''}>Centro Médico</option><option value="universidad" ${cliente.tipo_establecimiento === 'universidad' ? 'selected' : ''}>Universidad</option></select></td><td class="p-5"><input type="text" id="etiq_${cliente._id}" value="${cliente.etiquetas || ''}" placeholder="Ej: VIP, Moroso, Acero" class="border-2 border-gray-200 focus:border-forestaGold rounded p-2 text-xs w-full text-forestaBlack outline-none"></td><td class="p-5"><textarea id="notas_${cliente._id}" placeholder="Notas del doctor..." class="border-2 border-gray-200 focus:border-forestaGold rounded p-2 text-xs w-full text-forestaBlack outline-none" rows="2">${cliente.notas || ''}</textarea></td><td class="p-5 text-center"><button onclick="guardarPerfil('${cliente._id}')" class="bg-forestaGold hover:bg-forestaGoldHover text-white text-xs font-bold px-4 py-2 rounded shadow uppercase tracking-wide transition">💾 Guardar</button></td></tr>`; 
        });
        html += `</tbody></table></div></div><script>async function guardarPerfil(idCliente) { const nuevoLugar = document.getElementById('lugar_' + idCliente).value; const nuevasEtiq = document.getElementById('etiq_' + idCliente).value; const nuevasNotas = document.getElementById('notas_' + idCliente).value; try { const response = await fetch('/admin/clientes/actualizar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: idCliente, tipo_establecimiento: nuevoLugar, etiquetas: nuevasEtiq, notas: nuevasNotas }) }); if(response.ok) { alert('Perfil de CRM guardado.'); } else { alert('Error.'); } } catch (error) { console.error('Error:', error); } }</script></body></html>`;
        res.send(html);
    } catch (error) { res.status(500).send('Error cargando CRM.'); }
});

app.get('/admin/catalogo', async (req, res) => {
    try {
        const productos = await Producto.find().sort({ categoria: 1, nombre: 1 });
        let html = `<!DOCTYPE html><html lang="es"><head><title>Forestadent | Catálogo</title>${htmlHead}</head><body class="bg-gray-50 p-8 font-sans"><div class="max-w-7xl mx-auto">${menuNavegacion}<div class="bg-white p-8 rounded-xl shadow-lg mb-8 border-l-8 border-forestaGold"><h2 class="text-xl font-extrabold text-forestaBlack mb-6 uppercase tracking-wide">➕ Agregar Nuevo Producto</h2><div class="grid grid-cols-1 md:grid-cols-5 gap-5"><input type="text" id="nuevo_codigo" placeholder="SKU / Código" class="border-2 border-gray-200 focus:border-forestaGold rounded p-3 font-medium text-forestaBlack outline-none"><input type="text" id="nuevo_nombre" placeholder="Nombre del Producto" class="border-2 border-gray-200 focus:border-forestaGold rounded p-3 font-medium text-forestaBlack outline-none md:col-span-2"><input type="text" id="nueva_categoria" placeholder="Categoría" class="border-2 border-gray-200 focus:border-forestaGold rounded p-3 font-medium text-forestaBlack outline-none"><input type="number" step="0.01" id="nuevo_precio" placeholder="Precio ($)" class="border-2 border-gray-200 focus:border-forestaGold rounded p-3 font-medium text-forestaBlack outline-none"></div><button onclick="agregarProducto()" class="mt-6 bg-forestaBlack hover:bg-gray-800 text-white font-bold py-3 px-8 rounded shadow transition uppercase text-sm tracking-widest">Guardar en Catálogo</button></div><div class="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100"><table class="w-full text-left border-collapse"><thead><tr class="bg-forestaBlack text-white uppercase text-sm tracking-wider"><th class="p-5">SKU</th><th class="p-5">Nombre del Producto</th><th class="p-5">Categoría</th><th class="p-5 text-right">Precio Unitario</th><th class="p-5 text-center">Acción</th></tr></thead><tbody class="divide-y divide-gray-100">`;
        productos.forEach(prod => { html += `<tr class="hover:bg-gray-50 transition"><td class="p-5 text-sm font-bold text-gray-500">${prod.codigo}</td><td class="p-5 font-bold text-forestaBlack">${prod.nombre}</td><td class="p-5 text-sm font-medium text-gray-500">${prod.categoria}</td><td class="p-5 text-right font-bold text-forestaGold text-lg">$${prod.precio.toFixed(2)}</td><td class="p-5 text-center"><button onclick="eliminarProducto('${prod._id}')" class="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-xs font-bold px-4 py-2 rounded transition uppercase tracking-wide">❌ Borrar</button></td></tr>`; });
        html += `</tbody></table></div></div><script>async function agregarProducto() { const codigo = document.getElementById('nuevo_codigo').value; const nombre = document.getElementById('nuevo_nombre').value; const categoria = document.getElementById('nueva_categoria').value; const precio = document.getElementById('nuevo_precio').value; if(!codigo || !nombre || !precio) return alert("Llena código, nombre y precio."); try { const response = await fetch('/admin/catalogo/agregar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo, nombre, categoria, precio: parseFloat(precio), empaque: "Unidad" }) }); if(response.ok) { window.location.reload(); } else { alert('Error.'); } } catch (error) { console.error('Error:', error); } } async function eliminarProducto(idProducto) { if(!confirm("¿Borrar este producto?")) return; try { const response = await fetch('/admin/catalogo/eliminar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: idProducto }) }); if(response.ok) { window.location.reload(); } else { alert('Error.'); } } catch (error) { console.error('Error:', error); } }</script></body></html>`;
        res.send(html);
    } catch (error) { res.status(500).send('Error cargando Catálogo.'); }
});

app.post('/admin/catalogo/agregar', async (req, res) => { try { await new Producto(req.body).save(); res.status(200).json({ success: true }); } catch (error) { res.status(500).json({ success: false }); } });
app.post('/admin/catalogo/eliminar', async (req, res) => { try { await Producto.findByIdAndDelete(req.body.id); res.status(200).json({ success: true }); } catch (error) { res.status(500).json({ success: false }); } });
app.post('/admin/clientes/actualizar', async (req, res) => { try { await Usuario.findByIdAndUpdate(req.body.id, { tipo_establecimiento: req.body.tipo_establecimiento, etiquetas: req.body.etiquetas, notas: req.body.notas }); res.status(200).json({ success: true }); } catch (error) { res.status(500).json({ success: false }); } });
app.post('/admin/recordar-cotizacion', async (req, res) => {
    try {
        const { id, telefono } = req.body;
        await Solicitud.findByIdAndUpdate(id, { estado_atencion: 'recordatorio_enviado' });
        const mensaje_recordatorio = `👋 Hola Doctor/a, espero te encuentres excelente hoy.\n\nTe escribo rápidamente para saber si pudiste revisar la cotización que te envié. ¿Tienes alguna duda o te gustaría que procedamos a armar el pedido? 📦🦷`;
        await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: telefono, type: 'text', text: { body: mensaje_recordatorio } }) });
        res.status(200).json({ success: true });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.post('/admin/estado', async (req, res) => {
    try {
        const { id, estado } = req.body;
        const pedidoActualizado = await Solicitud.findByIdAndUpdate(id, { estado_atencion: estado }, { new: true });
        if (estado === 'despachado' && pedidoActualizado) {
            const perfilCliente = await Usuario.findOne({ telefono: pedidoActualizado.telefono_cliente });
            const lugarDeEntrega = perfilCliente ? perfilCliente.tipo_establecimiento : 'consultorio';
            const mensaje_notificacion = `🚚 *¡Buenas noticias, ${pedidoActualizado.nombre_cliente}!*\n\nTu pedido ha sido empacado y acaba de ser *DESPACHADO* a tu ${lugarDeEntrega}.\n\nGracias por confiar en Forestadent Ecuador. 🦷`;
            await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: pedidoActualizado.telefono_cliente, type: 'text', text: { body: mensaje_notificacion } }) });
        }
        res.status(200).json({ success: true });
    } catch (error) { res.status(500).json({ success: false }); }
});

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
                    if (msg_body.toLowerCase() === 'menu' || msg_body.toLowerCase() === 'menú') {
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
                        await enviarMensajeInmediato(from, "⏳ *Calculando cotización...*\nEstoy revisando el inventario y calculando los precios exactos. Dame unos segunditos por favor. 🧮");
                        const catalogoCompleto = await Producto.find().lean();
                        const textoCotizacionIA = await generarCotizacionConIA(msg_body, catalogoCompleto);
                        const nuevaSolicitud = new Solicitud({ telefono_cliente: from, nombre_cliente: nombre_cliente, tipo_solicitud: 'cotizacion', contenido_texto: textoCotizacionIA, estado_atencion: 'cotizado' });
                        await nuevaSolicitud.save();
                        mensaje_respuesta = textoCotizacionIA + `\n\n👉 *¿Deseas convertir esta cotización en un pedido formal?*\nResponde *SI* para confirmar, o escribe *Menu* para regresar.`;
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
                                    mensaje_respuesta = `✅ ¡Pedido generado con éxito a partir de tu cotización!\n\n${resumenVisual}\n\nPronto te confirmaremos el despacho.\n\n_(Escribe *Menu* para volver)_`;
                                } else { mensaje_respuesta = `Tuve un problema. Escribe *Menu* e intenta pedirlo por la opción 3 (Nuevo Pedido).`; }
                            } else { mensaje_respuesta = `No encontré tu cotización. Escribe *Menu* para volver al inicio.`; }
                        } else { mensaje_respuesta = `De acuerdo, cotización guardada.\n\n` + texto_menu; }
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