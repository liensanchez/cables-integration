// src/routes/amznRoutes.js
const express = require("express");
const router = express.Router();
const path = require("path");

module.exports = () => {
    router.get("/auth/user", async (req, res, next) => {
        const code = req.query.code;
        if (!code) {
            return res.status(400).json({ message: "Missing authorization code" });
        }

        try {
            const tokens = await amznService.handleAuthCallback(code);
            console.log("✅ Amazon tokens received:", tokens);
            
            // Redirect to success page or send response
            res.json({ 
                success: true,
                access_token: tokens.access_token,
                expires_in: tokens.expires_in
            });
        } catch (err) {
            next(err);
        }
    });

    router.get("/test", (req, res) => {
        res.send("Hello this amazon route works");
    });

    return router;
};
