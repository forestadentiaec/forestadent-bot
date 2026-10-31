const htmlHead = `
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="https://cdn.tailwindcss.com"></script>
<script>
    tailwind.config = {
        theme: {
            extend: {
                colors: {
                    forestaBlack: '#111111',
                    forestaGold: '#B4975A'
                }
            }
        }
    }
</script>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800&display=swap" rel="stylesheet">
<style>
    body { font-family: 'Inter', sans-serif; }
    /* Estilos para ocultar elementos al imprimir */
    @media print {
        .hide-on-print { display: none !important; }
    }
</style>
`;

const menuNavegacion = `
<div class="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-center mb-8 gap-4 border-t-4 border-t-forestaGold hide-on-print">
    
    <!-- Sección de Logo y Título -->
    <div class="flex items-center gap-6">
        <img src="/logo-vector-forestadent.webp" alt="Forestadent" class="h-20 object-contain drop-shadow-sm" onerror="this.style.display='none'">
        <div class="border-l-2 border-gray-200 pl-5">
            <h1 class="text-2xl font-extrabold tracking-tight text-forestaBlack uppercase">Torre de Control</h1>
            <p class="text-[10px] text-gray-500 font-extrabold tracking-widest uppercase">Forestadent B2B Ecuador</p>
        </div>
    </div>
    
    <!-- Botonera de Navegación -->
    <div class="flex flex-wrap gap-2 justify-center">
        <a href="/admin/dashboard" class="px-3 py-2 rounded-md text-xs font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 transition shadow-sm">📊 Dashboard</a>
        <a href="/admin" class="px-3 py-2 rounded-md text-xs font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 transition shadow-sm">📦 Pedidos</a>
        <a href="/admin/clientes" class="px-3 py-2 rounded-md text-xs font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 transition shadow-sm">👥 CRM</a>
        <a href="/admin/broadcast" class="px-3 py-2 rounded-md text-xs font-bold text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 transition shadow-sm">📢 Broadcast</a>
        <a href="/admin/inventario" class="px-3 py-2 rounded-md text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition shadow-sm">📦 Inventario IA</a>
        <a href="/admin/catalogo" class="px-3 py-2 rounded-md text-xs font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 transition shadow-sm">⚙️ Catálogo</a>
    </div>
</div>
`;

module.exports = { htmlHead, menuNavegacion };