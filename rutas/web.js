const express = require('express');
const router = express.Router();

// Importamos los modelos existentes de tu Base de Datos
const { Usuario, Solicitud, Producto } = require('../modelos/BaseDatos');

// ==========================================
// HELPER: CONEXIÓN BLINDADA CON GEMINI PARA CHAT WEB
// ==========================================
async function responderChatWebConIA({ mensaje, historial, datosDoctor, catalogo }) {
    // Priorizamos los modelos verificados en tu cuenta y dejamos respaldos automáticos
    const modelos = [
        'gemini-3.5-flash',
        'gemini-3.8-flash',
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-1.5-flash'
    ];

    const listaCatalogo = catalogo.length > 0
        ? catalogo.map(p => {
            const precio = typeof p.precio === 'number' ? `$${p.precio.toFixed(2)}` : 'Consultar';
            const stockTxt = (typeof p.stock_actual === 'number' && p.stock_actual > 0) ? 'Disponible' : 'Bajo pedido';
            return `- [${p.codigo || 'S/C'}] ${p.nombre || 'Producto'} | Categoría: ${p.categoria || 'General'} | Precio ref: ${precio} | Empaque: ${p.empaque || 'Unidad/Caso'} | Estado: ${stockTxt}`;
        }).join('\n')
        : 'Catálogo en actualización. Consultar disponibilidad directa con asesor.';

    const historialTexto = (Array.isArray(historial) ? historial.slice(-6) : [])
        .map(h => `${h.rol === 'usuario' ? 'Doctor' : 'Asistente'}: ${h.texto}`)
        .join('\n');

    const promptSistema = `
Eres el Asistente Clínico y Comercial Oficial de Forestadent Ecuador (11 años de representación oficial en Ecuador de Forestadent Bernhard Förster GmbH, Pforzheim - Alemania, "Made in Black Forest").

DATOS DEL ESPECIALISTA CON QUIEN HABLAS:
- Nombre: ${datosDoctor.nombre || 'Doctor/a'}
- Teléfono: ${datosDoctor.telefono || 'No registrado'}
- Clínica / Universidad / Ciudad: ${datosDoctor.establecimiento || 'No especificado'}

CATÁLOGO ACTUAL EN BASE DE DATOS (FORESTADENT ECUADOR):
${listaCatalogo}

REGLAS ESTRICTAS DE COMPORTAMIENTO:
1. Tono profesional, cálido, preciso y ejecutivo (hablas con ortodoncistas, clínicas dentales o estudiantes/directores de posgrado en Ecuador).
2. NUNCA menciones a TPQ ni a empresas ajenas a Forestadent Ecuador.
3. Si preguntan precios o quieren cotizar, usa únicamente los datos del catálogo de arriba. Si un producto no aparece en la lista, indícales que manejamos el catálogo alemán completo de Forestadent (brackets clásicos, autoligado, anclaje esquelético OrthoEasy, expansión Hyrax, láminas Track y ortodoncia digital 3D) y que un asesor verificará stock o importación.
4. Si preguntan por el "Panel IA" o "Asistente IA para su consultorio/clínica/universidad", explícales con entusiasmo que es un beneficio exclusivo para clientes activos de Forestadent Ecuador: les damos su propia página con asistente IA para atender pacientes 24/7 (y opción de WhatsApp API), y que ya dejamos registrada su solicitud para que dirección comercial la apruebe y les envíe sus credenciales temporales de acceso.
5. Respuestas claras, concisas (máximo 2 o 3 párrafos cortos o viñetas) y orientadas a ayudar.
6. Cuando el doctor quiera confirmar un pedido, pedir factura, coordinar despacho o cerrar una cotización, invítalo a pulsar el botón de "Continuar en WhatsApp" que aparece debajo del chat para pasar directo con su cotización lista.

HISTORIAL RECIENTE:
${historialTexto || '(Inicio de conversación)'}

MENSAJE ACTUAL DEL DOCTOR:
"${mensaje}"

Responde directamente al doctor en español:
`.trim();

    for (const modelo of modelos) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${process.env.GEMINI_API_KEY}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: promptSistema }] }]
                })
            });

            const data = await response.json();
            if (data.error || !data.candidates?.[0]?.content?.parts?.[0]?.text) {
                continue;
            }
            return data.candidates[0].content.parts[0].text.trim();
        } catch (error) {
            continue;
        }
    }

    return 'En este momento nuestro asistente técnico está experimentando alta demanda. Tus datos ya quedaron registrados y puedes continuar directamente con un asesor por WhatsApp usando el botón de abajo.';
}

