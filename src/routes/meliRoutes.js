// src/routes/meliRoutes.js
const express = require("express");
const router = express.Router();

const processingLocks = new Map();
const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes lock duration

// Cleanup function to remove expired locks
setInterval(() => {
    const now = Date.now();
    for (const [orderId, timestamp] of processingLocks.entries()) {
        if (now - timestamp > LOCK_TIMEOUT_MS) {
            processingLocks.delete(orderId);
            console.log(`♻️ Cleared expired lock for order ${orderId}`);
        }
    }
}, 60 * 1000); // Run cleanup every minute

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
                const now = Date.now();

                // Check for existing lock (regardless of age)
                if (processingLocks.has(orderId)) {
                    const lockTime = processingLocks.get(orderId);
                    console.log(
                        `⏳ Order ${orderId} is locked (since ${new Date(lockTime).toISOString()}), skipping. ` +
                            `Will expire at ${new Date(lockTime + LOCK_TIMEOUT_MS).toISOString()}`
                    );
                    return res.status(200).send("OK - Already processing");
                }

                // Set new lock with current timestamp
                processingLocks.set(orderId, now);
                console.log(
                    `🔒 Lock set for order ${orderId} at ${new Date(now).toISOString()}`
                );

                try {
                    console.log(
                        `🔍 Processing order notification for ID: ${orderId}`
                    );
                    const order = await meliService.getSingleOrder(orderId);
                    console.log(
                        `✅ Processed order ${orderId} for buyer ${order.buyer?.nickname}`
                    );
                } catch (err) {
                    console.error(`❌ Error processing order ${orderId}:`, err);
                    // For non-permanent errors, we keep the lock to prevent retries
                    if (isPermanentError(err)) {
                        processingLocks.delete(orderId);
                        console.log(
                            `🔓 Removed lock for order ${orderId} due to permanent error`
                        );
                    }
                    throw err;
                }
                // No finally block - we leave the lock in place until it expires
            }

            res.status(200).send("OK");
        } catch (err) {
            console.error("Webhook processing error:", err);
            res.status(200).send("OK");
        }
    });

    // Helper function to determine permanent errors
    function isPermanentError(err) {
        // Define errors that should immediately release the lock
        return (
            err.response?.status === 404 || // Not found
            err.response?.status === 403 || // Unauthorized
            err.response?.status === 410
        ); // Gone
    }

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
