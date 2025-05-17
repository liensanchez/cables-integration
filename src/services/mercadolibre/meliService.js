const MeliAPI = require("./meliAPI");
const odooService = require("../../services/odooService");
/* const ErrorQueue = require('../../models/ErrorQueue'); // Assuming Mongoose */
const MeliOrder = require("../../models/MeliOrder");

class MercadoLibreService {
    constructor() {
        this.meliAPI = new MeliAPI(); // instance to handle raw API calls
    }

    // Pass the received authorization code to the API method
    async getAccessTokenWithUser(code) {
        try {
            const tokenResponse =
                await this.meliAPI.getAccessTokenWithCode(code); // fetch access token with the code
            return tokenResponse;
        } catch (err) {
            console.error("Error getting access token:", err);
            throw err;
        }
    }

    // Method to get products for the user
    async getUserProducts() {
        try {
            const products = await this.meliAPI.getUserProducts(); // fetch products using the access token
            return products;
        } catch (err) {
            console.error("Error fetching products:", err);
            throw err;
        }
    }

    // Method to get orders for the user
    async getUserOrders() {
        try {
            const orders = await this.meliAPI.getUserOrders();

            const storedOrders = await Promise.all(
                orders.map(async (order) => {
                    // Check if order already exists
                    const existing = await MeliOrder.findOne({
                        orderId: order.id,
                    });

                    if (existing) {
                        // Update the existing one
                        return await MeliOrder.findOneAndUpdate(
                            { orderId: order.id },
                            {
                                status: order.status,
                                date_created: order.date_created,
                                total_amount: order.total_amount,
                                buyer_nickname: order.buyer,
                                shipping_id: order.shipping_id,
                            },
                            { new: true }
                        );
                    } else {
                        // Create new
                        return await MeliOrder.create({
                            orderId: order.id,
                            status: order.status,
                            date_created: order.date_created,
                            total_amount: order.total_amount,
                            buyer_nickname: order.buyer,
                            shipping_id: order.shipping_id,
                        });
                    }
                })
            );

            return storedOrders;
        } catch (err) {
            console.error("Error fetching and saving orders:", err);
            throw err;
        }
    }

    /* async subscribeToWebhook(notificationUrl) {
        try {
            const result =
                await this.meliAPI.subscribeToNotifications(notificationUrl);
            return result;
        } catch (err) {
            console.error("Error subscribing to webhook:", err);
            throw err;
        }
    } */
}

module.exports = MercadoLibreService;

/* 
    async getAccessTokenWithUser() {
        try {
            const tokenResponse = await this.meliAPI.getAccessTokenWithUser(); // fetch access token from meliAPI
            return tokenResponse;
        } catch (err) {
            console.error("Error getting access token:", err);
            throw err;
        }
    }
*/
