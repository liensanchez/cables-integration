// src/services/mercadolibre/meliService.js
const MeliAPI = require("./meliAPI");
const odooService = require("../../services/odooService");
/* const ErrorQueue = require('../../models/ErrorQueue'); // Assuming Mongoose */
const MeliOrder = require("../../models/MeliOrder");

class MercadoLibreService {
    constructor() {
        this.meliAPI = new MeliAPI(); // instance to handle raw API calls
        this.odooService = new odooService(); // instance to handle Odoo API calls
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

            const processedOrders = await Promise.all(
                orders.map(async (order) => {
                    const existing = await MeliOrder.findOne({
                        orderId: order.id,
                    });

                    if (existing) {
                        await MeliOrder.findOneAndUpdate(
                            { orderId: order.id },
                            {
                                status: order.status,
                                date_created: order.date_created,
                                total_amount: order.total_amount,
                                buyer: order.buyer,
                                currency: order.currency,
                                order_items: order.order_items,
                                payments: order.payments,
                            },
                            { new: true }
                        );
                    } else {
                        await MeliOrder.create({
                            orderId: order.id,
                            status: order.status,
                            date_created: order.date_created,
                            total_amount: order.total_amount,
                            buyer_nickname: order.buyer.nickname,
                            currency: order.currency,
                            order_items: order.order_items,
                            payments: order.payments,
                        });
                    }

                    // Enviar a Odoo
                    await this.odooService.pushOrdersToOdoo([order]);

                    return order;
                })
            );

            return processedOrders;
        } catch (err) {
            console.error("Error fetching and saving orders:", err);
            throw err;
        }
    }

    async getSingleOrder(orderId) {
        try {
            // Fetch the order from MercadoLibre API
            const order = await this.meliAPI.getSingleOrder(orderId);

            // Check if order exists in database
            const existing = await MeliOrder.findOne({ orderId: order.id });

            if (existing) {
                await MeliOrder.findOneAndUpdate(
                    { orderId: order.id },
                    {
                        status: order.status,
                        date_created: order.date_created,
                        total_amount: order.total_amount,
                        buyer: order.buyer,
                        currency: order.currency,
                        order_items: order.order_items,
                        payments: order.payments,
                    },
                    { new: true }
                );
            } else {
                await MeliOrder.create({
                    orderId: order.id,
                    status: order.status,
                    date_created: order.date_created,
                    total_amount: order.total_amount,
                    buyer_nickname: order.buyer.nickname,
                    currency: order.currency,
                    order_items: order.order_items,
                    payments: order.payments,
                });
            }

            // Send to Odoo
            await this.odooService.pushOrdersToOdoo([order]);

            return order;
        } catch (err) {
            console.error("Error fetching single order:", err);
            throw err;
        }
    }

}

module.exports = MercadoLibreService;