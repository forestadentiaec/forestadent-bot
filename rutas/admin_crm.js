const express = require('express');
const router = express.Router();
const { Usuario } = require('../modelos/BaseDatos');
const { htmlHead, menuNavegacion } = require('../vistas/Plantillas');

router.get('/admin/clientes', async (req, res) => {
    try {
        const clRaw = await Usuario.find().sort({ ultima_interaccion: -1 });
        
        let filas = clRaw.map(c => {
            const diasInactivo = c.ultima_interaccion ? Math.floor((Date.now() - new Date(c.ultima_interaccion)) / (1000 * 60 * 60 * 24)) : 99;
            
            let semaforo = '';
            let estadoFiltro = '';
            
            if (diasInactivo <= 15) { 
                semaforo = `<span class="bg-green-100 text-green-800 border border-green-200 text-[10px] font-extrabold px-2 py-1 rounded-sm uppercase tracking-wide">🟢 Activo</span>`; 
                estadoFiltro = 'activo'; 
            } else if (diasInactivo > 15 && diasInactivo <= 45) { 
                semaforo = `<span class="bg-yellow-100 text-yellow-800 border border-yellow-200 text-[10px] font-extrabold px-2 py-1 rounded-sm uppercase tracking-wide">🟡 Enfriándose</span>`; 
                estadoFiltro = 'enfriandose'; 
            } else { 
                semaforo = `<span class="bg-red-100 text-red-800 border border-red-200 text-[10px] font-extrabold px-2 py-1 rounded-sm uppercase tracking-wide">🔴 En Riesgo</span>`; 
                estadoFiltro = 'riesgo'; 
            }

            // Preparamos los datos limpios para inyectarlos en la Ficha (Modal)
            const cJson = JSON.stringify({
                id: c._id, 
                nombre: c.nombre_whatsapp, 
                telefono: c.telefono,
                ciudad: c.ciudad || 'Quito', 
                direccion: c.direccion || '',
                especialidad: c.especialidad || 'Ortodoncia', 
                tipo: c.tipo_establecimiento || 'consultorio',
                etiquetas: c.etiquetas || '', 
                notas: (c.notas || '').replace(/"/g, '&quot;').replace(/\n/g, '\\n')
            });

            return `
            <tr class="border-b hover:bg-gray-50 fila-cliente" data-nombre="${c.nombre_whatsapp.toLowerCase()}" data-estado="${estadoFiltro}">
                <td class="p-4">
                    <p class="font-bold text-gray-900 text-sm">${c.nombre_whatsapp}</p>
                    <p class="text-[11px] text-gray-500 font-medium mb-1.5">+${c.telefono}</p>
                    ${semaforo}
                </td>
                <td class="p-4 text-xs text-gray-600">
                    <p class="font-extrabold uppercase text-gray-800">${c.ciudad || 'Quito'}</p>
                    <p class="truncate max-w-[150px] mt-1">${c.direccion || 'Sin dirección registrada'}</p>
                </td>
                <td class="p-4 text-xs text-gray-600">
                    <p class="font-extrabold text-blue-800 bg-blue-50 px-2 py-0.5 rounded inline-block mb-1">${c.especialidad || 'Ortodoncia'}</p>
                    <p class="capitalize text-gray-500 font-medium">🏢 ${c.tipo_establecimiento || 'Consultorio'}</p>
                </td>
                <td class="p-4">
                    <p class="text-xs text-gray-500 font-medium max-w-[200px] truncate"><span class="font-bold text-forestaGold">🏷️ Etiquetas:</span> ${c.etiquetas || 'Ninguna'}</p>
                    <p class="text-[10px] text-gray-400 mt-1 max-w-[200px] truncate">📝 ${c.notas || 'Sin notas'}</p>
                </td>
                <td class="p-4 text-center">
                    <button onclick='abrirFicha(${cJson})' class="bg-forestaBlack hover:bg-gray-800 text-white font-extrabold px-4 py-2 rounded-lg text-[10px] shadow-sm uppercase tracking-wider transition w-full">📇 Abrir Ficha</button>
                </td>
            </tr>`;
        }).join('');

        res.send(`<!DOCTYPE html><html><head><title>CRM B2B | Forestadent</title>${htmlHead}</head><body class="bg-gray-100 p-8"><div class="max-w-7xl mx-auto">${menuNavegacion}
        
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div class="p-6 border-b border-gray-100">
                <div class="flex justify-between items-center mb-6">
                    <div>
                        <h2 class="text-xl font-extrabold uppercase tracking-tight text-gray-900">👥 Base de Datos CRM</h2>
                        <p class="text-xs text-gray-500 font-medium mt-1">Directorio médico, semáforos de retención y perfiles B2B</p>
                    </div>
                </div>
                
                <!-- BARRA DE FILTROS INTELIGENTE -->
                <div class="flex flex-col md:flex-row gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <div class="flex-1 relative">
                        <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">🔍</span>
                        <input type="text" id="filtroBuscador" onkeyup="filtrarCRM()" placeholder="Buscar doctor por nombre..." class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm font-medium focus:ring-2 focus:ring-forestaGold focus:border-forestaGold outline-none">
                    </div>
                    <select id="filtroEstado" onchange="filtrarCRM()" class="border border-gray-300 rounded-md py-2 px-3 text-sm font-bold text-gray-700 bg-white cursor-pointer outline-none w-full md:w-64">
                        <option value="todos">🚦 Todos los Semáforos</option>
                        <option value="activo">🟢 Activos (Últimos 15 días)</option>
                        <option value="enfriandose">🟡 Enfriándose (15 - 45 días)</option>
                        <option value="riesgo">🔴 En Riesgo de Pérdida (+45 días)</option>
                    </select>
                </div>
            </div>
            
            <table class="w-full text-left" id="tablaCRM">
                <thead>
                    <tr class="bg-gray-50 border-b border-gray-100 text-gray-400 text-[10px] uppercase tracking-wider">
                        <th class="p-4 font-bold">Doctor & Estado</th>
                        <th class="p-4 font-bold">Ubicación</th>
                        <th class="p-4 font-bold">Perfil Clínico</th>
                        <th class="p-4 font-bold">Segmentación</th>
                        <th class="p-4 font-bold text-center">Gestión</th>
                    </tr>
                </thead>
                <tbody>${filas || '<tr><td colspan="5" class="p-8 text-center text-gray-400 text-sm">No hay clientes registrados</td></tr>'}</tbody>
            </table>
        </div>

        <!-- MODAL: FICHA DEL CLIENTE -->
        <div id="modalFicha" class="fixed inset-0 bg-black bg-opacity-50 z-50 hidden flex items-center justify-center backdrop-blur-sm transition-opacity">
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden transform transition-all">
                <div class="bg-forestaBlack p-5 flex justify-between items-center">
                    <h3 class="text-lg font-extrabold text-white uppercase tracking-wider">📇 Ficha Corporativa del Cliente</h3>
                    <button onclick="cerrarFicha()" class="text-gray-400 hover:text-white text-2xl font-bold">&times;</button>
                </div>
                
                <div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <input type="hidden" id="ficha_id">
                    
                    <!-- Info Contacto (Solo Lectura) -->
                    <div class="md:col-span-2 bg-gray-50 p-4 rounded-lg border border-gray-100 flex justify-between items-center">
                        <div>
                            <p class="text-[10px] font-bold text-gray-400 uppercase">Nombre Registrado</p>
                            <p id="ficha_nombre" class="text-lg font-extrabold text-gray-900"></p>
                        </div>
                        <div class="text-right">
                            <p class="text-[10px] font-bold text-gray-400 uppercase">WhatsApp</p>
                            <p id="ficha_telefono" class="text-sm font-bold text-blue-600"></p>
                        </div>
                    </div>

                    <!-- Inputs Editables -->
                    <div>
                        <label class="block text-xs font-extrabold text-gray-600 uppercase mb-1">📍 Ciudad</label>
                        <input type="text" id="ficha_ciudad" class="w-full border border-gray-300 rounded-md p-2.5 text-sm font-bold focus:border-forestaGold outline-none">
                    </div>
                    <div>
                        <label class="block text-xs font-extrabold text-gray-600 uppercase mb-1">🗺️ Dirección Exacta</label>
                        <input type="text" id="ficha_direccion" class="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:border-forestaGold outline-none">
                    </div>
                    <div>
                        <label class="block text-xs font-extrabold text-gray-600 uppercase mb-1">🦷 Especialidad</label>
                        <input type="text" id="ficha_especialidad" class="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:border-forestaGold outline-none">
                    </div>
                    <div>
                        <label class="block text-xs font-extrabold text-gray-600 uppercase mb-1">🏢 Tipo de Establecimiento</label>
                        <select id="ficha_tipo" class="w-full border border-gray-300 rounded-md p-2.5 text-sm font-bold cursor-pointer outline-none">
                            <option value="consultorio">Consultorio Privado</option>
                            <option value="clínica">Clínica Odontológica</option>
                        </select>
                    </div>
                    
                    <!-- Memoria Comercial -->
                    <div class="md:col-span-2 border-t border-gray-200 pt-4 mt-2">
                        <label class="block text-xs font-extrabold text-forestaGold uppercase mb-1">🏷️ Etiquetas para Marketing (Ej: VIP, Autoligado)</label>
                        <input type="text" id="ficha_etiquetas" class="w-full border border-amber-300 bg-amber-50 text-amber-900 rounded-md p-2.5 text-sm font-bold focus:ring-1 focus:ring-forestaGold outline-none">
                    </div>
                    <div class="md:col-span-2">
                        <label class="block text-xs font-extrabold text-gray-600 uppercase mb-1">📝 Historial y Notas Comerciales</label>
                        <textarea id="ficha_notas" rows="4" class="w-full border border-gray-300 rounded-md p-3 text-sm focus:border-forestaGold outline-none" placeholder="Registra aquí acuerdos, preferencias o comentarios sobre el doctor..."></textarea>
                    </div>
                </div>

                <div class="bg-gray-50 p-4 border-t border-gray-200 flex justify-end gap-3">
                    <button onclick="cerrarFicha()" class="px-5 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg text-xs font-extrabold uppercase shadow-sm hover:bg-gray-50">Cancelar</button>
                    <button onclick="guardarFicha()" class="px-6 py-2.5 bg-forestaGold hover:bg-yellow-600 text-white rounded-lg text-xs font-extrabold uppercase shadow-md transition">💾 Guardar Cambios</button>
                </div>
            </div>
        </div>

        <script>
            // Motor de Filtros CRM
            function filtrarCRM() {
                const busqueda = document.getElementById('filtroBuscador').value.toLowerCase();
                const estado = document.getElementById('filtroEstado').value;
                const filas = document.querySelectorAll('.fila-cliente');
                
                filas.forEach(fila => {
                    const fNombre = fila.getAttribute('data-nombre');
                    const fEstado = fila.getAttribute('data-estado');
                    
                    const coincideBusqueda = fNombre.includes(busqueda);
                    const coincideEstado = estado === 'todos' || fEstado === estado;
                    
                    if (coincideBusqueda && coincideEstado) fila.style.display = '';
                    else fila.style.display = 'none';
                });
            }

            // Control del Modal (Ficha)
            function abrirFicha(cliente) {
                document.getElementById('ficha_id').value = cliente.id;
                document.getElementById('ficha_nombre').innerText = cliente.nombre;
                document.getElementById('ficha_telefono').innerText = '+' + cliente.telefono;
                
                document.getElementById('ficha_ciudad').value = cliente.ciudad;
                document.getElementById('ficha_direccion').value = cliente.direccion;
                document.getElementById('ficha_especialidad').value = cliente.especialidad;
                document.getElementById('ficha_tipo').value = cliente.tipo;
                document.getElementById('ficha_etiquetas').value = cliente.etiquetas;
                
                // Restauramos los saltos de línea para el textarea
                document.getElementById('ficha_notas').value = cliente.notas.replace(/\\n/g, '\\n');
                
                document.getElementById('modalFicha').classList.remove('hidden');
            }

            function cerrarFicha() {
                document.getElementById('modalFicha').classList.add('hidden');
            }

            // Guardar Datos en Backend
            async function guardarFicha() {
                const data = {
                    id: document.getElementById('ficha_id').value,
                    ciudad: document.getElementById('ficha_ciudad').value,
                    direccion: document.getElementById('ficha_direccion').value,
                    especialidad: document.getElementById('ficha_especialidad').value,
                    tipo_establecimiento: document.getElementById('ficha_tipo').value,
                    etiquetas: document.getElementById('ficha_etiquetas').value,
                    notas: document.getElementById('ficha_notas').value
                };

                try {
                    const res = await fetch('/admin/clientes/actualizar', { 
                        method: 'POST', 
                        headers: {'Content-Type':'application/json'}, 
                        body: JSON.stringify(data) 
                    });
                    const result = await res.json();
                    if(result.success) {
                        alert('✅ Ficha actualizada correctamente');
                        location.reload();
                    } else {
                        alert('❌ Hubo un error al guardar');
                    }
                } catch(e) {
                    alert('❌ Error de conexión');
                }
            }
        </script>
        </div></body></html>`);
    } catch (e) { res.status(500).send('Error en CRM'); }
});

router.post('/admin/clientes/actualizar', async (req, res) => {
    try { await Usuario.findByIdAndUpdate(req.body.id, req.body); res.json({ success: true }); } catch (e) { res.json({ success: false }); }
});

module.exports = router;