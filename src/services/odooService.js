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
                // 1. Create or update customer
                const partnerId = await this.createOrUpdatePartner(order);

                // 2. Create sales order
                const saleOrderId = await this.createSalesOrder(
                    order,
                    partnerId
                );

                // 3. Add order items
                await this.addOrderItems(order, saleOrderId);

                results.push({
                    orderId: order.id,
                    status: "completed",
                    saleOrderId,
                    partnerId,
                });
            } catch (err) {
                console.error("Error pushing order to Odoo:", err);
                results.push({
                    orderId: order.id,
                    status: "error",
                    error: err.message,
                });
            }
        }
        return results;
    }

    async createOrUpdatePartner(order) {
        const partnerName =
            order.buyer?.first_name && order.buyer?.last_name
                ? `${order.buyer.first_name} ${order.buyer.last_name}`
                : order.buyer?.nickname || "MercadoLibre Buyer";

        // Search by identification number or email
        let partnerIds = [];
        if (order.buyer?.identification_number) {
            partnerIds = await call("res.partner", "search", [
                [["vat", "=", order.buyer.identification_number]],
            ]);
        }
        if (!partnerIds.length && order.buyer?.email) {
            partnerIds = await call("res.partner", "search", [
                [["email", "=", order.buyer.email]],
            ]);
        }

        // Prepare partner data
        const partnerData = {
            name: partnerName,
            email: order.buyer?.email || `${order.id}@meli.local`,
            phone: order.buyer?.phone || order.shipping?.receiver_phone || "",
            vat: order.buyer?.identification_number || "",
            street: order.shipping?.address || "",
            comment: `MercadoLibre Buyer\nID: ${order.buyer?.id || ""}\nType: ${order.buyer?.identification_type || ""}`,
        };

        // Create or update
        if (partnerIds.length) {
            await call("res.partner", "write", [[partnerIds[0]], partnerData]);
            return partnerIds[0];
        } else {
            return await call("res.partner", "create", [partnerData]);
        }
    }

    async createSalesOrder(order, partnerId) {
        const note =
            `MercadoLibre Order ID: ${order.id}\n` +
            `Buyer: ${order.buyer?.nickname || ""}\n` +
            `Shipping: ${order.shipping?.address || ""}\n` +
            `Receiver: ${order.shipping?.receiver_name || ""}`;

        return await call("sale.order", "create", [
            {
                partner_id: partnerId,
                partner_invoice_id: partnerId,
                partner_shipping_id: partnerId,
                origin: `MELI-${order.id}`,
                note: note,
                client_order_ref: `ML-${order.id}`,
                invoice_status:
                    order.payments?.[0]?.status === "approved"
                        ? "invoiced"
                        : "to invoice",
            },
        ]);
    }

    async addOrderItems(order, saleOrderId) {
        for (const item of order.order_items) {
            const productIds = await call("product.product", "search", [
                [["default_code", "=", item.sku]],
            ]);

            if (productIds.length) {
                await call("sale.order.line", "create", [
                    {
                        order_id: saleOrderId,
                        product_id: productIds[0],
                        name: item.title || `Product ${item.sku}`,
                        product_uom_qty: item.quantity,
                        price_unit: item.unit_price,
                    },
                ]);
            }
        }
    }
}

module.exports = OdooService;
