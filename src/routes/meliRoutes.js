// src/routes/meliRoutes.js
const express = require("express");
const router = express.Router();
const MeliOrder = require("../models/MeliOrder"); // Assuming Mongoose model for orders
const odooService = require("../services/odooService"); // Import Odoo service
const odooSer = new odooService();

module.exports = (meliService) => {
    // route to get the auth
    router.get("/auth/user", async (req, res, next) => {
        const code = req.query.code; // Expecting code as a query parameter
        if (!code) {
            return res
                .status(400)
                .json({ message: "Missing authorization code" });
        }

        try {
            const tokens = await meliService.getAccessTokenWithUser(code); // Pass the code to the service method
            res.json(tokens);
        } catch (err) {
            next(err);
        }
    });

    // route to get the products
    router.get("/user/products", async (req, res, next) => {
        try {
            const products = await meliService.getUserProducts();
            res.json(products);
        } catch (err) {
            next(err);
        }
    });

    router.get("/user/orders", async (req, res, next) => {
        try {
            const orders = await meliService.getUserOrders();
            res.json(orders);
        } catch (err) {
            next(err);
        }
    });

    // route to get a single order by ID
    router.get("/user/orders/:orderId", async (req, res, next) => {
        try {
            const orderId = req.params.orderId;
            if (!orderId) {
                return res.status(400).json({ message: "Missing order ID" });
            }

            const order = await meliService.getSingleOrder(orderId);
            res.json(order);
        } catch (err) {
            next(err);
        }
    });

    // route to get a single buyer by ID
    router.get("/user/buyer/:buyerId", async (req, res, next) => {
        try {
            const buyerId = req.params.buyerId;
            if (!buyerId) {
                return res.status(400).json({ message: "Missing buyer ID" });
            }

            const buyer = await meliService.getBuyerInfo(buyerId);
            res.json(buyer);
        } catch (err) {
            next(err);
        }
    });

    // This will receive Mercado Libre notifications
    router.post("/notifications", async (req, res) => {
        const body = req.body;
        console.log("📦 Received ML webhook:", body.topic, body.resource);

        try {
            // 🟨 ORDERS
            if (
                body.topic === "orders_v2" &&
                body.resource.includes("/orders/")
            ) {
                const orderId = body.resource.split("/orders/")[1];

                const existingOrder = await MeliOrder.findOne({ orderId });
                if (existingOrder) {
                    console.log(
                        `🔄 Repeated order ${orderId}, skipping processing`
                    );
                    return res.status(200).send("OK - Order already processed");
                }

                try {
                    console.log(
                        `🔍 Processing new order notification for ID: ${orderId}`
                    );
                    const order = await meliService.getSingleOrder(orderId);
                    console.log(
                        `✅ Processed order ${orderId} for buyer ${order.buyer?.nickname}`
                    );
                } catch (err) {
                    console.error(`❌ Error processing order ${orderId}:`, err);
                    throw err;
                }

                return res.status(200).send("OK - Order processed");
            }

            // 🟦 SHIPMENTS
            if (
                body.topic === "shipments" &&
                body.resource.includes("/shipments/")
            ) {
                const shipmentId = body.resource.split("/shipments/")[1];
                console.log(
                    `📫 Received shipment webhook for shipment ID: ${shipmentId}`
                );

                const existingOrder = await MeliOrder.findOne({
                    orderId: shipmentId,
                });

                if (!existingOrder) {
                    console.warn(
                        `❗ Shipment received for unknown order ID: ${shipmentId}`
                    );
                    return res
                        .status(404)
                        .json({ message: "Order not found", shipmentId });
                }

                console.log(`📦 Shipment update for known order ${shipmentId}`);

                const fields = ["tags"];
                let details;
                try {
                    details = await meliService.getOrderDetails(
                        shipmentId,
                        fields
                    );
                } catch (err) {
                    console.error(
                        `❌ Failed to fetch order details for ${shipmentId}:`,
                        err
                    );
                    return res
                        .status(500)
                        .json({ message: "Failed to fetch order details" });
                }

                const tags = details?.tags || [];
                console.log(`🏷️ Order ${shipmentId} tags:`, tags);
                if (tags.includes("delivered")) {
                    console.log(
                        `🚚 Order ${shipmentId} has been delivered and ${existingOrder.odoo_id}`
                    );

                    try {
                        // 1. FIRST GET COMPLETE ORDER INFO WITH PICKINGS
                        const inventoryInfo =
                            await odooSer.getInventoryInfoForSaleOrder(
                                parseInt(existingOrder.odoo_id)
                            );

                        console.log("📦 Inventory info:", {
                            pickings: inventoryInfo.pickings,
                            moves: inventoryInfo.inventory_movements,
                        });

                        // 2. EXTRACT PICKING IDs FROM THE RESPONSE
                        const pickingIds = inventoryInfo.pickings.map(
                            (p) => p.id
                        );

                        if (pickingIds.length === 0) {
                            console.warn(
                                "⚠️ No pickings found even after inventory check"
                            );
                            return res.status(200).json({
                                message: "No pickings found for this order",
                                inventory_info: inventoryInfo,
                            });
                        }

                        const results = [];

                        for (const pickingId of pickingIds) {
                            try {
                                console.log(
                                    `⚙️ Processing picking ${pickingId}`
                                );

                                // 1. Read picking
                                const [picking] = await odooSer.call(
                                    "stock.picking",
                                    "read",
                                    [pickingId, ["move_line_ids", "move_ids"]]
                                );

                                // 2. Read move lines — FIXED FIELD LIST
                                const moveLines = await odooSer.call(
                                    "stock.move.line",
                                    "search_read",
                                    [
                                        [["id", "in", picking.move_line_ids]],
                                        [
                                            "id",
                                            "qty_done",
                                            "reserved_qty",
                                            "product_id",
                                        ],
                                    ]
                                );

                                // 3. Set qty_done = reserved quantity (or 1 as fallback)
                                for (const ml of moveLines) {
                                    const qty = ml.reserved_qty || 1;

                                    await odooSer.call(
                                        "stock.move.line",
                                        "write",
                                        [[ml.id], { qty_done: qty }]
                                    );
                                }

                                // 4. Validate the picking (this sets move + picking state to done)
                                try {
                                    const result = await odooSer.call(
                                        "stock.picking",
                                        "button_validate",
                                        [pickingId]
                                    );

                                    if (
                                        result &&
                                        typeof result === "object" &&
                                        result.res_model
                                    ) {
                                        await odooSer.call(
                                            result.res_model,
                                            "process",
                                            [[result.res_id]]
                                        );
                                    }

                                    results.push({
                                        pickingId,
                                        status: "validated",
                                    });
                                } catch (e) {
                                    console.error(
                                        "❌ Validation failed:",
                                        e.message
                                    );
                                    throw e;
                                }
                            } catch (err) {
                                console.error(
                                    `❌ Error processing picking ${pickingId}:`,
                                    err
                                );
                                results.push({ pickingId, error: err.message });
                            }
                        }

                        // 3. PROCESS EACH PICKING
                        /* for (const pickingId of pickingIds) {
    try {
        console.log(`⚙️ Processing picking ${pickingId}`);

        // 1. First get complete picking info
        const [picking] = await odooSer.call(
            "stock.picking", 
            "read", 
            [pickingId, ["state", "move_ids", "move_line_ids", "picking_type_id"]]
        );

        // 2. Get move lines with correct fields for your Odoo version
        let moveLines;
        try {
            // Try with newer Odoo field names first
            moveLines = await odooSer.call(
                "stock.move.line",
                "search_read",
                [
                    [["id", "in", picking.move_line_ids]],
                    ["id", "product_uom_qty", "qty_done", "product_id"]
                ]
            );
        } catch (e) {
            // Fallback to alternative field names if needed
            moveLines = await odooSer.call(
                "stock.move.line",
                "search_read",
                [
                    [["id", "in", picking.move_line_ids]],
                    ["id", "reserved_qty", "qty_done", "product_id"]
                ]
            );
        }

        // 3. Update move lines with correct quantities
const moveLineUpdates = moveLines.map(ml => ({
    id: ml.id,
    qty_done: ml.product_uom_qty || ml.reserved_qty || 0
}));

for (const ml of moveLineUpdates) {
    await odooSer.call("stock.move.line", "write", [
        [ml.id],
        { qty_done: ml.qty_done }
    ]);
}

        // 4. Get moves with correct fields for your Odoo version
        let moves;
        try {
            moves = await odooSer.call(
                "stock.move",
                "search_read",
                [
                    [["id", "in", picking.move_ids]],
                    ["id", "product_uom_qty", "quantity_done", "state", "product_id"]
                ]
            );
        } catch (e) {
            moves = await odooSer.call(
                "stock.move",
                "search_read",
                [
                    [["id", "in", picking.move_ids]],
                    ["id", "product_qty", "quantity_done", "state", "product_id"]
                ]
            );
        }

        // 5. Update moves with correct quantities and state
        const moveUpdates = moves.map(m => ({
            id: m.id,
            quantity_done: m.product_uom_qty || m.product_qty || 0,
            state: "done"
        }));

        await odooSer.call("stock.move", "write", [
            moveUpdates.map(m => m.id),
            {
                quantity_done: moveUpdates.map(m => m.quantity_done),
                state: moveUpdates.map(m => m.state)
            }
        ]);

        // 6. Validate the picking
        try {
            // First try standard validation
            const result = await odooSer.call(
                "stock.picking",
                "button_validate",
                [pickingId]
            );

            // Handle wizard response if needed
            if (result && typeof result === 'object' && result.res_model) {
                console.log(`⚡ Processing validation wizard for picking ${pickingId}`);
                await odooSer.call(result.res_model, "process", [[result.res_id]]);
            }

            results.push({
                pickingId,
                status: "validated",
                method: "standard"
            });
        } catch (validateErr) {
            console.warn(`⚠️ Standard validation failed, forcing state (${validateErr.message})`);
            
            // Fallback to manual validation
            await odooSer.call("stock.picking", "write", [
                [pickingId],
                {
                    state: "done",
                    date_done: new Date().toISOString()
                }
            ]);

            // Update inventory quants
            for (const move of moves) {
                const productId = move.product_id[0];
                const qty = move.product_uom_qty || move.product_qty || 0;
                
                // Reduce source location
                await odooSer.call("stock.quant", "_update_available_quantity", [
                    productId,
                    8, // WH/Stock location ID (adjust as needed)
                    -qty
                ]);
                
                // Increase destination location
                await odooSer.call("stock.quant", "_update_available_quantity", [
                    productId,
                    5, // Partners/Customers location ID (adjust as needed)
                    qty
                ]);
            }

            results.push({
                pickingId,
                status: "forced",
                method: "manual"
            });
        }

    } catch (err) {
        console.error(`❌ Failed to process picking ${pickingId}:`, err);
        results.push({
            pickingId,
            status: "failed",
            error: err.message
        });
    }
} */

                        // 4. GET UPDATED INVENTORY INFO
                        const updatedInfo =
                            await odooSer.getInventoryInfoForSaleOrder(
                                parseInt(existingOrder.odoo_id)
                            );

                        return res.status(200).json({
                            message: "Order processing complete",
                            orderId: existingOrder.orderId,
                            processingResults: results,
                            inventory_info: updatedInfo,
                        });
                    } catch (finalErr) {
                        console.error(`💥 Final processing error:`, finalErr);
                        return res.status(500).json({
                            message: "Processing failed",
                            error: finalErr.message,
                        });
                    }
                }
            }

            // Default fallback
            res.status(200).send("OK");
        } catch (err) {
            console.error("Webhook processing error:", err);
            res.status(500).send("Internal Server Error");
        }
    });

    router.get("/test", (req, res) => {
        res.send("Hello this works");
    });

    router.post("/test-user", async (req, res) => {
        try {
            const testUser = await meliService.createTestUser();
            res.json(testUser);
        } catch (err) {
            console.error("Error creating test user:", err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // Route to get specific order details
    router.get("/user/orders/:orderId/details", async (req, res, next) => {
        try {
            const orderId = req.params.orderId;
            const fields = req.query.fields
                ? req.query.fields.split(",")
                : null;

            if (!orderId) {
                return res.status(400).json({ message: "Missing order ID" });
            }

            const details = await meliService.getOrderDetails(orderId, fields);
            res.json(details);
        } catch (err) {
            next(err);
        }
    });

    // Route to get all shipments with optional filters
    router.get("/user/shipments", async (req, res, next) => {
        try {
            // Extract query params
            const { status, date_from, date_to, limit, offset } = req.query;

            const params = {
                ...(status && { status }),
                ...(date_from && { date_from }),
                ...(date_to && { date_to }),
                ...(limit && { limit: parseInt(limit) }),
                ...(offset && { offset: parseInt(offset) }),
            };

            const shipments = await meliService.getAllShipments(params);
            res.json(shipments);
        } catch (err) {
            next(err);
        }
    });

    router.post("/orders/:orderId/check-status", async (req, res, next) => {
        try {
            const orderId = req.params.orderId;
            if (!orderId) {
                return res.status(400).json({ message: "Missing order ID" });
            }

            // Get the order from database
            const order = await MeliOrder.findOne({ orderId });
            if (!order) {
                return res.status(404).json({ message: "Order not found" });
            }

            // Check and update status
            await meliService.checkAndUpdateOrderStatus(order);

            res.json({
                message: "Order status checked",
                orderId,
                status: order.status,
            });
        } catch (err) {
            next(err);
        }
    });

    return router;
};
