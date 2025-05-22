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

    // Method to get one order for the user
    async getSingleOrder(orderId) {
        try {
            // 1. Fetch the order from MercadoLibre API
            const order = await this.meliAPI.getSingleOrder(orderId);

            // 2. Fetch additional buyer info if available
            let fullBuyerInfo = {};
            if (order.buyer?.id) {
                try {
                    fullBuyerInfo = await this.getBuyerInfo(order.buyer.id);
                } catch (buyerError) {
                    console.error(
                        `Could not fetch additional info for buyer ${order.buyer.id}:`,
                        buyerError.message
                    );
                    // Fall back to basic buyer info
                    fullBuyerInfo = {
                        id: order.buyer.id,
                        nickname: order.buyer.nickname,
                    };
                }
            }

            // 3. Prepare complete order object with merged buyer info
            const completeOrder = {
                ...order,
                buyer: {
                    ...order.buyer,
                    ...fullBuyerInfo,
                },
            };

            // 4. Check if order exists in database
            const existing = await MeliOrder.findOne({
                orderId: completeOrder.id,
            });

            // 5. Update or create order in database
            if (existing) {
                await MeliOrder.findOneAndUpdate(
                    { orderId: completeOrder.id },
                    {
                        status: completeOrder.status,
                        date_created: completeOrder.date_created,
                        total_amount: completeOrder.total_amount,
                        buyer: completeOrder.buyer, // Now includes full buyer info
                        currency: completeOrder.currency,
                        order_items: completeOrder.order_items,
                        payments: completeOrder.payments,
                        shipping_type: completeOrder.shipping_type,
                        shipping_cost: completeOrder.shipping_cost,
                    },
                    { new: true }
                );
            } else {
                await MeliOrder.create({
                    orderId: completeOrder.id,
                    status: completeOrder.status,
                    date_created: completeOrder.date_created,
                    total_amount: completeOrder.total_amount,
                    buyer_nickname: completeOrder.buyer.nickname,
                    buyer_full: completeOrder.buyer, // Store complete buyer info
                    currency: completeOrder.currency,
                    order_items: completeOrder.order_items,
                    payments: completeOrder.payments,
                    shipping_type: completeOrder.shipping_type,
                    shipping_cost: completeOrder.shipping_cost,
                });
            }

            // 6. Send to Odoo with complete information
            await this.odooService.pushOrdersToOdoo([completeOrder]);

            return completeOrder;
        } catch (err) {
            console.error("Error fetching single order:", err);
            throw err;
        }
    }

    // Method to get info from a buyer
    async getBuyerInfo(buyerId) {
        try {
            // Fetch buyer info from API
            const buyer = await this.meliAPI.getBuyerInfo(buyerId);

            // Transform data if needed
            return {
                id: buyer.id,
                nickname: buyer.nickname,
                email: buyer.email,
                first_name: buyer.first_name,
                last_name: buyer.last_name,
                phone: buyer.phone?.number || 1111111111,
                address: buyer.address?.address || 1111111111,
                city: buyer.address?.city || 1111111111,
                state: buyer.address?.state || 1111111111,
                zip_code: buyer.address?.zip_code || 1111111111,
                registration_date: buyer.registration_date,
                user_type: buyer.user_type,
                points: buyer.points,
                site_id: buyer.site_id,
                permalink: buyer.permalink,
                status: buyer.status,
            };
        } catch (err) {
            console.error("Error fetching buyer info:", err);
            throw err;
        }
    }

    async createTestUser() {
        try {
            const testUser = await this.meliAPI.createFullTestUser();
            return testUser;
        } catch (error) {
            console.error("❌ Error in createTestUser:", error.message);
            throw error;
        }
    }
}

module.exports = MercadoLibreService;
