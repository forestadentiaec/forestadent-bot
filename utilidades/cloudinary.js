const cloudinary = require('cloudinary').v2;
const multer = require('multer');

// ==========================================
// 1. VERIFICACIÓN Y CONFIGURACIÓN SEGURA
// ==========================================
function cloudinaryEstaConfigurado() {
    if (process.env.CLOUDINARY_URL && process.env.CLOUDINARY_URL.trim() !== '') {
        return true;
    }
    return Boolean(
        process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET
    );
}

if (cloudinaryEstaConfigurado()) {
    if (process.env.CLOUDINARY_URL) {
        cloudinary.config({ secure: true });
    } else {
        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET,
            secure: true
        });
    }
    console.log('✅ Cloudinary configurado y listo para recibir imágenes');
} else {
    console.log('ℹ️ Cloudinary aún no configurado (CLOUDINARY_URL pendiente). El sistema operará normalmente con URLs.');
}

// ==========================================
// 2. MULTER EN MEMORIA (NO ESCRIBE EN EL DISCO DE RENDER)
// ==========================================
const uploadMemoria = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // Máximo 5 MB por imagen
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype && file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos de imagen (JPG, PNG, WEBP, GIF).'));
        }
    }
});

// Middleware seguro compatible con todas tus rutas (catálogo y clínicas)
function subirImagenUnica(nombreCampo) {
    return (req, res, next) => {
        uploadMemoria.single(nombreCampo)(req, res, (err) => {
            if (err) {
                const mensajeError = err.code === 'LIMIT_FILE_SIZE'
                    ? 'La imagen supera el límite de 5 MB.'
                    : (err.message || 'Archivo de imagen no válido.');
                req.errorSubidaImagen = mensajeError;
                req.errorSubida = mensajeError;
            }
            next();
        });
    };
}

// ==========================================
// 3. SUBIDA CON OPTIMIZACIÓN AUTOMÁTICA (AHORRA PLAN FREE)
// ==========================================
function subirBufferACloudinary(buffer, carpeta = 'forestadent_general', maxLado = 1000) {
    return new Promise((resolve, reject) => {
        if (!cloudinaryEstaConfigurado()) {
            return reject(new Error('CLOUDINARY_NO_CONFIGURADO'));
        }

        const stream = cloudinary.uploader.upload_stream(
            {
                folder: carpeta,
                resource_type: 'image',
                transformation: [
                    { width: maxLado, height: maxLado, crop: 'limit' },
                    { quality: 'auto:good', fetch_format: 'auto' }
                ]
            },
            (error, result) => {
                if (error) return reject(error);
                resolve({
                    url: result.secure_url,
                    public_id: result.public_id
                });
            }
        );

        stream.end(buffer);
    });
}

// ==========================================
// 4. LIMPIEZA DE IMAGEN ANTERIOR EN CLOUDINARY
// ==========================================
async function eliminarDeCloudinary(publicId) {
    if (!publicId || !cloudinaryEstaConfigurado()) return;
    try {
        await cloudinary.uploader.destroy(publicId);
    } catch (error) {
        console.error('⚠️ No se pudo eliminar imagen anterior en Cloudinary:', error.message);
    }
}

module.exports = {
    cloudinaryEstaConfigurado,
    // Nombres usados en admin_clinicas.js y clinicas_publico.js
    subirImagenUnica,
    subirBufferACloudinary,
    eliminarDeCloudinary,
    // Alias exactos usados en admin_catalogo.js
    manejarSubidaImagen: subirImagenUnica,
    subirImagenCloudinary: subirBufferACloudinary,
    eliminarImagenCloudinary: eliminarDeCloudinary
};