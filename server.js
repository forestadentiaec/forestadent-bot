require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

// --- 1. CONEXIÓN A MONGODB ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('🟢 Conectado a MongoDB Atlas');
        inicializarCatalogo(); // <--- Disparamos el Auto-Sembrador al conectar
    })
    .catch((error) => console.error('🔴 Error MongoDB:', error));

// --- 2. ESTRUCTURAS DE LA BASE DE DATOS ---
const usuarioSchema = new mongoose.Schema({
    telefono: String,
    nombre_whatsapp: String,
    estado_conversacion: { type: String, default: 'inicio' },
    tipo_establecimiento: { type: String, default: 'consultorio' },
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

// NUEVA ESTRUCTURA: CEREBRO FINANCIERO (CATÁLOGO)
const productoSchema = new mongoose.Schema({
    codigo: String,
    nombre: String,
    categoria: String,
    precio: Number,
    empaque: String
});
const Producto = mongoose.model('Producto', productoSchema);

// AUTO-SEMBRADOR DE PRODUCTOS (Extraído de tu Proforma PDF)
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
    { codigo: "KIT-BQ", nombre: "Kit Autoligado BioQuick FACE (20 brackets + 6 arcos + 8 tubos)", categoria: "Kits", precio: 199.00, empaque: "Kit Completo" },
    { codigo: "KIT-MS", nombre: "Kit Mini Sprint II FACE Evolution (20 brackets + 8 tubos)", categoria: "Kits", precio: 82.00, empaque: "Kit Completo" },
    { codigo: "KIT-QK", nombre: "Kit QuickKlear FACE Evolution (20 brackets + 8 tubos)", categoria: "Kits", precio: 320.00, empaque: "Kit Completo" },
    { codigo: "706-1006", nombre: "Easy Eco MOD MST .022, 20 brackets", categoria: "Brackets", precio: 35.00, empaque: "Caso" },
    { codigo: "729-0702", nombre: "Tubo FACE sup. 6 derecha", categoria: "Tubos", precio: 5.00, empaque: "Funda de 10 unidades" },
    { codigo: "730-0702", nombre: "Tubo FACE sup. 6 izquierda", categoria: "Tubos", precio: 5.00, empaque: "Funda de 10 unidades" },
    { codigo: "729-1702", nombre: "Tubo FACE inf. 6 izquierda", categoria: "Tubos", precio: 5.00, empaque: "Funda de 10 unidades" },
    { codigo: "729-1702-D", nombre: "Tubo FACE inf. 6 derecha", categoria: "Tubos", precio: 5.00, empaque: "Funda de 10 unidades" },
    { codigo: "729-0602", nombre: "Tubo FACE sup. 7 derecha", categoria: "Tubos", precio: 5.00, empaque: "Funda de 10 unidades" },
    { codigo: "730-0602", nombre: "Tubo FACE sup. 7 izquierda", categoria: "Tubos", precio: 5.00, empaque: "Funda de 10 unidades" },
    { codigo: "749K8425", nombre: "Tubo FACE inf. 7 izquierda", categoria: "Tubos", precio: 5.00, empaque: "Funda de 10 unidades" },
    { codigo: "749K8605", nombre: "Tubo FACE inf. 7 derecha", categoria: "Tubos", precio: 5.00, empaque: "Funda de 10 unidades" }
];

async function inicializarCatalogo() {
    try {
        const conteo = await Producto.countDocuments();
        if (conteo === 0) {
            console.log("📦 Base de datos de productos vacía. Insertando catálogo inicial...");
            await Producto.insertMany(productosIniciales);
            console.log("✅ Catálogo inicial cargado exitosamente.");
        } else {
            console.log(`📘 El catálogo ya tiene ${conteo} referencias cargadas.`);
        }
    } catch (error) {
        console.error("🔴 Error inicializando catálogo:", error);
    }
}

// --- 3. CEREBRO DE INTELIGENCIA ARTIFICIAL (CASCADA) ---
async function analizarPedidoConIA(texto_del_cliente) {
    const modelos = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'];
    const prompt = `
    Eres un asistente comercial de insumos de ortodoncia de Forestadent. 
    Pedido informal: "${texto_del_cliente}"
    Devuelve ÚNICAMENTE un arreglo JSON con las claves "producto" y "cantidad".
    Ejemplo: [{"producto": "Tubo molar Roth", "cantidad": 5}]
    `;

    for (const modelo of modelos) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${process.env.GEMINI_API_KEY}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            const data = await response.json();
            if (data.error) continue; 
            
            let textoJson = data.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(textoJson);
        } catch (error) { continue; }
    }
    return null;
}

