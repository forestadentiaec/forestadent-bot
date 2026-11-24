const express = require('express');
const router = express.Router();
const {
    Clinica,
    PacienteClinica,
    hashPassword,
    verificarPassword
} = require('../modelos/BaseDatos');

function esc(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizarTelefonoEC(tel) {
    let limpio = String(tel || '').replace(/\D/g, '');
    if (limpio.startsWith('09') && limpio.length === 10) {
        limpio = '593' + limpio.substring(1);
    }
    return limpio;
}

function obtenerUrlBase(req) {
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    return `${proto}://${req.get('host')}`;
}

// ==========================================
// CEREBRO GEMINI MULTI-TENANT (AISLADO POR CLÍNICA)
// ==========================================
async function responderChatClinicaConIA({ clinica, paciente, mensaje, historial }) {
    const modelos = [
        'gemini-3.5-flash',
        'gemini-3.8-flash',
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-1.5-flash'
    ];

    const historialTexto = (Array.isArray(historial) ? historial.slice(-6) : [])
        .map(h => `${h.rol === 'usuario' ? 'Paciente' : 'Asistente'}: ${h.texto}`)
        .join('\n');

    const prompt = `
Eres el Asistente Virtual oficial de "${clinica.nombre}" (${clinica.tipo || 'consultorio'} de ortodoncia y odontología en ${clinica.ciudad || 'Ecuador'}).
Especialista / Responsable: ${clinica.responsable || clinica.nombre}
Dirección: ${clinica.direccion || 'Consultar por WhatsApp'}
Horarios de atención: ${clinica.horarios || 'Consultar horarios disponibles'}
Tratamientos y servicios ofrecidos: ${clinica.servicios || 'Ortodoncia y valoración dental'}
${clinica.instrucciones_ia ? `Instrucciones adicionales del doctor:\n${clinica.instrucciones_ia}` : ''}

DATOS DEL PACIENTE:
- Nombre: ${paciente.nombre || 'Paciente'}
- Teléfono: ${paciente.telefono || 'Registrado'}

REGLAS:
1. Responde con calidez, empatía y claridad en español (máximo 2 o 3 párrafos cortos).
2. NO des diagnósticos médicos definitivos ni recetes medicamentos. Orienta sobre los tratamientos ofrecidos e invita a una valoración profesional.
3. Si pregunta por precios exactos no especificados arriba, explica que el costo depende de la valoración clínica y ofrece coordinar su cita por WhatsApp.
4. Cuando quiera agendar una cita o confirmar horario, invítalo a pulsar el botón verde "Agendar por WhatsApp" que aparece en el chat para pasar directo con recepción.
5. Nunca inventes horarios, promociones o direcciones que no estén indicadas arriba.

HISTORIAL RECIENTE:
${historialTexto || '(Inicio de conversación)'}

MENSAJE DEL PACIENTE:
"${mensaje}"

Responde directamente al paciente:
`.trim();

    for (const modelo of modelos) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${process.env.GEMINI_API_KEY}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            const data = await response.json();
            if (data.error || !data.candidates?.[0]?.content?.parts?.[0]?.text) continue;
            return data.candidates[0].content.parts[0].text.trim();
        } catch (e) {
            continue;
        }
    }

    return `Gracias por escribir a ${clinica.nombre}. Tus datos ya están registrados; puedes pulsar el botón de WhatsApp aquí abajo para coordinar tu cita directamente con nuestro equipo.`;
}

