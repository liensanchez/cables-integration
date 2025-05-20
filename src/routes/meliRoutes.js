// src/routes/meliRoutes.js
const express = require("express");
const router = express.Router();

module.exports = (meliService) => {
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

    // New route to get the products
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

    // Add this new route to get a single order by ID
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

    // This will receive Mercado Libre notifications
    router.post("/notifications", async (req, res) => {
        const body = req.body;
        console.log(
            "📦 Received webhook notification from Mercado Libre:",
            JSON.stringify(body, null, 2)
        );

        try {
            // Check if this is an order-related notification
            if (
                body.topic === "orders_v2" &&
                body.resource.includes("/orders/")
            ) {
                // Extract the order ID from the resource URL
                const orderId = body.resource.split("/orders/")[1];

                console.log(`🔄 Processing order ${orderId} from webhook`);

                // Fetch and process the single order
                const order = await meliService.getSingleOrder(orderId);

                // Optional: Add additional logging
                console.log(
                    `✅ Processed order ${orderId} with status ${order.status}`
                );
            }

            // Always respond quickly to the webhook
            res.status(200).send("OK");
        } catch (err) {
            console.error("Webhook processing error:", err);
            // Still return 200 to prevent MercadoLibre from retrying excessively
            res.status(200).send("OK");
        }
    });

    router.get("/test", (req, res) => {
        res.send("Hello this works");
    });

    return router;
};
