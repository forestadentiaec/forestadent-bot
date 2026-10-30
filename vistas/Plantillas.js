// CONFIGURACIÓN VISUAL BASE (Librerías, Tailwind CSS y Colores Corporativos)
const htmlHead = `
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <!-- Tailwind para el diseño -->
    <script src="https://cdn.tailwindcss.com"></script>
    <!-- Chart.js para los gráficos del Dashboard -->
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <!-- HTML2PDF para generar proformas -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
    <!-- SheetJS para exportar Excel de los Diplomas -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
    
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        forestaBlack: '#111111',
                        forestaGold: '#B4975A',
                        forestaGoldHover: '#9A804B'
                    }
                }
            }
        }
    </script>
    <style>
        body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    </style>
`;

// MENÚ DE NAVEGACIÓN SUPERIOR GLOBAL
const menuNavegacion = `
    <div class="flex justify-between items-center mb-8 bg-white p-6 rounded-xl shadow-sm border-t-4 border-forestaGold">
        <div>
            <h1 class="text-3xl font-extrabold text-forestaBlack tracking-tight uppercase">Torre de Control</h1>
            <p class="text-gray-500 font-medium text-sm mt-1">Forestadent B2B Ecuador</p>
        </div>
        <nav class="flex gap-3">
            <a href="/admin/dashboard" class="bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-bold text-sm transition shadow-sm">📊 Dashboard</a>
            <a href="/admin" class="bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-bold text-sm transition shadow-sm">📦 Pedidos</a>
            <a href="/admin/clientes" class="bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-bold text-sm transition shadow-sm">👥 CRM</a>
            <a href="/admin/broadcast" class="bg-green-50 hover:bg-green-100 text-green-800 px-4 py-2 rounded-lg font-bold text-sm transition border border-green-200 shadow-sm">📢 Cursos & Broadcast</a>
            <a href="/admin/inventario" class="bg-blue-50 hover:bg-blue-100 text-blue-800 px-4 py-2 rounded-lg font-bold text-sm transition border border-blue-200 shadow-sm">📦 Inventario IA</a>
            <a href="/admin/catalogo" class="bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-bold text-sm transition shadow-sm">⚙️ Catálogo</a>
        </nav>
    </div>
`;

module.exports = { htmlHead, menuNavegacion };