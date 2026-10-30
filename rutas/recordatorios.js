const express = require('express');
const router = express.Router();
const { Campana, Ticket } = require('../modelos/BaseDatos');

// FUNCIÓN QUE VERIFICA Y DISPARA RECORDATORIOS CADA CIERTO TIEMPO
async function verificarEventosProximos() {
    try {
        const ahora = new Date();
        // Buscamos campañas que tengan fecha de evento futura y que AÚN NO hayan enviado recordatorio
        const campanasPendientes = await Campana.find({
            fecha_evento: { $ne: null, $gt: ahora },
            recordatorio_enviado: false
        });

        for (const camp of campanasPendientes) {
            const diferenciaHoras = (new Date(camp.fecha_evento) - ahora) / (1000 * 60 * 60);

            // Si faltan 24 horas (o menos) para el evento, disparamos la alerta automática
            if (diferenciaHoras <= 24 && diferenciaHoras > 0) {
                console.log(`⏰ [RECORDATORIO] Disparando alertas para el evento: ${camp.nombre_campana}`);

                // Buscamos todos los tickets pagados/emitidos para este evento
                const ticketsEvento = await Ticket.find({ nombre_evento: camp.nombre_campana });

                for (const t of ticketsEvento) {
                    const mensajeRecordatorio = `⏰ *¡Recordatorio Oficial Forestadent!*\n\nEstimado/a *${t.nombre_cliente}*,\n\nTe recordamos que el evento *${camp.nombre_campana}* está próximo a realizarse (mañana).\n\n🎟️ *Tu Ticket VIP:* ${t.id_unico}\n\n¡Te esperamos! No olvides llevar tu código QR para el ingreso en la puerta. ✨`;

                    await fetch(`https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            messaging_product: 'whatsapp',
                            to: t.telefono_cliente,
                            type: 'text',
                            text: { body: mensajeRecordatorio }
                        })
                    });

                    // Pausa de cortesía entre mensajes para evitar bloqueos de Meta
                    await new Promise(r => setTimeout(r, 500));
                }

                // Marcamos la campaña como recordatorio enviado para que no se repita
                camp.recordatorio_enviado = true;
                await camp.save();
                console.log(`✅ [RECORDATORIO] Alertas enviadas exitosamente para: ${camp.nombre_campana}`);
            }
        }
    } catch (e) {
        console.error("Error en el motor de recordatorios:", e);
    }
}

// Activamos el "reloj" para que revise la base de datos cada 10 minutos automáticamente
setInterval(verificarEventosProximos, 10 * 60 * 1000);

module.exports = router;