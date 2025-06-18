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

    router.get("/odoo-version", async (req, res, next) => {
        try {
            const version = await odooSer.getVersion();
            res.json({ version });
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

    router.get("/inventory/:odoo_id", async (req, res) => {
        try {
            const inventoryInfo = await odooSer.getInventoryInfoForSaleOrder(
                parseInt(req.params.odoo_id)
            );

            res.json({
                success: true,
                data: inventoryInfo,
            });
        } catch (error) {
            console.error("Test route error:", error);
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    });

    router.get("/odoo-taxes", async (req, res, next) => {
        try {
            const taxes = await odooSer.call("account.tax", "search_read", [
                [],
                ["id", "name", "amount", "type_tax_use", "company_id"],
            ]);

            res.json({
                success: true,
                count: taxes.length,
                taxes,
            });
        } catch (err) {
            console.error("❌ Failed to fetch taxes:", err);
            res.status(500).json({
                success: false,
                error: err.message,
            });
        }
    });

    router.get("/odoo-debug-models", async (req, res) => {
        try {
            const models = await odooSer.call("ir.model", "search_read", [
                [["model", "=", "stock.warehouse"]],
                ["model", "name"],
            ]);
            res.json({ models });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
