require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

// --- 1. CONEXIÓN A MONGODB ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('🟢 Conectado a MongoDB Atlas'))
    .catch((error) => console.error('🔴 Error MongoDB:', error));

// --- 2. ESTRUCTURAS DE LA BASE DE DATOS ---
const usuarioSchema = new mongoose.Schema({
    telefono: String,
    nombre_whatsapp: String,
    estado_conversacion: { type: String, default: 'inicio' },
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

// --- 4. PORTAL WEB DE ADMINISTRACIÓN ---
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
                <div class="flex justify-between items-center mb-8">
                    <h1 class="text-3xl font-bold text-gray-800">📦 Panel de Pedidos B2B</h1>
                    <span class="bg-blue-600 text-white px-4 py-2 rounded-lg shadow">🟢 Sistema Online</span>
                </div>
                
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
                productos.forEach(item => {
                    productosHtml += `<li><strong>${item.cantidad}</strong> x ${item.producto}</li>`;
                });
                productosHtml += '</ul>';
            } catch (e) {
                productosHtml = `<span class="text-gray-600 italic">${pedido.contenido_texto}</span>`;
            }

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
                                <td class="p-4 text-center">
                                    <span class="px-3 py-1 rounded-full text-xs font-bold uppercase ${badgeColor}">
                                        ${pedido.estado_atencion}
                                    </span>
                                </td>
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
                        const response = await fetch('/admin/estado', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ id: idPedido, estado: nuevoEstado })
                        });
                        
                        if(response.ok) {
                            window.location.reload(); 
                        } else {
                            alert('Error al actualizar el estado.');
                        }
                    } catch (error) {
                        console.error('Error:', error);
                    }
                }
            </script>
        </body>
        </html>
        `;
        
        res.send(html);
    } catch (error) {
        res.status(500).send('Error cargando el panel de administración.');
    }
});

app.post('/admin/estado', async (req, res) => {
    try {
        const { id, estado } = req.body;
        const pedidoActualizado = await Solicitud.findByIdAndUpdate(id, { estado_atencion: estado }, { new: true });
        console.log(`📦 Pedido ${id} actualizado a: ${estado}`);

        if (estado === 'despachado' && pedidoActualizado) {
            const mensaje_notificacion = `🚚 *¡Buenas noticias, ${pedidoActualizado.nombre_cliente}!*\n\nTu pedido ha sido empacado y acaba de ser *DESPACHADO* a tu clínica.\n\nGracias por confiar en Forestadent Ecuador. 🦷`;
            
            const respuestaMetaAdmin = await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    messaging_product: 'whatsapp', 
                    to: pedidoActualizado.telefono_cliente, 
                    type: 'text', 
                    text: { body: mensaje_notificacion } 
                })
            });
            
            // --- ESPÍA DE DESPACHO ---
            const datosRespuestaAdmin = await respuestaMetaAdmin.json();
            console.log("📤 Respuesta de Meta (Despacho):", datosRespuestaAdmin);
        }

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error actualizando estado:', error);
        res.status(500).json({ success: false });
    }
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
    
    // --- ESPÍA DE ENTRADA ---
    console.log("📬 ALERTA: Llegó un mensaje de Meta:", JSON.stringify(body, null, 2));

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
                
                // --- ESPÍA DE SALIDA DE MENSAJES ---
                const respuestaMeta = await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, {
                    method: 'POST', headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ messaging_product: 'whatsapp', to: from, type: 'text', text: { body: mensaje_respuesta } })
                });
                
                const datosRespuesta = await respuestaMeta.json();
                console.log("📤 Respuesta de Meta al intentar enviar mensaje:", datosRespuesta);
                // ------------------------------------
                
            } catch (error) { console.error('🔴 Error:', error); }
        }
        res.sendStatus(200); 
    } else { res.sendStatus(200); }
});

app.listen(PORT, () => { console.log(`🚀 Motor encendido y escuchando en el puerto ${PORT}`); });