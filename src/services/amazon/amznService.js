// src/services/amznService.js
const AmznAPI = require("./amznAPI");
const OdooService = require("../odooService"); // adjust path if needed

class AmazonService {
    constructor() {
        this.amznAPI = new AmznAPI();     // handle raw Amazon API calls
        this.odooService = new OdooService(); // Odoo integration
    }

    async handleAuthCallback(code) {
        try {
            const tokens = await this.amznAPI.getAccessToken(code);
            return tokens;
        } catch (error) {
            console.error("Amazon auth error:", error);
            throw error;
        }
    }

    async refreshAccessToken(refreshToken) {
        return await this.amznAPI.refreshToken(refreshToken);
    }

    // Add more methods here as needed, e.g., for handling orders, notifications, etc.
}

module.exports = AmazonService;
