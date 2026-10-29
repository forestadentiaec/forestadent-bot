const express = require('express');
const router = express.Router();

// Importamos la Base de Datos
const { Usuario, Solicitud, Producto, Campana } = require('../modelos/BaseDatos');

// --- CEREBRO DE INTELIGENCIA ARTIFICIAL ---
async function analizarPedidoConIA(texto) {
    const modelos = ['gemini-3.8-flash', 'gemini-3.5-flash'];
    const prompt = `Eres un asistente comercial. Pedido: "${texto}". Devuelve ÚNICAMENTE un arreglo JSON con "producto" y "cantidad" (solo números).`;
    for (const modelo of modelos) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${process.env.GEMINI_API_KEY}`;
            const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
            const data = await response.json(); if (data.error) continue; return JSON.parse(data.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim());
        } catch (error) { continue; }
    } return null;
}

async function generarCotizacionConIA(texto, catalogo) {
    const modelos = ['gemini-3.8-flash', 'gemini-3.5-flash'];
    let catTxt = catalogo.map(p => `- ${p.nombre} | Precio Unidad: $${(p.precio || 0).toFixed(2)} | Empaque: ${p.empaque}`).join('\n');
    const prompt = `Cotizar: "${texto}"\nCatálogo:\n${catTxt}\nREGLA: Precio Unidad es 1 pieza suelta. Multiplica según cantidad/empaque. Formato: Saludo, Lista (Cant x Nombre = Subtotal), Total. PROHIBIDO TERMINAR CON PREGUNTAS.`;
    for (const modelo of modelos) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${process.env.GEMINI_API_KEY}`;
            const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
            const data = await response.json(); if (data.error) continue; return data.candidates[0].content.parts[0].text.trim();
        } catch (error) { continue; }
    } return "Error de cotización.";
}

// --- HERRAMIENTAS DEL BOT ---
async function enviarMensajeInmediato(tel, txt) { 
    await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: tel, type: 'text', text: { body: txt } }) }); 
}

// --- RUTAS DEL WEBHOOK DE WHATSAPP ---
router.get('/activar-meta', async (req, res) => { try { const response = await fetch(`https://graph.facebook.com/v25.0/2048355149178743/subscribed_apps`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }}); res.status(200).json({ resultado: await response.json() }); } catch (error) { res.status(500).json({ error: error.message }); } });

router.get('/webhook', (req, res) => { if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === process.env.VERIFY_TOKEN) res.status(200).send(req.query['hub.challenge']); else res.sendStatus(403); });

