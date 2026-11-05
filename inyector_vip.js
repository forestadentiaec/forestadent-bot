require('dotenv').config();
const mongoose = require('mongoose');
const { Producto } = require('./modelos/BaseDatos');

const productosVIP = [
    { sku: "FQ-01", nombre: "Brackets Autoligado Cerámicos Quicklear (MBT/Face)", precio: 320, empaque: "Caso completo (más IVA)", categoria: "Brackets Estéticos" },
    { sku: "FMS-01", nombre: "Brackets Mini Sprint Face", precio: 100, empaque: "Caso completo individual (incl. IVA)", categoria: "Brackets Metálicos" },
    { sku: "FMS-10", nombre: "Promo 10 Casos Mini Sprint Face", precio: 800, empaque: "10 Casos completos (incl. IVA)", categoria: "Brackets Metálicos" },
    { sku: "FOE-01", nombre: "Mini Implante Orto Easy", precio: 156.50, empaque: "Unidad (más IVA)", categoria: "Anclaje Esquelético" },
    { sku: "FOE-KIT", nombre: "Kit 5 Mini Implantes Orto Easy (6, 8, 10mm)", precio: 180, empaque: "Kit (incl. IVA)", categoria: "Anclaje Esquelético" },
    { sku: "FEE-01", nombre: "Brackets Easy Eco Roth-MBT", precio: 85, empaque: "Caso completo (incl. IVA)", categoria: "Brackets Metálicos" },
    { sku: "FEE-10", nombre: "Promo 10 Casos Easy Eco (Sin arcos/tubos)", precio: 252, empaque: "10 Casos (más IVA)", categoria: "Brackets Metálicos" },
    { sku: "FHY-12", nombre: "Tornillo de Disyunción Hyrax Slim 12mm", precio: 38, empaque: "Unidad", categoria: "Expansión" },
    { sku: "FHY-13", nombre: "Tornillo de Disyunción Hyrax 13mm", precio: 28, empaque: "Unidad", categoria: "Expansión" },
    { sku: "FBQ-01", nombre: "Brackets BioQuick 5ta Gen (Roth/MBT/Face)", precio: 199, empaque: "Caso completo (incl. IVA)", categoria: "Brackets Autoligado" },
    { sku: "FBQ-POS", nombre: "Brackets BioQuick 5ta Gen (Promo Estudiante Posgrado)", precio: 155.65, empaque: "Caso completo (más IVA)", categoria: "Brackets Autoligado" },
    { sku: "FTR-05", nombre: "Láminas Termoformadoras Track 0.5mm", precio: 189, empaque: "Caja (incl. IVA)", categoria: "Alineadores" },
    { sku: "FTR-08", nombre: "Láminas Termoformadoras Track 0.8mm", precio: 199, empaque: "Caja (incl. IVA)", categoria: "Alineadores" },
    { sku: "FTR-10", nombre: "Láminas Termoformadoras Track 1.0mm", precio: 229, empaque: "Caja (incl. IVA)", categoria: "Alineadores" },
    { sku: "FTR-15", nombre: "Láminas Termoformadoras Track 1.5mm", precio: 184, empaque: "Caja (incl. IVA)", categoria: "Alineadores" }
];

async function inyectarVIP() {
    try {
        console.log("⏳ Conectando a MongoDB Atlas...");
        await mongoose.connect(process.env.MONGO_URI);
        
        console.log("🧹 Limpiando catálogo anterior...");
        await Producto.deleteMany({});
        
        console.log("🚀 Inyectando productos de Alta Rotación VIP...");
        await Producto.insertMany(productosVIP);
        
        console.log("✅ ¡Catálogo VIP cargado con éxito! Tienes " + productosVIP.length + " SKUs activos.");
        process.exit();
    } catch (error) {
        console.error("❌ Error:", error);
        process.exit(1);
    }
}

inyectarVIP();