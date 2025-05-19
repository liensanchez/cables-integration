// src/services/odooService.js
const { call } = require("../utils/odooRpc");
require("dotenv").config();

class OdooService {
    constructor() {
        // If needed, add configuration here (e.g., session, auth)
    }

    async getInventory() {
        try {
            const productIds = await call("product.product", "search", [
                [["default_code", "!=", false]],
            ]);

            if (!productIds.length) return [];

            const products = await call("product.product", "read", [
                productIds,
                ["default_code", "qty_available"],
            ]);

            return products.map((prod) => ({
                meliId: prod.default_code,
                availableQuantity: prod.qty_available,
            }));
        } catch (err) {
            console.error(
                "❌ Failed to fetch inventory from Odoo:",
                err.message
            );
            throw err;
        }
    }

    async pushOrdersToOdoo(meliOrders) {
        const results = [];

        for (const order of meliOrders) {
            try {
                const partnerName =
                    order.buyer_nickname || "MercadoLibre Buyer";

                // Step 1: Find or create the customer
                const partnerIds = await call("res.partner", "search", [
                    [["name", "=", partnerName]],
                ]);
                let partnerId = partnerIds.length
                    ? partnerIds[0]
                    : await call("res.partner", "create", [
                          {
                              name: partnerName,
                              email: `${order.orderId}@meli.local`,
                          },
                      ]);

                // Step 2: Create sale order
                const saleOrderId = await call("sale.order", "create", [
                    {
                        partner_id: partnerId,
                        origin: `MELI-${order.orderId}`,
                        note: `Imported from Mercado Libre on ${order.date_created}`,
                    },
                ]);

                // Step 3: Add order items
                for (const item of order.order_items) {
                    // Find product by SKU (default_code in Odoo)
                    const productIds = await call("product.product", "search", [
                        [["default_code", "=", item.sku]],
                    ]);

                    if (!productIds.length) {
                        console.warn(
                            `Product with SKU ${item.sku} not found in Odoo`
                        );
                        continue;
                    }

                    const productId = productIds[0];

                    await call("sale.order.line", "create", [
                        {
                            order_id: saleOrderId,
                            product_id: productId,
                            name: item.title || `Product ${item.sku}`,
                            product_uom_qty: item.quantity,
                            price_unit: item.unit_price,
                        },
                    ]);
                }

                results.push({
                    orderId: order.orderId,
                    status: "created",
                    saleOrderId,
                });
            } catch (err) {
                console.error("Error pushing order to Odoo:", err.message);
                results.push({
                    orderId: order.orderId,
                    status: "error",
                    error: err.message,
                });
            }
        }

        return results;
    }
}

module.exports = OdooService;
