// src/routes/routes.js
const express = require("express");
const router = express.Router();

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

    return router;
};
