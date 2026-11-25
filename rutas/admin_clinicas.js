 const express = require('express');
const router = express.Router();
const {
    Clinica,
    PacienteClinica,
    Solicitud,
    hashPassword,
    generarPasswordTemporal
} = require('../modelos/BaseDatos');
const { htmlHead, menuNavegacion } = require('../vistas/Plantillas');
const {
    cloudinaryEstaConfigurado,
    manejarSubidaImagen,
    subirImagenCloudinary,
    eliminarImagenCloudinary
} = require('../utilidades/cloudinary');

function esc(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function crearSlugLimpio(texto) {
    return String(texto || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 45) || 'clinica';
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

async function intentarEnviarWhatsAppMeta(telefono, texto) {
    if (!process.env.WHATSAPP_TOKEN || !process.env.PHONE_NUMBER_ID || !telefono) {
        return { enviado: false, motivo: 'WhatsApp API no configurado en variables de entorno.' };
    }
    try {
        const res = await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: telefono,
                type: 'text',
                text: { body: texto }
            })
        });
        const data = await res.json();
        if (res.ok && !data.error) {
            return { enviado: true, motivo: 'Enviado por Meta WhatsApp API.' };
        }
        return { enviado: false, motivo: data.error?.message || 'Restricción de ventana 24h de Meta API (usa el botón manual de WhatsApp).' };
    } catch (e) {
        return { enviado: false, motivo: 'Error de red enviando por API (usa el botón manual de WhatsApp).' };
    }
}

function armarMensajeCredenciales({ nombre, responsable, urlPublica, urlLogin, usuario, passwordTemp }) {
    return `¡Hola ${responsable || nombre}! 🎉\n\nBienvenido al *Ecosistema IA para Clientes Aliados de Forestadent Ecuador*.\n\nYa activamos tu cuenta para *${nombre}*:\n\n🌐 *Tu Página Pública con Asistente IA:*\n${urlPublica}\n\n🔐 *Tu Panel Privado (Pacientes, Logo y Configuración):*\n${urlLogin}\n\n👤 *Usuario:* ${usuario}\n🔑 *Contraseña temporal:* ${passwordTemp}\n\n⚠️ Por seguridad, al ingresar por primera vez el sistema te pedirá crear tu contraseña definitiva. Luego podrás subir tu propio logo y personalizar tus servicios.\n\n¡Éxitos con tu nuevo asistente inteligente!`;
}