// ==========================================
// 1. PÁGINA PÚBLICA DE CADA CLÍNICA (/c/:slug)
// ==========================================
router.get('/c/:slug', async (req, res) => {
    try {
        const clinica = await Clinica.findOne({ slug: req.params.slug.toLowerCase() }).lean();
        if (!clinica || !clinica.activo) {
            return res.status(404).send(`
                <!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Página no disponible</title><script src="https://cdn.tailwindcss.com"></script></head>
                <body class="bg-gray-100 min-h-screen flex items-center justify-center p-6">
                    <div class="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center border border-gray-200">
                        <h1 class="text-xl font-bold text-gray-900 mb-2">Asistente temporalmente no disponible</h1>
                        <p class="text-sm text-gray-500">El enlace que buscas no existe o se encuentra pausado en este momento.</p>
                    </div>
                </body></html>
            `);
        }

        const listaServicios = (clinica.servicios || '')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);

        res.render('clinica_publica', { clinica, listaServicios });
    } catch (error) {
        console.error('❌ Error cargando página de clínica:', error);
        res.status(500).send('Error cargando página.');
    }
});

// ==========================================
// 2. API PÚBLICA: REGISTRO DE PACIENTE EN LA CLÍNICA
// ==========================================
router.post('/api/c/:slug/registro', async (req, res) => {
    try {
        const clinica = await Clinica.findOne({ slug: req.params.slug.toLowerCase(), activo: true }).lean();
        if (!clinica) {
            return res.status(404).json({ ok: false, error: 'Consultorio no disponible.' });
        }

        const nombre = (req.body.nombre || '').trim();
        const telefono = normalizarTelefonoEC(req.body.telefono);
        const motivo = (req.body.motivo || '').trim();

        if (!nombre || telefono.length < 7) {
            return res.status(400).json({ ok: false, error: 'Por favor ingresa tu nombre y número de WhatsApp válido.' });
        }

        const paciente = await new PacienteClinica({
            clinica_id: clinica._id,
            clinica_slug: clinica.slug,
            nombre,
            telefono,
            motivo: motivo || 'Consulta inicial desde web'
        }).save();

        if (!req.session.pacientesPorClinica) req.session.pacientesPorClinica = {};
        req.session.pacientesPorClinica[clinica.slug] = {
            id: paciente._id.toString(),
            nombre,
            telefono,
            count: 0
        };

        return res.json({
            ok: true,
            paciente: { id: paciente._id.toString(), nombre, telefono }
        });
    } catch (error) {
        console.error('❌ Error registrando paciente:', error);
        return res.status(500).json({ ok: false, error: 'No pudimos registrar tus datos.' });
    }
});

// ==========================================
// 3. API PÚBLICA: MENSAJE AL ASISTENTE IA DE LA CLÍNICA
// ==========================================
router.post('/api/c/:slug/mensaje', async (req, res) => {
    try {
        const clinica = await Clinica.findOne({ slug: req.params.slug.toLowerCase(), activo: true }).lean();
        if (!clinica) {
            return res.status(404).json({ ok: false, error: 'Consultorio no disponible.' });
        }

        const mensaje = (req.body.mensaje || '').trim();
        const historial = Array.isArray(req.body.historial) ? req.body.historial : [];
        const sesionPac = req.session.pacientesPorClinica?.[clinica.slug];
        const paciente = req.body.paciente || sesionPac || {};

        if (!mensaje) {
            return res.status(400).json({ ok: false, error: 'Escribe tu consulta.' });
        }

        if (sesionPac) {
            sesionPac.count = (sesionPac.count || 0) + 1;
            if (sesionPac.count > 20) {
                return res.json({
                    ok: true,
                    respuesta: 'Has alcanzado el límite de mensajes en esta sesión. Continúa directamente por WhatsApp para agendar tu cita sin esperas.',
                    sugerirWhatsapp: true
                });
            }
        }

        const respuestaIA = await responderChatClinicaConIA({
            clinica,
            paciente,
            mensaje,
            historial
        });

        // Actualizamos el resumen del paciente para que el doctor vea su interés real
        if (paciente.id) {
            await PacienteClinica.findOneAndUpdate(
                { _id: paciente.id, clinica_id: clinica._id },
                {
                    $set: {
                        motivo: mensaje.substring(0, 220),
                        resumen_ia: respuestaIA.substring(0, 400)
                    }
                }
            ).catch(() => {});
        }

        const msgLower = mensaje.toLowerCase();
        const sugerirWhatsapp = ['cita', 'agend', 'hora', 'turno', 'precio', 'costo', 'valor', 'whatsapp', 'ubicacion', 'ubicación'].some(k => msgLower.includes(k));

        return res.json({ ok: true, respuesta: respuestaIA, sugerirWhatsapp });
    } catch (error) {
        console.error('❌ Error en chat IA de clínica:', error);
        return res.status(500).json({ ok: false, error: 'Error procesando tu consulta.' });
    }
});

