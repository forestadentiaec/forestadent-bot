require('dotenv').config();

async function consultarModelos() {
    console.log("⏳ Conectando con los servidores oficiales de Google Gemini...");
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.error) {
            return console.error("❌ Error de la API:", data.error.message);
        }

        console.log("\n✅ === MODELOS GEMINI DISPONIBLES PARA TU CUENTA ===");
        data.models.forEach(modelo => {
            // Filtramos para mostrar solo la familia Gemini y hacer la lista más limpia
            if(modelo.name.includes('gemini')) {
                console.log(`🔹 ID del Modelo: ${modelo.name.replace('models/', '')}`);
            }
        });
        console.log("====================================================\n");
        
    } catch (error) {
        console.error("❌ Error de conexión:", error);
    }
}

consultarModelos();