const express = require('express');
const router = express.Router();

// Arquitectura Modular de la Torre de Control
router.use(require('./admin_pedidos'));
router.use(require('./admin_inventario'));
router.use(require('./admin_crm'));
router.use(require('./admin_broadcast'));
router.use(require('./admin_catalogo'));

module.exports = router;