// ==========================================
// 4. MIDDLEWARE DE AUTENTICACIÓN DEL PANEL DEL DOCTOR (/mi-clinica)
// ==========================================
async function verificarClinica(req, res, next) {
    try {
        if (!req.session || !req.session.clinicaId) {
            return res.redirect('/mi-clinica/login');
        }
        const clinica = await Clinica.findById(req.session.clinicaId);
        if (!clinica || !clinica.activo) {
            delete req.session.clinicaId;
            return res.redirect('/mi-clinica/login?msg=Cuenta+pausada+o+no+disponible');
        }
        req.clinica = clinica;

        // Obligatorio cambiar clave temporal en primer ingreso
        if (clinica.debe_cambiar_password && req.path !== '/mi-clinica/cambiar-clave' && req.path !== '/mi-clinica/logout') {
            return res.redirect('/mi-clinica/cambiar-clave');
        }
        next();
    } catch (error) {
        console.error('❌ Error middleware clínica:', error);
        res.redirect('/mi-clinica/login');
    }
}

// ==========================================
// 5. LOGIN PRIVADO DE DOCTORES / CLÍNICAS
// ==========================================
router.get('/mi-clinica/login', (req, res) => {
    if (req.session && req.session.clinicaId) {
        return res.redirect('/mi-clinica/panel');
    }
    const mensajeError = req.query.msg ? `<div class="bg-red-50 border border-red-200 text-red-700 text-xs font-bold p-3 rounded-lg mb-4">${esc(req.query.msg)}</div>` : '';

    res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Acceso Clientes Aliados | Panel IA</title>
        <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-slate-100 min-h-screen flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 border-t-8 border-[#cda434]">
            <div class="text-center mb-6">
                <img src="/logo-vector-forestadent.webp" alt="Forestadent Ecuador" class="h-12 mx-auto mb-3 object-contain" onerror="this.style.display='none'">
                <h1 class="text-xl font-extrabold text-[#0b1f38]">Panel de Mi Consultorio IA</h1>
                <p class="text-xs text-gray-500 mt-1">Acceso exclusivo para doctores, clínicas y universidades aliadas</p>
            </div>
            ${mensajeError}
            <form action="/mi-clinica/login" method="POST" class="space-y-4">
                <div>
                    <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Usuario</label>
                    <input type="text" name="usuario" required autocomplete="username" class="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm outline-none focus:border-[#0b1f38]">
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Contraseña</label>
                    <input type="password" name="password" required autocomplete="current-password" class="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm outline-none focus:border-[#0b1f38]">
                </div>
                <button type="submit" class="w-full bg-[#0b1f38] hover:bg-slate-800 text-white font-bold py-3 rounded-xl shadow transition text-sm">
                    Ingresar a mi Panel
                </button>
            </form>
        </div>
    </body>
    </html>
    `);
});

router.post('/mi-clinica/login', async (req, res) => {
    try {
        const usuario = (req.body.usuario || '').trim().toLowerCase();
        const password = req.body.password || '';

        const clinica = await Clinica.findOne({ usuario_acceso: usuario });
        if (!clinica || !verificarPassword(password, clinica.password_hash)) {
            return res.redirect('/mi-clinica/login?msg=Usuario+o+contrase%C3%B1a+incorrectos');
        }
        if (!clinica.activo) {
            return res.redirect('/mi-clinica/login?msg=Tu+cuenta+est%C3%A1+pausada.+Contacta+a+Forestadent+Ecuador.');
        }

        req.session.clinicaId = clinica._id.toString();

        if (clinica.debe_cambiar_password) {
            return res.redirect('/mi-clinica/cambiar-clave');
        }
        return res.redirect('/mi-clinica/panel');
    } catch (error) {
        console.error('❌ Error login clínica:', error);
        res.redirect('/mi-clinica/login?msg=Error+iniciando+sesi%C3%B3n');
    }
});

router.get('/mi-clinica/logout', (req, res) => {
    delete req.session.clinicaId;
    res.redirect('/mi-clinica/login');
});

// ==========================================
// 6. CAMBIO OBLIGATORIO DE CONTRASEÑA TEMPORAL
// ==========================================
router.get('/mi-clinica/cambiar-clave', verificarClinica, (req, res) => {
    const err = req.query.err ? `<div class="bg-red-50 border border-red-200 text-red-700 text-xs font-bold p-3 rounded-lg mb-4">${esc(req.query.err)}</div>` : '';
    const esObligatorio = req.clinica.debe_cambiar_password;

    res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Actualizar Contraseña | ${esc(req.clinica.nombre)}</title>
        <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-slate-100 min-h-screen flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 border-t-8 border-[#cda434]">
            <h1 class="text-xl font-extrabold text-[#0b1f38] mb-1">
                ${esObligatorio ? '🔐 Configura tu Contraseña Definitiva' : '🔐 Cambiar Contraseña'}
            </h1>
            <p class="text-xs text-gray-500 mb-5">
                Hola <strong>${esc(req.clinica.responsable || req.clinica.nombre)}</strong>.
                ${esObligatorio ? 'Por seguridad, cambia la clave temporal antes de ingresar a tu panel.' : 'Ingresa tu nueva contraseña personal.'}
            </p>
            ${err}
            <form action="/mi-clinica/cambiar-clave" method="POST" class="space-y-4">
                <div>
                    <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Nueva contraseña (mínimo 6 caracteres)</label>
                    <input type="password" name="nueva_password" required minlength="6" class="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm outline-none focus:border-[#0b1f38]">
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Confirmar nueva contraseña</label>
                    <input type="password" name="confirmar_password" required minlength="6" class="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm outline-none focus:border-[#0b1f38]">
                </div>
                <button type="submit" class="w-full bg-[#0b1f38] hover:bg-slate-800 text-white font-bold py-3 rounded-xl shadow transition text-sm">
                    Guardar Contraseña y Continuar
                </button>
                ${!esObligatorio ? '<a href="/mi-clinica/panel" class="block text-center text-xs text-gray-500 hover:underline mt-2">Volver al panel</a>' : ''}
            </form>
        </div>
    </body>
    </html>
    `);
});