// ==========================================
// 1. RUTA PRINCIPAL: LANDING PAGE CORPORATIVA + CATÁLOGO EN VIVO
// ==========================================
router.get('/', async (req, res) => {
    try {
        const productos = await Producto.find().sort({ categoria: 1, nombre: 1 }).lean();

        // Extraemos categorías únicas para los filtros rápidos
        const categoriasSet = new Set();
        productos.forEach(p => {
            if (p.categoria && p.categoria.trim() !== '') {
                categoriasSet.add(p.categoria.trim());
            }
        });
        const categorias = Array.from(categoriasSet);

        // Número corporativo de Forestadent Ecuador controlado desde Render (sin quemar números en código)
        const whatsappNumero = (process.env.WHATSAPP_FORESTADENT || '').replace(/\D/g, '');

        res.render('index', {
            productos,
            categorias,
            whatsappNumero
        });
    } catch (error) {
        console.error('❌ Error cargando la Landing Page:', error);
        res.render('index', {
            productos: [],
            categorias: [],
            whatsappNumero: (process.env.WHATSAPP_FORESTADENT || '').replace(/\D/g, '')
        });
    }
});

// ==========================================
// 2. API CHAT WEB: REGISTRO DE LEAD EN MONGODB (CRM)
// ==========================================
router.post('/api/chat-web/registro', async (req, res) => {
    try {
        const nombre = (req.body.nombre || '').trim();
        const telefonoRaw = (req.body.telefono || '').trim();
        const establecimiento = (req.body.establecimiento || '').trim();
        const motivoInicial = (req.body.motivo || '').trim();

        const telefonoLimpio = telefonoRaw.replace(/\D/g, '');

        if (!nombre || telefonoLimpio.length < 7) {
            return res.status(400).json({
                ok: false,
                error: 'Por favor ingresa tu nombre y un número de WhatsApp válido.'
            });
        }

        // Normalizamos a formato Ecuador si ingresan 09xxxxxxxx
        let telefonoFinal = telefonoLimpio;
        if (telefonoFinal.startsWith('09') && telefonoFinal.length === 10) {
            telefonoFinal = '593' + telefonoFinal.substring(1);
        }

        // 1. Guardamos o actualizamos el contacto en tu colección Usuario (CRM existente)
        let usuario = await Usuario.findOne({ telefono: telefonoFinal });
        if (!usuario) {
            usuario = new Usuario({
                telefono: telefonoFinal,
                nombre_whatsapp: nombre
            });
            await usuario.save();
        } else if (!usuario.nombre_whatsapp || usuario.nombre_whatsapp === 'Sin nombre') {
            usuario.nombre_whatsapp = nombre;
            await usuario.save();
        }

        // 2. Registramos la entrada en Solicitud (usando tipo 'contacto' compatible con tu esquema actual)
        const resumenLead = [
            '🌐 [PROSPECTO WEB - CHAT IA]',
            `Especialista: ${nombre}`,
            `WhatsApp: ${telefonoFinal}`,
            establecimiento ? `Clínica / Universidad / Ciudad: ${establecimiento}` : null,
            motivoInicial ? `Interés inicial: ${motivoInicial}` : null
        ].filter(Boolean).join('\n');

        await new Solicitud({
            telefono_cliente: telefonoFinal,
            nombre_cliente: nombre,
            tipo_solicitud: 'contacto',
            contenido_texto: resumenLead
        }).save();

        // Guardamos datos en sesión para el hilo del chat y control de cuota
        req.session.leadWeb = {
            nombre,
            telefono: telefonoFinal,
            establecimiento: establecimiento || 'No especificado'
        };
        if (!req.session.chatWebCount) req.session.chatWebCount = 0;

        return res.json({
            ok: true,
            lead: req.session.leadWeb
        });
    } catch (error) {
        console.error('❌ Error registrando lead web:', error);
        return res.status(500).json({
            ok: false,
            error: 'No pudimos guardar tus datos en este momento. Intenta nuevamente.'
        });
    }
});

