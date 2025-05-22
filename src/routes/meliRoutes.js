// src/routes/meliRoutes.js
const express = require("express");
const router = express.Router();

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
            if (
                body.topic === "orders_v2" &&
                body.resource.includes("/orders/")
            ) {
                const orderId = body.resource.split("/orders/")[1];

                console.log(
                    `🔍 Processing order notification for ID: ${orderId}`
                );

                const order = await meliService.getSingleOrder(orderId);
                console.log(
                    `✅ Processed order ${orderId} for buyer ${order.buyer?.nickname}`
                );
            }

            res.status(200).send("OK");
        } catch (err) {
            console.error("Webhook processing error:", err);
            res.status(200).send("OK");
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

    return router;
};