// --- 4. PORTAL WEB DE ADMINISTRACIÓN (TORRE DE CONTROL) ---
const menuNavegacion = `
    <div class="flex gap-4 mb-6">
        <a href="/admin" class="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded shadow font-bold transition">📦 Pedidos</a>
        <a href="/admin/clientes" class="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded shadow font-bold transition">👥 Directorio CRM</a>
        <a href="/admin/catalogo" class="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded shadow font-bold transition">📖 Catálogo de Productos</a>
    </div>
`;

app.get('/admin', async (req, res) => {
    try {
        const pedidos = await Solicitud.find({ tipo_solicitud: 'pedido' }).sort({ fecha: -1 });
        
        let html = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Forestadent | Torre de Control</title>
            <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-gray-100 p-8 font-sans">
            <div class="max-w-6xl mx-auto">
                <div class="flex justify-between items-center mb-4">
                    <h1 class="text-3xl font-bold text-gray-800">Torre de Control B2B</h1>
                    <span class="bg-green-600 text-white px-4 py-2 rounded-lg shadow font-bold">🟢 En línea</span>
                </div>
                ${menuNavegacion}
                <div class="bg-white rounded-xl shadow-md overflow-hidden">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="bg-gray-800 text-white">
                                <th class="p-4">Fecha</th>
                                <th class="p-4">Cliente</th>
                                <th class="p-4">Teléfono</th>
                                <th class="p-4">Detalle del Pedido</th>
                                <th class="p-4 text-center">Estado</th>
                                <th class="p-4 text-center">Acción</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-200">
        `;

        pedidos.forEach(pedido => {
            let fecha = new Date(pedido.fecha).toLocaleString('es-EC');
            let productosHtml = '';
            try {
                let productos = JSON.parse(pedido.contenido_texto);
                productosHtml = '<ul class="list-disc pl-5 text-sm text-gray-700">';
                productos.forEach(item => { productosHtml += `<li><strong>${item.cantidad}</strong> x ${item.producto}</li>`; });
                productosHtml += '</ul>';
            } catch (e) { productosHtml = `<span class="text-gray-600 italic">${pedido.contenido_texto}</span>`; }

            let badgeColor = pedido.estado_atencion === 'pendiente' ? 'bg-yellow-200 text-yellow-800' : 'bg-green-200 text-green-800';
            let botonAccion = pedido.estado_atencion === 'pendiente' 
                ? `<button onclick="actualizarEstado('${pedido._id}', 'despachado')" class="bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold px-4 py-2 rounded shadow transition">📦 Despachar</button>`
                : `<span class="text-xs text-gray-500 font-bold">✔️ Completado</span>`;
            
            html += `
                            <tr class="hover:bg-gray-50 transition">
                                <td class="p-4 text-sm text-gray-500">${fecha}</td>
                                <td class="p-4 font-semibold text-gray-800">${pedido.nombre_cliente}</td>
                                <td class="p-4 text-sm text-gray-600">+${pedido.telefono_cliente}</td>
                                <td class="p-4">${productosHtml}</td>
                                <td class="p-4 text-center"><span class="px-3 py-1 rounded-full text-xs font-bold uppercase ${badgeColor}">${pedido.estado_atencion}</span></td>
                                <td class="p-4 text-center">${botonAccion}</td>
                            </tr>
            `;
        });

        html += `
                        </tbody>
                    </table>
                </div>
            </div>
            <script>
                async function actualizarEstado(idPedido, nuevoEstado) {
                    if(!confirm('¿Confirmas que este pedido ya fue empacado y despachado?')) return;
                    try {
                        const response = await fetch('/admin/estado', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: idPedido, estado: nuevoEstado }) });
                        if(response.ok) { window.location.reload(); } else { alert('Error al actualizar.'); }
                    } catch (error) { console.error('Error:', error); }
                }
            </script>
        </body>
        </html>
        `;
        res.send(html);
    } catch (error) { res.status(500).send('Error cargando el panel.'); }
});

app.get('/admin/clientes', async (req, res) => {
    try {
        const clientes = await Usuario.find().sort({ fecha_registro: -1 });
        let html = `
        <!DOCTYPE html>
        <html lang="es">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Forestadent | CRM</title><script src="https://cdn.tailwindcss.com"></script></head>
        <body class="bg-gray-100 p-8 font-sans">
            <div class="max-w-6xl mx-auto">
                <div class="flex justify-between items-center mb-4"><h1 class="text-3xl font-bold text-gray-800">Torre de Control B2B</h1><span class="bg-green-600 text-white px-4 py-2 rounded-lg shadow font-bold">🟢 En línea</span></div>
                ${menuNavegacion}
                <div class="bg-white rounded-xl shadow-md overflow-hidden">
                    <table class="w-full text-left border-collapse">
                        <thead><tr class="bg-indigo-900 text-white"><th class="p-4">Cliente</th><th class="p-4">Teléfono</th><th class="p-4">Lugar de Entrega</th><th class="p-4 text-center">Acción</th></tr></thead>
                        <tbody class="divide-y divide-gray-200">
        `;

        clientes.forEach(cliente => {
            html += `
                            <tr class="hover:bg-gray-50 transition">
                                <td class="p-4 font-semibold text-gray-800">${cliente.nombre_whatsapp}</td>
                                <td class="p-4 text-sm text-gray-600">+${cliente.telefono}</td>
                                <td class="p-4">
                                    <select id="lugar_${cliente._id}" class="border border-gray-300 rounded p-2 text-sm">
                                        <option value="consultorio" ${cliente.tipo_establecimiento === 'consultorio' ? 'selected' : ''}>Consultorio</option>
                                        <option value="clínica" ${cliente.tipo_establecimiento === 'clínica' ? 'selected' : ''}>Clínica</option>
                                        <option value="centro médico" ${cliente.tipo_establecimiento === 'centro médico' ? 'selected' : ''}>Centro Médico</option>
                                        <option value="universidad" ${cliente.tipo_establecimiento === 'universidad' ? 'selected' : ''}>Universidad</option>
                                    </select>
                                </td>
                                <td class="p-4 text-center"><button onclick="guardarPerfil('${cliente._id}')" class="bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold px-4 py-2 rounded">💾 Guardar</button></td>
                            </tr>
            `;
        });

        html += `
                        </tbody></table></div></div>
            <script>
                async function guardarPerfil(idCliente) {
                    const nuevoLugar = document.getElementById('lugar_' + idCliente).value;
                    try {
                        const response = await fetch('/admin/clientes/actualizar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: idCliente, tipo_establecimiento: nuevoLugar }) });
                        if(response.ok) { alert('Perfil actualizado.'); } else { alert('Error.'); }
                    } catch (error) { console.error('Error:', error); }
                }
            </script>
        </body></html>
        `;
        res.send(html);
    } catch (error) { res.status(500).send('Error cargando CRM.'); }
});

// NUEVA PANTALLA 3: CATÁLOGO DE PRODUCTOS
app.get('/admin/catalogo', async (req, res) => {
    try {
        const productos = await Producto.find().sort({ categoria: 1, nombre: 1 });
        
        let html = `
        <!DOCTYPE html>
        <html lang="es">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Forestadent | Catálogo</title><script src="https://cdn.tailwindcss.com"></script></head>
        <body class="bg-gray-100 p-8 font-sans">
            <div class="max-w-6xl mx-auto">
                <div class="flex justify-between items-center mb-4">
                    <h1 class="text-3xl font-bold text-gray-800">Torre de Control B2B</h1>
                    <span class="bg-green-600 text-white px-4 py-2 rounded-lg shadow font-bold">🟢 En línea</span>
                </div>
                ${menuNavegacion}
                <div class="bg-white rounded-xl shadow-md overflow-hidden">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="bg-emerald-800 text-white">
                                <th class="p-4">SKU / Referencia</th>
                                <th class="p-4">Nombre del Producto</th>
                                <th class="p-4">Categoría</th>
                                <th class="p-4">Empaque</th>
                                <th class="p-4 text-right">Precio Unitario (Inc. IVA)</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-200">
        `;

        productos.forEach(prod => {
            html += `
                            <tr class="hover:bg-gray-50 transition">
                                <td class="p-4 text-sm font-bold text-gray-700">${prod.codigo}</td>
                                <td class="p-4 font-semibold text-gray-800">${prod.nombre}</td>
                                <td class="p-4 text-sm text-gray-500">${prod.categoria}</td>
                                <td class="p-4 text-sm text-gray-500">${prod.empaque}</td>
                                <td class="p-4 text-right font-bold text-emerald-600">$${prod.precio.toFixed(2)}</td>
                            </tr>
            `;
        });

        html += `
                        </tbody>
                    </table>
                </div>
            </div>
        </body>
        </html>
        `;
        res.send(html);
    } catch (error) { res.status(500).send('Error cargando Catálogo.'); }
});

app.post('/admin/clientes/actualizar', async (req, res) => {
    try {
        const { id, tipo_establecimiento } = req.body;
        await Usuario.findByIdAndUpdate(id, { tipo_establecimiento: tipo_establecimiento });
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
            
            await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, {
                method: 'POST', headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ messaging_product: 'whatsapp', to: pedidoActualizado.telefono_cliente, type: 'text', text: { body: mensaje_notificacion } })
            });
        }
        res.status(200).json({ success: true });
    } catch (error) { res.status(500).json({ success: false }); }
});

// --- 5. RUTAS DE WHATSAPP (BOT) ---
app.get('/activar-meta', async (req, res) => {
    try {
        const response = await fetch(`https://graph.facebook.com/v25.0/2048355149178743/subscribed_apps`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }});
        res.status(200).json({ resultado: await response.json() });
    } catch (error) { res.status(500).json({ error: error.message }); }
});
app.get('/webhook', (req, res) => {
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === process.env.VERIFY_TOKEN) { res.status(200).send(req.query['hub.challenge']); } else { res.sendStatus(403); }
});