router.post('/mi-clinica/cambiar-clave', verificarClinica, async (req, res) => {
    try {
        const nueva = (req.body.nueva_password || '').trim();
        const confirmar = (req.body.confirmar_password || '').trim();

        if (nueva.length < 6) {
            return res.redirect('/mi-clinica/cambiar-clave?err=La+contrase%C3%B1a+debe+tener+al+menos+6+caracteres');
        }
        if (nueva !== confirmar) {
            return res.redirect('/mi-clinica/cambiar-clave?err=Las+contrase%C3%B1as+no+coinciden');
        }

        req.clinica.password_hash = hashPassword(nueva);
        req.clinica.debe_cambiar_password = false;
        await req.clinica.save();

        res.redirect('/mi-clinica/panel?ok=clave');
    } catch (error) {
        console.error('❌ Error cambiando clave clínica:', error);
        res.redirect('/mi-clinica/cambiar-clave?err=No+se+pudo+guardar+la+clave');
    }
});

// ==========================================
// 7. PANEL PRIVADO DEL DOCTOR (PACIENTES + CONFIGURACIÓN)
// ==========================================
router.get('/mi-clinica/panel', verificarClinica, async (req, res) => {
    try {
        const c = req.clinica;
        const pacientes = await PacienteClinica.find({ clinica_id: c._id }).sort({ fecha: -1 }).limit(100).lean();
        const urlPublica = `${obtenerUrlBase(req)}/c/${c.slug}`;

        const avisoOk = req.query.ok === 'config'
            ? '<div class="bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold p-3.5 rounded-xl mb-6">✅ Configuración guardada. Tu página web y tu Asistente IA ya están actualizados.</div>'
            : req.query.ok === 'clave'
                ? '<div class="bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold p-3.5 rounded-xl mb-6">✅ Contraseña actualizada correctamente. ¡Bienvenido a tu panel!</div>'
                : '';

        const filasPacientes = pacientes.length > 0 ? pacientes.map(p => {
            const fechaTxt = p.fecha ? new Date(p.fecha).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
            const linkWa = `https://wa.me/${esc(p.telefono)}?text=${encodeURIComponent(`Hola ${p.nombre}, te escribimos desde ${c.nombre} en seguimiento a tu consulta en nuestra página web.`)}`;
            return `
            <tr class="border-b border-gray-100 hover:bg-gray-50">
                <td class="p-3.5">
                    <div class="font-bold text-sm text-gray-900">${esc(p.nombre)}</div>
                    <div class="text-xs font-mono text-gray-500">${esc(p.telefono)} · ${esc(fechaTxt)}</div>
                </td>
                <td class="p-3.5 text-xs text-gray-700 max-w-md">${esc(p.motivo || 'Consulta general')}</td>
                <td class="p-3.5">
                    <form action="/mi-clinica/paciente/${esc(p._id)}/estado" method="POST" class="flex items-center gap-1.5">
                        <select name="estado" onchange="this.form.submit()" class="text-xs font-bold border border-gray-300 rounded-lg px-2 py-1.5 bg-white">
                            <option value="nuevo" ${p.estado === 'nuevo' ? 'selected' : ''}>🟡 Nuevo</option>
                            <option value="contactado" ${p.estado === 'contactado' ? 'selected' : ''}>🔵 Contactado</option>
                            <option value="agendado" ${p.estado === 'agendado' ? 'selected' : ''}>🟢 Agendado</option>
                            <option value="descartado" ${p.estado === 'descartado' ? 'selected' : ''}>⚪ Cerrado</option>
                        </select>
                    </form>
                </td>
                <td class="p-3.5 text-right">
                    <a href="${linkWa}" target="_blank" class="inline-block bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition">
                        WhatsApp
                    </a>
                </td>
            </tr>`;
        }).join('') : `
            <tr>
                <td colspan="4" class="p-8 text-center text-sm text-gray-500">
                    Aún no tienes pacientes registrados desde tu Asistente IA. Comparte tu enlace público en Instagram, Facebook o tu perfil de WhatsApp para empezar a recibir prospectos 24/7.
                </td>
            </tr>
        `;

        res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Panel IA | ${esc(c.nombre)}</title>
            <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-slate-100 min-h-screen p-4 md:p-8">
            <div class="max-w-6xl mx-auto">
                <!-- Cabecera -->
                <div class="bg-[#0b1f38] text-white rounded-2xl p-6 shadow-lg mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b-4 border-[#cda434]">
                    <div class="flex items-center gap-4">
                        ${c.logo_url ? `<img src="${esc(c.logo_url)}" alt="${esc(c.nombre)}" class="h-12 w-12 rounded-xl object-contain bg-white p-1">` : `<div class="h-12 w-12 rounded-xl bg-[#cda434] text-[#0b1f38] font-extrabold flex items-center justify-center text-lg">${esc((c.nombre || 'C').charAt(0).toUpperCase())}</div>`}
                        <div>
                            <h1 class="text-xl font-extrabold">${esc(c.nombre)}</h1>
                            <p class="text-xs text-gray-300">Panel Privado · Ecosistema IA Forestadent Ecuador</p>
                        </div>
                    </div>
                    <div class="flex flex-wrap gap-2 text-xs">
                        <a href="${esc(urlPublica)}" target="_blank" class="bg-[#cda434] hover:bg-yellow-500 text-[#0b1f38] font-extrabold px-4 py-2 rounded-lg transition">🌐 Ver Mi Página IA ↗</a>
                        <a href="/mi-clinica/cambiar-clave" class="bg-white/10 hover:bg-white/20 text-white font-bold px-3.5 py-2 rounded-lg transition">🔑 Clave</a>
                        <a href="/mi-clinica/logout" class="bg-red-500/20 hover:bg-red-500/30 text-red-200 font-bold px-3.5 py-2 rounded-lg transition">Salir</a>
                    </div>
                </div>

                ${avisoOk}

                <!-- Enlace compartible -->
                <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-200 mb-6 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div class="text-xs">
                        <span class="font-bold text-gray-500 uppercase block">Tu enlace público para compartir con pacientes:</span>
                        <a href="${esc(urlPublica)}" target="_blank" class="text-sm font-bold text-blue-600 hover:underline break-all">${esc(urlPublica)}</a>
                    </div>
                    <button type="button" onclick="navigator.clipboard.writeText('${esc(urlPublica)}').then(()=>alert('✅ Enlace copiado'));" class="bg-gray-900 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-black flex-shrink-0">
                        📋 Copiar Enlace
                    </button>
                </div>

                <!-- Tabla de Pacientes Capturados -->
                <div class="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-8">
                    <div class="p-5 border-b border-gray-100 flex items-center justify-between">
                        <h2 class="text-base font-extrabold text-[#0b1f38]">👥 Pacientes Capturados por tu Asistente IA (${pacientes.length})</h2>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="bg-gray-50 text-[11px] font-bold text-gray-500 uppercase border-b border-gray-200">
                                    <th class="p-3.5">Paciente</th>
                                    <th class="p-3.5">Motivo / Interés</th>
                                    <th class="p-3.5">Estado</th>
                                    <th class="p-3.5 text-right">Contactar</th>
                                </tr>
                            </thead>
                            <tbody>${filasPacientes}</tbody>
                        </table>
                    </div>
                </div>

                <!-- Configuración de la Clínica y Entrenamiento de la IA -->
                <div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                    <h2 class="text-base font-extrabold text-[#0b1f38] mb-1">⚙️ Personalizar mi Página Web y Asistente IA</h2>
                    <p class="text-xs text-gray-500 mb-5">Todo lo que actualices aquí se refleja al instante en tu página pública y en las respuestas de tu chatbot.</p>

                    <form action="/mi-clinica/guardar-config" method="POST" class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                            <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Nombre comercial</label>
                            <input type="text" name="nombre" required value="${esc(c.nombre)}" class="w-full border border-gray-300 rounded-lg p-2.5">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Doctor / Responsable</label>
                            <input type="text" name="responsable" value="${esc(c.responsable)}" class="w-full border border-gray-300 rounded-lg p-2.5">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-600 uppercase mb-1">WhatsApp de recepción (donde llegan citas)</label>
                            <input type="text" name="telefono_whatsapp" required value="${esc(c.telefono_whatsapp)}" class="w-full border border-gray-300 rounded-lg p-2.5">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Ciudad</label>
                            <input type="text" name="ciudad" value="${esc(c.ciudad)}" class="w-full border border-gray-300 rounded-lg p-2.5">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Dirección del consultorio</label>
                            <input type="text" name="direccion" value="${esc(c.direccion)}" placeholder="Ej: Av. República y Amazonas, Edif. X" class="w-full border border-gray-300 rounded-lg p-2.5">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Horarios de atención</label>
                            <input type="text" name="horarios" value="${esc(c.horarios)}" class="w-full border border-gray-300 rounded-lg p-2.5">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-600 uppercase mb-1">URL de tu Logo (imagen)</label>
                            <input type="url" name="logo_url" value="${esc(c.logo_url)}" placeholder="https://..." class="w-full border border-gray-300 rounded-lg p-2.5">
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Color Principal</label>
                                <input type="color" name="color_primario" value="${esc(c.color_primario || '#0b1f38')}" class="w-full h-10 rounded border border-gray-300 cursor-pointer">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Color Acento</label>
                                <input type="color" name="color_acento" value="${esc(c.color_acento || '#cda434')}" class="w-full h-10 rounded border border-gray-300 cursor-pointer">
                            </div>
                        </div>
                        <div class="md:col-span-2">
                            <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Servicios / Tratamientos (separados por coma)</label>
                            <textarea name="servicios" rows="2" class="w-full border border-gray-300 rounded-lg p-2.5">${esc(c.servicios)}</textarea>
                        </div>
                        <div class="md:col-span-2">
                            <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Mensaje de bienvenida del chat</label>
                            <textarea name="mensaje_bienvenida" rows="2" class="w-full border border-gray-300 rounded-lg p-2.5">${esc(c.mensaje_bienvenida)}</textarea>
                        </div>
                        <div class="md:col-span-2">
                            <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Instrucciones extra para tu IA (precios de valoración, promociones, formas de pago)</label>
                            <textarea name="instrucciones_ia" rows="3" placeholder="Ej: La valoración inicial cuesta $25. Aceptamos tarjetas de crédito y planes de financiamiento en ortodoncia." class="w-full border border-gray-300 rounded-lg p-2.5">${esc(c.instrucciones_ia)}</textarea>
                        </div>
                        <div class="md:col-span-2 text-right">
                            <button type="submit" class="bg-[#0b1f38] hover:bg-slate-800 text-white font-extrabold text-xs uppercase tracking-wider px-6 py-3 rounded-xl shadow transition">
                                💾 Guardar Cambios
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </body>
        </html>
        `);
    } catch (error) {
        console.error('❌ Error en /mi-clinica/panel:', error);
        res.status(500).send('Error cargando tu panel.');
    }
});

router.post('/mi-clinica/guardar-config', verificarClinica, async (req, res) => {
    try {
        const c = req.clinica;
        c.nombre = (req.body.nombre || c.nombre).trim();
        c.responsable = (req.body.responsable || '').trim();
        c.telefono_whatsapp = normalizarTelefonoEC(req.body.telefono_whatsapp || c.telefono_whatsapp);
        c.ciudad = (req.body.ciudad || '').trim();
        c.direccion = (req.body.direccion || '').trim();
        c.horarios = (req.body.horarios || '').trim();
        c.logo_url = (req.body.logo_url || '').trim();
        c.color_primario = (req.body.color_primario || '#0b1f38').trim();
        c.color_acento = (req.body.color_acento || '#cda434').trim();
        c.servicios = (req.body.servicios || '').trim();
        c.mensaje_bienvenida = (req.body.mensaje_bienvenida || '').trim();
        c.instrucciones_ia = (req.body.instrucciones_ia || '').trim();
        await c.save();

        res.redirect('/mi-clinica/panel?ok=config');
    } catch (error) {
        console.error('❌ Error guardando configuración clínica:', error);
        res.redirect('/mi-clinica/panel');
    }
});

router.post('/mi-clinica/paciente/:id/estado', verificarClinica, async (req, res) => {
    try {
        const estadosValidos = ['nuevo', 'contactado', 'agendado', 'descartado'];
        const nuevoEstado = req.body.estado;
        if (estadosValidos.includes(nuevoEstado)) {
            await PacienteClinica.findOneAndUpdate(
                { _id: req.params.id, clinica_id: req.clinica._id },
                { estado: nuevoEstado }
            );
        }
        res.redirect('/mi-clinica/panel');
    } catch (error) {
        res.redirect('/mi-clinica/panel');
    }
});

module.exports = router;