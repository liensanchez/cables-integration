// src/services/odooService.js
const { call } = require("../utils/odooRpc");
require("dotenv").config();
const xmlrpc = require("xmlrpc");

class OdooService {
    constructor() {
        this.modelsClient = xmlrpc.createClient({
            url: `${process.env.ODOO_XMLRPC_URL}/xmlrpc/2/object`,
        });
        this.uid = null;
        this.db = process.env.ODOO_DB;
        this.password = process.env.ODOO_PASS;
    }

    async authenticate() {
        const commonClient = xmlrpc.createClient({
            url: `${process.env.ODOO_XMLRPC_URL}/xmlrpc/2/common`,
        });

        this.uid = await new Promise((resolve, reject) => {
            commonClient.methodCall(
                "authenticate",
                [this.db, process.env.ODOO_USER, this.password, {}],
                (err, value) => {
                    if (err) return reject(err);
                    resolve(value);
                }
            );
        });
        return this.uid;
    }

    async call(model, method, args = [], kwargs = {}) {
        if (!this.uid) {
            await this.authenticate();
        }

        return new Promise((resolve, reject) => {
            this.modelsClient.methodCall(
                "execute_kw",
                [this.db, this.uid, this.password, model, method, args, kwargs],
                (err, value) => {
                    if (err) return reject(err);
                    resolve(value);
                }
            );
        });
    }

    async getInventory(testMode = false) {
        try {
            if (testMode) {
                console.log(
                    "⚠️ Running in test mode - returning mock inventory data"
                );
                return [
                    { meliId: "TEST001", availableQuantity: 10 },
                    { meliId: "TEST002", availableQuantity: 5 },
                    { meliId: "TEST003", availableQuantity: 0 },
                ];
            }

            console.log("🔍 Attempting to fetch inventory from Odoo...");

            // Try the most common model names
            const modelsToTry = ["product.product", "product.template"];

            for (const model of modelsToTry) {
                try {
                    // Verify model exists
                    await this.call(model, "fields_get", [], {});

                    // Get products
                    const productIds = await this.call(model, "search", [
                        [["default_code", "!=", false]],
                    ]);

                    if (!productIds.length) return [];

                    const products = await this.call(model, "read", [
                        productIds,
                        ["default_code", "qty_available"],
                    ]);

                    const inventory = products
                        .filter((prod) => prod.default_code)
                        .map((prod) => ({
                            meliId: prod.default_code,
                            availableQuantity: Number(prod.qty_available) || 0,
                        }));

                    console.log(
                        `✅ Successfully fetched ${inventory.length} items using model: ${model}`
                    );
                    return inventory;
                } catch (err) {
                    console.log(`⚠️ Model ${model} failed, trying next...`);
                    continue;
                }
            }

            throw new Error(
                `No valid product model found. Tried: ${modelsToTry.join(", ")}`
            );
        } catch (err) {
            console.error("❌ Critical error fetching inventory:", err);
            throw new Error(`Inventory fetch failed: ${err.message}`);
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

        // Buscar cliente por DNI
        let partnerIds = [];
        const dni = order.buyer?.identification?.number;
        const email = order.buyer?.email;

        if (dni) {
            partnerIds = await call("res.partner", "search", [
                [["vat", "=", dni]],
            ]);
        }

        if (!partnerIds.length && email) {
            partnerIds = await call("res.partner", "search", [
                [["email", "=", email]],
            ]);
        }

        // Asegurar que exista la categoría "MercadoLibre"
        let categoryIds = await call("res.partner.category", "search", [
            [["name", "=", "MercadoLibre"]],
        ]);

        if (!categoryIds.length) {
            const categoryId = await call("res.partner.category", "create", [
                { name: "MercadoLibre" },
            ]);
            categoryIds = [categoryId];
        }

        // Normalizar dirección
        const rawAddress =
            order.billing_info?.address || order.shipping_info?.address || "";
        let street = "",
            zip = "",
            city = "",
            stateName = "",
            stateId = null;

        if (rawAddress) {
            const parts = rawAddress.split("-");
            street = parts[0]?.trim() + (parts[1] ? ` ${parts[1].trim()}` : "");
            zip = parts[2]?.trim() || "";
            city = parts[3]?.trim() || "";
            const lastPart = parts[4] || "";
            stateName = lastPart.split(",")[1]?.trim() || lastPart.trim();
        }

        // Buscar ID de provincia en Odoo si existe
        if (stateName) {
            const states = await call("res.country.state", "search_read", [
                [["name", "ilike", stateName]],
                ["id"],
            ]);
            if (states.length) {
                stateId = states[0].id;
            }
        }

        const partnerData = {
            name: partnerName,
            email: email || `${order.id}@meli.local`,
            phone:
                order.buyer?.phone || order.shipping_info?.receiver_phone || "",
            vat: dni || "",
            street,
            zip,
            city,
            state_id: stateId || undefined,
            category_id: [[6, false, categoryIds]],
            comment: `MercadoLibre Buyer\nID: ${order.buyer?.id || ""}\nType: ${order.buyer?.identification?.type || ""}`,
        };

        if (partnerIds.length) {
            console.log(
                `🔄 Updating partner ID ${partnerIds[0]} for order ${order.id}`
            );
            await call("res.partner", "write", [[partnerIds[0]], partnerData]);
            return partnerIds[0];
        } else {
            const newPartnerId = await call("res.partner", "create", [
                partnerData,
            ]);
            console.log(
                `✅ Created new partner ID ${newPartnerId} for order ${order.id}`
            );
            return newPartnerId;
        }
    }

    async createSalesOrder(order, partnerId) {
        const isFulfillment = order.is_fulfillment === true;

        // Buscar el almacén correcto según fulfillment
        const warehouseDomain = [["code", "=", isFulfillment ? "ML" : "WH"]];
        const warehouses = await call("stock.warehouse", "search_read", [
            warehouseDomain,
            ["id", "lot_stock_id"],
        ]);

        if (!warehouses.length) {
            throw new Error(
                `No se encontró el almacén ${isFulfillment ? "ML" : "WH"}`
            );
        }

        const warehouseId = warehouses[0].id;
        const locationId = warehouses[0].lot_stock_id[0]; // stock de origen

        const note =
            `MercadoLibre Order ID: ${order.id}\n` +
            `Buyer: ${order.buyer?.nickname || ""}\n` +
            `Shipping: ${order.shipping?.address || ""}\n` +
            `Receiver: ${order.shipping?.receiver_name || ""}`;

        const saleOrderId = await call("sale.order", "create", [
            {
                partner_id: partnerId,
                partner_invoice_id: partnerId,
                partner_shipping_id: partnerId,
                origin: `MELI-${order.id}`,
                note: note,
                client_order_ref: `ML-${order.id}`,
                warehouse_id: warehouseId,
                //location_id: locationId,
                invoice_status:
                    order.payments?.[0]?.status === "approved"
                        ? "invoiced"
                        : "to invoice",
            },
        ]);

        if (order.payments?.[0]?.status === "approved") {
            await call("sale.order", "action_confirm", [[saleOrderId]]);
        }

        return saleOrderId;
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
