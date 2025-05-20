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

    /* async pushOrdersToOdoo(meliOrders) {
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

                // Step 4: Confirm the sale order (creates stock moves)
                await call("sale.order", "action_confirm", [saleOrderId]);

                // Step 5: Create and validate the delivery
                const pickingIds = await call("stock.picking", "search", [
                    [
                        ["origin", "=", `MELI-${order.orderId}`],
                        ["state", "!=", "done"],
                    ],
                ]);

                if (pickingIds.length > 0) {
                    // Validate each picking (delivery)
                    for (const pickingId of pickingIds) {
                        await call("stock.picking", "action_assign", [
                            pickingId,
                        ]);
                        await call("stock.picking", "button_validate", [
                            pickingId,
                        ]);
                    }
                }

                results.push({
                    orderId: order.orderId,
                    status: "completed",
                    saleOrderId,
                    inventoryUpdated: true,
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
    } */

    async pushOrdersToOdoo(meliOrders) {
        const results = [];

        for (const order of meliOrders) {
            try {
                const partnerName =
                    order.buyer?.nickname ||
                    order.buyer_nickname ||
                    "MercadoLibre Buyer";
                    
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
                        // Set order as paid if payment is confirmed
                        invoice_status: "to invoice", // or 'invoiced' if already paid
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

                // Step 4: Confirm the sale order (creates stock moves)
                await call("sale.order", "action_confirm", [saleOrderId]);

                // Step 5: Process delivery to deduct inventory
                const pickingIds = await call("stock.picking", "search", [
                    [
                        ["origin", "=", `MELI-${order.orderId}`],
                        ["state", "!=", "done"],
                        ["picking_type_code", "=", "outgoing"],
                    ],
                    { limit: 1 }, // Get the first outgoing picking
                ]);

                if (pickingIds.length > 0) {
                    const pickingId = pickingIds[0];

                    // Force availability of products
                    await call("stock.picking", "action_assign", [pickingId]);

                    // Validate the picking (deducts inventory)
                    const validationResult = await call(
                        "stock.picking",
                        "button_validate",
                        [pickingId]
                    );

                    // Handle immediate transfer (if needed)
                    if (validationResult && validationResult.res_id) {
                        await call("stock.immediate.transfer", "process", [
                            validationResult.res_id,
                        ]);
                    }
                } else {
                    console.warn(
                        `No outgoing picking found for order MELI-${order.orderId}`
                    );
                }

                // Optional: Create and validate invoice if payment is confirmed
                if (order.payment_status === "paid") {
                    const invoiceId = await call(
                        "sale.order",
                        "action_invoice_create",
                        [[saleOrderId], { grouped: false }]
                    );

                    if (invoiceId && invoiceId.length) {
                        await call("account.invoice", "action_invoice_open", [
                            invoiceId[0],
                        ]);
                        await call("account.invoice", "action_invoice_paid", [
                            invoiceId[0],
                        ]);
                    }
                }

                results.push({
                    orderId: order.orderId,
                    status: "completed",
                    saleOrderId,
                    inventoryUpdated: true,
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
