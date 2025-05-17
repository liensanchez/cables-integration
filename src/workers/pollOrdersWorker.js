
const MercadoLibreService = require("../services/mercadolibre/meliService");
const meliService = new MercadoLibreService();



setInterval(async () => {
    try {
        console.log("🔄 Auto-fetching orders...");
        const orders = await meliService.getUserOrders();
        console.log(`✅ Synced ${orders.length} orders`);
    } catch (err) {
        console.error("❌ Error during background fetch:", err.message);
    }
}, 30 * 1000);