router.post('/webhook', async (req, res) => {
    res.sendStatus(200); 
    if (req.body.entry?.[0]?.changes?.[0]?.value?.messages) {
        let val = req.body.entry[0].changes[0].value;
        let from = val.messages[0].from; 
        if (from === '16315551181') return; // Ignorar el número del propio bot

        let mType = val.messages[0].type;
        let mBody = mType === 'text' ? val.messages[0].text.body.trim() : ''; 
        let nombre = val.contacts[0].profile.name; 

        try {
            let u = await Usuario.findOne({ telefono: from });
            let resp = ''; const txtM = `1️⃣ Catálogo\n2️⃣ Cotizar Productos\n3️⃣ Nuevo Pedido\n4️⃣ Contacto`;

            if (!u) { u = new Usuario({ telefono: from, nombre_whatsapp: nombre }); await u.save(); }

            // LÓGICA DE COMPROBANTES DE PAGO
            if (mType === 'image' && u.estado_conversacion === 'esperando_pago') {
                await new Solicitud({ telefono_cliente: from, nombre_cliente: nombre, tipo_solicitud: 'validacion_pago', id_campana_relacionada: u.ultima_campana, contenido_texto: '💰 [COMPROBANTE RECIBIDO]\nEl doctor envió una FOTO por WhatsApp. Revisa el celular de la empresa y aprueba el pago en la Torre.' }).save();
                u.estado_conversacion = 'menu_principal'; await u.save();
                return await enviarMensajeInmediato(from, "📸 *¡Comprobante recibido!*\nValidaremos la transferencia y te enviaremos confirmación en breve.");
            } else if (mType === 'image') {
                return await enviarMensajeInmediato(from, "Recibí tu imagen. Si deseas un pedido, escribe *Menu*.");
            }

            // LÓGICA DEL EMBUDO DE CAMPAÑAS
            let msgL = mBody.toLowerCase();
            if (msgL === 'info') {
                if (u.ultima_campana) {
                    const c = await Campana.findById(u.ultima_campana);
                    if (c) {
                        await Campana.findByIdAndUpdate(c._id, { $inc: { metricas_info: 1 } });
                        resp = `¡Excelente decisión, ${nombre}! 🎉\n\nInfo detallada:\n🔗 ${c.enlace_pdf || 'Sin enlace'}\n\n🎟️ *¿Deseas asegurar tu cupo?* Responde: *RESERVAR*.`;
                        u.estado_conversacion = 'esperando_reserva'; await u.save();
                    } else resp = `La campaña expiró. Escribe *Menu*.`;
                } else resp = `No hay campañas activas. Escribe *Menu*.`;
            }
            else if (msgL === 'reservar' && u.estado_conversacion === 'esperando_reserva') {
                const c = await Campana.findById(u.ultima_campana);
                if (c) {
                    await Campana.findByIdAndUpdate(c._id, { $inc: { metricas_reservas: 1 } });
                    resp = `✅ *¡Pre-reserva confirmada!*\n\nRealiza tu transferencia a:\n${c.datos_bancarios || 'Cta. Forestadent'}\n\n📸 *Cuando transfieras, envíame la foto del comprobante aquí mismo.*`;
                    u.estado_conversacion = 'esperando_pago'; await u.save();
                }
            }
            // LÓGICA DEL CORE (PEDIDOS Y COTIZACIONES)
            else if (msgL === 'menu' || msgL === 'menú') { u.estado_conversacion = 'menu_principal'; await u.save(); resp = txtM; }
            else if (u.estado_conversacion === 'esperando_pedido') {
                await enviarMensajeInmediato(from, "⏳ Organizando...");
                const data = await analizarPedidoConIA(mBody);
                if (data) { await new Solicitud({ telefono_cliente: from, nombre_cliente: nombre, tipo_solicitud: 'pedido', contenido_texto: JSON.stringify(data) }).save(); resp = `✅ ¡Pedido procesado! Pronto despacharemos.`; } 
                else { resp = `Error analizando.`; }
                u.estado_conversacion = 'menu_principal'; await u.save();
            }
            else if (u.estado_conversacion === 'esperando_cotizacion') {
                await enviarMensajeInmediato(from, "⏳ Calculando...");
                const cot = await generarCotizacionConIA(mBody, await Producto.find().lean());
                const nSol = await new Solicitud({ telefono_cliente: from, nombre_cliente: nombre, tipo_solicitud: 'cotizacion', contenido_texto: cot, estado_atencion: 'cotizado' }).save();
                resp = `✅ Listo.\n📄 *Descarga tu Proforma:* https://${req.get('host')}/proforma/${nSol._id}\n\n¿Convertir en pedido? Responde *SI*.`;
                u.estado_conversacion = 'decidiendo_cotizacion'; await u.save();
            }
            else if (u.estado_conversacion === 'decidiendo_cotizacion') {
                if (['si', 'sí', 'ok'].some(p => msgL.includes(p))) {
                    await enviarMensajeInmediato(from, "⏳ Generando pedido...");
                    const uCot = await Solicitud.findOne({ telefono_cliente: from, tipo_solicitud: 'cotizacion' }).sort({ fecha: -1 });
                    if (uCot) {
                        const data = await analizarPedidoConIA(uCot.contenido_texto);
                        if(data){ await new Solicitud({ telefono_cliente: from, nombre_cliente: nombre, tipo_solicitud: 'pedido', contenido_texto: JSON.stringify(data) }).save(); resp = `✅ ¡Pedido generado desde proforma!`; } else resp = `Error procesando.`;
                    } else resp = `Proforma no encontrada.`;
                } else { resp = `Guardado.\n\n` + txtM; }
                u.estado_conversacion = 'menu_principal'; await u.save();
            }
            else if (u.estado_conversacion === 'esperando_contacto') {
                await new Solicitud({ telefono_cliente: from, nombre_cliente: nombre, tipo_solicitud: 'contacto', contenido_texto: mBody }).save();
                u.estado_conversacion = 'menu_principal'; await u.save(); resp = `✅ Contacto registrado.`;
            }
            else if (u.estado_conversacion === 'menu_principal' || u.estado_conversacion === 'inicio') {
                if (u.estado_conversacion === 'inicio') { u.estado_conversacion = 'menu_principal'; await u.save(); }
                switch(mBody) {
                    case '1': resp = `📘 *Catálogo*\nwww.forestadent.com`; break;
                    case '2': u.estado_conversacion = 'esperando_cotizacion'; await u.save(); resp = `Escribe a cotizar:`; break;
                    case '3': u.estado_conversacion = 'esperando_pedido'; await u.save(); resp = `Escribe tu pedido:`; break;
                    case '4': u.estado_conversacion = 'esperando_contacto'; await u.save(); resp = `Motivo:`; break;
                    default: resp = `No reconocí.\n\n` + txtM; break;
                }
            } else { resp = `Recibí tu mensaje.\n_(Escribe *Menu*)_`; }
            
            if (resp !== '') await enviarMensajeInmediato(from, resp);
        } catch (e) { console.error(e); }
    }
});

module.exports = router;