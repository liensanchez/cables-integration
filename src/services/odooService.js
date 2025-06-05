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

                // 4. Get the complete Odoo order data including name/reference
                const odooOrder = await this.call("sale.order", "read", [
                    saleOrderId,
                    ["name", "client_order_ref", "origin"],
                ]);

                const pickingIds = await this.call("stock.picking", "search", [
                    [["origin", "=", `MELI-${order.id}`]],
                ]);

                const pickings = pickingIds.length
                    ? await this.call("stock.picking", "read", [
                          pickingIds,
                          ["id", "name", "state"],
                      ])
                    : [];

                results.push({
                    orderId: order.id,
                    status: "completed",
                    odooId: saleOrderId,
                    odooReference: odooOrder.name,
                    odooClientRef: odooOrder.client_order_ref,
                    odooPickings: pickings, // Add picking information
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

        // Normalize and prepare buyer information
        const email = (order.buyer?.email || "").trim().toLowerCase();
        const phone = (order.buyer?.phone || "").trim();
        const vat = (order.buyer?.identification?.number || "")
            .trim()
            .toUpperCase();
        const fallbackEmail = `${order.id}@meli.local`;

        // Validate VAT format
        let vatFormatted = vat;
        if (vatFormatted && vatFormatted !== "NOAVAILABLE") {
            if (!vatFormatted.match(/^[A-Z]{2}\d+$/)) {
                console.warn(
                    `VAT number ${vatFormatted} is not in the correct format. Expected format: CC##. Clearing VAT number.`
                );
                vatFormatted = false;
            }
        } else {
            vatFormatted = false;
        }

        // FIRST search by name (most important check to prevent duplicates)
        let partnerIds = await this.call("res.partner", "search", [
            [["name", "=ilike", partnerName]],
        ]);

        // If no match by name, try other identifiers
        if (!partnerIds.length) {
            if (vatFormatted) {
                partnerIds = await this.call("res.partner", "search", [
                    [["vat", "=", vatFormatted]],
                ]);
            }

            if (!partnerIds.length && email) {
                partnerIds = await this.call("res.partner", "search", [
                    [["email", "=ilike", email]],
                ]);
            }

            if (!partnerIds.length && phone) {
                partnerIds = await this.call("res.partner", "search", [
                    [["phone", "=", phone]],
                ]);
            }
        }

        // Ensure the "MercadoLibre" category exists
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

        // Prepare address information
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

        if (stateName) {
            const states = await this.call("res.country.state", "search_read", [
                [["name", "ilike", stateName]],
                ["id"],
            ]);
            if (states.length) {
                stateId = states[0].id;
            }
        }

        // Prepare partner data
        const partnerData = {
            name: partnerName,
            email: email || fallbackEmail,
            phone: phone || order.shipping_info?.receiver_phone || "",
            vat: vatFormatted || "",
            street,
            zip,
            city,
            state_id: stateId || undefined,
            category_id: [[6, false, categoryIds]],
            comment: `MercadoLibre Buyer\nID: ${order.buyer?.id || ""}\nType: ${order.buyer?.identification?.type || ""}`,
        };

        // Update or create partner
        if (partnerIds.length) {
            // Check if we need to update any missing information
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
                    `🔄 Updating partner ID ${partnerIds[0]} for order ${order.id}`
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
                `✅ Created new partner ID ${newPartnerId} for order ${order.id}`
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
            paid: "sale",
            shipped: "progress",
            delivered: "done",
            cancelled: "cancel",
            completed: "done",
        };

        const odooStatus = statusMapping[meliStatus] || "draft";

        if (odooStatus === "sale") {
            await this.call("sale.order", "action_confirm", [[saleOrderId]]);
        } else if (odooStatus === "done" || odooStatus === "completed") {
            try {
                // 1. Confirm the order if not already confirmed
                await this.call("sale.order", "action_confirm", [
                    [saleOrderId],
                ]);

                // 2. Get all related pickings
                const pickingIds = await this.call("stock.picking", "search", [
                    [["origin", "=", `MELI-${order.id}`]],
                ]);

                if (pickingIds.length) {
                    // 3. Validate each picking
                    for (const pickingId of pickingIds) {
                        try {
                            const picking = await this.call(
                                "stock.picking",
                                "read",
                                [pickingId, ["state"]]
                            );

                            // Only validate if not already done
                            if (picking.state !== "done") {
                                await this.call(
                                    "stock.picking",
                                    "button_validate",
                                    [pickingId]
                                );
                                console.log(
                                    `✅ Validated picking ${pickingId}`
                                );
                            }
                        } catch (err) {
                            console.error(
                                `❌ Error validating picking ${pickingId}:`,
                                err
                            );
                        }
                    }
                }

                // 4. Mark the order as done
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

    async getInventoryInfoForSaleOrder(saleOrderId) {
        try {
            console.log(`🔍 Fetching inventory info for order ${saleOrderId}`);

            // 1. Get extended sale order info including state and picking_ids
            const saleOrders = await this.call("sale.order", "read", [
                [saleOrderId],
                [
                    "name",
                    "client_order_ref",
                    "origin",
                    "state",
                    "picking_ids",
                    "warehouse_id",
                ],
            ]);

            const saleOrder = saleOrders?.[0];

            if (!saleOrder) {
                throw new Error(`Sale order ${saleOrderId} not found`);
            }

            console.log("📦 Order state:", saleOrder.state);
            console.log("📦 Order origin:", saleOrder.origin);
            console.log("📦 Direct picking IDs:", saleOrder.picking_ids);

            // 2. Try multiple ways to find related pickings
            let pickingIds = saleOrder.picking_ids || [];

            // If no direct pickings, try searching by origin
            if (pickingIds.length === 0) {
                const origin =
                    saleOrder.origin ||
                    `MELI-${saleOrder.client_order_ref?.replace("ML-", "")}`;
                console.log("🔍 Searching pickings by origin:", origin);

                pickingIds = await this.call("stock.picking", "search", [
                    [
                        "|",
                        ["origin", "=", origin],
                        ["origin", "=", `MELI-${saleOrder.client_order_ref}`],
                    ],
                ]);
                console.log("🔍 Found picking IDs by origin:", pickingIds);
            }

            // 3. If still no pickings and order isn't confirmed, try confirming it
            if (pickingIds.length === 0 && saleOrder.state !== "sale") {
                console.log("⚠️ Order not confirmed, attempting to confirm...");
                await this.call("sale.order", "action_confirm", [
                    [saleOrderId],
                ]);
                await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait for operations

                // Try getting pickings again
                pickingIds = (
                    await this.call("sale.order", "read", [
                        saleOrderId,
                        ["picking_ids"],
                    ])
                ).picking_ids;
                console.log("🔄 Pickings after confirmation:", pickingIds);
            }

            // 4. Get detailed picking info
            const pickings = pickingIds.length
                ? await this.call("stock.picking", "read", [
                      pickingIds,
                      [
                          "id",
                          "name",
                          "state",
                          "scheduled_date",
                          "date_done",
                          "move_ids",
                      ],
                  ])
                : [];

            // 5. Get moves information (alternative method if pickings are empty)
            let moves = [];
            if (pickingIds.length) {
                moves = await this.call("stock.move", "search_read", [
                    [["picking_id", "in", pickingIds]],
                    [
                        "id",
                        "product_id",
                        "product_qty",
                        "quantity_done",
                        "state",
                        "location_id",
                        "location_dest_id",
                        "reference",
                        "picking_id",
                    ],
                ]);
            } else {
                // Fallback: try to find moves by sale order line
                console.log("🔍 Trying to find moves by sale order...");
                const orderLines = await this.call(
                    "sale.order.line",
                    "search",
                    [[["order_id", "=", saleOrderId]]]
                );

                if (orderLines.length) {
                    moves = await this.call("stock.move", "search_read", [
                        [["sale_line_id", "in", orderLines]],
                        [
                            "id",
                            "product_id",
                            "product_qty",
                            "quantity_done",
                            "state",
                            "location_id",
                            "location_dest_id",
                            "reference",
                            "picking_id",
                        ],
                    ]);
                    console.log(
                        "🔍 Found moves via order lines:",
                        moves.length
                    );
                }
            }

            // 6. Get product details
            const movesWithProducts = await Promise.all(
                moves.map(async (move) => {
                    const product = move.product_id
                        ? await this.call("product.product", "read", [
                              move.product_id[0],
                              [
                                  "id",
                                  "default_code",
                                  "display_name",
                                  "qty_available",
                              ],
                          ])
                        : {
                              default_code: "UNKNOWN",
                              display_name: "Unknown Product",
                              qty_available: 0,
                          };

                    return {
                        ...move,
                        product_sku: product.default_code,
                        product_name: product.display_name,
                        current_stock: product.qty_available,
                    };
                })
            );

            // 7. Get warehouse info for context
            const warehouse = saleOrder.warehouse_id
                ? await this.call("stock.warehouse", "read", [
                      saleOrder.warehouse_id[0],
                      ["name", "code"],
                  ])
                : null;

            return {
                sale_order: {
                    id: saleOrderId,
                    name: saleOrder.name,
                    origin: saleOrder.origin,
                    client_ref: saleOrder.client_order_ref,
                    state: saleOrder.state,
                    warehouse: warehouse
                        ? {
                              id: saleOrder.warehouse_id[0],
                              name: warehouse.name,
                              code: warehouse.code,
                          }
                        : null,
                },
                pickings: pickings.map((p) => ({
                    id: p.id,
                    name: p.name,
                    status: p.state,
                    scheduled_date: p.scheduled_date,
                    date_done: p.date_done,
                    move_count: p.move_ids?.length || 0,
                })),
                inventory_movements: movesWithProducts.map((m) => ({
                    move_id: m.id,
                    product_id: m.product_id?.[0] || null,
                    product_sku: m.product_sku,
                    product_name: m.product_name,
                    quantity: m.product_qty,
                    quantity_done: m.quantity_done,
                    status: m.state,
                    source_location_id: m.location_id?.[0] || null,
                    source_location_name: m.location_id?.[1] || null,
                    dest_location_id: m.location_dest_id?.[0] || null,
                    dest_location_name: m.location_dest_id?.[1] || null,
                    current_stock: m.current_stock,
                    picking_id: m.picking_id?.[0] || null,
                    picking_name: m.picking_id?.[1] || null,
                })),
                _debug: {
                    search_origin:
                        saleOrder.origin ||
                        `MELI-${saleOrder.client_order_ref?.replace("ML-", "")}`,
                    raw_picking_ids: pickingIds,
                    raw_move_count: moves.length,
                },
            };
        } catch (err) {
            console.error(
                `Error fetching inventory info for order ${saleOrderId}:`,
                err
            );
            throw err;
        }
    }
}

module.exports = OdooService;