app.post('/webhook', async (req, res) => {
    const body = req.body;
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
                    } else if (usuario.estado_conversacion === 'esperando_pedido') {
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
                    } else if (usuario.estado_conversacion === 'esperando_cotizacion' || usuario.estado_conversacion === 'esperando_contacto') {
                        let tipo = usuario.estado_conversacion === 'esperando_cotizacion' ? 'cotizacion' : 'contacto';
                        const nuevaSolicitud = new Solicitud({ telefono_cliente: from, nombre_cliente: nombre_cliente, tipo_solicitud: tipo, contenido_texto: msg_body });
                        await nuevaSolicitud.save();
                        usuario.estado_conversacion = 'menu_principal'; await usuario.save();
                        mensaje_respuesta = `✅ Hemos registrado tu ${tipo} exitosamente. Nos pondremos a trabajar en ello de inmediato.\n\n_(Escribe *Menu* para volver)_`;
                    } else if (usuario.estado_conversacion === 'menu_principal' || usuario.estado_conversacion === 'inicio') {
                        if (usuario.estado_conversacion === 'inicio') { usuario.estado_conversacion = 'menu_principal'; await usuario.save(); }
                        switch(msg_body) {
                            case '1': mensaje_respuesta = `📘 *Catálogo*\nEnlace: https://www.forestadent.com \n\n_(Escribe *Menu* para volver)_`; break;
                            case '2': usuario.estado_conversacion = 'esperando_cotizacion'; await usuario.save(); mensaje_respuesta = `📊 *Cotizar*\nEscribe los productos a cotizar:`; break;
                            case '3': usuario.estado_conversacion = 'esperando_pedido'; await usuario.save(); mensaje_respuesta = `📦 *Nuevo Pedido*\nEscribe en un solo mensaje los productos y cantidades. Mi inteligencia artificial lo organizará automáticamente:`; break;
                            case '4': usuario.estado_conversacion = 'esperando_contacto'; await usuario.save(); mensaje_respuesta = `👤 *Contacto*\nDescríbeme el motivo de tu consulta:`; break;
                            case '5': mensaje_respuesta = `💳 *Estado de Cuenta*\nRevisaré tu saldo internamente y te lo enviaré en breve.\n\n_(Escribe *Menu* para volver)_`; break;
                            default: mensaje_respuesta = `No reconocí esa opción. 😅\n\n` + texto_menu; break;
                        }
                    } else {
                        mensaje_respuesta = `Recibí tu mensaje.\n\n_(Escribe *Menu* para ver las opciones)_`;
                    }
                }
                
                await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, {
                    method: 'POST', headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ messaging_product: 'whatsapp', to: from, type: 'text', text: { body: mensaje_respuesta } })
                });
            } catch (error) { console.error('🔴 Error:', error); }
        }
        res.sendStatus(200); 
    } else { res.sendStatus(200); }
});

app.listen(PORT, () => { console.log(`🚀 Motor encendido y escuchando en el puerto ${PORT}`); });