// ==========================================
// 1. PANEL PRINCIPAL DE CLÍNICAS / INQUILINOS
// ==========================================
router.get('/admin/clinicas', async (req, res) => {
    try {
        const [clinicas, solicitudesPendientes, conteosPacientes] = await Promise.all([
            Clinica.find().sort({ fecha_creacion: -1 }).lean(),
            Solicitud.find({
                contenido_texto: /SOLICITUD PANEL IA/i,
                estado_atencion: { $ne: 'atendido' }
            }).sort({ fecha: -1 }).limit(20).lean(),
            PacienteClinica.aggregate([
                { $group: { _id: '$clinica_id', total: { $sum: 1 } } }
            ])
        ]);

        const mapaPacientes = {};
        conteosPacientes.forEach(item => {
            mapaPacientes[String(item._id)] = item.total;
        });

        const baseUrl = obtenerUrlBase(req);
        const cloudActivo = cloudinaryEstaConfigurado();
        const alertaCredenciales = req.session.ultimaCredencialCreada || null;
        delete req.session.ultimaCredencialCreada;

        const bloqueAlertaCredenciales = alertaCredenciales ? `
        <div class="bg-emerald-50 border-2 border-emerald-400 rounded-xl p-6 mb-8 shadow-md">
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                <div>
                    <h3 class="text-lg font-extrabold text-emerald-900">✅ Cuenta lista: ${esc(alertaCredenciales.nombre)}</h3>
                    <p class="text-xs text-emerald-700 font-semibold mt-0.5">${esc(alertaCredenciales.estadoEnvioMeta)}</p>
                    ${alertaCredenciales.avisoLogo ? `<p class="text-xs text-amber-800 font-bold mt-1">⚠️ ${esc(alertaCredenciales.avisoLogo)}</p>` : ''}
                </div>
                <div class="flex flex-wrap gap-2">
                    ${alertaCredenciales.telefono ? `
                    <a href="https://wa.me/${esc(alertaCredenciales.telefono)}?text=${encodeURIComponent(alertaCredenciales.mensajeWhatsApp)}" target="_blank" class="bg-green-600 hover:bg-green-700 text-white text-xs font-extrabold px-4 py-2.5 rounded-lg shadow transition">
                        📲 Enviar Credenciales por WhatsApp
                    </a>` : ''}
                    <button type="button" onclick="copiarMensajeCredenciales()" class="bg-forestaBlack hover:bg-gray-800 text-white text-xs font-extrabold px-4 py-2.5 rounded-lg shadow transition">
                        📋 Copiar Mensaje Completo
                    </button>
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs bg-white p-4 rounded-lg border border-emerald-200">
                <div><span class="text-gray-400 font-bold block uppercase">Usuario</span><span class="font-mono font-bold text-sm text-forestaBlack">${esc(alertaCredenciales.usuario)}</span></div>
                <div><span class="text-gray-400 font-bold block uppercase">Clave Temporal</span><span class="font-mono font-bold text-sm text-emerald-700">${esc(alertaCredenciales.passwordTemp)}</span></div>
                <div><span class="text-gray-400 font-bold block uppercase">Web Pública IA</span><a href="${esc(alertaCredenciales.urlPublica)}" target="_blank" class="text-blue-600 underline font-semibold break-all">${esc(alertaCredenciales.urlPublica)}</a></div>
                <div><span class="text-gray-400 font-bold block uppercase">Panel del Doctor</span><a href="${esc(alertaCredenciales.urlLogin)}" target="_blank" class="text-blue-600 underline font-semibold break-all">${esc(alertaCredenciales.urlLogin)}</a></div>
            </div>
            <textarea id="textoCredencialesCopiar" class="hidden">${esc(alertaCredenciales.mensajeWhatsApp)}</textarea>
        </div>
        ` : '';

        const bloqueSolicitudes = solicitudesPendientes.length > 0 ? `
        <div class="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-8 shadow-sm">
            <h2 class="text-base font-extrabold text-amber-900 uppercase tracking-wide mb-3">🚀 Solicitudes Pendientes desde el Chat Web (${solicitudesPendientes.length})</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                ${solicitudesPendientes.map(s => `
                <div class="bg-white rounded-lg p-4 border border-amber-200 flex flex-col justify-between gap-3">
                    <div>
                        <div class="flex items-center justify-between gap-2">
                            <p class="font-bold text-sm text-forestaBlack">${esc(s.nombre_cliente || 'Sin nombre')}</p>
                            <span class="text-[11px] font-mono text-gray-500">${esc(s.telefono_cliente || '')}</span>
                        </div>
                        <p class="text-xs text-gray-600 mt-2 whitespace-pre-line line-clamp-4">${esc(s.contenido_texto || '')}</p>
                    </div>
                    <div class="flex gap-2 pt-2 border-t border-gray-100">
                        <button
                            type="button"
                            class="btn-cargar-solicitud flex-1 bg-forestaGold hover:bg-amber-600 text-white text-xs font-extrabold py-2 px-3 rounded-md transition"
                            data-id="${esc(s._id)}"
                            data-nombre="${esc(s.nombre_cliente || '')}"
                            data-telefono="${esc(s.telefono_cliente || '')}"
                        >
                            ⚡ Cargar para Aprobar
                        </button>
                        <form action="/admin/clinicas/descartar-solicitud/${esc(s._id)}" method="POST">
                            <button type="submit" class="bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold py-2 px-3 rounded-md transition">Ocultar</button>
                        </form>
                    </div>
                </div>
                `).join('')}
            </div>
        </div>
        ` : '';

        const filasClinicas = clinicas.length > 0 ? clinicas.map(c => {
            const totalPac = mapaPacientes[String(c._id)] || 0;
            const urlPub = `${baseUrl}/c/${c.slug}`;
            const badgeEstado = c.activo
                ? '<span class="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800">ACTIVA</span>'
                : '<span class="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-red-100 text-red-700">PAUSADA</span>';
            const badgeClave = c.debe_cambiar_password
                ? '<span class="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">Pendiente 1er ingreso</span>'
                : '<span class="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">Clave actualizada</span>';
            const avatarLogo = c.logo_url
                ? `<img src="${esc(c.logo_url)}" alt="Logo" class="w-10 h-10 rounded-lg object-contain bg-white border border-gray-200 p-0.5 flex-shrink-0">`
                : `<div class="w-10 h-10 rounded-lg bg-gray-800 text-amber-400 font-extrabold text-sm flex items-center justify-center flex-shrink-0">${esc((c.nombre || 'C').charAt(0).toUpperCase())}</div>`;

            return `
            <tr class="border-b border-gray-100 hover:bg-gray-50 transition">
                <td class="p-4">
                    <div class="flex items-start gap-3">
                        ${avatarLogo}
                        <div>
                            <div class="font-bold text-sm text-forestaBlack">${esc(c.nombre)}</div>
                            <div class="text-xs text-gray-500">${esc(c.responsable || '')} · <span class="uppercase font-semibold">${esc(c.tipo)}</span> · ${esc(c.ciudad)}</div>
                            <div class="mt-1 flex items-center gap-2 flex-wrap">
                                <span class="text-[11px] font-mono text-gray-500">User: <strong>${esc(c.usuario_acceso)}</strong></span>
                                ${badgeClave}
                            </div>
                        </div>
                    </div>
                </td>
                <td class="p-4 text-xs">
                    <div class="font-mono text-gray-700 mb-1">${esc(c.telefono_whatsapp || 'Sin WhatsApp')}</div>
                    <a href="${esc(urlPub)}" target="_blank" class="text-blue-600 hover:underline font-semibold break-all">/c/${esc(c.slug)} ↗</a>
                </td>
                <td class="p-4 text-center">
                    <span class="inline-block bg-blue-50 text-blue-800 font-extrabold text-sm px-3 py-1 rounded-lg">${totalPac}</span>
                </td>
                <td class="p-4 text-center">${badgeEstado}</td>
                <td class="p-4">
                    <div class="flex flex-wrap gap-1.5 justify-end">
                        <form action="/admin/clinicas/estado/${esc(c._id)}" method="POST">
                            <button type="submit" class="px-2.5 py-1.5 rounded text-[11px] font-bold ${c.activo ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'} transition">
                                ${c.activo ? '⏸ Pausar' : '▶ Activar'}
                            </button>
                        </form>
                        <form action="/admin/clinicas/reset-clave/${esc(c._id)}" method="POST" onsubmit="return confirm('¿Generar una nueva contraseña temporal para ${esc(c.nombre)}?');">
                            <button type="submit" class="px-2.5 py-1.5 rounded text-[11px] font-bold bg-gray-800 text-white hover:bg-black transition">
                                🔑 Nueva Clave
                            </button>
                        </form>
                        <form action="/admin/clinicas/eliminar/${esc(c._id)}" method="POST" onsubmit="return confirm('¿Eliminar definitivamente ${esc(c.nombre)} y sus pacientes registrados?');">
                            <button type="submit" class="px-2.5 py-1.5 rounded text-[11px] font-bold bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 transition">
                                🗑
                            </button>
                        </form>
                    </div>
                </td>
            </tr>
            `;
        }).join('') : `
            <tr>
                <td colspan="5" class="p-10 text-center text-sm text-gray-500">
                    Todavía no has creado ninguna clínica, consultorio o universidad aliada. Crea la primera arriba para probarla.
                </td>
            </tr>
        `;

        res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <title>Clínicas IA Multi-Tenant | Torre de Control</title>
            ${htmlHead}
        </head>
        <body class="bg-gray-100 min-h-screen p-4 md:p-8">
            <div class="max-w-7xl mx-auto">
                ${menuNavegacion}

                ${bloqueAlertaCredenciales}
                ${bloqueSolicitudes}

                <!-- Formulario de Creación de Nuevo Inquilino (Ilimitado) -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5 pb-3 border-b border-gray-100">
                        <div>
                            <h2 class="text-lg font-extrabold text-forestaBlack uppercase">🏥 Activar Nueva Clínica / Doctor / Universidad</h2>
                            <p class="text-xs text-gray-500">Genera automáticamente su página web con Chatbot IA, su panel privado (donde cada doctor puede subir su propio logo) y su contraseña temporal.</p>
                        </div>
                        <div class="flex items-center gap-2">
                            ${cloudActivo
                                ? '<span class="text-[11px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full">☁️ Cloudinary Activo</span>'
                                : '<span class="text-[11px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-full">⏳ Cloudinary pendiente</span>'}
                            <span class="text-xs font-bold bg-gray-100 text-gray-600 px-3 py-1 rounded-full">Activas: ${clinicas.filter(c => c.activo).length} / ${clinicas.length}</span>
                        </div>
                    </div>

                    <form action="/admin/clinicas/crear" method="POST" enctype="multipart/form-data" id="formCrearClinica" class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <input type="hidden" name="solicitud_id" id="inputSolicitudId" value="">

                        <div>
                            <label class="block text-xs font-extrabold text-gray-600 uppercase mb-1">Nombre de Clínica / Consultorio *</label>
                            <input type="text" name="nombre" id="inputNombreClinica" required placeholder="Ej: Ortodoncia Dra. Pérez" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:border-forestaGold">
                        </div>

                        <div>
                            <label class="block text-xs font-extrabold text-gray-600 uppercase mb-1">Nombre del Doctor / Responsable *</label>
                            <input type="text" name="responsable" id="inputResponsable" required placeholder="Ej: Dra. María Pérez" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:border-forestaGold">
                        </div>

                        <div>
                            <label class="block text-xs font-extrabold text-gray-600 uppercase mb-1">WhatsApp del Consultorio *</label>
                            <input type="text" name="telefono_whatsapp" id="inputTelefonoClinica" required placeholder="Ej: 0991234567" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:border-forestaGold">
                        </div>

                        <div>
                            <label class="block text-xs font-extrabold text-gray-600 uppercase mb-1">Tipo de Establecimiento</label>
                            <select name="tipo" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white outline-none focus:border-forestaGold">
                                <option value="consultorio">Consultorio Particular</option>
                                <option value="clinica">Clínica Odontológica</option>
                                <option value="universidad">Universidad / Posgrado</option>
                            </select>
                        </div>

                        <div>
                            <label class="block text-xs font-extrabold text-gray-600 uppercase mb-1">Ciudad</label>
                            <input type="text" name="ciudad" value="Quito" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:border-forestaGold">
                        </div>

                        <div>
                            <label class="block text-xs font-extrabold text-gray-600 uppercase mb-1">Usuario de Acceso (Opcional)</label>
                            <input type="text" name="usuario_acceso" placeholder="Si lo dejas vacío se genera automático" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:border-forestaGold">
                        </div>

                        <div class="md:col-span-3">
                            <label class="block text-xs font-extrabold text-gray-600 uppercase mb-1">Servicios Principales (separados por coma)</label>
                            <input type="text" name="servicios" value="Ortodoncia convencional, Autoligado estético y metálico, Alineadores invisibles, Valoración inicial" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:border-forestaGold">
                        </div>

                        <div class="md:col-span-2">
                            <label class="block text-xs font-extrabold text-gray-600 uppercase mb-1">📤 Subir Logo Inicial (Opcional — el doctor también puede subirlo en su panel)</label>
                            <input type="file" name="logo_file" accept="image/*" class="w-full border border-gray-300 rounded-lg p-2 text-xs bg-gray-50 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-bold file:bg-forestaBlack file:text-white cursor-pointer">
                        </div>

                        <div>
                            <label class="block text-xs font-extrabold text-gray-600 uppercase mb-1">O URL de Logo (Opcional)</label>
                            <input type="url" name="logo_url" placeholder="https://..." class="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:border-forestaGold">
                        </div>

                        <div class="md:col-span-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
                            <label class="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 cursor-pointer">
                                <input type="checkbox" name="enviar_meta_api" value="1" checked class="rounded border-gray-300">
                                <span>Intentar envío automático de credenciales por Meta WhatsApp API (además del botón manual)</span>
                            </label>
                            <button type="submit" class="bg-forestaBlack hover:bg-gray-800 text-white font-extrabold text-xs uppercase tracking-wider px-6 py-3 rounded-lg shadow transition">
                                ✨ Crear Cuenta y Generar Clave Temporal
                            </button>
                        </div>
                    </form>
                </div>

                <!-- Listado de Clínicas / Inquilinos -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div class="p-5 border-b border-gray-100 flex items-center justify-between">
                        <h2 class="text-base font-extrabold text-forestaBlack uppercase">Directorio de Clientes Aliados con IA</h2>
                        <a href="/mi-clinica/login" target="_blank" class="text-xs font-bold text-blue-600 hover:underline">Abrir Login de Doctores (/mi-clinica/login) ↗</a>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="bg-gray-50 text-[11px] font-extrabold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                                    <th class="p-4">Clínica / Usuario</th>
                                    <th class="p-4">WhatsApp y Enlace Público</th>
                                    <th class="p-4 text-center">Pacientes IA</th>
                                    <th class="p-4 text-center">Estado</th>
                                    <th class="p-4 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${filasClinicas}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <script>
                document.querySelectorAll('.btn-cargar-solicitud').forEach(btn => {
                    btn.addEventListener('click', () => {
                        document.getElementById('inputSolicitudId').value = btn.dataset.id || '';
                        document.getElementById('inputResponsable').value = btn.dataset.nombre || '';
                        document.getElementById('inputNombreClinica').value = btn.dataset.nombre ? ('Consultorio ' + btn.dataset.nombre) : '';
                        document.getElementById('inputTelefonoClinica').value = btn.dataset.telefono || '';
                        document.getElementById('formCrearClinica').scrollIntoView({ behavior: 'smooth' });
                        document.getElementById('inputNombreClinica').focus();
                    });
                });

                function copiarMensajeCredenciales() {
                    const txt = document.getElementById('textoCredencialesCopiar');
                    if (!txt) return;
                    navigator.clipboard.writeText(txt.value).then(() => {
                        alert('✅ Mensaje con credenciales copiado. Ya puedes pegarlo en WhatsApp o correo.');
                    });
                }
            </script>
        </body>
        </html>
        `);
    } catch (error) {
        console.error('❌ Error cargando /admin/clinicas:', error);
        res.status(500).send('Error cargando módulo de Clínicas IA.');
    }
});

// ==========================================
// 2. CREAR NUEVA CLÍNICA + CLAVE TEMPORAL + LOGO OPCIONAL
// ==========================================
router.post('/admin/clinicas/crear', manejarSubidaImagen('logo_file'), async (req, res) => {
    try {
        const nombre = (req.body.nombre || '').trim();
        const responsable = (req.body.responsable || '').trim();
        const telefono = normalizarTelefonoEC(req.body.telefono_whatsapp);
        const tipo = (req.body.tipo || 'consultorio').trim();
        const ciudad = (req.body.ciudad || 'Quito').trim();
        const servicios = (req.body.servicios || '').trim();
        let logo_url = (req.body.logo_url || '').trim();
        let logo_public_id = '';
        let avisoLogo = '';
        const solicitudId = (req.body.solicitud_id || '').trim();
        const enviarMeta = req.body.enviar_meta_api === '1';

        if (!nombre || !telefono) {
            return res.send(`<script>alert('⚠️ Debes ingresar al menos el nombre y el WhatsApp.'); window.location.href='/admin/clinicas';</script>`);
        }

        // Subida opcional del logo inicial a Cloudinary
        if (req.errorSubida) {
            avisoLogo = `La clínica se creó, pero el logo no se subió: ${req.errorSubida}`;
        } else if (req.file && req.file.buffer) {
            if (cloudinaryEstaConfigurado()) {
                try {
                    const subida = await subirImagenCloudinary(req.file.buffer, 'forestadent_logos');
                    logo_url = subida.url;
                    logo_public_id = subida.public_id;
                } catch (e) {
                    avisoLogo = 'La clínica se creó, pero hubo un error subiendo el logo a Cloudinary. El doctor puede subirlo desde su panel.';
                }
            } else {
                avisoLogo = 'La clínica se creó, pero aún falta configurar CLOUDINARY_URL en Render para guardar archivos de logo.';
            }
        }

        // Generar slug único
        const slugBase = crearSlugLimpio(nombre);
        let slugFinal = slugBase;
        let contador = 2;
        while (await Clinica.findOne({ slug: slugFinal })) {
            slugFinal = `${slugBase}-${contador++}`;
        }

        // Generar usuario único
        const userBase = crearSlugLimpio(req.body.usuario_acceso || slugFinal).replace(/-/g, '.');
        let usuarioFinal = userBase;
        let contUser = 2;
        while (await Clinica.findOne({ usuario_acceso: usuarioFinal })) {
            usuarioFinal = `${userBase}${contUser++}`;
        }

        // Generar clave temporal encriptada
        const passwordTemp = generarPasswordTemporal();
        const password_hash = hashPassword(passwordTemp);

        const nuevaClinica = new Clinica({
            slug: slugFinal,
            nombre,
            tipo,
            responsable,
            telefono_whatsapp: telefono,
            ciudad,
            servicios: servicios || 'Ortodoncia convencional, Autoligado, Alineadores, Valoración inicial',
            logo_url,
            logo_public_id,
            usuario_acceso: usuarioFinal,
            password_hash,
            debe_cambiar_password: true,
            activo: true
        });
        await nuevaClinica.save();

        // Si venía de una solicitud pendiente del chat web, la marcamos como atendida
        if (solicitudId) {
            await Solicitud.findByIdAndUpdate(solicitudId, { estado_atencion: 'atendido' }).catch(() => {});
        }

        const baseUrl = obtenerUrlBase(req);
        const urlPublica = `${baseUrl}/c/${slugFinal}`;
        const urlLogin = `${baseUrl}/mi-clinica/login`;

        const mensajeWhatsApp = armarMensajeCredenciales({
            nombre,
            responsable,
            urlPublica,
            urlLogin,
            usuario: usuarioFinal,
            passwordTemp
        });

        let estadoEnvioMeta = 'Listo para enviar manualmente por WhatsApp.';
        if (enviarMeta) {
            const intento = await intentarEnviarWhatsAppMeta(telefono, mensajeWhatsApp);
            estadoEnvioMeta = intento.enviado
                ? '📨 Confirmación enviada automáticamente por WhatsApp API.'
                : `ℹ️ API Meta no envió (${intento.motivo}). Usa el botón verde de WhatsApp aquí al lado.`;
        }

        req.session.ultimaCredencialCreada = {
            nombre,
            telefono,
            usuario: usuarioFinal,
            passwordTemp,
            urlPublica,
            urlLogin,
            mensajeWhatsApp,
            estadoEnvioMeta,
            avisoLogo
        };

        res.redirect('/admin/clinicas');
    } catch (error) {
        console.error('❌ Error creando clínica:', error);
        res.send(`<script>alert('❌ Error creando clínica: ${esc(error.message)}'); window.location.href='/admin/clinicas';</script>`);
    }
});

// ==========================================
// 3. PAUSAR / REACTIVAR CLÍNICA
// ==========================================
router.post('/admin/clinicas/estado/:id', async (req, res) => {
    try {
        const clinica = await Clinica.findById(req.params.id);
        if (clinica) {
            clinica.activo = !clinica.activo;
            await clinica.save();
        }
        res.redirect('/admin/clinicas');
    } catch (error) {
        console.error('❌ Error cambiando estado de clínica:', error);
        res.redirect('/admin/clinicas');
    }
});

// ==========================================
// 4. GENERAR NUEVA CLAVE TEMPORAL
// ==========================================
router.post('/admin/clinicas/reset-clave/:id', async (req, res) => {
    try {
        const clinica = await Clinica.findById(req.params.id);
        if (!clinica) return res.redirect('/admin/clinicas');

        const passwordTemp = generarPasswordTemporal();
        clinica.password_hash = hashPassword(passwordTemp);
        clinica.debe_cambiar_password = true;
        await clinica.save();

        const baseUrl = obtenerUrlBase(req);
        const urlPublica = `${baseUrl}/c/${clinica.slug}`;
        const urlLogin = `${baseUrl}/mi-clinica/login`;

        const mensajeWhatsApp = armarMensajeCredenciales({
            nombre: clinica.nombre,
            responsable: clinica.responsable,
            urlPublica,
            urlLogin,
            usuario: clinica.usuario_acceso,
            passwordTemp
        });

        const intento = await intentarEnviarWhatsAppMeta(clinica.telefono_whatsapp, mensajeWhatsApp);

        req.session.ultimaCredencialCreada = {
            nombre: clinica.nombre,
            telefono: clinica.telefono_whatsapp,
            usuario: clinica.usuario_acceso,
            passwordTemp,
            urlPublica,
            urlLogin,
            mensajeWhatsApp,
            estadoEnvioMeta: intento.enviado
                ? '📨 Nueva clave temporal enviada por WhatsApp API.'
                : `🔑 Nueva clave temporal generada. Usa el botón de WhatsApp para enviarla.`
        };

        res.redirect('/admin/clinicas');
    } catch (error) {
        console.error('❌ Error reseteando clave:', error);
        res.redirect('/admin/clinicas');
    }
});

// ==========================================
// 5. DESCARTAR SOLICITUD PENDIENTE / ELIMINAR CLÍNICA
// ==========================================
router.post('/admin/clinicas/descartar-solicitud/:id', async (req, res) => {
    try {
        await Solicitud.findByIdAndUpdate(req.params.id, { estado_atencion: 'atendido' });
    } catch (e) {}
    res.redirect('/admin/clinicas');
});

router.post('/admin/clinicas/eliminar/:id', async (req, res) => {
    try {
        const clinica = await Clinica.findById(req.params.id);
        if (clinica && clinica.logo_public_id) {
            await eliminarImagenCloudinary(clinica.logo_public_id);
        }
        await PacienteClinica.deleteMany({ clinica_id: req.params.id });
        await Clinica.findByIdAndDelete(req.params.id);
    } catch (e) {
        console.error('❌ Error eliminando clínica:', e);
    }
    res.redirect('/admin/clinicas');
});

module.exports = router;