// ==========================================
// 3. API CHAT WEB: CONVERSACIÓN CON GEMINI + DETECCIÓN DE COTIZACIÓN / PANEL IA
// ==========================================
router.post('/api/chat-web/mensaje', async (req, res) => {
    try {
        const mensaje = (req.body.mensaje || '').trim();
        const historial = Array.isArray(req.body.historial) ? req.body.historial : [];
        const leadCliente = req.body.lead || req.session.leadWeb || {};

        if (!mensaje) {
            return res.status(400).json({ ok: false, error: 'Escribe una consulta para continuar.' });
        }

        // Protección básica de cuota de Gemini por sesión (máx. 25 mensajes por visita)
        req.session.chatWebCount = (req.session.chatWebCount || 0) + 1;
        if (req.session.chatWebCount > 25) {
            return res.json({
                ok: true,
                respuesta: 'Has alcanzado el límite de consultas automáticas en esta sesión web. Por favor continúa directamente por WhatsApp con nuestro equipo comercial para atenderte sin esperas.',
                sugerirWhatsapp: true
            });
        }

        // Consultamos el catálogo real en MongoDB
        const catalogo = await Producto.find().lean();

        const respuestaIA = await responderChatWebConIA({
            mensaje,
            historial,
            datosDoctor: leadCliente,
            catalogo
        });

        const msgLower = mensaje.toLowerCase();
        const esCotizacion = ['cotiz', 'precio', 'valor', 'cuanto', 'cuánto', 'caso', 'casos', 'comprar', 'pedido', 'promo', 'posgrado'].some(k => msgLower.includes(k));
        const esSolicitudPanel = ['panel', 'mi propio bot', 'mi consultorio', 'asistente para mi', 'clinica ia', 'clínica ia', 'multitenant'].some(k => msgLower.includes(k));

        // Si el doctor pide cotización o solicita su propio Panel IA, guardamos registro automático en la Torre de Control
        if (leadCliente.telefono && (esCotizacion || esSolicitudPanel)) {
            const etiqueta = esSolicitudPanel
                ? '🚀 [SOLICITUD PANEL IA PARA CLÍNICA/UNIVERSIDAD]'
                : '🌐 [COTIZACIÓN / INTERÉS WEB]';

            const tipoGuardar = esCotizacion && !esSolicitudPanel ? 'cotizacion' : 'contacto';

            await new Solicitud({
                telefono_cliente: leadCliente.telefono,
                nombre_cliente: leadCliente.nombre || 'Prospecto Web',
                tipo_solicitud: tipoGuardar,
                contenido_texto: `${etiqueta}\nClínica/Ciudad: ${leadCliente.establecimiento || 'N/A'}\nConsulta del doctor: ${mensaje}\n\nRespuesta IA:\n${respuestaIA}`
            }).save();
        }

        return res.json({
            ok: true,
            respuesta: respuestaIA,
            sugerirWhatsapp: esCotizacion || esSolicitudPanel || msgLower.includes('whatsapp') || msgLower.includes('asesor') || msgLower.includes('despacho')
        });
    } catch (error) {
        console.error('❌ Error en chat web IA:', error);
        return res.status(500).json({
            ok: false,
            error: 'Ocurrió un inconveniente procesando tu consulta. Intenta nuevamente.'
        });
    }
});

module.exports = router;