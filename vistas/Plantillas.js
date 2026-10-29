// --- CONFIGURACIÓN VISUAL DEL PORTAL ---

const htmlHead = `
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap" rel="stylesheet">
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
    <script>
        tailwind.config = { 
            theme: { 
                extend: { 
                    colors: { forestaBlack: '#111111', forestaGold: '#B4975A', forestaGoldHover: '#9a814b' }, 
                    fontFamily: { sans: ['Montserrat', 'sans-serif'] } 
                } 
            } 
        }
    </script>
`;

const menuNavegacion = `
    <div class="flex justify-between items-center mb-6 bg-white p-6 rounded-xl shadow-sm border-t-4 border-forestaGold">
        <div class="flex items-center gap-6">
            <img src="/logo-vector-forestadent.webp" alt="Logo" class="h-16 object-contain" onerror="this.style.display='none'">
            <div>
                <h1 class="text-3xl font-extrabold text-forestaBlack uppercase tracking-wider">Torre de Control</h1>
                <p class="text-sm text-forestaGold font-bold tracking-widest uppercase">Ecuador B2B</p>
            </div>
        </div>
        <span class="bg-forestaGold text-white px-5 py-2 rounded shadow font-bold text-sm uppercase tracking-wide">🟢 Sistema Activo</span>
    </div>
    <div class="flex flex-wrap gap-3 mb-8">
        <a href="/admin/dashboard" class="bg-blue-900 hover:bg-blue-800 text-white px-5 py-3 rounded shadow font-bold uppercase text-xs">📊 Dashboard BI</a>
        <a href="/admin" class="bg-forestaBlack hover:bg-gray-800 text-white px-5 py-3 rounded shadow font-bold uppercase text-xs">📦 Pedidos</a>
        <a href="/admin/clientes" class="bg-forestaGold hover:bg-forestaGoldHover text-white px-5 py-3 rounded shadow font-bold uppercase text-xs">👥 CRM</a>
        <a href="/admin/catalogo" class="bg-white border-2 border-forestaBlack text-forestaBlack hover:bg-gray-50 px-5 py-3 rounded shadow font-bold uppercase text-xs">📖 Catálogo</a>
        <a href="/admin/broadcast" class="bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded shadow font-bold uppercase text-xs">📢 Cursos & Broadcast</a>
    </div>
`;

const scriptExportarExcel = `
    <script>
        function exportarExcel(n) { 
            let wb = XLSX.utils.table_to_book(document.querySelector("table")); 
            XLSX.writeFile(wb, n + ".xlsx"); 
        }
    </script>
`;

// 🚨 EXPORTAMOS LOS DISEÑOS PARA USARLOS EN LAS PANTALLAS
module.exports = {
    htmlHead,
    menuNavegacion,
    scriptExportarExcel
};