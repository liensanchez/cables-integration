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

    // This will receive Mercado Libre notifications
    router.post("/notifications", (req, res) => {
        const body = req.body;
        console.log(
            "📦 Received webhook notification from Mercado Libre:",
            JSON.stringify(body, null, 2)
        );

        // Send a 200 OK to acknowledge receipt
        res.status(200).send("OK");
    });

    // Add this in server.js (or split into a route if you prefer)
    /* router.post("/meli/webhook", (req, res) => {
        const payload = req.body;

        console.log(
            "📦 Webhook received from Mercado Libre:",
            JSON.stringify(payload, null, 2)
        );

        // TODO: You can fetch full order info from payload.resource if needed
        // e.g., /orders/{id}

        res.sendStatus(200); // Always respond with 200 to prevent retries
    });

    router.post("/subscribe/webhook", async (req, res, next) => {
        try {
            const { url } = req.body; // e.g. { "url": "https://yourdomain.com/meli/webhook" }
            const result = await meliService.subscribeToWebhook(url);
            res.json(result);
        } catch (err) {
            next(err);
        }
    }); */

    router.get("/test", (req, res) => {
        res.send("Hello this works");
    });

    return router;
};

/* 
    router.get("/auth/user", async (req, res, next) => {
        try {
            const tokens = await meliService.getAccessTokenWithUser();
            res.json(tokens);
        } catch (err) {
            next(err);
        }
    });
*/
