// src/services/odooService.js
const { call } = require("../utils/odooRpc");
const odooRpc = require("../utils/odooRpc");
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

    async getVersion() {
        const commonClient = xmlrpc.createClient({
            url: `${process.env.ODOO_XMLRPC_URL}/xmlrpc/2/common`,
        });

        return new Promise((resolve, reject) => {
            commonClient.methodCall("version", [], (err, value) => {
                if (err) return reject(err);
                resolve(value);
            });
        });
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
                    odooReference,
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
                : order.buyer?.nickname || "Comprador MercadoLibre";

        const email = (order.buyer?.email || "").trim().toLowerCase();
        const phone = (order.buyer?.phone || "").trim();
        const rfcRaw = (order.buyer?.identification?.number || "")
            .trim()
            .toUpperCase();
        const fallbackEmail = `${order.id}@meli.local`;

        // Validación básica de RFC (puedes ajustarla según tus reglas)
        let rfcFormatted = rfcRaw;
        const rfcRegex = /^([A-ZÑ&]{3,4})(\d{2})(\d{2})(\d{2})([A-Z\d]{3})$/; // formato RFC mexicano común

        if (rfcFormatted && rfcFormatted !== "NOAVAILABLE") {
            if (!rfcRegex.test(rfcFormatted)) {
                console.warn(
                    `RFC "${rfcFormatted}" no tiene formato válido. Se limpiará.`
                );
                rfcFormatted = false;
            }
        } else {
            rfcFormatted = false;
        }

        // Buscar partner primero por nombre
        let partnerIds = await this.call("res.partner", "search", [
            [["name", "=ilike", partnerName]],
        ]);

        // Si no existe, buscar por RFC
        if (!partnerIds.length && rfcFormatted) {
            partnerIds = await this.call("res.partner", "search", [
                [["vat", "=", rfcFormatted]],
            ]);
        }

        // Luego por email
        if (!partnerIds.length && email) {
            partnerIds = await this.call("res.partner", "search", [
                [["email", "=ilike", email]],
            ]);
        }

        // Luego por teléfono
        if (!partnerIds.length && phone) {
            partnerIds = await this.call("res.partner", "search", [
                [["phone", "=", phone]],
            ]);
        }

        // Categoría MercadoLibre
        let categoryIds = await this.call("res.partner.category", "search", [
            [["name", "=", "MercadoLibre"]],
        ]);
        if (!categoryIds.length) {
            const categoryId = await this.call(
                "res.partner.category",
                "create",
                [{ name: "MercadoLibre" }]
            );
            categoryIds = [categoryId];
        }

        // BUSCAMOS EL PAÍS MÉXICO DINÁMICAMENTE
        const mexico = await this.call("res.country", "search_read", [
            [["name", "ilike", "Mexico"]],
            ["id", "name"],
        ]);
        if (!mexico.length) {
            throw new Error("No se encontró el país México en res.country");
        }
        const mexicoCountryId = mexico[0].id;

        // Extraer dirección para buscar estado
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
            // El estado suele estar separado por coma
            stateName = lastPart.split(",")[1]?.trim() || lastPart.trim();
        }

        if (stateName) {
            const states = await this.call("res.country.state", "search_read", [
                [
                    ["name", "ilike", stateName],
                    ["country_id", "=", mexicoCountryId],
                ],
                ["id"],
            ]);
            if (states.length) {
                stateId = states[0].id;
            }
        }

        const partnerData = {
            name: partnerName,
            email: email || fallbackEmail,
            phone: phone || order.shipping_info?.receiver_phone || "",
            vat: rfcFormatted || "",
            street,
            zip,
            city,
            state_id: stateId || undefined,
            country_id: mexicoCountryId,
            lang: "es_MX", // Idioma español por defecto
            category_id: [[6, false, categoryIds]],
            comment: `Comprador MercadoLibre\nID: ${order.buyer?.id || ""}\nTipo ID: ${order.buyer?.identification?.type || ""}`,
        };

        if (partnerIds.length) {
            const existingPartner = await this.call("res.partner", "read", [
                partnerIds[0],
                Object.keys(partnerData),
            ]);
            let needsUpdate = false;
            for (const key in partnerData) {
                if (
                    partnerData[key] &&
                    (!existingPartner[key] ||
                        existingPartner[key] !== partnerData[key])
                ) {
                    needsUpdate = true;
                    break;
                }
            }

            if (needsUpdate) {
                console.log(
                    `🔄 Actualizando partner ID ${partnerIds[0]} para orden ${order.id}`
                );
                await this.call("res.partner", "write", [
                    [partnerIds[0]],
                    partnerData,
                ]);
            }
            return partnerIds[0];
        } else {
            const newPartnerId = await this.call("res.partner", "create", [
                partnerData,
            ]);
            console.log(
                `✅ Creado nuevo partner ID ${newPartnerId} para orden ${order.id}`
            );
            return newPartnerId;
        }
    }

    async createSalesOrder(order, partnerId) {
        const isFulfillment = order.is_fulfillment === true;

        // Buscar el almacén correcto según fulfillment
        const warehouseDomain = [["code", "=", isFulfillment ? "ML" : "WH"]];
        const warehouses = await this.call("stock.warehouse", "search_read", [
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

        const saleOrderId = await this.call("sale.order", "create", [
            {
                partner_id: partnerId,
                partner_invoice_id: partnerId,
                partner_shipping_id: partnerId,
                origin: `MELI-${order.id}`,
                note: note,
                client_order_ref: `ML-${order.id}`,
                warehouse_id: warehouseId,
                //location_id: locationId,
                invoice_status: "to invoice", // Always start as "to invoice"
                state: "draft", // Explicitly set as draft initially
                /* invoice_status:
                    order.payments?.[0]?.status === "approved"
                        ? "invoiced"
                        : "to invoice", */
            },
        ]);

        if (order.payments?.[0]?.status === "approved") {
            await this.call("sale.order", "action_confirm", [[saleOrderId]]);
        }

        return saleOrderId;
    }

    async addOrderItems(order, saleOrderId) {
        for (const item of order.order_items) {
            const productIds = await this.call("product.product", "search", [
                [["default_code", "=", item.sku]],
            ]);

            if (productIds.length) {
                await this.call("sale.order.line", "create", [
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

    async updateOrderStatus(saleOrderId, meliStatus) {
        const statusMapping = {
            paid: "sale", // When payment is confirmed
            shipped: "progress", // When order is shipped
            delivered: "done", // When order is delivered
            cancelled: "cancel", // When order is cancelled
            completed: "done", // New status for completed orders
        };

        const odooStatus = statusMapping[meliStatus] || "draft";

        if (odooStatus === "sale") {
            await this.call("sale.order", "action_confirm", [[saleOrderId]]);
        } else if (odooStatus === "done" || odooStatus === "completed") {
            // For completed orders, ensure delivery is processed
            try {
                // First confirm the order if not already confirmed
                await this.call("sale.order", "action_confirm", [
                    [saleOrderId],
                ]);

                // Process delivery
                const pickingIds = await this.call(
                    "sale.order",
                    "action_view_delivery",
                    [[saleOrderId]]
                );
                if (pickingIds && pickingIds.length) {
                    await this.call("stock.picking", "button_validate", [
                        pickingIds,
                    ]);
                }

                // Mark as done
                await this.call("sale.order", "write", [
                    [saleOrderId],
                    { state: "done" },
                ]);
            } catch (err) {
                console.error("Error completing order in Odoo:", err);
                throw err;
            }
        } else {
            await this.call("sale.order", "write", [
                [saleOrderId],
                { state: odooStatus },
            ]);
        }
    }

    async updateShipmentStatus(odooId, status, mlShippingId) {
        try {
            // 1. First get the sale order to find related pickings
            const saleOrder = await odooRpc.searchRead(
                "sale.order",
                [["id", "=", odooId]],
                ["name", "picking_ids"]
            );

            if (!saleOrder || saleOrder.length === 0) {
                throw new Error(`No sale order found with ID ${odooId}`);
            }

            // 2. Get all pickings for this order
            const pickings = await odooRpc.searchRead(
                "stock.picking",
                [
                    ["id", "in", saleOrder[0].picking_ids],
                    ["state", "!=", "done"], // Only consider not-done pickings
                ],
                ["name", "state", "origin"]
            );

            if (!pickings || pickings.length === 0) {
                throw new Error(
                    `No picking found for MercadoLibre shipment ${mlShippingId}`
                );
            }

                  // Format date in Odoo's expected format
        const now = new Date();
        const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

            // 3. Update all relevant pickings
            const updateResults = await Promise.all(
                pickings.map(async (picking) => {
                    return await odooRpc.update("stock.picking", picking.id, {
                        state: "done",
                        /* ml_shipping_id: mlShippingId,  */// Store ML shipping ID for reference
                        date_done: formattedDate,
                    });
                })
            );

            return updateResults;
        } catch (error) {
            console.error("Error updating shipment status:", error);
            throw error;
        }
    }
}

module.exports = OdooService;
