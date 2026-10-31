const express = require('express');
const router = express.Router();
const { Usuario } = require('../modelos/BaseDatos');
const { htmlHead, menuNavegacion } = require('../vistas/Plantillas');

router.get('/admin/clientes', async (req, res) => {
    try {
        const clRaw = await Usuario.find().sort({ ultima_interaccion: -1 });
        let filas = clRaw.map(c => {
            const diasInactivo = c.ultima_interaccion ? Math.floor((Date.now() - new Date(c.ultima_interaccion)) / (1000 * 60 * 60 * 24)) : 99;
            let semaforo = `<span class="bg-green-100 text-green-800 text-xs font-extrabold px-2.5 py-1 rounded-full">🟢 Activo (${diasInactivo}d)</span>`;
            if (diasInactivo > 15 && diasInactivo <= 45) semaforo = `<span class="bg-yellow-100 text-yellow-800 text-xs font-extrabold px-2.5 py-1 rounded-full">🟡 Enfriándose</span>`;
            else if (diasInactivo > 45) semaforo = `<span class="bg-red-100 text-red-800 text-xs font-extrabold px-2.5 py-1 rounded-full">🔴 En Riesgo</span>`;
            return `<tr class="border-b hover:bg-gray-50"><td class="p-4"><p class="font-bold text-gray-800">${c.nombre_whatsapp}</p><p class="text-xs text-gray-500 mb-2">+${c.telefono}</p>${semaforo}</td><td class="p-4"><input type="text" id="ciudad_${c._id}" value="${c.ciudad || 'Quito'}" placeholder="Ciudad" class="border p-2 w-full text-xs rounded mb-1 font-bold"><input type="text" id="dir_${c._id}" value="${c.direccion || ''}" placeholder="Dirección" class="border p-2 w-full text-xs rounded"></td><td class="p-4"><input type="text" id="esp_${c._id}" value="${c.especialidad || 'Ortodoncia'}" placeholder="Especialidad" class="border p-2 w-full text-xs rounded mb-1"><select id="lugar_${c._id}" class="border p-2 w-full text-xs rounded font-bold"><option value="consultorio" ${c.tipo_establecimiento==='consultorio'?'selected':''}>🏥 Consultorio</option><option value="clínica" ${c.tipo_establecimiento==='clínica'?'selected':''}>🏢 Clínica</option></select></td><td class="p-4"><input type="text" id="etiq_${c._id}" value="${c.etiquetas || ''}" placeholder="Ej: VIP" class="border border-amber-300 bg-amber-50/30 p-2 w-full text-xs rounded mb-1 font-bold"><textarea id="notas_${c._id}" class="border p-2 w-full text-xs rounded" rows="2" placeholder="Notas...">${c.notas || ''}</textarea></td><td class="p-4 text-center"><button onclick="guardar('${c._id}')" class="bg-forestaGold hover:bg-yellow-600 text-white font-bold px-4 py-2 rounded-lg text-xs shadow">💾 Guardar</button></td></tr>`;
        }).join('');
        res.send(`<!DOCTYPE html><html><head><title>CRM Clientes</title>${htmlHead}</head><body class="bg-gray-50 p-8"><div class="max-w-7xl mx-auto">${menuNavegacion}<div class="bg-white rounded-xl shadow overflow-hidden border-t-8 border-forestaGold"><div class="p-6 border-b flex justify-between items-center"><div><h2 class="text-xl font-extrabold uppercase">👥 Inteligencia Comercial & CRM B2B</h2></div></div><table class="w-full text-left"><thead><tr class="bg-forestaBlack text-white text-xs uppercase"><th class="p-4">Doctor & Semáforo</th><th class="p-4">Ubicación</th><th class="p-4">Perfil Clínico</th><th class="p-4">Etiquetas</th><th class="p-4 text-center">Acción</th></tr></thead><tbody>${filas}</tbody></table></div><script>async function guardar(id) { await fetch('/admin/clientes/actualizar', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ id, ciudad: document.getElementById('ciudad_'+id).value, direccion: document.getElementById('dir_'+id).value, especialidad: document.getElementById('esp_'+id).value, tipo_establecimiento: document.getElementById('lugar_'+id).value, etiquetas: document.getElementById('etiq_'+id).value, notas: document.getElementById('notas_'+id).value }) }); alert('✅ Ficha actualizada'); location.reload(); }</script></div></body></html>`);
    } catch (e) { res.status(500).send('Error en CRM'); }
});

router.post('/admin/clientes/actualizar', async (req, res) => {
    try { await Usuario.findByIdAndUpdate(req.body.id, req.body); res.json({ success: true }); } catch (e) { res.json({ success: false }); }
});

module.exports = router;