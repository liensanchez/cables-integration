// src/api/amznAPI.js
const axios = require("axios");
require("dotenv").config();

class AmznAPI {
    constructor() {
        this.clientId = process.env.AMAZON_CLIENT_ID;
        this.clientSecret = process.env.AMAZON_CLIENT_SECRET;
        this.redirectUri = process.env.AMAZON_REDIRECT_URI;
        this.tokenUrl = "https://api.amazon.com/auth/o2/token";
    }

    async getAccessToken(code) {
        const params = new URLSearchParams();
        params.append("grant_type", "authorization_code");
        params.append("code", code);
        params.append("client_id", this.clientId);
        params.append("client_secret", this.clientSecret);
        params.append("redirect_uri", this.redirectUri);

        const response = await axios.post(this.tokenUrl, params, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" }
        });

        return response.data;
    }

    async refreshToken(refreshToken) {
        const params = new URLSearchParams();
        params.append("grant_type", "refresh_token");
        params.append("refresh_token", refreshToken);
        params.append("client_id", this.clientId);
        params.append("client_secret", this.clientSecret);

        const response = await axios.post(this.tokenUrl, params, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" }
        });

        return response.data;
    }

    async getOrders(accessToken) {
        // Placeholder for Amazon SP-API or MWS call
        // Example:
        // return await axios.get("https://sellingpartnerapi-na.amazon.com/orders/v0/orders", {
        //     headers: {
        //         Authorization: `Bearer ${accessToken}`,
        //         "Content-Type": "application/json"
        //     }
        // });
    }
}

module.exports = AmznAPI;
