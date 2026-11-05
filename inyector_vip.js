require('dotenv').config();
const mongoose = require('mongoose');
const { Producto } = require('./modelos/BaseDatos');

const productosVIP = [
    { codigo: "FQ-01", nombre: "Brackets Autoligado Cerámicos Quicklear (MBT/Face)", precio: 320, empaque: "Caso completo (más IVA)", categoria: "Brackets Estéticos", stock_actual: 100 },
    { codigo: "FMS-01", nombre: "Brackets Mini Sprint Face", precio: 100, empaque: "Caso completo individual (incl. IVA)", categoria: "Brackets Metálicos", stock_actual: 100 },
    { codigo: "FMS-10", nombre: "Promo 10 Casos Mini Sprint Face", precio: 800, empaque: "10 Casos completos (incl. IVA)", categoria: "Brackets Metálicos", stock_actual: 100 },
    { codigo: "FOE-01", nombre: "Mini Implante Orto Easy", precio: 156.50, empaque: "Unidad (más IVA)", categoria: "Anclaje Esquelético", stock_actual: 100 },
    { codigo: "FOE-KIT", nombre: "Kit 5 Mini Implantes Orto Easy (6, 8, 10mm)", precio: 180, empaque: "Kit (incl. IVA)", categoria: "Anclaje Esquelético", stock_actual: 100 },
    { codigo: "FEE-01", nombre: "Brackets Easy Eco Roth-MBT", precio: 85, empaque: "Caso completo (incl. IVA)", categoria: "Brackets Metálicos", stock_actual: 100 },
    { codigo: "FEE-10", nombre: "Promo 10 Casos Easy Eco (Sin arcos/tubos)", precio: 252, empaque: "10 Casos (más IVA)", categoria: "Brackets Metálicos", stock_actual: 100 },
    { codigo: "FHY-12", nombre: "Tornillo de Disyunción Hyrax Slim 12mm", precio: 38, empaque: "Unidad", categoria: "Expansión", stock_actual: 100 },
    { codigo: "FHY-13", nombre: "Tornillo de Disyunción Hyrax 13mm", precio: 28, empaque: "Unidad", categoria: "Expansión", stock_actual: 100 },
    { codigo: "FBQ-01", nombre: "Brackets BioQuick 5ta Gen (Roth/MBT/Face)", precio: 199, empaque: "Caso completo (incl. IVA)", categoria: "Brackets Autoligado", stock_actual: 100 },
    { codigo: "FBQ-POS", nombre: "Brackets BioQuick 5ta Gen (Promo Estudiante Posgrado)", precio: 155.65, empaque: "Caso completo (más IVA)", categoria: "Brackets Autoligado", stock_actual: 100 },
    { codigo: "FTR-05", nombre: "Láminas Termoformadoras Track 0.5mm", precio: 189, empaque: "Caja (incl. IVA)", categoria: "Alineadores", stock_actual: 100 },
    { codigo: "FTR-08", nombre: "Láminas Termoformadoras Track 0.8mm", precio: 199, empaque: "Caja (incl. IVA)", categoria: "Alineadores", stock_actual: 100 },
    { codigo: "FTR-10", nombre: "Láminas Termoformadoras Track 1.0mm", precio: 229, empaque: "Caja (incl. IVA)", categoria: "Alineadores", stock_actual: 100 },
    { codigo: "FTR-15", nombre: "Láminas Termoformadoras Track 1.5mm", precio: 184, empaque: "Caja (incl. IVA)", categoria: "Alineadores", stock_actual: 100 }
];

async function inyectarVIP() {
    try {
        console.log("⏳ Conectando a MongoDB Atlas...");
        await mongoose.connect(process.env.MONGO_URI);
        
        console.log("🧹 Limpiando base de datos...");
        await Producto.deleteMany({});
        
        console.log("🚀 Inyectando productos con la estructura correcta...");
        await Producto.insertMany(productosVIP);
        
        console.log("✅ ¡Listo! Base de datos actualizada y 100% compatible con tu Torre de Control.");
        process.exit();
    } catch (error) {
        console.error("❌ Error:", error);
        process.exit(1);
    }
}

inyectarVIP();