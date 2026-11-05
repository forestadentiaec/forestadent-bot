const express = require('express');
const router = express.Router();

// Ruta de la Landing Page pública
router.get('/', (req, res) => {
    res.render('index'); // Llama al archivo index.ejs que creaste en la carpeta vistas/
});

module.exports = router;