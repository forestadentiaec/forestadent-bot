const express = require('express');
const router = express.Router();
const { Producto } = require('../modelos/BaseDatos');
const { htmlHead, menuNavegacion } = require('../vistas/Plantillas');
const {
    cloudinaryEstaConfigurado,
    manejarSubidaImagen,
    subirImagenCloudinary,
    eliminarImagenCloudinary
} = require('../utilidades/cloudinary');

function escHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

router.get('/admin/catalogo', async (req, res) => {
    try {
        const prod = await Producto.find().sort({ categoria: 1, nombre: 1 });
        const cloudActivo = cloudinaryEstaConfigurado();
        
        // Extraer categorías únicas para el filtro
        const categorias = [...new Set(prod.map(p => p.categoria || 'General'))].sort();
        const opcionesCat = categorias.map(c => `<option value="${escHtml(c.toLowerCase())}">📂 ${escHtml(c)}</option>`).join('');

        let filas = prod.map(p => {
            // Imagen por defecto si no tiene una asignada
            const imgUrl = p.imagen_url ? p.imagen_url : 'https://placehold.co/150x150/f3f4f6/a1a1aa?text=Sin+Foto';
            
            // Preparamos datos seguros para la Ficha
            const pJson = JSON.stringify({
                id: p._id,
                codigo: p.codigo || '',
                nombre: p.nombre || '',
                categoria: p.categoria || 'General',
                precio: Number(p.precio || 0),
                empaque: p.empaque || '',
                imagen_url: p.imagen_url || '',
                descripcion: p.descripcion || ''
            }).replace(/</g, '\\u003c').replace(/'/g, '&#39;');

            return `
            <tr class="border-b hover:bg-gray-50 fila-producto" data-sku="${escHtml((p.codigo || '').toLowerCase())}" data-nombre="${escHtml((p.nombre || '').toLowerCase())}" data-categoria="${escHtml((p.categoria || 'general').toLowerCase())}">
                <td class="p-4 w-16">
                    <img src="${escHtml(imgUrl)}" class="w-12 h-12 rounded-lg object-cover border border-gray-200 shadow-sm bg-white" alt="Foto">
                </td>
                <td class="p-4">
                    <p class="font-extrabold text-gray-900 text-sm tracking-tight">${escHtml(p.codigo || 'S/C')}</p>
                    <p class="font-medium text-xs text-gray-500 mt-0.5 truncate max-w-[200px]">${escHtml(p.nombre || '')}</p>
                </td>
                <td class="p-4">
                    <span class="bg-gray-100 text-gray-700 border border-gray-200 text-[10px] font-extrabold px-2.5 py-1 rounded-sm uppercase tracking-wide">${escHtml(p.categoria || 'General')}</span>
                </td>
                <td class="p-4 text-center">
                    <p class="font-extrabold text-blue-700 text-lg">$${Number(p.precio || 0).toFixed(2)}</p>
                </td>
                <td class="p-4 text-center">
                    <button onclick='abrirFichaProd(${pJson})' class="bg-white border border-gray-300 hover:bg-forestaBlack hover:text-white hover:border-forestaBlack text-gray-700 px-4 py-2 rounded-lg font-extrabold text-[10px] uppercase tracking-wide shadow-sm transition-all w-full">✏️ Ficha y Media</button>
                </td>
            </tr>`;
        }).join('');

        const badgeCloud = cloudActivo
            ? '<span class="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-extrabold px-3 py-1 rounded-full">☁️ Cloudinary Conectado</span>'
            : '<span class="inline-flex items-center gap-1.5 bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-extrabold px-3 py-1 rounded-full">⏳ Cloudinary pendiente (agrega CLOUDINARY_URL en Render)</span>';

        res.send(`<!DOCTYPE html><html><head><title>Catálogo Vivo | Forestadent</title>${htmlHead}</head><body class="bg-gray-100 p-8"><div class="max-w-7xl mx-auto">${menuNavegacion}
        
        <!-- CREADOR RÁPIDO -->
        <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6 border-l-4 border-l-forestaGold">
            <h3 class="text-sm font-extrabold uppercase mb-4 text-gray-800 tracking-tight">➕ Alta Rápida de SKU</h3>
            <div class="grid grid-cols-1 md:grid-cols-5 gap-4">
                <input type="text" id="nuevoCodigo" placeholder="SKU (Ej: 206-1010)" class="border border-gray-300 p-2.5 rounded-md font-bold text-sm focus:border-forestaGold outline-none">
                <input type="text" id="nuevoNombre" placeholder="Nombre Oficial del Producto" class="border border-gray-300 p-2.5 rounded-md text-sm md:col-span-2 focus:border-forestaGold outline-none">
                <input type="number" step="0.01" id="nuevoPrecio" placeholder="Precio USD" class="border border-gray-300 p-2.5 rounded-md font-extrabold text-sm text-blue-700 focus:border-forestaGold outline-none">
                <button onclick="crearProd()" id="btnCrear" class="bg-forestaGold text-white font-extrabold uppercase tracking-wider rounded-md px-4 py-2.5 text-[11px] shadow-sm hover:bg-yellow-600 transition-all">➕ Añadir al Catálogo</button>
            </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div class="p-6 border-b border-gray-100">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-6">
                    <div>
                        <h2 class="text-xl font-extrabold uppercase tracking-tight text-gray-900">📑 Gestor de Catálogo y Media</h2>
                        <p class="text-xs text-gray-500 font-medium mt-1">Sincronización en vivo con la IA, imágenes y descripciones B2B</p>
                    </div>
                    ${badgeCloud}
                </div>
                
                <!-- BARRA DE FILTROS -->
                <div class="flex flex-col md:flex-row gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <div class="flex-1 relative">
                        <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">🔍</span>
                        <input type="text" id="filtroBuscadorProd" onkeyup="filtrarCatalogo()" placeholder="Buscar producto por SKU o Nombre..." class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm font-medium focus:ring-2 focus:ring-forestaGold focus:border-forestaGold outline-none transition-all">
                    </div>
                    <select id="filtroCategoria" onchange="filtrarCatalogo()" class="border border-gray-300 rounded-md py-2 px-3 text-sm font-bold text-gray-700 bg-white cursor-pointer outline-none w-full md:w-64 focus:ring-2 focus:ring-forestaGold transition-all">
                        <option value="todos">🗂️ Todas las Categorías</option>
                        ${opcionesCat}
                    </select>
                </div>
            </div>

            <table class="w-full text-left">
                <thead>
                    <tr class="bg-gray-50 border-b border-gray-100 text-gray-400 text-[10px] uppercase tracking-wider">
                        <th class="p-4 font-bold">Foto</th>
                        <th class="p-4 font-bold">SKU & Nombre</th>
                        <th class="p-4 font-bold">Familia / Categoría</th>
                        <th class="p-4 font-bold text-center">Precio de Venta</th>
                        <th class="p-4 font-bold text-center">Acción</th>
                    </tr>
                </thead>
                <tbody>${filas || '<tr><td colspan="5" class="p-8 text-center text-gray-400 text-sm">El catálogo está vacío</td></tr>'}</tbody>
            </table>
        </div>

        <!-- MODAL: FICHA DEL PRODUCTO -->
        <div id="modalProd" class="fixed inset-0 bg-black bg-opacity-50 z-50 hidden flex items-center justify-center backdrop-blur-sm transition-opacity p-4">
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden transform transition-all">
                <div class="bg-forestaBlack p-5 flex justify-between items-center">
                    <h3 class="text-lg font-extrabold text-white uppercase tracking-wider">🗂️ Ficha de Producto y Multimedia</h3>
                    <button onclick="cerrarFichaProd()" class="text-gray-400 hover:text-white text-2xl font-bold">&times;</button>
                </div>
                
                <div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-5 max-h-[80vh] overflow-y-auto">
                    <input type="hidden" id="prod_id">
                    
                    <div>
                        <label class="block text-xs font-extrabold text-gray-600 uppercase mb-1">SKU</label>
                        <input type="text" id="prod_codigo" disabled class="w-full border border-gray-200 bg-gray-50 rounded-md p-2.5 text-sm font-extrabold text-gray-500 cursor-not-allowed">
                    </div>
                    <div>
                        <label class="block text-xs font-extrabold text-gray-600 uppercase mb-1">Categoría</label>
                        <input type="text" id="prod_categoria" placeholder="Ej: Arcos, Brackets, Tubos..." class="w-full border border-gray-300 rounded-md p-2.5 text-sm font-bold focus:border-forestaGold outline-none">
                    </div>
                    <div class="md:col-span-2">
                        <label class="block text-xs font-extrabold text-gray-600 uppercase mb-1">Nombre Comercial</label>
                        <input type="text" id="prod_nombre" class="w-full border border-gray-300 rounded-md p-2.5 text-sm font-bold focus:border-forestaGold outline-none">
                    </div>
                    <div>
                        <label class="block text-xs font-extrabold text-gray-600 uppercase mb-1">💰 Precio USD</label>
                        <input type="number" step="0.01" id="prod_precio" class="w-full border border-blue-300 bg-blue-50 text-blue-800 rounded-md p-2.5 text-lg font-extrabold text-center focus:ring-1 focus:ring-blue-500 outline-none">
                    </div>
                    <div>
                        <label class="block text-xs font-extrabold text-gray-600 uppercase mb-1">📦 Presentación / Empaque</label>
                        <input type="text" id="prod_empaque" placeholder="Ej: Caso x 20 brackets, Unidad..." class="w-full border border-gray-300 rounded-md p-2.5 text-sm font-semibold focus:border-forestaGold outline-none">
                    </div>

                    <!-- BLOQUE DE IMAGEN: SUBIDA DIRECTA CLOUDINARY + VISTA PREVIA -->
                    <div class="md:col-span-2 bg-amber-50/60 border border-amber-200 rounded-xl p-4">
                        <div class="flex flex-col sm:flex-row items-center gap-4">
                            <img id="prod_preview_img" src="https://placehold.co/150x150/f3f4f6/a1a1aa?text=Sin+Foto" alt="Vista previa" class="w-24 h-24 rounded-xl object-contain bg-white border border-amber-200 p-1 shadow-sm flex-shrink-0">
                            <div class="flex-1 w-full space-y-3">
                                <div>
                                    <label class="block text-xs font-extrabold text-amber-900 uppercase mb-1">📤 Subir Foto desde tu Computadora o Celular (Cloudinary)</label>
                                    <input type="file" id="prod_imagen_file" accept="image/*" onchange="previsualizarArchivoProd(event)" class="w-full text-xs text-gray-700 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-forestaBlack file:text-white hover:file:bg-gray-800 cursor-pointer">
                                    <p class="text-[11px] text-gray-500 mt-1">
                                        ${cloudActivo ? 'Se subirá optimizada automáticamente a tu carpeta forestadent_productos.' : 'Cuando agregues CLOUDINARY_URL en Render se subirá automáticamente aquí. Mientras tanto puedes usar el link de abajo.'}
                                    </p>
                                </div>
                                <div>
                                    <label class="block text-[11px] font-bold text-gray-600 uppercase mb-1">O pegar Link de Imagen (Opcional)</label>
                                    <input type="text" id="prod_imagen" placeholder="https://res.cloudinary.com/..." class="w-full border border-amber-300 bg-white text-gray-700 rounded-md p-2 text-xs focus:ring-1 focus:ring-forestaGold outline-none">
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="md:col-span-2">
                        <label class="block text-xs font-extrabold text-gray-600 uppercase mb-1">📄 Descripción Clínica (Para Catálogo Digital)</label>
                        <textarea id="prod_descripcion" rows="4" class="w-full border border-gray-300 rounded-md p-3 text-sm focus:border-forestaGold outline-none" placeholder="Características técnicas, composición, indicaciones..."></textarea>
                    </div>
                </div>

                <div class="bg-gray-50 p-4 border-t border-gray-200 flex justify-end gap-3">
                    <button onclick="cerrarFichaProd()" class="px-5 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg text-xs font-extrabold uppercase shadow-sm hover:bg-gray-50">Cancelar</button>
                    <button onclick="guardarCambiosProd()" id="btnGuardarProd" class="px-6 py-2.5 bg-forestaBlack hover:bg-gray-800 text-white rounded-lg text-xs font-extrabold uppercase shadow-md transition">💾 Sincronizar con IA</button>
                </div>
            </div>
        </div>

        <script>
            // Filtros en Tiempo Real
            function filtrarCatalogo() {
                const busqueda = document.getElementById('filtroBuscadorProd').value.toLowerCase();
                const categoria = document.getElementById('filtroCategoria').value;
                const filas = document.querySelectorAll('.fila-producto');
                
                filas.forEach(fila => {
                    const fSku = fila.getAttribute('data-sku');
                    const fNombre = fila.getAttribute('data-nombre');
                    const fCat = fila.getAttribute('data-categoria');
                    
                    const coincideBusqueda = fSku.includes(busqueda) || fNombre.includes(busqueda);
                    const coincideCategoria = categoria === 'todos' || fCat === categoria;
                    
                    if (coincideBusqueda && coincideCategoria) fila.style.display = '';
                    else fila.style.display = 'none';
                });
            }

            // Alta Rápida
            async function crearProd(){
                const codigo = document.getElementById('nuevoCodigo').value;
                const nombre = document.getElementById('nuevoNombre').value;
                const precio = Number(document.getElementById('nuevoPrecio').value);
                if(!codigo || !nombre || !precio) return alert('Completa SKU, nombre y precio para el alta rápida.');
                
                document.getElementById('btnCrear').innerText = '⏳ Creando...';
                await fetch('/admin/catalogo/crear', {
                    method:'POST', 
                    headers:{'Content-Type':'application/json'}, 
                    body:JSON.stringify({codigo, nombre, precio})
                });
                location.reload();
            }

            // Vista previa instantánea al elegir archivo
            function previsualizarArchivoProd(event) {
                const archivo = event.target.files && event.target.files[0];
                if (!archivo) return;
                const reader = new FileReader();
                reader.onload = function(e) {
                    document.getElementById('prod_preview_img').src = e.target.result;
                };
                reader.readAsDataURL(archivo);
            }

            // Modal: Abrir y Cerrar Ficha
            function abrirFichaProd(prod) {
                document.getElementById('prod_id').value = prod.id;
                document.getElementById('prod_codigo').value = prod.codigo;
                document.getElementById('prod_nombre').value = prod.nombre;
                document.getElementById('prod_categoria').value = prod.categoria;
                document.getElementById('prod_precio').value = prod.precio;
                document.getElementById('prod_empaque').value = prod.empaque || '';
                document.getElementById('prod_imagen').value = prod.imagen_url || '';
                document.getElementById('prod_imagen_file').value = '';
                document.getElementById('prod_preview_img').src = prod.imagen_url || 'https://placehold.co/150x150/f3f4f6/a1a1aa?text=Sin+Foto';
                document.getElementById('prod_descripcion').value = prod.descripcion || '';
                
                document.getElementById('modalProd').classList.remove('hidden');
            }

            function cerrarFichaProd() {
                document.getElementById('modalProd').classList.add('hidden');
            }

            // Guardar Cambios Detallados (Soporta subida de imagen por FormData)
            async function guardarCambiosProd() {
                const btn = document.getElementById('btnGuardarProd');
                btn.disabled = true;
                btn.innerText = '⏳ Subiendo y sincronizando...';

                const formData = new FormData();
                formData.append('id', document.getElementById('prod_id').value);
                formData.append('nombre', document.getElementById('prod_nombre').value);
                formData.append('categoria', document.getElementById('prod_categoria').value);
                formData.append('precio', document.getElementById('prod_precio').value);
                formData.append('empaque', document.getElementById('prod_empaque').value);
                formData.append('imagen_url', document.getElementById('prod_imagen').value);
                formData.append('descripcion', document.getElementById('prod_descripcion').value);

                const fileInput = document.getElementById('prod_imagen_file');
                if (fileInput.files && fileInput.files[0]) {
                    formData.append('imagen_file', fileInput.files[0]);
                }

                try {
                    const res = await fetch('/admin/catalogo/actualizar', { 
                        method: 'POST', 
                        body: formData
                    });
                    const result = await res.json();
                    if (result.success) {
                        if (result.aviso) alert('⚠️ ' + result.aviso);
                        else alert('✅ Producto actualizado e indexado');
                        location.reload();
                    } else {
                        alert('❌ ' + (result.error || 'Error al actualizar'));
                        btn.disabled = false;
                        btn.innerText = '💾 Sincronizar con IA';
                    }
                } catch(e) {
                    alert('❌ Error de red');
                    btn.disabled = false;
                    btn.innerText = '💾 Sincronizar con IA';
                }
            }
        </script>
        </div></body></html>`);
    } catch (e) {
        console.error('❌ Error en /admin/catalogo:', e);
        res.status(500).send('Error en catálogo');
    }
});

router.post('/admin/catalogo/actualizar', manejarSubidaImagen('imagen_file'), async (req, res) => {
    try {
        if (req.errorSubida) {
            return res.json({ success: false, error: req.errorSubida });
        }

        const prod = await Producto.findById(req.body.id);
        if (!prod) {
            return res.json({ success: false, error: 'Producto no encontrado.' });
        }

        let nuevaImagenUrl = (req.body.imagen_url || '').trim();
        let nuevoPublicId = prod.imagen_public_id || '';
        let aviso = '';

        // Si el administrador seleccionó un archivo para subir
        if (req.file && req.file.buffer) {
            if (cloudinaryEstaConfigurado()) {
                const subida = await subirImagenCloudinary(req.file.buffer, 'forestadent_productos');
                if (prod.imagen_public_id && prod.imagen_public_id !== subida.public_id) {
                    await eliminarImagenCloudinary(prod.imagen_public_id);
                }
                nuevaImagenUrl = subida.url;
                nuevoPublicId = subida.public_id;
            } else {
                aviso = 'Los textos y el precio sí se guardaron, pero todavía falta agregar CLOUDINARY_URL en Render para subir archivos de foto.';
            }
        }

        prod.nombre = (req.body.nombre || prod.nombre).trim();
        prod.categoria = (req.body.categoria || 'General').trim();
        prod.precio = Number(req.body.precio || 0);
        if (typeof req.body.empaque === 'string') {
            prod.empaque = req.body.empaque.trim();
        }
        prod.imagen_url = nuevaImagenUrl;
        prod.imagen_public_id = nuevoPublicId;
        prod.descripcion = (req.body.descripcion || '').trim();

        await prod.save();
        res.json({ success: true, aviso });
    } catch (e) {
        console.error('❌ Error actualizando producto:', e);
        res.json({ success: false, error: 'Error subiendo imagen o guardando cambios.' });
    }
});

router.post('/admin/catalogo/crear', async (req, res) => {
    try { 
        await new Producto({ 
            codigo: req.body.codigo, 
            nombre: req.body.nombre, 
            precio: req.body.precio, 
            categoria: 'General',
            stock_actual: 10, 
            stock_seguridad: 5, 
            lead_time_dias: 30 
        }).save(); 
        res.json({success:true}); 
    } catch (e) { res.json({success:false}); }
});

module.exports = router;