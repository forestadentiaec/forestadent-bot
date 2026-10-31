const express = require('express');
const router = express.Router();
const { htmlHead } = require('../vistas/Plantillas');

// ==========================================
// 1. PANTALLA VISUAL DE LOGIN
// ==========================================
router.get('/login', (req, res) => {
    // Si ya tiene la llave, lo mandamos directo al dashboard sin pedir clave
    if (req.session && req.session.adminLogueado) return res.redirect('/admin/dashboard');
    
    res.send(`
    <!DOCTYPE html><html><head><title>Login | Torre de Control</title>${htmlHead}</head>
    <body class="bg-gray-100 h-screen flex items-center justify-center p-4">
        <div class="bg-white p-8 rounded-xl shadow-xl w-full max-w-md border-t-8 border-forestaGold">
            <div class="text-center mb-8">
                <img src="/logo-vector-forestadent.webp" class="h-20 mx-auto mb-4 object-contain" onerror="this.style.display='none'">
                <h2 class="text-2xl font-extrabold uppercase text-forestaBlack tracking-tight">Acceso Restringido</h2>
                <p class="text-xs text-gray-500 font-bold mt-1 tracking-widest uppercase">Forestadent B2B Ecuador</p>
            </div>
            <form action="/login" method="POST" class="flex flex-col gap-4">
                <div>
                    <label class="block text-xs font-extrabold text-gray-600 uppercase mb-1 tracking-wide">Usuario Corporativo</label>
                    <input type="text" name="usuario" required class="w-full border border-gray-300 rounded-md p-3 text-sm focus:ring-2 focus:ring-forestaGold focus:border-forestaGold outline-none">
                </div>
                <div>
                    <label class="block text-xs font-extrabold text-gray-600 uppercase mb-1 tracking-wide">Contraseña</label>
                    <input type="password" name="password" required class="w-full border border-gray-300 rounded-md p-3 text-sm focus:ring-2 focus:ring-forestaGold focus:border-forestaGold outline-none">
                </div>
                <button type="submit" class="w-full bg-forestaBlack text-white font-extrabold py-3.5 rounded-lg mt-4 uppercase tracking-widest shadow-md hover:bg-gray-800 transition">Ingresar a la Torre</button>
            </form>
        </div>
    </body></html>
    `);
});

// ==========================================
// 2. PROCESAR CREDENCIALES
// ==========================================
router.post('/login', (req, res) => {
    const { usuario, password } = req.body;
    
    // Credenciales de acceso
    if (usuario === 'nestor' && password === 'Foresta2026!') {
        req.session.adminLogueado = true; // Le damos la llave maestra
        res.redirect('/admin/dashboard');
    } else {
        res.send(`<script>alert('❌ Credenciales incorrectas. Acceso denegado.'); window.location.href='/login';</script>`);
    }
});

// ==========================================
// 3. CERRAR SESIÓN
// ==========================================
router.get('/logout', (req, res) => {
    req.session.destroy(); // Destruye la llave maestra
    res.redirect('/login'); // Te saca al login
});

// ==========================================
// 4. EL CANDADO VIRTUAL (Middleware de seguridad)
// ==========================================
const verificarAutenticacion = (req, res, next) => {
    if (req.session && req.session.adminLogueado) {
        next(); // Tiene la llave, lo dejamos pasar a la ruta que pidió
    } else {
        res.redirect('/login'); // No tiene llave, lo mandamos a la puerta (Login)
    }
};

// 🚨 APLICAMOS EL CANDADO A TODO LO QUE EMPIECE CON /admin 🚨
router.use('/admin', verificarAutenticacion);

// ==========================================
// 5. ARQUITECTURA MODULAR (Los módulos protegidos)
// ==========================================
router.use(require('./admin_pedidos'));
router.use(require('./admin_inventario'));
router.use(require('./admin_crm'));
router.use(require('./admin_broadcast'));
router.use(require('./admin_catalogo'));

module.exports = router;