// src/routes/meliRoutes.js
const express = require("express");
const router = express.Router();
const MeliOrder = require("../models/MeliOrder"); // Assuming Mongoose model for orders
const odooService = require("../services/odooService"); // Import Odoo service
const odooSer = new odooService();
const path = require("path");

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
            console.log("✅ Tokens received:", tokens);
            const newToken = await meliService.automaticAccessToken();
            console.log("✅ Token refreshed automatically", newToken);
            res.sendFile(path.join(__dirname, "../public/index.html"));
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

            // 🟦 SHIPMENTS (NEW CONDITION)
            if (
                body.topic === "shipments" &&
                body.resource.includes("/shipments/")
            ) {
                const shipmentId = body.resource.split("/shipments/")[1];

                console.log(
                    `🚚 Processing shipment notification for shipment ID: ${shipmentId}`
                );

                try {
                    const shipmentInfo =
                        await meliService.getSingleShipment(shipmentId);

                    console.log(shipmentInfo.order_id);
                    const orderId = shipmentInfo.order_id;
                    // 1. Get order details
                    const order =
                        await meliService.meliAPI.getSingleOrder(orderId);
                    console.log(
                        `🔍 Retrieved order ${orderId} with shipping ID: ${order.shipping_id}`
                    );

                    if (!order.shipping_id) {
                        console.warn(
                            `⚠️ No shipping ID found in order ${orderId}`
                        );
                        return res
                            .status(200)
                            .send("OK - No shipping ID found");
                    }

                    // 2. Get shipment details
                    const shipment = await meliService.meliAPI.getShipment(
                        order.shipping_id
                    );
                    console.log(
                        `📦 Shipment status: ${shipment.status} (substatus: ${shipment.substatus})`
                    );

                    // 3. Find the associated order in our database
                    const dbOrder = await MeliOrder.findOne({
                        orderId: orderId,
                    });
                    if (!dbOrder) {
                        console.warn(
                            `⚠️ No order found in database for ${orderId}`
                        );
                        return res
                            .status(200)
                            .send("OK - No associated order found");
                    }

                    if (!dbOrder.odoo_id) {
                        console.warn(
                            `⚠️ No Odoo reference found for order ${orderId}`
                        );
                        return res
                            .status(200)
                            .send("OK - No Odoo reference found");
                    }

                    // 4. Check delivery status (more robust check)
                    const isDelivered =
                        shipment.status === "delivered" ||
                        (shipment.substatus &&
                            shipment.substatus.includes("delivered"));

                    if (isDelivered) {
                        console.log(
                            `📦 Shipment ${order.shipping_id} marked as delivered`
                        );

                        // 5. Update Odoo
                        await meliService.odooService.updateShipmentStatus(
                            dbOrder.odoo_id,
                            "done",
                            order.shipping_id // Use shipping_id here too
                        );

                        // 6. Update our database
                        await MeliOrder.findOneAndUpdate(
                            { orderId: orderId },
                            {
                                "shipping.status": "delivered",
                                "shipping.tags": ["delivered"],
                                status: "completed",
                                updatedAt: new Date(),
                            }
                        );

                        console.log(
                            `✅ Updated Odoo shipment for order ${orderId}`
                        );
                    } else {
                        console.log(
                            `⏩ Shipment ${order.shipping_id} status: ${shipment.status}, not updating yet`
                        );
                    }

                    return res.status(200).send("OK - Shipment processed");
                } catch (err) {
                    console.error(
                        `❌ Error processing shipment for order ${orderId}:`,
                        err
                    );
                    throw err;
                }
            }

            // For other webhook types we don't handle
            console.log(`ℹ️ Unhandled webhook type: ${body.topic}`);
            return res
                .status(200)
                .send("OK - Webhook received but not processed");
        } catch (err) {
            console.error("Error processing webhook:", err);
            return res.status(500).send("Internal Server Error");
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

    // Route to get one shipment by ID
    router.get("/user/shipment/:shipmentId", async (req, res, next) => {
        try {
            const shipmentId = req.params.shipmentId;
            if (!shipmentId) {
                return res.status(400).json({ message: "Missing shipment ID" });
            }

            const shipment = await meliService.getSingleShipment(shipmentId);
            res.json(shipment);
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

    router.get("/auth/test", async (req, res, next) => {
        /* const code = req.query.code; // Expecting code as a query parameter
        if (!code) {
            return res
                .status(400)
                .json({ message: "Missing authorization code" });
        } */

        try {
            //const tokens = await meliService.getAccessTokenWithUser(code); // Pass the code to the service method
            res.sendFile(path.join(__dirname, "../public/index.html"));
        } catch (err) {
            next(err);
        }
    });

    return router;
};
