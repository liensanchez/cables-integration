// src/services/mercadolibre/meliAPI.js
const axios = require("axios");
const qs = require("qs");
require("dotenv").config();

class MeliAPI {
    constructor() {
        this.clientId = process.env.MELI_CLIENT_ID;
        this.clientSecret = process.env.MELI_CLIENT_SECRET;
        this.redirectUri = process.env.MELI_REDIRECT_URI;
        this.Username = process.env.MELI_USERNAME;
        this.Password = process.env.MELI_PASSWORD;
        this.baseUrl = "https://api.mercadolibre.com";
        this.token = null; // Will hold the access token
        this.refreshToken = null; // Will hold the refresh token
        this.userId = process.env.MELI_USER_ID; // Will hold the user info
    }

    // Exchange the authorization code for an access token
    async getAccessTokenWithCode(code) {
        try {
            const payload = new URLSearchParams({
                grant_type: "authorization_code",
                client_id: this.clientId,
                client_secret: this.clientSecret,
                code: code,
                redirect_uri: this.redirectUri,
            });

            const res = await axios.post(
                `${this.baseUrl}/oauth/token`,
                payload.toString(),
                {
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                }
            );

            this.token = res.data.access_token;
            this.refreshToken = res.data.refresh_token; // Store the refresh token

            console.log("✅ Access token:", this.token);
            return res.data;
        } catch (error) {
            console.error(
                "❌ Failed to get access token:",
                error.response?.data || error.message
            );
            throw error;
        }
    }

    // Refresh the access token using the refresh token
    async refreshAccessToken() {
        if (!this.refreshToken) {
            throw new Error("No refresh token available");
        }

        try {
            const payload = new URLSearchParams({
                grant_type: "refresh_token",
                client_id: this.clientId,
                client_secret: this.clientSecret,
                refresh_token: this.refreshToken,
            });

            const res = await axios.post(
                `${this.baseUrl}/oauth/token`,
                payload.toString(),
                {
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                }
            );

            this.token = res.data.access_token; // Store the new access token
            console.log("✅ Refreshed access token:", this.token);

            return res.data;
        } catch (error) {
            console.error(
                "❌ Failed to refresh access token:",
                error.response?.data || error.message
            );
            throw error;
        }
    }

    // fetch the user's products
    async getUserProducts() {
        if (!this.token) {
            throw new Error("Access token is missing");
        }

        try {
            // Step 1: Get the user ID
            const userInfo = await axios.get(`${this.baseUrl}/users/me`, {
                headers: {
                    Authorization: `Bearer ${this.token}`,
                },
            });

            const userId = userInfo.data.id;

            // Step 2: Get product IDs
            const itemsRes = await axios.get(
                `${this.baseUrl}/users/${userId}/items/search`,
                {
                    headers: {
                        Authorization: `Bearer ${this.token}`,
                    },
                }
            );

            const itemIds = itemsRes.data.results;

            if (itemIds.length === 0) return [];

            // Step 3: Fetch stock details for each item
            const products = await Promise.all(
                itemIds.map(async (itemId) => {
                    const res = await axios.get(
                        `${this.baseUrl}/items/${itemId}`,
                        {
                            headers: {
                                Authorization: `Bearer ${this.token}`,
                            },
                        }
                    );

                    const item = res.data;

                    return {
                        id: item.id,
                        title: item.title,
                        available_quantity: item.available_quantity,
                        sold_quantity: item.sold_quantity,
                        price: item.price,
                        status: item.status,
                    };
                })
            );

            return products;
        } catch (error) {
            console.error(
                "❌ Failed to fetch product stock:",
                error.response?.data || error.message
            );
            throw error;
        }
    }

    // fetch the user's orders
    async getUserOrders() {
        if (!this.token) {
            throw new Error("Access token is missing");
        }

        try {
            // Step 1: Get the authenticated user's ID
            const userInfo = await axios.get(`${this.baseUrl}/users/me`, {
                headers: {
                    Authorization: `Bearer ${this.token}`,
                },
            });

            const userId = userInfo.data.id;

            // Step 2: Fetch orders
            const ordersRes = await axios.get(
                `${this.baseUrl}/orders/search?seller=${userId}`,
                {
                    headers: {
                        Authorization: `Bearer ${this.token}`,
                    },
                }
            );

            const orders = ordersRes.data.results.map((order) => ({
                id: order.id,
                status: order.status,
                date_created: order.date_created,
                total_amount: order.total_amount,
                buyer: order.buyer.nickname,
                shipping_id: order.shipping?.id,
            }));

            return orders;
        } catch (error) {
            console.error(
                "❌ Failed to fetch orders:",
                error.response?.data || error.message
            );
            throw error;
        }
    }

    // Subscribe to notifications
    /* async subscribeToNotifications(notificationUrl) {
        if (!this.token) {
            throw new Error("Access token is missing");
        }

        try {
            const res = await axios.post(
                `${this.baseUrl}/users/${this.userId}/notifications`,
                {
                    url: notificationUrl,
                    topics: ["orders"], // You can add more topics if needed
                },
                {
                    headers: {
                        Authorization: `Bearer ${this.token}`,
                        "Content-Type": "application/json",
                    },
                }
            );

            console.log("✅ Webhook subscribed successfully:", res.data);
            return res.data;
        } catch (error) {
            console.error(
                "❌ Failed to subscribe to webhook:",
                error.response?.data || error.message
            );
            throw error;
        }
    } */
}

module.exports = MeliAPI;

/* async getAccessTokenWithUser() {
        try {
            const payload = new URLSearchParams({
                grant_type: "password",
                client_id: this.clientId,
                client_secret: this.clientSecret,
                username: this.Username,
                password: this.Password,
            });

            const res = await axios.post(
                `${this.baseUrl}/oauth/token`,
                payload.toString(),
                {
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                }
            );

            this.token = res.data.access_token;
            console.log("✅ Access token:", this.token);

            return res.data;
        } catch (error) {
            console.error(
                "❌ Failed to get access token:",
                error.response?.data || error.message
            );
            throw error;
        }
    } */
