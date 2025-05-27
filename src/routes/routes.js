// src/routes/routes.js
const express = require("express");
const router = express.Router();
// Add at the top of routes.js
const xmlrpc = require("xmlrpc");

module.exports = (odooSer, meliService) => {
    // ✅ New route to sync orders to Odoo
    router.post("/orders", async (req, res, next) => {
        try {
            const orders = await meliService.getUserOrders(); // Fetch and store in Mongo
            const results = await odooSer.pushOrdersToOdoo(orders); // Push to Odoo
            res.json(results);
        } catch (err) {
            next(err);
        }
    });

    router.get("/odoo-products", async (req, res, next) => {
        try {
            const results = await odooSer.getInventory();
            res.json(results);
        } catch (err) {
            next(err);
        }
    });

    // In your route.js
    router.get("/odoo-connection-test", async (req, res, next) => {
        try {
            console.log("🔌 Testing Odoo connection...");

            // This will now automatically authenticate
            const inventory = await odooSer.getInventory();

            res.json({
                success: true,
                inventory: {
                    count: inventory.length,
                    sample: inventory.slice(0, 3),
                },
            });
        } catch (err) {
            console.error("❌ Odoo connection test failed:", err);
            res.status(500).json({
                success: false,
                error: err.message,
            });
        }
    });

    return router;
};
