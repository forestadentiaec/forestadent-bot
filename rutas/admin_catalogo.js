const express = require('express');
const router = express.Router();
const { Producto } = require('../modelos/BaseDatos');
const { htmlHead, menuNavegacion } = require('../vistas/Plantillas');

router.get('/admin/catalogo', async (req, res) => {
    try {
        const prod = await Producto.find().sort({ categoria: 1, nombre: 1 });
        let filas = prod.map(p => `<tr class="border-b hover:bg-gray-50"><td class="p-4 font-bold text-gray-800">${p.codigo}</td><td class="p-4"><input type="text" id="nom_${p._id}" value="${p.nombre}" class="border p-2 rounded w-full text-sm"></td><td class="p-4"><input type="text" id="cat_${p._id}" value="${p.categoria || 'General'}" class="border p-2 rounded w-full text-sm"></td><td class="p-4"><input type="number" step="0.01" id="pre_${p._id}" value="${p.precio}" class="border-2 border-blue-200 p-2 rounded w-28 text-center font-extrabold text-blue-700"></td><td class="p-4 text-center"><button onclick="guardarProd('${p._id}')" class="bg-forestaBlack text-white px-4 py-2 rounded text-xs font-bold hover:bg-gray-800">💾 Actualizar</button></td></tr>`).join('');
        res.send(`<!DOCTYPE html><html><head><title>Catálogo Vivo</title>${htmlHead}</head><body class="bg-gray-50 p-8"><div class="max-w-7xl mx-auto">${menuNavegacion}<div class="bg-white p-6 rounded-xl shadow mb-8 border-l-8 border-forestaGold"><h3 class="text-lg font-extrabold uppercase mb-4">➕ Crear Nuevo Producto / SKU</h3><div class="grid grid-cols-1 md:grid-cols-5 gap-4"><input type="text" id="nuevoCodigo" placeholder="SKU (Ej: 206-1010)" class="border p-2.5 rounded font-bold text-sm"><input type="text" id="nuevoNombre" placeholder="Nombre del Producto" class="border p-2.5 rounded text-sm md:col-span-2"><input type="number" step="0.01" id="nuevoPrecio" placeholder="Precio USD" class="border p-2.5 rounded font-bold text-sm"><button onclick="crearProd()" class="bg-forestaGold text-white font-bold rounded px-4 py-2.5 text-sm shadow hover:bg-yellow-600">➕ Agregar al Catálogo</button></div></div><div class="bg-white rounded-xl shadow overflow-hidden"><table class="w-full text-left"><thead><tr class="bg-forestaBlack text-white text-xs uppercase"><th class="p-4">SKU</th><th class="p-4">Nombre</th><th class="p-4">Categoría</th><th class="p-4">Precio USD</th><th class="p-4 text-center">Acción</th></tr></thead><tbody>${filas}</tbody></table></div><script>async function guardarProd(id){ await fetch('/admin/catalogo/actualizar', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, nombre: document.getElementById('nom_'+id).value, categoria: document.getElementById('cat_'+id).value, precio: Number(document.getElementById('pre_'+id).value)})}); alert('✅ Producto actualizado'); location.reload(); } async function crearProd(){ const codigo = document.getElementById('nuevoCodigo').value; const nombre = document.getElementById('nuevoNombre').value; const precio = Number(document.getElementById('nuevoPrecio').value); if(!codigo || !nombre || !precio) return alert('Completa datos'); await fetch('/admin/catalogo/crear', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({codigo, nombre, precio})}); location.reload(); }</script></div></body></html>`);
    } catch (e) { res.status(500).send('Error en catálogo'); }
});

router.post('/admin/catalogo/actualizar', async (req, res) => {
    try { await Producto.findByIdAndUpdate(req.body.id, { nombre: req.body.nombre, categoria: req.body.categoria, precio: req.body.precio }); res.json({success:true}); } catch (e) { res.json({success:false}); }
});

router.post('/admin/catalogo/crear', async (req, res) => {
    try { await new Producto({ codigo: req.body.codigo, nombre: req.body.nombre, precio: req.body.precio, stock_actual: 10, stock_seguridad: 5, lead_time_dias: 30 }).save(); res.json({success:true}); } catch (e) { res.json({success:false}); }
});

module.exports = router;